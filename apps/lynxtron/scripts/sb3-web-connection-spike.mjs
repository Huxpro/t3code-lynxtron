/**
 * SB3 spike: prove the REAL web app boots against the seeded shared server in a
 * headless browser and reaches populated state.
 *
 * This is the risk buy-down for SB3 before the full two-pane harness rewrite.
 * It stands up the seeded server (SB2 dataset), serves the real
 * `apps/web/dist` build single-origin with `/api|/ws|/oauth|/.well-known`
 * proxied to the server (exactly the dev single-origin model), opens the
 * pairing URL in headless Chrome, and asserts the web app reaches a populated
 * connected state showing a known seeded record.
 *
 * Usage:
 *   node scripts/sb3-web-connection-spike.mjs \
 *     [--base-dir apps/lynxtron/.t3-workbench] \
 *     [--output reports/sb3-web-connection.json] [--keep]
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import * as httpProxy from "node:http";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const lynxAppDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(lynxAppDir, "../..");
const WEB_DIST = path.join(repoRoot, "apps/web/dist");
const SERVER_BIN = process.env.T3_SERVER_BIN ?? path.join(repoRoot, "apps/server/dist/bin.mjs");
const CHROME_BIN =
  process.env.T3_WORKBENCH_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function argValue(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const hasFlag = (name) => process.argv.includes(name);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const baseDir = path.resolve(argValue("--base-dir", path.join(lynxAppDir, ".t3-workbench")));
const outputPath = path.resolve(argValue("--output", "reports/sb3-web-connection.json"));
const keep = hasFlag("--keep");
const HOST = "127.0.0.1";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".map": "application/json; charset=utf-8",
};

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, HOST, () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });
}

function httpRequest(port, requestPath, method, headers, body) {
  return new Promise((resolve, reject) => {
    const req = httpProxy.request(
      { host: HOST, port, path: requestPath, method, headers, timeout: 8000 },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: data }),
        );
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("http timeout")));
    if (body) req.write(body);
    req.end();
  });
}

function safeJoin(root, p) {
  const resolved = path.join(root, path.normalize(p).replace(/^(\.\.[/\\])+/, ""));
  return resolved.startsWith(root) ? resolved : null;
}

/** Proxy prefixes that must reach the real server (dev single-origin model). */
const PROXY_PREFIXES = ["/api", "/ws", "/oauth", "/.well-known"];

/**
 * Single-origin front server: static `apps/web/dist` for the app, everything in
 * PROXY_PREFIXES tunneled to the real server (HTTP and WS upgrade).
 */
function startFrontServer(serverPort) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${HOST}`);
    const pathname = decodeURIComponent(url.pathname);
    if (
      PROXY_PREFIXES.some(
        (p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p + "?"),
      )
    ) {
      // Proxy HTTP to server.
      const proxyReq = httpProxy.request(
        { host: HOST, port: serverPort, path: req.url, method: req.method, headers: req.headers },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
          proxyRes.pipe(res);
        },
      );
      proxyReq.on("error", () => res.writeHead(502).end("proxy error"));
      req.pipe(proxyReq);
      return;
    }
    // Static SPA: serve file or fall back to index.html.
    let filePath =
      pathname === "/" ? path.join(WEB_DIST, "index.html") : safeJoin(WEB_DIST, pathname);
    let info = filePath ? await stat(filePath).catch(() => null) : null;
    if (!info || !info.isFile()) {
      filePath = path.join(WEB_DIST, "index.html");
      info = await stat(filePath).catch(() => null);
      if (!info) return void res.writeHead(404).end("not found");
    }
    res.writeHead(200, {
      "content-type": MIME[path.extname(filePath)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    createReadStream(filePath).pipe(res);
  });
  // WS upgrade proxy for /ws.
  server.on("upgrade", (req, socket, head) => {
    const upstream = net.connect(serverPort, HOST, () => {
      const headerLines = [
        `${req.method} ${req.url} HTTP/1.1`,
        ...Object.entries(req.headers).map(
          ([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`,
        ),
        "",
        "",
      ].join("\r\n");
      upstream.write(headerLines);
      if (head && head.length) upstream.write(head);
      socket.pipe(upstream);
      upstream.pipe(socket);
    });
    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
  });
  return new Promise((resolve) => {
    server.listen(0, HOST, () => resolve({ server, port: server.address().port }));
  });
}

