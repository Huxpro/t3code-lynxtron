#!/usr/bin/env node

import { spawn } from "node:child_process";
import {
  createReadStream,
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { createServer, request as httpRequest } from "node:http";
import { createRequire } from "node:module";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const appRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(appRoot, "../..");
const webDist = path.join(repoRoot, "apps/web/dist");
const chromeBinary =
  process.env.T3_WORKBENCH_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const { T3Connector } = require(path.join(appRoot, "dist/desktop/connector.bundle.cjs"));
const sourceFixture = process.argv.slice(2).find((argument) => argument !== "--");
if (!sourceFixture) {
  throw new Error("Usage: shared-environment-web-native-smoke.mjs <fixture-dir>");
}
if (!existsSync(path.join(webDist, "index.html"))) {
  throw new Error(`Web build missing at ${webDist}; run the production Web build first.`);
}
if (!existsSync(chromeBinary)) {
  throw new Error(`Chrome binary missing at ${chromeBinary}.`);
}

const host = "127.0.0.1";
const runRoot = mkdtempSync(path.join(tmpdir(), "t3-shared-environment-web-native-"));
const stateDir = path.join(runRoot, "state");
const nativeOutputDir = path.join(runRoot, "native");
const nativePairingUrlFile = path.join(runRoot, "native-pairing-url.txt");
const nativeReportPath = path.join(nativeOutputDir, "report.json");
const webScreenshotPath = path.join(runRoot, "web-authority.png");
const browserProfile = path.join(runRoot, "chrome-profile");
cpSync(path.resolve(sourceFixture), stateDir, { recursive: true });

const manifestPath = path.join(stateDir, "visual-state.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const threadId = manifest.transcriptFixture?.threadId ?? manifest.idleThreadFixture?.threadId;
if (typeof threadId !== "string") {
  throw new Error("Shared Web/Native smoke requires a fixture thread id.");
}
const initialTitle = `Shared client thread ${Date.now()}`;
const webTitle = `${initialTitle} web`;
const finalTitle = `${initialTitle} owner`;
manifest.sidebarFixture = { ...(manifest.sidebarFixture ?? {}), titles: [initialTitle] };
manifest.transcriptFixture = manifest.transcriptFixture
  ? { ...manifest.transcriptFixture, title: initialTitle }
  : manifest.transcriptFixture;
manifest.idleThreadFixture = manifest.idleThreadFixture
  ? { ...manifest.idleThreadFixture, title: initialTitle }
  : manifest.idleThreadFixture;
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const previous = {
  baseDir: process.env.T3_LYNXTRON_BASE_DIR,
  pairingUrl: process.env.T3_LYNXTRON_PAIRING_URL,
  projectCwd: process.env.T3_LYNXTRON_PROJECT_CWD,
  serverStdio: process.env.T3_LYNXTRON_SERVER_STDIO,
};
function restoreEnvironment() {
  for (const [key, value] of Object.entries({
    T3_LYNXTRON_BASE_DIR: previous.baseDir,
    T3_LYNXTRON_PAIRING_URL: previous.pairingUrl,
    T3_LYNXTRON_PROJECT_CWD: previous.projectCwd,
    T3_LYNXTRON_SERVER_STDIO: previous.serverStdio,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
async function waitFor(read, label, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let latest;
  while (Date.now() < deadline) {
    latest = await read();
    if (latest) return latest;
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(latest)}`);
}

function safeJoin(root, requestPath) {
  const resolved = path.join(root, path.normalize(requestPath).replace(/^(\.\.[/\\])+/, ""));
  return resolved.startsWith(root) ? resolved : null;
}

const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};
const proxyPrefixes = ["/api", "/ws", "/oauth", "/.well-known"];
function startFrontServer(serverPort) {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${host}`);
    const pathname = decodeURIComponent(url.pathname);
    if (proxyPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
      const proxy = httpRequest(
        {
          host,
          port: serverPort,
          path: request.url,
          method: request.method,
          headers: request.headers,
        },
        (upstream) => {
          response.writeHead(upstream.statusCode ?? 502, upstream.headers);
          upstream.pipe(response);
        },
      );
      proxy.on("error", () => response.writeHead(502).end("proxy error"));
      request.pipe(proxy);
      return;
    }
    let filePath =
      pathname === "/" ? path.join(webDist, "index.html") : safeJoin(webDist, pathname);
    let info = filePath ? await stat(filePath).catch(() => null) : null;
    if (!info?.isFile()) {
      filePath = path.join(webDist, "index.html");
      info = await stat(filePath).catch(() => null);
    }
    if (!info?.isFile()) return void response.writeHead(404).end("not found");
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": mime[path.extname(filePath)] ?? "application/octet-stream",
    });
    createReadStream(filePath).pipe(response);
  });
  server.on("upgrade", (request, socket, head) => {
    const upstream = net.connect(serverPort, host, () => {
      upstream.write(
        [
          `${request.method} ${request.url} HTTP/1.1`,
          ...Object.entries(request.headers).map(
            ([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`,
          ),
          "",
          "",
        ].join("\r\n"),
      );
      if (head.length > 0) upstream.write(head);
      socket.pipe(upstream);
      upstream.pipe(socket);
    });
    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
  });
  return new Promise((resolve) => {
    server.listen(0, host, () => resolve({ server, port: server.address().port }));
  });
}

class Cdp {
  constructor(url) {
    this.url = url;
    this.id = 1;
    this.pending = new Map();
    this.listeners = new Set();
  }
  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (typeof message.id === "number") {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result ?? {});
      } else {
        for (const listener of this.listeners) listener(message);
      }
    });
  }
  onEvent(listener) {
    this.listeners.add(listener);
  }
  send(method, params = {}, sessionId) {
    const id = this.id++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify(payload));
    });
  }
  close() {
    this.socket?.close();
  }
}

async function evaluate(cdp, sessionId, expression) {
  const result = await cdp.send(
    "Runtime.evaluate",
    { expression, awaitPromise: true, returnByValue: true },
    sessionId,
  );
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result?.value;
}

function waitForDevtools(chrome) {
  return new Promise((resolve, reject) => {
    let output = "";
    const onData = (chunk) => {
      output += String(chunk);
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        resolve(match[1].replace(/^ws:\/\//, "http://").replace(/\/devtools\/browser\/.*$/, ""));
      }
    };
    chrome.stderr.on("data", onData);
    chrome.stdout.on("data", onData);
    chrome.once("exit", (code) => reject(new Error(`Chrome exited before DevTools (${code}).`)));
    setTimeout(() => reject(new Error("Timed out waiting for Chrome DevTools.")), 15_000);
  });
}

async function waitForChildExit(child, timeoutMs) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

async function stopOwnedChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  if (await waitForChildExit(child, 2_000)) return;
  child.kill("SIGKILL");
  await waitForChildExit(child, 2_000);
}

async function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Command failed code=${code} signal=${signal}: ${stderr || stdout}`));
    });
  });
}

let shell = { projects: [], threads: [] };
const statuses = [];
const owner = new T3Connector({
  onStatus: (status, detail) => statuses.push({ status, detail }),
  onConfig: () => {},
  onAccess: () => {},
  onShell: (next) => {
    shell = next;
  },
  onThread: () => {},
  onLog: () => {},
});
let front;
let chrome;
let cdp;

try {
  process.env.T3_LYNXTRON_BASE_DIR = stateDir;
  process.env.T3_LYNXTRON_PROJECT_CWD = repoRoot;
  process.env.T3_LYNXTRON_SERVER_STDIO = "ignore";
  delete process.env.T3_LYNXTRON_PAIRING_URL;

  await owner.connect();
  const ownerPort = await waitFor(() => {
    const detail = statuses.find(({ status }) => status === "starting-server")?.detail;
    const match = detail?.match(/:(\d+)$/u);
    return match ? Number(match[1]) : null;
  }, "owner server port");
  await owner.renameThread({ threadId, title: initialTitle });
  await waitFor(
    () => shell.threads.find((thread) => thread.id === threadId && thread.title === initialTitle),
    "initial owner rename",
  );

  const webPairing = await owner.createPairingCredential({ label: "Web shared thread authority" });
  front = await startFrontServer(ownerPort);
  const origin = `http://${host}:${front.port}`;
  chrome = spawn(
    chromeBinary,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${browserProfile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--disable-gpu",
      "about:blank",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const endpoint = await waitForDevtools(chrome);
  const version = await fetch(new URL("/json/version", endpoint)).then((response) =>
    response.json(),
  );
  cdp = new Cdp(version.webSocketDebuggerUrl);
  await cdp.connect();
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const consoleEvents = [];
  await Promise.all([
    cdp.send("Runtime.enable", {}, sessionId),
    cdp.send("Log.enable", {}, sessionId),
    cdp.send("Page.enable", {}, sessionId),
    cdp.send(
      "Emulation.setDeviceMetricsOverride",
      { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false },
      sessionId,
    ),
  ]);
  cdp.onEvent((event) => {
    if (event.sessionId && event.sessionId !== sessionId) return;
    if (event.method === "Runtime.consoleAPICalled") {
      consoleEvents.push({
        level: event.params.type,
        text: event.params.args
          .map((argument) => argument.value ?? argument.description ?? "")
          .join(" "),
      });
    } else if (event.method === "Runtime.exceptionThrown") {
      consoleEvents.push({
        level: "error",
        text:
          event.params.exceptionDetails.exception?.description ??
          event.params.exceptionDetails.text,
      });
    } else if (event.method === "Log.entryAdded") {
      consoleEvents.push({ level: event.params.entry.level, text: event.params.entry.text });
    }
  });
  await cdp.send(
    "Page.navigate",
    {
      url: `${origin}/pair#token=${encodeURIComponent(webPairing.credential)}`,
    },
    sessionId,
  );

  const webReady = await waitFor(
    () =>
      evaluate(
        cdp,
        sessionId,
        `(() => {
          const row = document.querySelector('[data-thread-id=${JSON.stringify(threadId)}]');
          return row && document.body?.innerText.includes(${JSON.stringify(initialTitle)})
            ? { href: location.origin + location.pathname, text: row.textContent, readyState: document.readyState }
            : null;
        })()`,
      ).catch(() => null),
    "Web authority rendering the shared thread",
  );

  const point = await evaluate(
    cdp,
    sessionId,
    `(() => {
      const row = document.querySelector('[data-thread-id=${JSON.stringify(threadId)}] [role="button"]')
        ?? document.querySelector('[data-thread-id=${JSON.stringify(threadId)}]');
      if (!row) return null;
      const rect = row.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    })()`,
  );
  if (!point) throw new Error("Could not locate the Web thread row.");
  await cdp.send(
    "Input.dispatchMouseEvent",
    {
      type: "mousePressed",
      ...point,
      button: "left",
      clickCount: 2,
    },
    sessionId,
  );
  await cdp.send(
    "Input.dispatchMouseEvent",
    {
      type: "mouseReleased",
      ...point,
      button: "left",
      clickCount: 2,
    },
    sessionId,
  );
  await waitFor(
    () =>
      evaluate(
        cdp,
        sessionId,
        `Boolean(document.querySelector('input[aria-label="Thread title"]'))`,
      ),
    "Web rename input",
  );
  await cdp.send("Input.insertText", { text: webTitle }, sessionId);
  await cdp.send(
    "Input.dispatchKeyEvent",
    {
      type: "rawKeyDown",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
    },
    sessionId,
  );
  await cdp.send(
    "Input.dispatchKeyEvent",
    {
      type: "keyUp",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
    },
    sessionId,
  );
  await waitFor(
    () => shell.threads.find((thread) => thread.id === threadId && thread.title === webTitle),
    "Web-authored rename in owner projection",
  );

  manifest.sidebarFixture = { ...(manifest.sidebarFixture ?? {}), titles: [webTitle] };
  if (manifest.transcriptFixture) manifest.transcriptFixture.title = webTitle;
  if (manifest.idleThreadFixture) manifest.idleThreadFixture.title = webTitle;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const nativePairing = await owner.createPairingCredential({
    label: "Native shared thread client",
  });
  writeFileSync(
    nativePairingUrlFile,
    `http://${host}:${ownerPort}/pair#token=${encodeURIComponent(nativePairing.credential)}\n`,
    { mode: 0o600 },
  );
  await runCommand(process.execPath, [
    path.join(appRoot, "scripts/verify-packaged-readiness.mjs"),
    "--fixture-dir",
    stateDir,
    "--project-cwd",
    repoRoot,
    "--output",
    nativeReportPath,
    "--runs",
    "1",
    "--width",
    "1280",
    "--height",
    "820",
    "--expected-theme",
    "dark",
    "--pairing-url-file",
    nativePairingUrlFile,
    "--timeout-ms",
    "60000",
  ]);
  const nativeReport = JSON.parse(readFileSync(nativeReportPath, "utf8"));
  const native = nativeReport.results?.[0];
  if (
    nativeReport.status !== "pass" ||
    native?.connection?.mode !== "existing-environment" ||
    native.connection.serverOwned !== false ||
    native.canonicalState?.canonicalThreadTitle !== webTitle
  ) {
    throw new Error(
      `Native shared-environment verification failed: ${JSON.stringify(nativeReport)}`,
    );
  }

  await owner.renameThread({ threadId, title: finalTitle });
  const webFinal = await waitFor(
    () =>
      evaluate(
        cdp,
        sessionId,
        `(() => {
          const row = document.querySelector('[data-thread-id=${JSON.stringify(threadId)}]');
          return row?.textContent?.includes(${JSON.stringify(finalTitle)})
            ? { text: row.textContent, href: location.origin + location.pathname }
            : null;
        })()`,
      ).catch(() => null),
    "Web observing the owner rename after Native exit",
  );
  const screenshot = await cdp.send(
    "Page.captureScreenshot",
    {
      format: "png",
      captureBeyondViewport: false,
    },
    sessionId,
  );
  await writeFile(webScreenshotPath, Buffer.from(screenshot.data, "base64"));
  const browserErrors = consoleEvents.filter((event) => event.level === "error");
  if (browserErrors.length > 0) {
    throw new Error(`Web authority emitted console errors: ${JSON.stringify(browserErrors)}`);
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        status: "pass",
        runRoot,
        ownerPort,
        threadId,
        web: {
          browserProcessId: chrome.pid,
          browserProduct: version.Browser,
          origin,
          initial: webReady,
          authoredTitle: webTitle,
          final: webFinal,
          consoleErrors: browserErrors,
          screenshotPath: webScreenshotPath,
        },
        native: {
          processId: native.processId,
          connection: native.connection,
          canonicalTitle: native.canonicalState.canonicalThreadTitle,
          rendererErrors: native.rendererErrors,
          reportPath: nativeReportPath,
        },
        finalOwnerTitle: finalTitle,
        pairingCredentialRetained: false,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  rmSync(nativePairingUrlFile, { force: true });
  cdp?.close();
  await stopOwnedChild(chrome);
  await new Promise((resolve) => front?.server.close(resolve) ?? resolve());
  owner.dispose();
  restoreEnvironment();
  rmSync(browserProfile, { force: true, recursive: true });
}
