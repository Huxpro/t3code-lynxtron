#!/usr/bin/env node

// Plan 14 M1 authority run: the Web/Electron Composer on the same canonical
// snapshot as `verify-packaged-readiness.mjs --verify-m1-local-journey`.
// It pastes the same PNG through a real ClipboardEvent, picks the same file
// mention, sends one authenticated OpenCode turn, and records the canonical
// user message so `compare-m1-journey-reports.mjs` can check payload parity.

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";

import { resolveElectronLaunchCommand } from "../../desktop/scripts/electron-launcher.mjs";
import { selectElectronRendererTarget } from "./electron-cdp-target.mjs";

const appRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(appRoot, "../..");
const desktopRoot = path.join(repoRoot, "apps/desktop");
const webStaticDir = path.join(repoRoot, "apps/web/dist");
const FILE_CONTEXT_PATH = "README.md";
const PASTED_IMAGE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAA4CAIAAABYNb64AAAACXBIWXMAAAAAAAAAAQCEeRdzAAABLGlDQ1BfAAB4nH2Qv0vDUBSFP0tB1C6iooNDxi5qW7E/sA62atGxVahuaRqK2NaQRnTv6h/h7Ca4iNDZxUlwEnFxFwTXeNIMKUi9l5v7vfMOee8+iC2hiKeg0/XcaqVk1I9PjMkPJpTDMK2ew/iQ6+c19L6s/OMbF1NNu2epf6k8V4frl03xfCvkq4AbIV8HfOk5nvgmYPewWhbfi5OtEW6MsOW4gf9NXOy0L6zo3iTs7lFNva5apsK5skUbmzVqnHGKKUqxS4E86+rbyg1VmoyUAlmtUpQpkdM3x56UvPbS7AxZjuA9wyP777A18H3/MdIOBnCXhemHSEtuwmwCnp4jLXpjx3TNoRRXxewSfC9olFuY+4SZvtTFYHvMrMafWQ326WKxKspomjTZXwyUTdpwduwoAAAAsElEQVR4nL2QQQ4BQRBF688UEhORmViJAziAEzivxCWsXUBYskEQRMxMf1VtFhKx1Yt+qZ+uqt8fRVGIiEo8X4AINd6ikIQSrErgoqmAIlEJVO3k5WOv/dH0sJ5pNpgcN3Pt5mMg1XY2tB5NWz34a5/VbMAH0Ij46eX/sE/X5dXtPu9bT+JxWjlu+6XbvewWZNDqeRYDQ03W1hfBUDGKFd4Qj84m0qJjoMHCjOnSV70AR55QzMkwRuEAAAAASUVORK5CYII=";

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

function readJourneyRows(databasePath, knownThreadIds) {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const threads = database
      .prepare("SELECT thread_id AS threadId FROM projection_threads WHERE deleted_at IS NULL")
      .all()
      .map((row) => row.threadId)
      .filter((threadId) => !knownThreadIds.includes(threadId));
    if (threads.length === 0) return null;
    const count = (sql, threadId) => database.prepare(sql).get(threadId).count;
    return threads.map((threadId) => ({
      threadId,
      userMessages: database
        .prepare(
          "SELECT text, attachments_json AS attachments FROM projection_thread_messages WHERE thread_id = ? AND role = 'user'",
        )
        .all(threadId)
        .map((row) => ({ text: row.text, attachments: JSON.parse(row.attachments ?? "[]") })),
      assistantTexts: database
        .prepare(
          "SELECT text FROM projection_thread_messages WHERE thread_id = ? AND role = 'assistant' AND is_streaming = 0",
        )
        .all(threadId)
        .map((row) => row.text),
      turns: count("SELECT COUNT(*) AS count FROM projection_turns WHERE thread_id = ?", threadId),
    }));
  } finally {
    database.close();
  }
}