// --- minimal CDP -----------------------------------------------------------
class Cdp {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 1;
    this.pending = new Map();
    this.listeners = new Set();
  }
  async connect() {
    this.socket = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const msg = JSON.parse(String(event.data));
      if (typeof msg.id === "number") {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result ?? {});
      } else {
        for (const l of this.listeners) l(msg);
      }
    });
  }
  onEvent(l) {
    this.listeners.add(l);
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
    try {
      this.socket.close();
    } catch {
      /* noop */
    }
  }
}

async function fetchJson(endpoint, pathname) {
  const res = await fetch(new URL(pathname, endpoint));
  return res.json();
}

async function waitForDevtools(chrome) {
  return new Promise((resolve, reject) => {
    let buf = "";
    const onData = (chunk) => {
      buf += String(chunk);
      const m = buf.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (m) {
        const wsUrl = m[1];
        const endpoint = wsUrl
          .replace(/^ws:\/\//, "http://")
          .replace(/\/devtools\/browser\/.*$/, "");
        resolve(endpoint);
      }
    };
    chrome.stderr.on("data", onData);
    chrome.stdout.on("data", onData);
    chrome.on("exit", (code) => reject(new Error(`chrome exited early (${code})`)));
    setTimeout(() => reject(new Error("timed out waiting for devtools")), 15000);
  });
}

async function evaluate(cdp, sessionId, expression) {
  const r = await cdp.send(
    "Runtime.evaluate",
    { expression, awaitPromise: true, returnByValue: true },
    sessionId,
  );
  if (r.exceptionDetails)
    throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result?.value;
}

async function main() {
  const report = { task: "SB3-spike", startedAt: new Date().toISOString(), steps: {} };
  if (!existsSync(SERVER_BIN)) throw new Error(`server bin missing: ${SERVER_BIN}`);
  if (!existsSync(path.join(WEB_DIST, "index.html")))
    throw new Error(`web build missing: ${WEB_DIST}`);
  if (!existsSync(path.join(baseDir, "userdata/state.sqlite")))
    throw new Error(
      `seed missing at ${baseDir}/userdata/state.sqlite; run sb2-seed-shared-state.mjs`,
    );

  const serverPort = await findFreePort();
  const { randomBytes } = await import("node:crypto");
  const bootstrapToken = randomBytes(24).toString("hex");
  const envelope = {
    mode: "desktop",
    noBrowser: true,
    port: serverPort,
    host: HOST,
    desktopBootstrapToken: bootstrapToken,
    tailscaleServeEnabled: false,
    tailscaleServePort: 3774,
  };
  console.log(`[sb3] server on :${serverPort} baseDir=${baseDir}`);
  const child = spawn(
    process.env.T3_NODE_BIN?.trim() || "node",
    [SERVER_BIN, "serve", "--bootstrap-fd", "3", "--base-dir", baseDir],
    {
      stdio: ["ignore", "pipe", "pipe", "pipe"],
      env: { ...process.env, SHELL: "/bin/sh" },
    },
  );
  child.stdio[3].write(JSON.stringify(envelope) + "\n");
  child.stdio[3].end();
  let serverExited = false;
  let startupToken = null;
  const onServerOut = (chunk) => {
    const text = String(chunk);
    const m = text.match(/Token:\s*([A-Z0-9]+)/);
    if (m && !startupToken) startupToken = m[1];
  };
  child.stdout.on("data", onServerOut);
  child.stderr.on("data", onServerOut);
  child.on("exit", () => (serverExited = true));

  let front;
  let chrome;
  const cleanup = () => {
    try {
      chrome?.kill("SIGKILL");
    } catch {
      /* noop */
    }
    try {
      front?.server.close();
    } catch {
      /* noop */
    }
    if (!keep && child && !child.killed) child.kill("SIGKILL");
  };

  try {
    // Wait for server readiness + startup token.
    let ready = false;
    for (let i = 0; i < 120; i++) {
      if (serverExited) throw new Error("server exited before ready");
      try {
        const r = await httpRequest(serverPort, "/.well-known/t3/environment", "GET", {});
        if (r.status === 200) {
          ready = true;
          break;
        }
      } catch {
        /* not up */
      }
      await delay(500);
    }
    report.steps.serverReady = ready;
    if (!ready) throw new Error("server not ready");
    // Give the startup banner a moment to print the token.
    for (let i = 0; i < 20 && !startupToken; i++) await delay(200);
    report.steps.startupTokenObtained = Boolean(startupToken);
    if (!startupToken) throw new Error("did not capture startup pairing token");

    front = await startFrontServer(serverPort);
    const origin = `http://${HOST}:${front.port}`;
    report.origin = origin;
    console.log(
      `[sb3] front origin ${origin} (proxying ${PROXY_PREFIXES.join(",")} -> :${serverPort})`,
    );

    // Launch headless Chrome.
    const userDataDir = path.join(
      process.env.TMPDIR ?? "/tmp",
      `t3-sb3-${process.pid}-${Date.now()}`,
    );
    chrome = spawn(
      CHROME_BIN,
      [
        "--headless=new",
        "--remote-debugging-port=0",
        `--user-data-dir=${userDataDir}`,
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
    const version = await fetchJson(endpoint, "/json/version");
    const cdp = new Cdp(version.webSocketDebuggerUrl);
    await cdp.connect();
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    const console_ = [];
    await Promise.all([
      cdp.send("Runtime.enable", {}, sessionId),
      cdp.send("Page.enable", {}, sessionId),
    ]);
    cdp.onEvent((m) => {
      if (m.sessionId && m.sessionId !== sessionId) return;
      if (m.method === "Runtime.consoleAPICalled")
        console_.push({
          level: m.params.type,
          text: (m.params.args ?? []).map((a) => a.value ?? a.description ?? "").join(" "),
        });
      else if (m.method === "Runtime.exceptionThrown")
        console_.push({
          level: "error",
          text: m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text,
        });
    });
    await cdp.send(
      "Emulation.setDeviceMetricsOverride",
      { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false },
      sessionId,
    );

    const pairUrl = `${origin}/pair#token=${startupToken}`;
    console.log(`[sb3] navigating to ${pairUrl}`);
    await cdp.send("Page.navigate", { url: pairUrl }, sessionId);

    // Poll for populated state: the seeded project title should appear in the DOM.
    const seed =
      JSON.parse(
        await readFile(path.join(baseDir, "..", "reports", "sb2-seed.json"), "utf8").catch(
          () => "null",
        ),
      ) ??
      JSON.parse(
        await readFile(path.resolve(repoRoot, "apps/lynxtron/reports/sb2-seed.json"), "utf8"),
      );
    const projectTitle = seed?.dataset?.projects?.[0]?.title ?? "t3code-lynxtron";
    report.expectedProjectTitle = projectTitle;

    const deadline = Date.now() + 30000;
    let connected = false;
    let bodyText = "";
    while (Date.now() < deadline) {
      bodyText =
        (await evaluate(cdp, sessionId, "document.body ? document.body.innerText : ''").catch(
          () => "",
        )) ?? "";
      if (bodyText.includes(projectTitle)) {
        connected = true;
        break;
      }
      await delay(500);
    }
    report.steps.reachedPopulatedState = connected;
    report.bodyTextSample = bodyText.slice(0, 400);
    report.consoleErrors = console_
      .filter((e) => e.level === "error")
      .map((e) => e.text)
      .slice(0, 20);

    // Screenshot for the record.
    const shot = await cdp.send(
      "Page.captureScreenshot",
      {
        format: "png",
        clip: { x: 0, y: 0, width: 1280, height: 820, scale: 1 },
        captureBeyondViewport: true,
      },
      sessionId,
    );
    const evidenceDir = path.resolve(repoRoot, "apps/lynxtron/evidence/2026-08-03/SB3");
    await mkdir(evidenceDir, { recursive: true });
    await writeFile(path.join(evidenceDir, "web-connection.png"), Buffer.from(shot.data, "base64"));
    report.screenshot = "apps/lynxtron/evidence/2026-08-03/SB3/web-connection.png";

    cdp.close();
    report.conclusion = {
      feasible: connected,
      notes: connected
        ? [
            "Real web app connected to the seeded shared server single-origin and rendered a seeded record.",
          ]
        : ["Web app did not reach populated state; inspect consoleErrors and bodyTextSample."],
    };
  } catch (err) {
    report.error = err?.message ?? String(err);
  } finally {
    cleanup();
    report.finishedAt = new Date().toISOString();
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, JSON.stringify(report, null, 2) + "\n");
    console.log(`[sb3] report -> ${path.relative(repoRoot, outputPath)}`);
    console.log(JSON.stringify(report.conclusion ?? { error: report.error }, null, 2));
  }
  if (!keep) process.exit(report.conclusion?.feasible ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
