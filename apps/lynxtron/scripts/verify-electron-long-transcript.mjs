#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { resolveElectronLaunchCommand } from "../../desktop/scripts/electron-launcher.mjs";
import { selectElectronRendererTarget } from "./electron-cdp-target.mjs";

const appRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(appRoot, "../..");
const desktopRoot = path.join(repoRoot, "apps/desktop");
const webStaticDir = path.join(repoRoot, "apps/web/dist");

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function reservePort() {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolvePort(address.port));
    });
  });
}

async function waitFor(read, label, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await read();
    if (latest) return latest;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(latest)}`);
}

function waitForChildExit(child, timeoutMs) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolveWait) => {
    const timer = setTimeout(() => resolveWait(false), timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolveWait(true);
    });
  });
}

async function stopOwnedChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGINT");
  if (await waitForChildExit(child, 5_000)) return;
  child.kill("SIGTERM");
  if (await waitForChildExit(child, 2_000)) return;
  child.kill("SIGKILL");
  await waitForChildExit(child, 5_000);
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolveConnect, reject) => {
      this.socket.addEventListener("open", resolveConnect, { once: true });
      this.socket.addEventListener("error", () => reject(new Error("Electron CDP failed")), {
        once: true,
      });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result ?? {});
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolveSend, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, 15_000);
      this.pending.set(id, { resolve: resolveSend, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket?.close();
  }
}

async function evaluate(client, expression) {
  const response = await client.send("Runtime.evaluate", { expression, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
  return response.result?.value;
}

const fixtureDir = path.resolve(argumentValue("--fixture-dir") ?? "");
const output = path.resolve(argumentValue("--output") ?? "");
const timeoutMs = Number(argumentValue("--timeout-ms") ?? "90000");
const width = Number(argumentValue("--width") ?? "1280");
const height = Number(argumentValue("--height") ?? "820");
if (!argumentValue("--fixture-dir") || !argumentValue("--output")) {
  throw new Error("--fixture-dir and --output are required.");
}
const manifestPath = path.join(fixtureDir, "visual-state.json");
const sourceDatabase = path.join(fixtureDir, "userdata/state.sqlite");
if (!existsSync(manifestPath) || !existsSync(sourceDatabase)) {
  throw new Error("Electron long-transcript gate requires a prepared fixture.");
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const fixture = manifest.longTranscriptFixture;
const webIndex = readFileSync(path.join(webStaticDir, "index.html"), "utf8");
const expectedEntryPath = webIndex.match(
  /<script[^>]+type=["']module["'][^>]+src=["'](?<src>[^"']+)["']/u,
)?.groups?.src;
if (!expectedEntryPath) throw new Error("Fresh Web build has no module entry asset.");
const expectedEntrySha256 = sha256(path.join(webStaticDir, expectedEntryPath.replace(/^\//u, "")));
if (typeof fixture?.threadId !== "string" || fixture.expectedTimelineRowCount < 100) {
  throw new Error("Fixture manifest has no valid longTranscriptFixture.");
}
const runRoot = mkdtempSync(path.join(os.tmpdir(), "t3-electron-long-transcript-"));
const electronHome = path.join(runRoot, "home");
const profile = path.join(runRoot, "profile");
cpSync(fixtureDir, electronHome, { recursive: true });
writeFileSync(
  path.join(electronHome, "userdata/desktop-settings.json"),
  `${JSON.stringify(
    { mainWindowBounds: { x: 0, y: 0, width, height }, mainWindowMaximized: false },
    null,
    2,
  )}\n`,
);
const copiedHash = sha256(path.join(electronHome, "userdata/state.sqlite"));
if (copiedHash !== manifest.snapshotId) {
  throw new Error(`Electron snapshot copy drifted: ${copiedHash} != ${manifest.snapshotId}`);
}
const cdpPort = await reservePort();
const backendPort = await reservePort();
const electronCommand = resolveElectronLaunchCommand([
  `--remote-debugging-port=${cdpPort}`,
  `--t3code-dev-root=${desktopRoot}`,
  "dist-electron/main.cjs",
]);
const child = spawn(electronCommand.electronPath, electronCommand.args, {
  cwd: desktopRoot,
  env: {
    ...process.env,
    T3CODE_HOME: electronHome,
    T3CODE_PORT: String(backendPort),
    T3CODE_STATIC_DIR: webStaticDir,
    T3CODE_DESKTOP_USER_DATA_DIR: profile,
    T3CODE_DISABLE_AUTO_UPDATE: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
child.stdout.on("data", (chunk) => {
  log += String(chunk);
});
child.stderr.on("data", (chunk) => {
  log += String(chunk);
});
let client;
try {
  const target = await waitFor(
    async () => {
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`Electron exited before CDP readiness: ${log}`);
      }
      try {
        const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
        return response.ok ? selectElectronRendererTarget(await response.json()) : null;
      } catch {
        return null;
      }
    },
    "Electron product renderer",
    timeoutMs,
  );
  client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  await client.send("Runtime.enable");
  const environmentId = await waitFor(
    () => {
      const environmentIdPath = path.join(electronHome, "userdata/environment-id");
      return existsSync(environmentIdPath) ? readFileSync(environmentIdPath, "utf8").trim() : null;
    },
    "Electron environment identity",
    timeoutMs,
  );
  const reloadingForTheme = await evaluate(
    client,
    '(() => { if (localStorage.getItem("t3code:theme") === "dark") return false; localStorage.setItem("t3code:theme", "dark"); location.reload(); return true; })()',
  );
  if (reloadingForTheme) await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  const canonicalRoute = `/${encodeURIComponent(environmentId)}/${encodeURIComponent(fixture.threadId)}`;
  await evaluate(
    client,
    `(() => {
      const target = ${JSON.stringify(canonicalRoute)};
      location.hash = "#" + target;
      return target;
    })()`,
  );
  const expectedMinimapCount = fixture.turnCount;
  let state;
  try {
    state = await waitFor(
      () =>
        evaluate(
          client,
          `(() => {
          const rows = Array.from(document.querySelectorAll("[data-timeline-row-id]"));
          const minimap = Array.from(document.querySelectorAll("[data-timeline-minimap-item]"));
          const timeline = document.querySelector("[data-timeline-root]");
          const rect = timeline?.getBoundingClientRect();
          return minimap.length === ${expectedMinimapCount} && rows.length > 0 ? {
            href: location.href,
            viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
            materializedRowIds: rows.map((row) => row.getAttribute("data-timeline-row-id")),
            minimapItemCount: minimap.length,
            firstMinimapItemId: minimap[0]?.getAttribute("data-timeline-minimap-item") ?? null,
            lastMinimapItemId: minimap.at(-1)?.getAttribute("data-timeline-minimap-item") ?? null,
            timelineRect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
            theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
            assetScripts: [...document.scripts].map((script) => script.src).filter(Boolean)
          } : null;
        })()`,
        ),
      "Electron canonical transcript",
      timeoutMs,
    );
  } catch (error) {
    const diagnostic = await evaluate(
      client,
      `(() => ({
        href: location.href,
        readyState: document.readyState,
        bodyText: (document.body?.innerText ?? "").slice(0, 500),
        rowCount: document.querySelectorAll("[data-timeline-row-id]").length,
        minimapItemCount: document.querySelectorAll("[data-timeline-minimap-item]").length,
        hasTimelineRoot: document.querySelector("[data-timeline-root]") !== null
      }))()`,
    ).catch(() => null);
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}; diagnostic=${JSON.stringify(diagnostic)}`,
    );
  }
  if (!state.href.includes(canonicalRoute)) {
    throw new Error(`Electron did not select canonical thread: ${state.href}`);
  }
  if (
    state.firstMinimapItemId !== "fidelity-long-turn-001-user" ||
    state.lastMinimapItemId !==
      `fidelity-long-turn-${String(fixture.turnCount).padStart(3, "0")}-user`
  ) {
    throw new Error(`Electron minimap identity drifted: ${JSON.stringify(state)}`);
  }
  const loadedEntryAssetUrl = state.assetScripts.find((asset) =>
    new URL(asset).pathname.endsWith(expectedEntryPath),
  );
  if (!loadedEntryAssetUrl) throw new Error("Electron did not load the fresh Web entry asset.");
  const scrollTarget = await evaluate(
    client,
    `(() => {
      const root = document.querySelector('[data-timeline-root]');
      let current = root;
      while (current) {
        if (current.scrollHeight > current.clientHeight + 1) {
          const rect = current.getBoundingClientRect();
          return {
            x: rect.x + rect.width / 2,
            y: rect.y + Math.min(rect.height / 2, 240),
            scrollTop: current.scrollTop,
            scrollHeight: current.scrollHeight,
            clientHeight: current.clientHeight
          };
        }
        current = current.parentElement;
      }
      return null;
    })()`,
  );
  if (!scrollTarget) throw new Error("Electron transcript has no scrollable ancestor.");
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseWheel",
    x: scrollTarget.x,
    y: scrollTarget.y,
    deltaX: 0,
    deltaY: -1_800,
  });
  const scrolled = await waitFor(
    () =>
      evaluate(
        client,
        `(() => {
          const root = document.querySelector('[data-timeline-root]');
          let current = root;
          while (current && !(current.scrollHeight > current.clientHeight + 1)) current = current.parentElement;
          if (!current || current.scrollTop >= ${scrollTarget.scrollTop} - 1) return null;
          const viewport = current.getBoundingClientRect();
          const visibleRowIds = [...document.querySelectorAll('[data-timeline-row-id]')].filter((row) => {
            const rect = row.getBoundingClientRect();
            return rect.bottom > viewport.top && rect.top < viewport.bottom;
          }).map((row) => row.getAttribute('data-timeline-row-id'));
          const jump = [...document.querySelectorAll('button')].find((button) => /(?:Jump|Scroll) to (?:latest|end)/u.test(button.textContent ?? ''));
          const leftTail = !visibleRowIds.some((rowId) => rowId?.startsWith('fidelity-long-turn-120-'));
          return leftTail && jump ? { scrollTop: current.scrollTop, visibleRowIds, jumpVisible: true } : null;
        })()`,
      ),
    "Electron transcript wheel-away",
    timeoutMs,
  );
  if (scrolled.visibleRowIds.length === 0 || scrolled.jumpVisible !== true) {
    throw new Error(`Electron wheel-away semantics drifted: ${JSON.stringify(scrolled)}`);
  }
  const report = {
    schemaVersion: 1,
    status: "pass",
    recordedAt: new Date().toISOString(),
    head: spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).stdout.trim(),
    ownedProcessId: child.pid,
    snapshotId: manifest.snapshotId,
    threadId: fixture.threadId,
    requestedWindow: { width, height },
    cdpPort,
    backendPort,
    rendererIdentity: {
      staticDir: webStaticDir,
      entryAssetUrl: loadedEntryAssetUrl,
      entryAssetSha256: expectedEntrySha256,
    },
    state: { ...state, scroll: { initial: scrollTarget, afterWheel: scrolled } },
    backendBehaviorClaimed: false,
  };
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  client?.close();
  await stopOwnedChild(child);
  rmSync(profile, { recursive: true, force: true });
  rmSync(runRoot, { recursive: true, force: true });
}
