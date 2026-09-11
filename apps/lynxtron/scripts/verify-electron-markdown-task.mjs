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

const fixtureDir = path.resolve(argumentValue("--fixture-dir") ?? "");
const output = path.resolve(argumentValue("--output") ?? "");
const timeoutMs = Number(argumentValue("--timeout-ms") ?? "90000");
if (!argumentValue("--fixture-dir") || !argumentValue("--output")) {
  throw new Error("--fixture-dir and --output are required.");
}
const manifest = JSON.parse(readFileSync(path.join(fixtureDir, "visual-state.json"), "utf8"));
const fixture = manifest.markdownTaskFixture;
if (
  typeof fixture?.relativePath !== "string" ||
  typeof fixture?.before !== "string" ||
  typeof fixture?.after !== "string"
) {
  throw new Error("Fixture manifest has no canonical markdownTaskFixture.");
}
const expectedTaskCount = Number.isInteger(fixture.taskCount)
  ? fixture.taskCount
  : [...fixture.before.matchAll(/\[[ xX]\]/gu)].length;
if (expectedTaskCount < 1) throw new Error("Markdown task fixture has no task markers.");
const workspaceFile = path.join(manifest.project.workspaceRoot, fixture.relativePath);
if (readFileSync(workspaceFile, "utf8") !== fixture.before) {
  throw new Error("Markdown task workspace did not start from canonical bytes.");
}
const runRoot = mkdtempSync(path.join(os.tmpdir(), "t3-electron-markdown-task-"));
const electronHome = path.join(runRoot, "home");
const profile = path.join(runRoot, "profile");
cpSync(fixtureDir, electronHome, { recursive: true });
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
  const environmentIdPath = path.join(electronHome, "userdata/environment-id");
  const environmentId = await waitFor(
    () =>
      existsSync(environmentIdPath) ? readFileSync(environmentIdPath, "utf8").trim() || null : null,
    "Electron environment identity",
    timeoutMs,
  );
  await evaluate(
    client,
    `(() => { localStorage.setItem("t3code:theme", "dark"); location.hash = "#/"; })()`,
  );
  try {
    await waitFor(
      () =>
        evaluate(
          client,
          `(() => document.body?.innerText?.includes(${JSON.stringify(manifest.project.title)}) || null)()`,
        ),
      "Electron project route",
      timeoutMs,
    );
  } catch (error) {
    const diagnostic = await evaluate(
      client,
      `(() => ({ href: location.href, bodyText: (document.body?.innerText ?? '').slice(0, 1600) }))()`,
    ).catch(() => null);
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}; diagnostic=${JSON.stringify(diagnostic)}`,
    );
  }
  await evaluate(
    client,
    `(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", code: "KeyP", metaKey: true, bubbles: true })); return true; })()`,
  );
  await waitFor(
    () =>
      evaluate(
        client,
        `(() => document.querySelector('[data-search-overlay-mode="files"]') ? true : null)()`,
      ),
    "Electron File Picker",
    timeoutMs,
  );
  await waitFor(
    () =>
      evaluate(
        client,
        `(() => { const row = [...document.querySelectorAll('[data-palette-row="true"]')].find((item) => item.textContent?.includes(${JSON.stringify(fixture.relativePath)})); if (!row) return null; row.click(); return true; })()`,
      ),
    "Electron README result",
    timeoutMs,
  );
  await waitFor(
    () =>
      evaluate(
        client,
        `(() => document.querySelector('[aria-label="Show rendered markdown"]') ? true : null)()`,
      ),
    "Electron Markdown source view",
    timeoutMs,
  );
  await evaluate(
    client,
    `(() => { document.querySelector('[aria-label="Show rendered markdown"]')?.click(); return true; })()`,
  );
  let before;
  try {
    before = await waitFor(
      () =>
        evaluate(
          client,
          `(() => { const tasks = [...document.querySelectorAll('input[name="markdown-task"]')]; if (tasks.length !== ${JSON.stringify(expectedTaskCount)} || tasks.every((task) => task.checked)) return null; return { viewport: { width: innerWidth, height: innerHeight, devicePixelRatio }, theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light', taskCount: tasks.length, initialChecked: tasks.map((task) => task.checked) }; })()`,
        ),
      "Electron rendered Markdown tasks",
      timeoutMs,
    );
  } catch (error) {
    const diagnostic = await evaluate(
      client,
      `(() => ({ bodyText: (document.body?.innerText ?? '').slice(0, 2000), taskCount: document.querySelectorAll('input[name="markdown-task"]').length, inputs: [...document.querySelectorAll('input[type="checkbox"]')].map((input) => ({ name: input.name, checked: input.checked, disabled: input.disabled })), details: [...document.querySelectorAll('details')].map((item) => ({ open: item.open, text: item.textContent })) }))()`,
    ).catch(() => null);
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}; diagnostic=${JSON.stringify(diagnostic)}`,
    );
  }
  await evaluate(
    client,
    `(() => { const tasks = [...document.querySelectorAll('input[name="markdown-task"]')]; for (const task of tasks) if (!task.checked) task.click(); return tasks.length; })()`,
  );
  await waitFor(
    () => (readFileSync(workspaceFile, "utf8") === fixture.after ? true : null),
    "Electron task persistence",
    timeoutMs,
  );
  const after = await evaluate(
    client,
    `(() => ({ checked: [...document.querySelectorAll('input[name="markdown-task"]')].map((input) => input.checked), saveError: Boolean(document.querySelector('[data-file-save-error]')) }))()`,
  );
  if (
    before.taskCount !== expectedTaskCount ||
    after.checked.length !== expectedTaskCount ||
    after.checked.some((checked) => checked !== true) ||
    after.saveError
  ) {
    throw new Error(`Electron Markdown task state drifted: ${JSON.stringify({ before, after })}`);
  }
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
    fixture: {
      environmentId,
      projectId: manifest.project.projectId,
      variant: fixture.variant ?? "simple",
      relativePath: fixture.relativePath,
      taskCount: expectedTaskCount,
      before: fixture.before,
      after: fixture.after,
      backendBehaviorClaimed: true,
    },
    state: { ...before, ...after, fileSha256: sha256(workspaceFile) },
    evidenceKind: "semantic-only",
  };
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  client?.close();
  await stopOwnedChild(child);
  rmSync(runRoot, { recursive: true, force: true });
}
