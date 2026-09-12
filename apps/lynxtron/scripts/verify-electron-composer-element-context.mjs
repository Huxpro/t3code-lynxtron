#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { resolveElectronLaunchCommand } from "../../desktop/scripts/electron-launcher.mjs";
import { selectElectronRendererTarget } from "./electron-cdp-target.mjs";

const appRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(appRoot, "../..");
const desktopRoot = path.join(repoRoot, "apps/desktop");
const sourceWebStaticDir = path.join(repoRoot, "apps/web/dist");
const selection = {
  pageUrl: "https://example.com/dashboard",
  pageTitle: "Dashboard",
  tagName: "button",
  selector: "button.submit",
  htmlPreview: '<button class="submit">Save</button>',
  componentName: "SubmitButton",
  source: {
    functionName: "SubmitButton",
    fileName: "/repo/src/Button.tsx",
    lineNumber: 12,
    columnNumber: 5,
  },
  styles: ".submit { color: white; }",
};
const label = "<SubmitButton>";

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

async function waitFor(read, labelText, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await read();
    if (latest) return latest;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Timed out waiting for ${labelText}: ${JSON.stringify(latest)}`);
}

async function stopOwnedChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const waitForExit = (timeoutMs) =>
    new Promise((resolveWait) => {
      const timer = setTimeout(() => resolveWait(false), timeoutMs);
      child.once("exit", () => {
        clearTimeout(timer);
        resolveWait(true);
      });
    });
  child.kill("SIGINT");
  if (await waitForExit(5_000)) return;
  child.kill("SIGTERM");
  if (await waitForExit(2_000)) return;
  child.kill("SIGKILL");
  await waitForExit(5_000);
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

const fixtureDirArgument = argumentValue("--fixture-dir");
const outputArgument = argumentValue("--output");
const timeoutMs = Number(argumentValue("--timeout-ms") ?? "90000");
if (!fixtureDirArgument || !outputArgument) {
  throw new Error("--fixture-dir and --output are required.");
}
const fixtureDir = path.resolve(fixtureDirArgument);
const output = path.resolve(outputArgument);
const manifest = JSON.parse(readFileSync(path.join(fixtureDir, "visual-state.json"), "utf8"));
const sourceIndex = readFileSync(path.join(sourceWebStaticDir, "index.html"), "utf8");
const expectedEntryPath = sourceIndex.match(
  /<script[^>]+type=["']module["'][^>]+src=["'](?<src>[^"']+)["']/u,
)?.groups?.src;
if (!expectedEntryPath) throw new Error("Fresh Web build has no module entry asset.");
const expectedEntrySha256 = sha256(
  path.join(sourceWebStaticDir, expectedEntryPath.replace(/^\//u, "")),
);
const runRoot = mkdtempSync(path.join(os.tmpdir(), "t3-electron-element-context-"));
const electronHome = path.join(runRoot, "home");
const profile = path.join(runRoot, "profile");
const webStaticDir = path.join(runRoot, "web");
cpSync(fixtureDir, electronHome, { recursive: true });
cpSync(sourceWebStaticDir, webStaticDir, { recursive: true });
writeFileSync(
  path.join(webStaticDir, "index.html"),
  sourceIndex.replace(
    "<head>",
    "<head><script>window.__T3_WORKBENCH_DESKTOP_VISUAL__=true;</script>",
  ),
);
writeFileSync(
  path.join(electronHome, "userdata/desktop-settings.json"),
  `${JSON.stringify({ mainWindowBounds: { x: 0, y: 0, width: 1280, height: 820 }, mainWindowMaximized: false }, null, 2)}\n`,
);
if (sha256(path.join(electronHome, "userdata/state.sqlite")) !== manifest.snapshotId) {
  throw new Error("Electron snapshot copy drifted.");
}
const cdpPort = await reservePort();
const backendPort = await reservePort();
const electronCommand = resolveElectronLaunchCommand([
  `--remote-debugging-port=${cdpPort}`,
  `--t3code-dev-root=${desktopRoot}`,
  "dist-electron/main.cjs",
]);
const electronEnv = {
  ...process.env,
  T3CODE_HOME: electronHome,
  T3CODE_PORT: String(backendPort),
  T3CODE_STATIC_DIR: webStaticDir,
  T3CODE_DESKTOP_USER_DATA_DIR: profile,
  T3CODE_DISABLE_AUTO_UPDATE: "1",
};
delete electronEnv.VITE_DEV_SERVER_URL;
const child = spawn(electronCommand.electronPath, electronCommand.args, {
  cwd: desktopRoot,
  env: electronEnv,
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
      if (child.exitCode !== null) throw new Error(`Electron exited before readiness: ${log}`);
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
  await evaluate(client, 'localStorage.setItem("t3code:theme", "dark")');
  await waitFor(
    () =>
      evaluate(
        client,
        `(() => document.body?.innerText?.includes(${JSON.stringify(manifest.project.title)}) && typeof window.__T3_WORKBENCH_ADD_ELEMENT_CONTEXT__ === 'function' ? true : null)()`,
      ),
    "real Web element-context action",
    timeoutMs,
  );
  const addResults = await evaluate(
    client,
    `(() => { const add = window.__T3_WORKBENCH_ADD_ELEMENT_CONTEXT__; const value = ${JSON.stringify(selection)}; return [add(value), add(value)]; })()`,
  );
  if (addResults?.[0] !== true || addResults?.[1] !== false) {
    throw new Error(`Electron element-context dedupe drifted: ${JSON.stringify(addResults)}`);
  }
  const removeSelector = `[aria-label=${JSON.stringify(`Remove ${label}`)}]`;
  const state = await waitFor(
    () =>
      evaluate(
        client,
        `(() => { const remove = document.querySelector(${JSON.stringify(removeSelector)}); const chip = remove?.parentElement; const icon = chip?.querySelector('svg'); const spans = chip ? [...chip.querySelectorAll(':scope > span')] : []; const form = document.querySelector('[data-chat-composer-form="true"]'); const action = form?.querySelector('button[type="submit"]'); const scripts = [...document.scripts].map((script) => script.src).filter(Boolean); if (!remove || !chip || !icon || spans.length < 2 || !action) return null; const rect = (element) => { const value = element.getBoundingClientRect(); return { x: value.x, y: value.y, width: value.width, height: value.height }; }; const styles = (element) => { const value = getComputedStyle(element); return { borderRadius: value.borderRadius, backgroundColor: value.backgroundColor, gap: value.gap }; }; return { href: location.href, viewport: { width: innerWidth, height: innerHeight, devicePixelRatio }, theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light', assetScripts: scripts, desktopVisualHost: window.__T3_WORKBENCH_DESKTOP_VISUAL__ === true, chipCount: document.querySelectorAll(${JSON.stringify(removeSelector)}).length, chip: { rect: rect(chip), styles: styles(chip) }, icon: rect(icon), label: { text: spans[0]?.textContent, rect: rect(spans[0]) }, source: { text: spans[1]?.textContent, rect: rect(spans[1]) }, remove: { rect: rect(remove), ariaLabel: remove.getAttribute('aria-label') }, primaryAction: { disabled: action.disabled, ariaLabel: action.getAttribute('aria-label') } }; })()`,
      ),
    "Electron element-context chip",
    timeoutMs,
  );
  if (
    state.chipCount !== 1 ||
    state.label.text !== label ||
    state.source.text !== "Button.tsx:12"
  ) {
    throw new Error(`Electron element-context anatomy drifted: ${JSON.stringify(state)}`);
  }
  const loadedEntryAssetUrl = state.assetScripts.find((asset) =>
    new URL(asset).pathname.endsWith(expectedEntryPath),
  );
  if (!loadedEntryAssetUrl) throw new Error("Electron did not load the fresh Web entry asset.");
  await evaluate(client, `document.querySelector(${JSON.stringify(removeSelector)})?.click()`);
  await waitFor(
    () =>
      evaluate(client, `document.querySelector(${JSON.stringify(removeSelector)}) ? null : true`),
    "Electron element-context removal",
    timeoutMs,
  );
  const report = {
    schemaVersion: 1,
    status: "pass",
    recordedAt: new Date().toISOString(),
    head: spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).stdout.trim(),
    snapshotId: manifest.snapshotId,
    ownedProcessId: child.pid,
    fixture: { projectId: manifest.project.projectId, selection },
    rendererIdentity: {
      staticDir: webStaticDir,
      entryAssetUrl: loadedEntryAssetUrl,
      entryAssetSha256: expectedEntrySha256,
    },
    state: { ...state, duplicateRejected: true, removed: true },
    evidenceKind: "semantic-geometry-only",
  };
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  client?.close();
  await stopOwnedChild(child);
  rmSync(runRoot, { recursive: true, force: true });
}
