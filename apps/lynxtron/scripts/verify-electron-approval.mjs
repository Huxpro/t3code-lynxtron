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
const verifyMessageCard = process.argv.includes("--message-card");
if (!argumentValue("--fixture-dir") || !argumentValue("--output")) {
  throw new Error("--fixture-dir and --output are required.");
}
const manifestPath = path.join(fixtureDir, "visual-state.json");
const sourceDatabase = path.join(fixtureDir, "userdata/state.sqlite");
if (!existsSync(manifestPath) || !existsSync(sourceDatabase)) {
  throw new Error("Electron approval gate requires a prepared fixture.");
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const fixture = verifyMessageCard ? manifest.messageCardFixture : manifest.pendingRequestFixture;
if (verifyMessageCard) {
  if (
    typeof fixture?.threadId !== "string" ||
    typeof fixture?.review?.filePath !== "string" ||
    typeof fixture?.preview?.id !== "string" ||
    typeof fixture?.element?.header !== "string"
  ) {
    throw new Error("Fixture manifest has no valid message-card fixture.");
  }
} else if (
  fixture?.mode !== "approval" ||
  fixture.activity?.kind !== "approval.requested" ||
  typeof fixture.activity?.payload?.requestId !== "string"
) {
  throw new Error("Fixture manifest has no valid pending approval.");
}
const runRoot = mkdtempSync(
  path.join(os.tmpdir(), verifyMessageCard ? "t3-electron-message-card-" : "t3-electron-approval-"),
);
const electronHome = path.join(runRoot, "home");
const profile = path.join(runRoot, "profile");
cpSync(fixtureDir, electronHome, { recursive: true });
writeFileSync(
  path.join(electronHome, "userdata/desktop-settings.json"),
  `${JSON.stringify({ mainWindowBounds: { x: 0, y: 0, width, height }, mainWindowMaximized: false }, null, 2)}\n`,
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
  const environmentIdPath = path.join(electronHome, "userdata/environment-id");
  const environmentId = await waitFor(
    () =>
      existsSync(environmentIdPath) ? readFileSync(environmentIdPath, "utf8").trim() || null : null,
    "Electron environment identity",
    timeoutMs,
  );
  const reloadingForTheme = await evaluate(
    client,
    '(() => { if (localStorage.getItem("t3code:theme") === "dark") return false; localStorage.setItem("t3code:theme", "dark"); location.reload(); return true; })()',
  );
  if (reloadingForTheme) await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  const canonicalRoute = `/${encodeURIComponent(environmentId)}/${encodeURIComponent(fixture.threadId)}`;
  await evaluate(client, `(() => { location.hash = "#" + ${JSON.stringify(canonicalRoute)}; })()`);
  const expectedDetail = verifyMessageCard ? undefined : fixture.activity.payload.detail;
  const expectedActions = ["Cancel turn", "Decline", "Always allow this session", "Approve once"];
  let state;
  try {
    state = verifyMessageCard
      ? await waitFor(
          () =>
            evaluate(
              client,
              `(() => {
              const review = document.querySelector('[data-review-comment-file=${JSON.stringify(fixture.review.filePath)}]');
              const preview = document.querySelector('[data-preview-annotation=${JSON.stringify(fixture.preview.id)}]');
              const element = document.querySelector('[data-message-context-kind="element"]');
              if (!review || !preview || !element) return null;
              return {
                href: location.href,
                viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
                theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
                visiblePageText: document.body?.innerText?.replace(/\\s+/g, ' ').trim() ?? '',
                review: {
                  filePath: review.getAttribute('data-review-comment-file'),
                  rangeLabel: review.getAttribute('data-review-comment-range'),
                  text: review.textContent?.replace(/\\s+/g, ' ').trim() ?? ''
                },
                preview: {
                  id: preview.getAttribute('data-preview-annotation'),
                  text: preview.textContent?.replace(/\\s+/g, ' ').trim() ?? ''
                },
                element: {
                  kind: element.getAttribute('data-message-context-kind'),
                  text: element.textContent?.replace(/\\s+/g, ' ').trim() ?? ''
                }
              };
            })()`,
            ),
          "Electron message cards",
          timeoutMs,
        )
      : await waitFor(
          () =>
            evaluate(
              client,
              `(() => {
          const pending = document.querySelector('[data-composer-pending-kind="approval"]');
          const summary = document.querySelector('.composer-pending-approval__summary');
          const detail = document.querySelector('[data-approval-detail="complete"]');
          const frame = document.querySelector('[data-composer-state]');
          const actions = Array.from(document.querySelectorAll('.composer-approval-action'));
          if (!pending || !summary || !detail || !frame || actions.length !== 4) return null;
          return {
            href: location.href,
            viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
            theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
            composerState: frame.getAttribute('data-composer-state'),
            pending: pending.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
            summary: summary.textContent?.trim() ?? '',
            detail: detail.textContent?.trim() ?? '',
            actions: actions.map((action) => action.textContent?.trim() ?? ''),
            disabled: actions.map((action) => action.matches(':disabled'))
          };
            })()`,
            ),
          "Electron pending approval",
          timeoutMs,
        );
  } catch (error) {
    const diagnostic = await evaluate(
      client,
      `(() => ({
        href: location.href,
        bodyText: (document.body?.innerText ?? '').slice(0, 1200),
        rowIds: Array.from(document.querySelectorAll('[data-timeline-row-id]')).map((row) => row.getAttribute('data-timeline-row-id')),
        reviewCount: document.querySelectorAll('.transcript-review-comment').length,
        previewCount: document.querySelectorAll('[data-preview-annotation]').length,
        elementCount: document.querySelectorAll('[data-message-context-kind="element"]').length
      }))()`,
    ).catch(() => null);
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}; diagnostic=${JSON.stringify(diagnostic)}`,
    );
  }
  const identityMatches = state.href.includes(canonicalRoute) && state.theme === "dark";
  const contentMatches = verifyMessageCard
    ? state.review.filePath === fixture.review.filePath &&
      state.review.rangeLabel === fixture.review.rangeLabel &&
      state.preview.id === fixture.preview.id &&
      state.element.kind === "element" &&
      state.visiblePageText.includes("Keep the shared card semantics aligned.") &&
      state.visiblePageText.includes(fixture.preview.comment) &&
      state.visiblePageText.includes("1 selected element.") &&
      state.visiblePageText.includes(fixture.element.header)
    : state.composerState === "working" &&
      state.pending.includes("PENDING APPROVAL") &&
      state.summary.replace(/\s+/g, "") === "Commandapprovalrequested" &&
      state.pending.includes(expectedDetail) &&
      state.detail === expectedDetail &&
      JSON.stringify(state.actions) === JSON.stringify(expectedActions) &&
      state.disabled.every((disabled) => disabled === false);
  if (!identityMatches || !contentMatches) {
    throw new Error(
      `Electron ${verifyMessageCard ? "message-card" : "approval"} semantics drifted: ${JSON.stringify(state)}`,
    );
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
    fixture: {
      environmentId,
      threadId: fixture.threadId,
      ...(verifyMessageCard
        ? { turnId: fixture.turnId, userMessageId: fixture.userMessageId }
        : { requestId: fixture.activity.payload.requestId, activeTurnId: fixture.activeTurnId }),
      backendBehaviorClaimed: manifest.preparation?.backendBehaviorClaimed === true,
    },
    requestedWindow: { width, height },
    cdpPort,
    backendPort,
    state,
    evidenceKind: "semantic-only",
  };
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  client?.close();
  await stopOwnedChild(child);
  rmSync(profile, { recursive: true, force: true });
  rmSync(runRoot, { recursive: true, force: true });
}