const fixtureDir = path.resolve(argumentValue("--fixture-dir") ?? "");
const output = path.resolve(argumentValue("--output") ?? "");
const timeoutMs = Number(argumentValue("--timeout-ms") ?? "180000");
if (!argumentValue("--fixture-dir") || !argumentValue("--output")) {
  throw new Error("--fixture-dir and --output are required.");
}
const manifest = JSON.parse(readFileSync(path.join(fixtureDir, "visual-state.json"), "utf8"));
const prefs = JSON.parse(readFileSync(path.join(fixtureDir, "lynxtron-prefs.json"), "utf8"));
const webIndex = readFileSync(path.join(webStaticDir, "index.html"), "utf8");
const expectedEntryPath = webIndex.match(
  /<script[^>]+type=["']module["'][^>]+src=["'](?<src>[^"']+)["']/u,
)?.groups?.src;
if (!expectedEntryPath) throw new Error("Fresh Web build has no module entry asset.");
const runRoot = mkdtempSync(path.join(os.tmpdir(), "t3-electron-m1-journey-"));
const electronHome = path.join(runRoot, "home");
const profile = path.join(runRoot, "profile");
cpSync(fixtureDir, electronHome, { recursive: true });
const snapshotSha256 = sha256(path.join(electronHome, "userdata/state.sqlite"));
writeFileSync(
  path.join(electronHome, "userdata/desktop-settings.json"),
  `${JSON.stringify({ mainWindowBounds: { x: 0, y: 0, width: 1280, height: 820 }, mainWindowMaximized: false }, null, 2)}\n`,
);
const databasePath = path.join(electronHome, "userdata/state.sqlite");
const knownThreadIds = new DatabaseSync(databasePath, { readOnly: true })
  .prepare("SELECT thread_id AS threadId FROM projection_threads")
  .all()
  .map((row) => row.threadId);
const promptToken = `T3_M1_JOURNEY_WEB_${Date.now()}`;
const responseToken = `${promptToken}_ACCEPTED`;
const prompt = `Reply exactly ${responseToken}. Do not use tools or modify files.`;

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
  await evaluate(
    client,
    `(() => { localStorage.setItem("t3code:theme", "dark"); location.hash = "#/"; })()`,
  );
  // Same provider path as the Lynx journey: seed Web's sticky model selection
  // before the Composer store hydrates, then reload into it.
  const selection = prefs.modelSelection;
  if (selection?.instanceId !== "opencode") {
    throw new Error(`M1 fixture must select OpenCode: ${JSON.stringify(selection)}`);
  }
  await evaluate(
    client,
    `(() => { localStorage.setItem("t3code:composer-drafts:v1", JSON.stringify({ version: 8, state: { draftsByThreadKey: {}, draftThreadsByThreadKey: {}, logicalProjectDraftThreadKeyByLogicalProjectKey: {}, stickyModelSelectionByProvider: { ${JSON.stringify(selection.instanceId)}: ${JSON.stringify(selection)} }, stickyActiveProvider: ${JSON.stringify(selection.instanceId)} } })); location.reload(); return true; })()`,
  ).catch(() => undefined);
  await client.close();
  const reloadedTarget = await waitFor(
    async () => {
      try {
        const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
        return response.ok ? selectElectronRendererTarget(await response.json()) : null;
      } catch {
        return null;
      }
    },
    "reloaded Electron product renderer",
    timeoutMs,
  );
  client = new CdpClient(reloadedTarget.webSocketDebuggerUrl);
  await client.connect();
  await client.send("Runtime.enable");
  await waitFor(
    () =>
      evaluate(
        client,
        `(() => document.body?.innerText?.includes(${JSON.stringify(manifest.project.title)}) && document.querySelector('[data-composer-editor="true"]') ? true : null)()`,
      ),
    "Electron Composer",
    timeoutMs,
  );
  const focusEditor = () =>
    evaluate(
      client,
      `(() => { const editor = document.querySelector('[data-composer-editor="true"]'); editor?.focus(); return document.activeElement === editor; })()`,
    );

  // Image: the Web product paste path with a real ClipboardEvent.
  const pasteResult = await evaluate(
    client,
    `(() => { const editor = document.querySelector('[data-composer-editor="true"]'); const bytes = Uint8Array.from(atob(${JSON.stringify(PASTED_IMAGE_BASE64)}), (c) => c.charCodeAt(0)); const transfer = new DataTransfer(); transfer.items.add(new File([bytes], "image.png", { type: "image/png" })); const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }); editor.dispatchEvent(event); return { defaultPrevented: event.defaultPrevented }; })()`,
  );
  if (pasteResult?.defaultPrevented !== true) {
    throw new Error(`Electron image paste was not consumed: ${JSON.stringify(pasteResult)}`);
  }
  await waitFor(
    () =>
      evaluate(
        client,
        `(() => document.querySelector('[aria-label="Remove image.png"]') ? true : null)()`,
      ),
    "Electron pasted image card",
    timeoutMs,
  );

  // File mention: type the trigger and pick the path item.
  if (!(await focusEditor())) throw new Error("Electron Composer editor did not take focus.");
  await client.send("Input.insertText", { text: "@READ" });
  await waitFor(
    () =>
      evaluate(
        client,
        `(() => [...document.querySelectorAll('[data-composer-item-id]')].some((item) => item.textContent.includes(${JSON.stringify(FILE_CONTEXT_PATH)})) || null)()`,
      ),
    "Electron file mention menu",
    timeoutMs,
  );
  await evaluate(
    client,
    `(() => { [...document.querySelectorAll('[data-composer-item-id]')].find((item) => item.textContent.includes(${JSON.stringify(FILE_CONTEXT_PATH)}))?.click(); return true; })()`,
  );
  await focusEditor();
  await client.send("Input.insertText", { text: prompt });
  await waitFor(
    () =>
      evaluate(
        client,
        `(() => { const text = document.querySelector('[data-composer-editor="true"]')?.innerText ?? ''; return text.includes(${JSON.stringify(responseToken)}) || null; })()`,
      ),
    "Electron prompt text",
    timeoutMs,
  );
  const submitted = await evaluate(
    client,
    `(() => { const button = document.querySelector('[data-chat-composer-form="true"] button[type="submit"]'); if (!button || button.disabled) return false; button.click(); return true; })()`,
  );
  if (!submitted) throw new Error("Electron Composer submit control was not enabled.");

  const completed = await waitFor(
    () => {
      const rows = readJourneyRows(databasePath, knownThreadIds);
      return rows?.length === 1 &&
        rows[0].assistantTexts.some((text) => text.includes(responseToken))
        ? rows
        : null;
    },
    "Electron authenticated assistant receipt",
    timeoutMs,
  );
  const [thread] = completed;
  const userMessage = thread.userMessages[0];
  const report = {
    schemaVersion: 1,
    status:
      thread.userMessages.length === 1 && thread.turns === 1 && userMessage.attachments.length === 1
        ? "pass"
        : "fail",
    recordedAt: new Date().toISOString(),
    renderer: "electron-web",
    head: spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).stdout.trim(),
    snapshotSha256,
    ownedProcessId: child.pid,
    provider: prefs.modelSelection ?? null,
    promptToken,
    canonical: {
      createdThreadIds: completed.map((row) => row.threadId),
      userMessages: thread.userMessages.length,
      turns: thread.turns,
      userMessage: {
        text: userMessage.text,
        attachments: userMessage.attachments.map((attachment) => ({
          name: attachment.name,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
        })),
      },
    },
  };
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.status !== "pass") process.exitCode = 1;
} finally {
  client?.close();
  await stopOwnedChild(child);
  rmSync(runRoot, { recursive: true, force: true });
}
