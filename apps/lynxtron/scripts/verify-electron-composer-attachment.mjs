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
const attachment = {
  name: "authority-pixel.png",
  mimeType: "image/png",
  base64:
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAA4CAIAAABYNb64AAAACXBIWXMAAAAAAAAAAQCEeRdzAAABLGlDQ1BfAAB4nH2Qv0vDUBSFP0tB1C6iooNDxi5qW7E/sA62atGxVahuaRqK2NaQRnTv6h/h7Ca4iNDZxUlwEnFxFwTXeNIMKUi9l5v7vfMOee8+iC2hiKeg0/XcaqVk1I9PjMkPJpTDMK2ew/iQ6+c19L6s/OMbF1NNu2epf6k8V4frl03xfCvkq4AbIV8HfOk5nvgmYPewWhbfi5OtEW6MsOW4gf9NXOy0L6zo3iTs7lFNva5apsK5skUbmzVqnHGKKUqxS4E86+rbyg1VmoyUAlmtUpQpkdM3x56UvPbS7AxZjuA9wyP777A18H3/MdIOBnCXhemHSEtuwmwCnp4jLXpjx3TNoRRXxewSfC9olFuY+4SZvtTFYHvMrMafWQ326WKxKspomjTZXwyUTdpwduwoAAAAsElEQVR4nL2QQQ4BQRBF688UEhORmViJAziAEzivxCWsXUBYskEQRMxMf1VtFhKx1Yt+qZ+uqt8fRVGIiEo8X4AINd6ikIQSrErgoqmAIlEJVO3k5WOv/dH0sJ5pNpgcN3Pt5mMg1XY2tB5NWz34a5/VbMAH0Ij46eX/sE/X5dXtPu9bT+JxWjlu+6XbvewWZNDqeRYDQ03W1hfBUDGKFd4Qj84m0qJjoMHCjOnSV70AR55QzMkwRuEAAAAASUVORK5CYII=",
};

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
const webIndex = readFileSync(path.join(webStaticDir, "index.html"), "utf8");
const expectedEntryPath = webIndex.match(
  /<script[^>]+type=["']module["'][^>]+src=["'](?<src>[^"']+)["']/u,
)?.groups?.src;
if (!expectedEntryPath) throw new Error("Fresh Web build has no module entry asset.");
const expectedEntrySha256 = sha256(path.join(webStaticDir, expectedEntryPath.replace(/^\//u, "")));
const runRoot = mkdtempSync(path.join(os.tmpdir(), "t3-electron-composer-attachment-"));
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
  await waitFor(
    () =>
      evaluate(
        client,
        `(() => document.body?.innerText?.includes(${JSON.stringify(manifest.project.title)}) && document.querySelector('[data-composer-editor="true"]') ? true : null)()`,
      ),
    "Electron Composer",
    timeoutMs,
  );
  const pasteResult = await evaluate(
    client,
    `(() => { const editor = document.querySelector('[data-composer-editor="true"]'); if (!editor) return { dispatched: false, reason: 'missing-editor' }; const bytes = Uint8Array.from(atob(${JSON.stringify(attachment.base64)}), (character) => character.charCodeAt(0)); const file = new File([bytes], ${JSON.stringify(attachment.name)}, { type: ${JSON.stringify(attachment.mimeType)} }); const transfer = new DataTransfer(); transfer.items.add(file); const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }); return { dispatched: editor.dispatchEvent(event), defaultPrevented: event.defaultPrevented, fileCount: transfer.files.length }; })()`,
  );
  if (pasteResult?.fileCount !== 1 || pasteResult.defaultPrevented !== true) {
    throw new Error(`Electron attachment paste was not consumed: ${JSON.stringify(pasteResult)}`);
  }
  const state = await waitFor(
    () =>
      evaluate(
        client,
        `(() => { const remove = document.querySelector(${JSON.stringify(`[aria-label="Remove ${attachment.name}"]`)}); const card = remove?.parentElement; const preview = card?.querySelector('img'); const form = document.querySelector('[data-chat-composer-form="true"]'); const action = form?.querySelector('button[type="submit"]'); const scripts = [...document.scripts].map((script) => script.src).filter(Boolean); if (!remove || !card || !preview || !form || !action || document.querySelector('[aria-label="Draft attachment may not persist"]')) return null; const rect = (element) => { const value = element.getBoundingClientRect(); return { x: value.x, y: value.y, width: value.width, height: value.height }; }; const styles = (element) => { const value = getComputedStyle(element); return { borderRadius: value.borderRadius, borderWidth: value.borderWidth, objectFit: value.objectFit, backgroundColor: value.backgroundColor }; }; return { href: location.href, viewport: { width: innerWidth, height: innerHeight, devicePixelRatio }, theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light', assetScripts: scripts, card: { rect: rect(card), styles: styles(card) }, preview: { rect: rect(preview), styles: styles(preview), alt: preview.alt }, remove: { rect: rect(remove), ariaLabel: remove.getAttribute('aria-label') }, primaryAction: { disabled: action.disabled, ariaLabel: action.getAttribute('aria-label') } }; })()`,
      ),
    "persisted Electron attachment card",
    timeoutMs,
  );
  const loadedEntryAssetUrl = state.assetScripts.find((asset) =>
    new URL(asset).pathname.endsWith(expectedEntryPath),
  );
  if (!loadedEntryAssetUrl) throw new Error("Electron did not load the fresh Web entry asset.");
  await evaluate(
    client,
    `(() => { document.querySelector(${JSON.stringify(`[aria-label="Remove ${attachment.name}"]`)})?.click(); return true; })()`,
  );
  await waitFor(
    () =>
      evaluate(
        client,
        `(() => document.querySelector(${JSON.stringify(`[aria-label="Remove ${attachment.name}"]`)}) ? null : true)()`,
      ),
    "Electron attachment removal",
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
    fixture: {
      projectId: manifest.project.projectId,
      attachment: { name: attachment.name, mimeType: attachment.mimeType },
    },
    rendererIdentity: {
      staticDir: webStaticDir,
      entryAssetUrl: loadedEntryAssetUrl,
      entryAssetSha256: expectedEntrySha256,
    },
    state: { ...state, removed: true },
    evidenceKind: "semantic-geometry-only",
  };
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  client?.close();
  await stopOwnedChild(child);
  rmSync(runRoot, { recursive: true, force: true });
}
