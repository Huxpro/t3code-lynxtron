/**
 * SB3 single-server dual-frontend workbench capture.
 *
 * Replaces the hand-built Web reference pane with the REAL Web app. It:
 *   1. launches ONE seeded, isolated T3 Code server (SB2 dataset),
 *   2. serves both panes single-origin — the real `apps/web/dist` under
 *      `/web-app/`, the Lynx-for-Web bundle under `/lynx/` — and proxies
 *      `/api|/ws|/oauth|/.well-known` to the server (the dev single-origin
 *      model, so no baked origins and no CORS),
 *   3. mints ONE wsTicket per run for the Lynx pane's live connector transport,
 *      captures the web pane's pairing token from server startup output,
 *   4. for each viewport, waits for BOTH panes to render the same seeded record
 *      from the same server, then records identity, geometry, console, and the
 *      single/side-by-side/diff PNGs and a comparison.html.
 *
 * Both panes are the shipping artifacts, so a difference the harness surfaces is
 * a real Web-vs-Lynx-for-Web difference, not a reference-fidelity artifact.
 * Native Lynxtron correlation remains Plan 11A BW5; browser evidence is
 * diagnostic until then.
 *
 * Usage:
 *   node scripts/capture-shared-workbench.mjs \
 *     [--base-dir apps/lynxtron/.t3-workbench] [--viewport 1280x820] [--all-viewports] \
 *     [--output evidence/2026-08-03/SB4] [--keep-server]
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { createServer, request as httpRequestRaw } from "node:http";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const lynxAppDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(lynxAppDir, "../..");
const WEB_DIST = path.join(repoRoot, "apps/web/dist");
const LYNX_BUILD_DIR = path.join(lynxAppDir, "output/browser-preview");
const WORKBENCH_ASSETS = path.join(scriptDir, "shared-workbench");
const SERVER_BIN = process.env.T3_SERVER_BIN ?? path.join(repoRoot, "apps/server/dist/bin.mjs");
const CHROME_BIN =
  process.env.T3_WORKBENCH_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const HOST = "127.0.0.1";

function argValue(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const hasFlag = (name) => process.argv.includes(name);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const baseDir = path.resolve(argValue("--base-dir", path.join(lynxAppDir, ".t3-workbench")));
const outputRoot = path.resolve(argValue("--output", "evidence/2026-08-03/SB4"));
const manifestPath = process.argv.includes("--manifest")
  ? path.resolve(argValue("--manifest", ""))
  : null;
const stateId = argValue("--state-id", "new-thread-hero");
const semanticRoute = argValue("--semantic-route", "new-thread");
const requestedWebRoute = argValue(
  "--web-route",
  semanticRoute.startsWith("settings-")
    ? `/settings/${semanticRoute
        .replace(/^settings-/, "")
        .replace(/-(loading|error|mutation)$/, "")}`
    : "/",
);
const theme = argValue("--theme", "dark") === "light" ? "light" : "dark";
const overlay = argValue("--overlay", "");
const requiresShortcutInput = overlay === "quick-switch" || overlay === "file-picker";
const query = argValue("--query", "");
const providerId = argValue("--provider-id", "");
const composerInput = argValue("--composer-input", "");
const sidebarQuery = argValue("--sidebar-query", "");
const sidebarTargetState = argValue("--sidebar-state", "");
const changedFilesTargetState = argValue("--changed-files-state", "");
const expandTurnId = argValue("--expand-turn-id", "");
const explicitExpectedThreadId = argValue("--expect-thread", "");
const expandThinking = hasFlag("--expand-thinking");
const keepServer = hasFlag("--keep-server");
const timeoutMs = Number(argValue("--timeout-ms", "35000"));
if (sidebarTargetState && !["expanded", "collapsed"].includes(sidebarTargetState)) {
  throw new Error(`Unsupported --sidebar-state: ${sidebarTargetState}`);
}
if (changedFilesTargetState && !["expanded", "collapsed"].includes(changedFilesTargetState)) {
  throw new Error(`Unsupported --changed-files-state: ${changedFilesTargetState}`);
}
const isLifecycleFaultState = stateId === "lifecycle-error" || stateId === "composer-disabled";
const composerExpectationByStateId = {
  "composer-hero": {
    layout: "hero",
    state: "idle",
    primaryState: "disabled",
    editorDisabled: false,
  },
  "composer-sendable": {
    layout: "hero",
    state: "sendable",
    primaryState: "send",
    editorDisabled: false,
  },
  "composer-docked": {
    layout: "docked",
    state: "idle",
    primaryState: "disabled",
    editorDisabled: false,
  },
  "composer-working": {
    layout: "docked",
    state: "working",
    primaryState: "stop",
    editorDisabled: false,
  },
  "composer-disabled": {
    layout: "docked",
    state: "disabled",
    primaryState: "disabled",
    editorDisabled: false,
  },
};
const composerExpectation = composerExpectationByStateId[stateId] ?? null;
const isReviewState = stateId.startsWith("review-");
const reviewExpectation =
  stateId === "review-empty"
    ? "panel-empty"
    : stateId === "review-checkpoint"
      ? "checkpoint"
      : stateId === "review-tree"
        ? "tree"
        : stateId === "review-diff"
          ? "diff"
          : null;
const ALL_VIEWPORTS = ["1280x820", "1440x900"];
const viewports = (
  hasFlag("--all-viewports") ? ALL_VIEWPORTS : [argValue("--viewport", "1280x820")]
).map((cell) => {
  const [w, h] = cell.split("x").map(Number);
  return { width: w, height: h, label: cell };
});

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
  ".bundle": "application/octet-stream",
};

function composerMetricsMatch(metrics, expectation) {
  return (
    metrics?.layout === expectation.layout &&
    metrics?.state === expectation.state &&
    metrics?.primaryState === expectation.primaryState &&
    metrics?.editor?.disabled === expectation.editorDisabled
  );
}

function composerAnatomyMatches(webMetrics, lynxMetrics) {
  if (!webMetrics && !lynxMetrics) return true;
  if (!webMetrics || !lynxMetrics) return false;
  const webControls = (webMetrics.controls ?? []).map(({ id, label }) => ({ id, label }));
  const lynxControls = (lynxMetrics.controls ?? []).map(({ id, label }) => ({ id, label }));
  if (JSON.stringify(webControls) !== JSON.stringify(lynxControls)) return false;
  if ((webMetrics.placeholder ?? null) !== (lynxMetrics.placeholder ?? null)) return false;
  if (
    JSON.stringify(webMetrics.contextLabels ?? []) !==
    JSON.stringify(lynxMetrics.contextLabels ?? [])
  ) {
    return false;
  }
  const webStatus = webMetrics.anatomy?.statusBanner;
  const lynxStatus = lynxMetrics.anatomy?.statusBanner;
  if (Boolean(webStatus) !== Boolean(lynxStatus)) return false;
  if (webStatus && lynxStatus) {
    for (const key of ["statusBanner", "statusCopy", "statusAction"]) {
      if (!rectDeltaWithin(webMetrics.anatomy?.[key], lynxMetrics.anatomy?.[key], 2)) {
        return false;
      }
    }
  }
  return true;
}

function composerPairMatches(webMetrics, lynxMetrics, expectation, viewportHeight) {
  if (
    !composerMetricsMatch(webMetrics, expectation) ||
    !composerMetricsMatch(lynxMetrics, expectation)
  ) {
    return false;
  }
  if (!composerAnatomyMatches(webMetrics, lynxMetrics)) return false;

  const webRect = webMetrics?.rect?.rect;
  const lynxRect = lynxMetrics?.rect?.rect;
  const webEditorRect = webMetrics?.editor?.rect?.rect;
  const lynxEditorRect = lynxMetrics?.editor?.rect?.rect;
  if (!webRect || !lynxRect || !webEditorRect || !lynxEditorRect) return false;
  const frameShapeMatches =
    Math.abs(webRect.x - lynxRect.x) <= 1 &&
    Math.abs(webRect.width - lynxRect.width) <= 1 &&
    Math.abs(webRect.height - lynxRect.height) <= 1;
  const editorShapeMatches =
    Math.abs(webEditorRect.x - lynxEditorRect.x) <= 1 &&
    Math.abs(webEditorRect.width - lynxEditorRect.width) <= 1 &&
    Math.abs(webEditorRect.height - lynxEditorRect.height) <= 1;
  if (!frameShapeMatches || !editorShapeMatches) return false;

  if (expectation.layout === "docked") {
    const webBottomInset = viewportHeight - (webRect.y + webRect.height);
    const lynxBottomInset = viewportHeight - (lynxRect.y + lynxRect.height);
    return Math.abs(webBottomInset - lynxBottomInset) <= 16;
  }
  return Math.abs(webRect.y - lynxRect.y) <= 16;
}

function rectDeltaWithin(left, right, tolerance) {
  if (!left?.rect || !right?.rect) return false;
  return (
    Math.abs(left.rect.x - right.rect.x) <= tolerance &&
    Math.abs(left.rect.y - right.rect.y) <= tolerance &&
    Math.abs(left.rect.width - right.rect.width) <= tolerance &&
    Math.abs(left.rect.height - right.rect.height) <= tolerance
  );
}

function normalizedChangedFilesState(reviewMetrics) {
  const state = reviewMetrics?.checkpointCards?.find(
    (card) => card.status === "ready",
  )?.expandedState;
  return state === "expanded" ? "expanded" : state ? "collapsed" : null;
}

function coreGeometryMatches(webState, lynxState) {
  const webComposer = webState?.composerMetrics;
  const lynxComposer = lynxState?.composerMetrics;
  if (webComposer || lynxComposer) {
    if (!rectDeltaWithin(webComposer?.rect, lynxComposer?.rect, 2)) return false;
    for (const key of ["surface", "editorArea", "footer"]) {
      if (!rectDeltaWithin(webComposer?.anatomy?.[key], lynxComposer?.anatomy?.[key], 2)) {
        return false;
      }
    }
  }

  const webRows = webState?.timelineMetrics?.rowGeometry ?? [];
  const lynxRows = lynxState?.timelineMetrics?.rowGeometry ?? [];
  if (webRows.length > 0 || lynxRows.length > 0) {
    if (webRows.length !== lynxRows.length) return false;
    for (const webRow of webRows) {
      const lynxRow = lynxRows.find((row) => row.id === webRow.id);
      const blockUserMessage =
        webRow.kind === "message" &&
        webRow.role === "user" &&
        (webRow.text.includes("\n") || webRow.text.includes("```"));
      if (blockUserMessage) continue;
      const compareOuterHeight = webRow.kind === "message" && webRow.role === "user";
      const webHeight = compareOuterHeight
        ? webRow.height
        : (webRow.contentHeight ?? webRow.height);
      const lynxHeight = compareOuterHeight
        ? lynxRow?.height
        : (lynxRow?.contentHeight ?? lynxRow?.height);
      if (!lynxRow || Math.abs(webHeight - lynxHeight) > 8) return false;
    }
  }

  const webCard = webState?.reviewMetrics?.checkpointCards?.find((card) => card.status === "ready");
  const lynxCard = lynxState?.reviewMetrics?.checkpointCards?.find(
    (card) => card.status === "ready",
  );
  if (webCard || lynxCard) {
    if (!rectDeltaWithin(webCard?.rect, lynxCard?.rect, 8)) return false;
  }

  if (expandThinking) {
    for (const key of ["workGroup", "workEntry", "workEntryBody"]) {
      const webRect = webState?.timelineMetrics?.anatomy?.[key]?.rect;
      const lynxRect = lynxState?.timelineMetrics?.anatomy?.[key]?.rect;
      if (!webRect || !lynxRect) return false;
      if (
        Math.abs(webRect.width - lynxRect.width) > 8 ||
        Math.abs(webRect.height - lynxRect.height) > 8
      ) {
        return false;
      }
    }
  }
  return true;
}

function threadReadyForReview(state, expectedThread) {
  return (
    state?.web?.semanticReady === true &&
    state?.lynx?.semanticReady === true &&
    (!expectedThread ||
      (state?.web?.productState?.selectedThread === expectedThread &&
        state?.lynx?.productState?.selectedThread === expectedThread))
  );
}

async function dispatchPointerClick(cdp, sessionId, point) {
  await cdp.send(
    "Input.dispatchMouseEvent",
    { type: "mousePressed", ...point, button: "left", clickCount: 1 },
    sessionId,
  );
  await cdp.send(
    "Input.dispatchMouseEvent",
    { type: "mouseReleased", ...point, button: "left", clickCount: 1 },
    sessionId,
  );
}

function reviewPairMatches(webMetrics, lynxMetrics, expectation) {
  if (expectation === null) return true;
  if (!webMetrics || !lynxMetrics) return false;
  if (expectation === "panel-empty") {
    return (
      webMetrics.panelOpen === true &&
      lynxMetrics.panelOpen === true &&
      webMetrics.panelEmpty === true &&
      lynxMetrics.panelEmpty === true &&
      JSON.stringify(webMetrics.actionKeys) === JSON.stringify(lynxMetrics.actionKeys)
    );
  }
  const webReadyCards = webMetrics.checkpointCards.filter((card) => card.status === "ready");
  const lynxReadyCards = lynxMetrics.checkpointCards.filter((card) => card.status === "ready");
  if (expectation === "checkpoint") {
    return (
      webReadyCards.length > 0 &&
      lynxReadyCards.length > 0 &&
      webReadyCards[0]?.fileCount === lynxReadyCards[0]?.fileCount
    );
  }
  if (expectation === "tree") {
    return (
      webReadyCards.length > 0 &&
      lynxReadyCards.length > 0 &&
      webReadyCards[0]?.fileCount === lynxReadyCards[0]?.fileCount &&
      webMetrics.treeCount >= 1 &&
      lynxMetrics.treeCount >= 1 &&
      JSON.stringify(webMetrics.treeFileCounts) === JSON.stringify(lynxMetrics.treeFileCounts)
    );
  }
  const webFilePaths = [...(webMetrics.diff?.filePaths ?? [])].sort();
  const lynxFilePaths = [...(lynxMetrics.diff?.filePaths ?? [])].sort();
  const diffPairReady =
    webMetrics.panelOpen === true &&
    lynxMetrics.panelOpen === true &&
    webMetrics.activeKind === "diff" &&
    lynxMetrics.activeKind === "diff" &&
    webMetrics.diff !== null &&
    lynxMetrics.diff !== null;
  return (
    diffPairReady &&
    webFilePaths.length > 0 &&
    JSON.stringify(webFilePaths) === JSON.stringify(lynxFilePaths) &&
    lynxMetrics.diff?.runtimeBlocker === "R10"
  );
}

function sidebarDiffPairMatches(webDiagnostics, lynxDiagnostics, expectation) {
  if (expectation !== "checkpoint" && expectation !== "tree" && expectation !== "diff") {
    return true;
  }
  const webDiffs = webDiagnostics?.diffs ?? [];
  const lynxDiffs = lynxDiagnostics?.diffs ?? [];
  return JSON.stringify(webDiffs) === JSON.stringify(lynxDiffs);
}

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
    const req = httpRequestRaw(
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

const PROXY_PREFIXES = ["/api", "/ws", "/oauth", "/.well-known"];
const isProxied = (pathname) =>
  PROXY_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p + "?"),
  );

/**
 * Single-origin front server. Routes:
 *   /__workbench              -> workbench shell (shared-workbench/workbench.html)
 *   /__workbench.js           -> controller
 *   /lynx/*                   -> Lynx-for-Web build
 *   /api|/ws|/oauth|/.well-known -> proxied to the shared server
 *   everything else           -> real apps/web/dist (SPA fallback to index.html)
 *
 * The real Web app is served at the ROOT origin so its absolute `/assets/*` and
 * router paths (`/pair`, `/`) resolve exactly as they do in production; the
 * harness top page and the Lynx bundle use reserved `/__workbench*` and `/lynx/`
 * prefixes that the web SPA never owns.
 */
function startFrontServer(serverPort) {
  const server = createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url ?? "/", `http://${HOST}`);
      const pathname = decodeURIComponent(reqUrl.pathname);

      if (isProxied(pathname)) {
        const proxyReq = httpRequestRaw(
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

      let filePath = null;
      let spaFallback = null;
      if (pathname === "/__workbench" || pathname === "/__workbench/") {
        filePath = path.join(WORKBENCH_ASSETS, "workbench.html");
      } else if (pathname === "/__workbench.js") {
        filePath = path.join(WORKBENCH_ASSETS, "workbench.js");
      } else if (pathname.startsWith("/lynx/")) {
        filePath = safeJoin(LYNX_BUILD_DIR, pathname.slice("/lynx/".length));
      } else if (pathname.startsWith("/static/")) {
        filePath = safeJoin(LYNX_BUILD_DIR, pathname.slice(1));
      } else {
        // Real Web app at the root origin, SPA fallback to its index.html.
        filePath =
          pathname === "/" ? path.join(WEB_DIST, "index.html") : safeJoin(WEB_DIST, pathname);
        spaFallback = path.join(WEB_DIST, "index.html");
      }

      if (!filePath) return void res.writeHead(404).end("not found");
      let info = await stat(filePath).catch(() => null);
      if ((!info || !info.isFile()) && spaFallback) {
        filePath = spaFallback;
        info = await stat(filePath).catch(() => null);
      }
      if (!info || !info.isFile()) return void res.writeHead(404).end("not found");
      res.writeHead(200, {
        "content-type": MIME[path.extname(filePath)] ?? "application/octet-stream",
        "cache-control": "no-store",
      });
      createReadStream(filePath).pipe(res);
    } catch (error) {
      res.writeHead(500).end(String(error));
    }
  });
  // WS upgrade proxy (for /ws).
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

function waitForDevtools(chrome) {
  return new Promise((resolve, reject) => {
    let buf = "";
    const onData = (chunk) => {
      buf += String(chunk);
      const m = buf.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (m) resolve(m[1].replace(/^ws:\/\//, "http://").replace(/\/devtools\/browser\/.*$/, ""));
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

async function focusRemoteElement(cdp, sessionId, expression) {
  const result = await cdp.send(
    "Runtime.evaluate",
    { expression, returnByValue: false },
    sessionId,
  );
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  const objectId = result.result?.objectId;
  if (!objectId) return false;
  try {
    const focused = await cdp
      .send("DOM.focus", { objectId }, sessionId)
      .then(() => true)
      .catch(() => false);
    if (!focused) return false;
    return true;
  } finally {
    await cdp.send("Runtime.releaseObject", { objectId }, sessionId).catch(() => undefined);
  }
}

function pngDimensions(buffer) {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function runFfmpeg(args) {
  const result = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], {
    encoding: "utf8",
  });
  if (result.error?.code === "ENOENT") return { ok: false, reason: "ffmpeg not installed" };
  if (result.error) return { ok: false, reason: String(result.error) };
  if (result.status !== 0) return { ok: false, reason: result.stderr || `status ${result.status}` };
  return { ok: true };
}

async function hashFile(filePath) {
  const contents = await readFile(filePath);
  return {
    path: path.relative(repoRoot, filePath),
    bytes: contents.byteLength,
    sha256: createHash("sha256").update(contents).digest("hex"),
  };
}

/** Mint a bearer + one wsTicket for the Lynx pane against the shared server. */
async function mintLynxSocketUrl(serverPort, bootstrapToken) {
  const form = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    subject_token: bootstrapToken,
    subject_token_type: "urn:t3:params:oauth:token-type:environment-bootstrap",
    requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
    client_label: "T3 Code SB3 Lynx pane",
    client_device_type: "desktop",
  }).toString();
  const exchange = await httpRequest(
    serverPort,
    "/oauth/token",
    "POST",
    {
      "content-type": "application/x-www-form-urlencoded",
      "content-length": String(Buffer.byteLength(form)),
    },
    form,
  );
  if (exchange.status !== 200) throw new Error(`token exchange failed (${exchange.status})`);
  const bearer = JSON.parse(exchange.body).access_token;
  const ticketRes = await httpRequest(
    serverPort,
    "/api/auth/websocket-ticket",
    "POST",
    {
      authorization: "Bearer " + bearer,
      "content-type": "application/json",
      "content-length": "2",
    },
    "{}",
  );
  if (ticketRes.status !== 200) throw new Error(`ws ticket failed (${ticketRes.status})`);
  const ticket = JSON.parse(ticketRes.body).ticket;
  return `ws://${HOST}:${serverPort}/ws?wsTicket=${encodeURIComponent(ticket)}`;
}

async function main() {
  for (const [label, target] of [
    ["server bin", SERVER_BIN],
    ["web build", path.join(WEB_DIST, "index.html")],
    ["lynx build", path.join(LYNX_BUILD_DIR, "lynx/main.web.bundle")],
  ]) {
    if (!existsSync(target)) {
      throw new Error(
        `Missing ${label} at ${target}. Build web (apps/web dist), lynx (pnpm run build:browser-preview), and seed (scripts/sb2-seed-shared-state.mjs) first.`,
      );
    }
  }

  const commit = spawnSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
    cwd: repoRoot,
  }).stdout?.trim();

  // Deterministic isolated state: re-seed the base dir from the SB2 source
  // BEFORE launching, so every run starts from the same pristine snapshot even
  // if a prior run was interrupted mid-flight (the live server mutates its own
  // runtime/session rows, so a leftover DB would otherwise drift the fixture).
  // This replaces a fragile backup/restore-on-exit dance with an idempotent
  // pre-run seed.
  console.log("[shared-workbench] re-seeding pristine fixture…");
  const threadStateIds = new Set([
    "existing-thread-idle",
    "existing-thread-working",
    "existing-thread-completed",
    "existing-thread-failed",
    "existing-thread-approval",
    "existing-thread-question",
    "composer-docked",
    "composer-working",
    "composer-disabled",
    "review-checkpoint",
    "review-tree",
    "review-diff",
    "review-empty",
    "sidebar-inline-search",
  ]);
  const seedSource =
    process.env.T3_PLAN11C_SEED_SOURCE ??
    (threadStateIds.has(stateId)
      ? path.join(process.env.HOME ?? "", ".t3-lynxtron/userdata/state.sqlite")
      : path.join(process.env.HOME ?? "", ".t3/userdata/state.sqlite"));
  const seedReportPath = path.join(baseDir, "workbench-seed-report.json");
  const reseed = spawnSync(
    process.env.T3_NODE_BIN?.trim() || "node",
    [
      path.join(scriptDir, "sb2-seed-shared-state.mjs"),
      "--source",
      seedSource,
      "--base-dir",
      baseDir,
      "--output",
      seedReportPath,
    ],
    { encoding: "utf8", cwd: lynxAppDir },
  );
  if (reseed.status !== 0) {
    throw new Error(`re-seed failed: ${reseed.stderr || reseed.stdout || "unknown"}`);
  }

  const seed = JSON.parse(await readFile(seedReportPath, "utf8"));
  const expectedThreadFixture = explicitExpectedThreadId
    ? seed?.dataset?.threads?.find((thread) => thread.id === explicitExpectedThreadId)
    : stateId === "composer-working" || stateId === "existing-thread-working"
      ? seed?.dataset?.workingThread
      : stateId === "existing-thread-completed"
        ? seed?.dataset?.canonicalThread
        : stateId === "existing-thread-failed"
          ? seed?.dataset?.canonicalThread
          : threadStateIds.has(stateId)
            ? (seed?.dataset?.idleThread ?? seed?.dataset?.canonicalThread)
            : null;
  if (threadStateIds.has(stateId) && !expectedThreadFixture?.id) {
    throw new Error(
      `State ${stateId} requires a seeded thread fixture, but ${seedSource} has none`,
    );
  }
  if (stateId === "composer-working" && expectedThreadFixture?.sessionStatus !== "running") {
    throw new Error(
      `State ${stateId} requires a running thread fixture, but ${seedSource} has none`,
    );
  }
  const expectProject = semanticRoute.startsWith("settings-")
    ? ""
    : (expectedThreadFixture?.projectTitle ?? seed?.dataset?.projects?.[0]?.title ?? "");
  const expectThread = expectedThreadFixture?.id ?? null;
  const webBundle = await hashFile(
    (await findFirst(WEB_DIST, /assets\/.*\.js$/)) ?? path.join(WEB_DIST, "index.html"),
  );
  const lynxBundle = await hashFile(path.join(LYNX_BUILD_DIR, "lynx/main.web.bundle"));

  // --- launch the shared server ---
  const serverPort = await findFreePort();
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
  console.log(`[shared-workbench] server on :${serverPort} baseDir=${baseDir}`);
  const child = spawn(
    process.env.T3_NODE_BIN?.trim() || "node",
    [SERVER_BIN, "serve", "--bootstrap-fd", "3", "--base-dir", baseDir],
    {
      stdio: ["ignore", "pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        SHELL: "/bin/sh",
        ...(stateId === "settings-source-control-error"
          ? { T3_TEST_SOURCE_CONTROL_DISCOVERY_ERROR: "1" }
          : {}),
      },
    },
  );
  child.stdio[3].write(JSON.stringify(envelope) + "\n");
  child.stdio[3].end();
  let serverExited = false;
  let startupToken = null;
  const onServerOut = (chunk) => {
    const m = String(chunk).match(/Token:\s*([A-Z0-9]+)/);
    if (m && !startupToken) startupToken = m[1];
  };
  child.stdout.on("data", onServerOut);
  child.stderr.on("data", onServerOut);
  child.on("exit", () => (serverExited = true));

  let front = null;
  let chrome = null;
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
    if (!keepServer && child && !child.killed) child.kill("SIGKILL");
  };

  const results = [];
  let failures = 0;
  try {
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
    if (!ready) throw new Error("server not ready");
    for (let i = 0; i < 20 && !startupToken; i++) await delay(200);
    if (!startupToken) throw new Error("did not capture startup pairing token");

    front = await startFrontServer(serverPort);
    const origin = `http://${HOST}:${front.port}`;
    const lynxSocketUrl = await mintLynxSocketUrl(serverPort, bootstrapToken);
    console.log(`[shared-workbench] front ${origin}; lynx socket direct to shared server /ws`);

    // Launch headless Chrome once; a page target per viewport.
    const userDataDir = path.join(
      process.env.TMPDIR ?? "/tmp",
      `t3-shared-workbench-${process.pid}-${Date.now()}`,
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
    const browserCdp = new Cdp(version.webSocketDebuggerUrl);
    await browserCdp.connect();

    for (const viewport of viewports) {
      const captured = await captureCell({
        browserCdp,
        origin,
        viewport,
        commit,
        webBundle,
        lynxBundle,
        serverPort,
        startupToken,
        lynxSocketUrl,
        expectProject,
        expectThread,
        seedHash: seed?.snapshotSha256 ?? null,
        stateId,
        semanticRoute,
        webRoute: requestedWebRoute,
        theme,
        overlay,
        query,
        providerId,
        composerInput,
        sidebarQuery,
        terminateOwnedServer: isLifecycleFaultState
          ? () => {
              if (!child.killed) child.kill("SIGTERM");
            }
          : null,
      });
      results.push(captured);
      if (!captured.pass) failures += 1;
    }
    browserCdp.close();
  } finally {
    cleanup();
    // The next run re-seeds pristine at startup, so no restore is needed here;
    // just leave the owned server killed by cleanup().
  }

  const summary = {
    schemaVersion: 1,
    task: "SB3",
    generatedAt: new Date().toISOString(),
    commit,
    server: { baseDir, seedHash: seed?.snapshotSha256 ?? null, expectProject },
    bundles: { web: webBundle, lynx: lynxBundle },
    cells: results,
    pass: failures === 0,
  };
  await mkdir(outputRoot, { recursive: true });
  await writeFile(
    path.join(outputRoot, "workbench-report.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  await writeFile(path.join(outputRoot, "comparison.html"), renderComparisonHtml(summary));
  if (manifestPath) {
    if (!results[0]?.pass) {
      throw new Error(
        `Refusing manifest admission: ${stateId} capture did not pass every hard gate`,
      );
    }
    await admitBrowserPairToManifest({
      manifestPath,
      outputRoot,
      stateId,
      result: results[0],
    });
  }
  console.log(
    JSON.stringify(
      { pass: summary.pass, cells: results.map((c) => ({ viewport: c.viewport, pass: c.pass })) },
      null,
      2,
    ),
  );
  process.exit(failures === 0 ? 0 : 1);
}

async function findFirst(dir, pattern) {
  const { readdir } = await import("node:fs/promises");
  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        const found = await walk(full);
        if (found) return found;
      } else if (pattern.test(path.relative(dir, full))) {
        return full;
      }
    }
    return null;
  }
  return walk(dir);
}

async function captureCell({
  browserCdp,
  origin,
  viewport,
  commit,
  webBundle,
  lynxBundle,
  startupToken,
  lynxSocketUrl,
  expectProject,
  expectThread,
  seedHash,
  stateId,
  semanticRoute,
  webRoute,
  theme,
  overlay,
  query,
  providerId,
  composerInput,
  sidebarQuery,
  terminateOwnedServer,
}) {
  const { width, height } = viewport;
  const cellDir = path.join(outputRoot, viewport.label);
  await mkdir(cellDir, { recursive: true });

  const { targetId } = await browserCdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await browserCdp.send("Target.attachToTarget", { targetId, flatten: true });
  const cdp = browserCdp;
  const console_ = [];
  await Promise.all([
    cdp.send("Runtime.enable", {}, sessionId),
    cdp.send("Log.enable", {}, sessionId),
    cdp.send("Page.enable", {}, sessionId),
    cdp.send("DOM.enable", {}, sessionId),
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
    else if (m.method === "Log.entryAdded")
      console_.push({ level: m.params.entry.level, text: m.params.entry.text });
  });

  await cdp.send(
    "Emulation.setDeviceMetricsOverride",
    { width: width * 2 + 1, height: height + 24, deviceScaleFactor: 1, mobile: false },
    sessionId,
  );

  const scenarioByStateId = {
    "new-thread-hero": "new-thread",
    "new-thread-hero-light": "new-thread",
    "existing-thread-idle": "existing-thread",
    "existing-thread-working": "existing-thread",
    "existing-thread-completed": "existing-thread",
    "existing-thread-failed": "existing-thread",
    "project-scope-open": "project-scope-open",
    "lifecycle-error": "lifecycle-error",
    "quick-switch-default": "existing-thread",
    "quick-switch-query": "existing-thread",
    "quick-switch-actions-only": "existing-thread",
    "quick-switch-empty": "existing-thread",
    "file-picker-default": "existing-thread",
    "sidebar-inline-search": "existing-thread",
    "model-picker-default": "model-picker",
    "model-picker-provider-rail": "model-picker",
    "model-picker-query": "model-picker",
    "model-picker-empty": "model-picker",
    "model-picker-selected": "model-picker",
    "composer-hero": "new-thread",
    "composer-sendable": "new-thread",
    "composer-docked": "existing-thread",
    "composer-working": "existing-thread",
    "composer-disabled": "existing-thread",
    "settings-general": "settings-general",
    "settings-connections": "settings-general",
    "settings-source-control": "settings-general",
    "settings-source-control-loading": "settings-general",
    "settings-source-control-error": "settings-general",
    "settings-beta": "settings-general",
    "settings-archive": "settings-general",
    "review-checkpoint": "existing-thread",
    "review-tree": "existing-thread",
    "review-diff": "existing-thread",
    "review-empty": "existing-thread",
  };
  const scenario = scenarioByStateId[stateId] ?? "existing-thread";
  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    pairingToken: startupToken,
    socket: lynxSocketUrl,
    scenario,
    semanticRoute,
    webRoute,
    theme,
    ...(overlay ? { overlay } : {}),
    expectProject,
    ...(expectThread ? { expectThread } : {}),
  });
  await cdp.send("Page.navigate", { url: `${origin}/__workbench?${params.toString()}` }, sessionId);

  const readyStart = Date.now();
  const deadline = readyStart + timeoutMs;
  let state = null;
  let webProjectMenuOpened = false;
  let webProjectMenuWaitPolls = 0;
  let webProjectInputSent = false;
  let webProjectSelectionStage = "waiting-for-trigger";
  let webRouteInputSent = webRoute === "/";
  let webOverlayInputSent = false;
  let webOverlayWaitPolls = 0;
  let webQuickSwitchKeyboardSent = false;
  let webShortcutInputChannel = requiresShortcutInput ? "pending" : "not-required";
  let lynxOverlayInputSent =
    overlay !== "project-scope" && overlay !== "quick-switch" && overlay !== "file-picker";
  let lynxOverlayWaitPolls = 0;
  let lynxShortcutInputChannel = requiresShortcutInput ? "pending" : "not-required";
  let webSidebarSearchInputSent = sidebarQuery.length === 0;
  let lynxSidebarSearchInputSent = sidebarQuery.length === 0;
  let sidebarSearchInputChannel = sidebarQuery.length === 0 ? "not-required" : "pending";
  let webThreadInputSent = expectThread === null;
  let lynxThreadInputSent = expectThread === null;
  let overlayQueryInputSent = query.length === 0;
  let overlayQueryInputChannel = query.length === 0 ? "not-required" : "pending";
  let providerInputSent = providerId.length === 0;
  let providerInputChannel = providerId.length === 0 ? "not-required" : "pending";
  let providerInputDiagnostics = null;
  const providerPostconditionTimeline = [];
  let providerReadyPolls = providerId.length === 0 ? 3 : 0;
  let lastProviderTimelineKey = "";
  let modelPickerSemanticReadyPolls = overlay === "model-picker" ? 0 : 3;
  let settingsAsyncReadyPolls =
    stateId === "settings-source-control" ||
    stateId === "settings-source-control-loading" ||
    stateId === "settings-source-control-error"
      ? 0
      : 10;
  let transcriptReadyPolls = stateId.startsWith("existing-thread-") ? 0 : 3;
  let pendingRequestReadyPolls =
    stateId === "existing-thread-approval" || stateId === "existing-thread-question" ? 0 : 3;
  let composerInputSent = composerInput.length === 0;
  let composerInputChannel = composerInput.length === 0 ? "not-required" : "pending";
  let webReviewPanelInputSent =
    !isReviewState ||
    reviewExpectation === "checkpoint" ||
    reviewExpectation === "tree" ||
    reviewExpectation === "diff";
  let lynxReviewPanelInputSent =
    !isReviewState || reviewExpectation === "checkpoint" || reviewExpectation === "tree";
  let webReviewDiffInputSent =
    !isReviewState ||
    reviewExpectation === "checkpoint" ||
    reviewExpectation === "tree" ||
    reviewExpectation === "panel-empty";
  let lynxReviewDiffInputSent =
    !isReviewState ||
    reviewExpectation === "checkpoint" ||
    reviewExpectation === "tree" ||
    reviewExpectation === "panel-empty";
  let webTurnFoldInputSent = expandTurnId.length === 0;
  let lynxTurnFoldInputSent = expandTurnId.length === 0;
  let webThinkingInputSent = !expandThinking;
  let lynxThinkingInputSent = !expandThinking;
  let webSidebarStateInputSent = sidebarTargetState.length === 0;
  let lynxSidebarStateInputSent = sidebarTargetState.length === 0;
  let webChangedFilesInputSent = changedFilesTargetState.length === 0;
  let lynxChangedFilesInputSent = changedFilesTargetState.length === 0;
  const reviewInteractionTimeline = [];
  let lastReviewTimelineKey = "";
  let ownedServerTerminated = false;
  let reachedTargetState = false;
  while (Date.now() < deadline) {
    state = await evaluate(
      cdp,
      sessionId,
      `(() => { const w = window.__T3_WORKBENCH__; return w ? w.read() : null; })()`,
    ).catch(() => null);
    if (expectThread && state?.web?.productState?.selectedThread === expectThread) {
      webThreadInputSent = true;
    }
    if (expectThread && state?.lynx?.productState?.selectedThread === expectThread) {
      lynxThreadInputSent = true;
    }
    if (expandTurnId && threadReadyForReview(state, expectThread)) {
      const webTurnFold = state?.web?.timelineMetrics?.turnFolds?.find(
        (fold) => fold.turnId === expandTurnId,
      );
      const lynxTurnFold = state?.lynx?.timelineMetrics?.turnFolds?.find(
        (fold) => fold.turnId === expandTurnId,
      );
      if (webTurnFold?.state === "expanded") webTurnFoldInputSent = true;
      if (lynxTurnFold?.state === "expanded") lynxTurnFoldInputSent = true;
      if (!webTurnFoldInputSent || !lynxTurnFoldInputSent) {
        const foldPoints = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const pointFor = (frameId, shadow) => {
              const frame = document.getElementById(frameId);
              const doc = frame?.contentWindow?.document;
              const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
              const target = root?.querySelector(
                ${JSON.stringify(
                  `[data-transcript-turn-fold="${expandTurnId}"] .transcript-turn-fold-button`,
                )}
              );
              if (!frame || !target) return null;
              target.scrollIntoView?.({ block: 'center', inline: 'nearest' });
              const frameRect = frame.getBoundingClientRect();
              const rect = target.getBoundingClientRect();
              if (
                rect.y < 0 ||
                rect.y + rect.height > frameRect.height ||
                rect.x < 0 ||
                rect.x + rect.width > frameRect.width
              ) {
                if (shadow) {
                  const list = root?.querySelector('.timeline-list');
                  const scroller = list?.shadowRoot?.querySelector('[part="content"]');
                  if (scroller) {
                    scroller.scrollTop +=
                      rect.y - frame.contentWindow.innerHeight / 2;
                  }
                }
                return null;
              }
              return {
                x: frameRect.x + rect.x + rect.width / 2,
                y: frameRect.y + rect.y + rect.height / 2,
              };
            };
            return {
              web: pointFor('web-pane', false),
              lynx: pointFor('lynx-pane', true),
            };
          })()`,
        ).catch(() => null);
        if (!webTurnFoldInputSent && foldPoints?.web) {
          await dispatchPointerClick(cdp, sessionId, foldPoints.web);
          await delay(100);
          continue;
        }
        if (!lynxTurnFoldInputSent && foldPoints?.lynx) {
          await dispatchPointerClick(cdp, sessionId, foldPoints.lynx);
          await delay(100);
          continue;
        }
      }
    }
    if (
      expandThinking &&
      webTurnFoldInputSent &&
      lynxTurnFoldInputSent &&
      threadReadyForReview(state, expectThread)
    ) {
      const webThinking = state?.web?.timelineMetrics?.workEntries?.find(
        (entry) => entry.tone === "thinking",
      );
      const lynxThinking = state?.lynx?.timelineMetrics?.workEntries?.find(
        (entry) => entry.tone === "thinking",
      );
      if (webThinking?.state === "expanded") webThinkingInputSent = true;
      if (lynxThinking?.state === "expanded") lynxThinkingInputSent = true;
      if (!webThinkingInputSent || !lynxThinkingInputSent) {
        const thinkingPoints = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const pointFor = (frameId, shadow) => {
              const frame = document.getElementById(frameId);
              const doc = frame?.contentWindow?.document;
              const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
              const target = root?.querySelector(
                '[data-transcript-work-tone="thinking"][data-transcript-work-state="collapsed"]'
              );
              if (!frame || !target) return null;
              target.scrollIntoView?.({ block: 'center', inline: 'nearest' });
              const frameRect = frame.getBoundingClientRect();
              const rect = target.getBoundingClientRect();
              return {
                x: frameRect.x + rect.x + rect.width / 2,
                y: frameRect.y + rect.y + rect.height / 2,
              };
            };
            return {
              web: pointFor('web-pane', false),
              lynx: pointFor('lynx-pane', true),
            };
          })()`,
        ).catch(() => null);
        if (!webThinkingInputSent && thinkingPoints?.web) {
          await dispatchPointerClick(cdp, sessionId, thinkingPoints.web);
          await delay(100);
          continue;
        }
        if (!lynxThinkingInputSent && thinkingPoints?.lynx) {
          await dispatchPointerClick(cdp, sessionId, thinkingPoints.lynx);
          await delay(100);
          continue;
        }
      }
    }
    if (providerId) {
      const timelineKey = JSON.stringify({
        web: state?.web?.overlayMetrics?.selectedProviderId ?? null,
        lynx: state?.lynx?.overlayMetrics?.selectedProviderId ?? null,
        webOverlay: state?.web?.productState?.overlay ?? null,
        lynxOverlay: state?.lynx?.productState?.overlay ?? null,
        lynxNavigation: state?.lynx?.overlayMetrics?.navigation ?? null,
      });
      if (timelineKey !== lastProviderTimelineKey) {
        providerPostconditionTimeline.push({
          elapsedMs: Date.now() - readyStart,
          ...JSON.parse(timelineKey),
        });
        lastProviderTimelineKey = timelineKey;
      }
    }
    if (
      terminateOwnedServer &&
      !ownedServerTerminated &&
      state?.web?.semanticReady === true &&
      state?.lynx?.semanticReady === true &&
      state?.web?.productState?.selectedProject === expectProject &&
      state?.lynx?.productState?.selectedProject === expectProject &&
      (!state?.lynx?.connectorDiagnostics?.commands?.some(
        ({ method }) => method === "readProjectBranch",
      ) ||
        state?.lynx?.connectorDiagnostics?.lastCommandResult?.method === "readProjectBranch") &&
      (!expectThread ||
        (state?.web?.productState?.selectedThread === expectThread &&
          state?.lynx?.productState?.selectedThread === expectThread))
    ) {
      terminateOwnedServer();
      ownedServerTerminated = true;
      await delay(100);
      continue;
    }
    if (
      !webRouteInputSent &&
      state?.web?.connected === true &&
      state?.web?.literalRoute !== webRoute
    ) {
      await evaluate(
        cdp,
        sessionId,
        `(() => {
          const frame = document.getElementById('web-pane');
          if (!frame?.contentWindow) return false;
          frame.contentWindow.location.assign(${JSON.stringify(webRoute)});
          return true;
        })()`,
      );
      webRouteInputSent = true;
      await delay(100);
      continue;
    }
    if (
      semanticRoute === "new-thread" &&
      !webProjectInputSent &&
      state?.web?.connected === true &&
      state?.web?.productState?.selectedProject !== expectProject
    ) {
      if (!webProjectMenuOpened) {
        const triggerPoint = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const frame = document.getElementById('web-pane');
            const doc = frame && frame.contentWindow && frame.contentWindow.document;
            const target = doc && doc.querySelector('[aria-label="Change project"]');
            if (!frame || !target) return null;
            const fr = frame.getBoundingClientRect();
            const r = target.getBoundingClientRect();
            return { x: fr.x + r.x + r.width / 2, y: fr.y + r.y + r.height / 2 };
          })()`,
        ).catch(() => null);
        if (!triggerPoint) {
          await delay(100);
          continue;
        }
        await cdp.send(
          "Input.dispatchMouseEvent",
          {
            type: "mousePressed",
            x: triggerPoint.x,
            y: triggerPoint.y,
            button: "left",
            clickCount: 1,
          },
          sessionId,
        );
        await cdp.send(
          "Input.dispatchMouseEvent",
          {
            type: "mouseReleased",
            x: triggerPoint.x,
            y: triggerPoint.y,
            button: "left",
            clickCount: 1,
          },
          sessionId,
        );
        webProjectMenuOpened = true;
        webProjectMenuWaitPolls = 0;
        webProjectSelectionStage = "waiting-for-project-item";
        await delay(100);
      }
      const projectPoint = await evaluate(
        cdp,
        sessionId,
        `(() => {
          const frame = document.getElementById('web-pane');
          const doc = frame && frame.contentWindow && frame.contentWindow.document;
          const target = [...(doc?.querySelectorAll('[data-slot="menu-radio-item"]') ?? [])]
            .find((item) => item.textContent?.trim() === ${JSON.stringify(expectProject)});
          if (!frame || !target) return null;
          const fr = frame.getBoundingClientRect();
          const r = target.getBoundingClientRect();
          return { x: fr.x + r.x + r.width / 2, y: fr.y + r.y + r.height / 2 };
        })()`,
      ).catch(() => null);
      if (projectPoint) {
        await cdp.send(
          "Input.dispatchMouseEvent",
          {
            type: "mousePressed",
            x: projectPoint.x,
            y: projectPoint.y,
            button: "left",
            clickCount: 1,
          },
          sessionId,
        );
        await cdp.send(
          "Input.dispatchMouseEvent",
          {
            type: "mouseReleased",
            x: projectPoint.x,
            y: projectPoint.y,
            button: "left",
            clickCount: 1,
          },
          sessionId,
        );
        webProjectInputSent = true;
        webProjectSelectionStage = "project-item-clicked";
      } else {
        webProjectMenuWaitPolls += 1;
        if (webProjectMenuWaitPolls >= 10) {
          webProjectMenuOpened = false;
          webProjectSelectionStage = "retrying-project-trigger";
        }
      }
    }
    if (
      expectThread &&
      state?.web?.connected === true &&
      state?.web?.productState?.selectedThread !== expectThread
    ) {
      const point = await evaluate(
        cdp,
        sessionId,
        `(() => {
          const frame = document.getElementById('web-pane');
          const doc = frame && frame.contentWindow && frame.contentWindow.document;
          const target = doc?.querySelector(
            ${JSON.stringify(`[data-thread-id="${expectThread}"] [role="button"]`)},
          ) ?? doc?.querySelector(${JSON.stringify(`[data-thread-id="${expectThread}"]`)});
          if (!frame || !target) return null;
          const fr = frame.getBoundingClientRect();
          const r = target.getBoundingClientRect();
          return { x: fr.x + r.x + r.width / 2, y: fr.y + r.y + r.height / 2 };
        })()`,
      ).catch(() => null);
      if (point) {
        await cdp.send(
          "Input.dispatchMouseEvent",
          { type: "mousePressed", ...point, button: "left", clickCount: 1 },
          sessionId,
        );
        await cdp.send(
          "Input.dispatchMouseEvent",
          { type: "mouseReleased", ...point, button: "left", clickCount: 1 },
          sessionId,
        );
        webThreadInputSent = true;
      }
    }
    if (
      expectThread &&
      state?.lynx?.connected === true &&
      state?.lynx?.productState?.selectedThread !== expectThread
    ) {
      const point = await evaluate(
        cdp,
        sessionId,
        `(() => {
          const frame = document.getElementById('lynx-pane');
          const doc = frame && frame.contentWindow && frame.contentWindow.document;
          const root = doc?.getElementById('t3-lynx-preview')?.shadowRoot;
          const target = root?.querySelector(
            ${JSON.stringify(`[data-thread-id="${expectThread}"] [role="button"]`)},
          ) ?? root?.querySelector(${JSON.stringify(`[data-thread-id="${expectThread}"]`)});
          if (!frame || !target) return null;
          const fr = frame.getBoundingClientRect();
          const r = target.getBoundingClientRect();
          return {
            x: fr.x + r.x + r.width / 2,
            y: fr.y + r.y + r.height / 2,
          };
        })()`,
      ).catch(() => null);
      if (point) {
        const { x, y } = point;
        await cdp.send(
          "Input.dispatchMouseEvent",
          { type: "mousePressed", x, y, button: "left", clickCount: 1 },
          sessionId,
        );
        await cdp.send(
          "Input.dispatchMouseEvent",
          { type: "mouseReleased", x, y, button: "left", clickCount: 1 },
          sessionId,
        );
        lynxThreadInputSent = true;
      }
    }
    if (
      sidebarQuery &&
      !webSidebarSearchInputSent &&
      state?.web?.semanticReady === true &&
      state?.web?.productState?.selectedProject === expectProject &&
      (!expectThread ||
        (state?.web?.productState?.selectedThread === expectThread &&
          state?.lynx?.productState?.selectedThread === expectThread))
    ) {
      const focused = await focusRemoteElement(
        cdp,
        sessionId,
        `(() => {
          const frame = document.getElementById('web-pane');
          return frame?.contentWindow?.document
            ?.querySelector('[aria-label="Search threads"]') ?? null;
        })()`,
      ).catch(() => false);
      if (focused) {
        for (const character of sidebarQuery) {
          await cdp.send(
            "Input.dispatchKeyEvent",
            { type: "char", text: character, unmodifiedText: character },
            sessionId,
          );
        }
        webSidebarSearchInputSent = true;
        await delay(100);
        continue;
      }
    }
    if (
      sidebarQuery &&
      webSidebarSearchInputSent &&
      !lynxSidebarSearchInputSent &&
      state?.lynx?.semanticReady === true &&
      state?.lynx?.productState?.selectedProject === expectProject &&
      (!expectThread ||
        (state?.web?.productState?.selectedThread === expectThread &&
          state?.lynx?.productState?.selectedThread === expectThread))
    ) {
      let typed = true;
      for (let index = 0; index < sidebarQuery.length; index += 1) {
        const character = sidebarQuery[index];
        const expectedPrefix = sidebarQuery.slice(0, index + 1);
        const focused = await focusRemoteElement(
          cdp,
          sessionId,
          `(() => {
            const frame = document.getElementById('lynx-pane');
            const doc = frame?.contentWindow?.document;
            const root = doc?.getElementById('t3-lynx-preview')?.shadowRoot;
            const host = root?.querySelector('[aria-label="Search threads"]');
            return host?.shadowRoot?.querySelector('input') ?? host ?? null;
          })()`,
        ).catch(() => false);
        if (!focused) {
          typed = false;
          break;
        }
        await cdp.send(
          "Input.dispatchKeyEvent",
          { type: "char", text: character, unmodifiedText: character },
          sessionId,
        );
        const prefixDeadline = Date.now() + 1000;
        let prefixApplied = false;
        while (Date.now() < prefixDeadline) {
          const currentQuery = await evaluate(
            cdp,
            sessionId,
            `window.__T3_WORKBENCH__?.read()?.lynx?.sidebarDiagnostics?.search?.value ?? ""`,
          ).catch(() => "");
          if (currentQuery === expectedPrefix) {
            prefixApplied = true;
            break;
          }
          await delay(20);
        }
        if (!prefixApplied) {
          typed = false;
          break;
        }
      }
      if (typed) {
        lynxSidebarSearchInputSent = true;
        sidebarSearchInputChannel = "web-dom-focus+key-char|lynx-dom-focus+key-char";
        await delay(100);
        continue;
      }
    }
    if (sidebarTargetState && threadReadyForReview(state, expectThread)) {
      if (state?.web?.sidebarDiagnostics?.state === sidebarTargetState) {
        webSidebarStateInputSent = true;
      }
      if (state?.lynx?.sidebarDiagnostics?.state === sidebarTargetState) {
        lynxSidebarStateInputSent = true;
      }
      if (!webSidebarStateInputSent || !lynxSidebarStateInputSent) {
        const sidebarPoints = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const pointFor = (frameId, shadow) => {
              const frame = document.getElementById(frameId);
              const doc = frame?.contentWindow?.document;
              const root = shadow
                ? doc?.getElementById('t3-lynx-preview')?.shadowRoot
                : doc;
              const target = root?.querySelector('[aria-label="Toggle main sidebar"]');
              if (!frame || !target) return null;
              const frameRect = frame.getBoundingClientRect();
              const rect = target.getBoundingClientRect();
              return {
                x: frameRect.x + rect.x + rect.width / 2,
                y: frameRect.y + rect.y + rect.height / 2,
              };
            };
            return {
              web: pointFor('web-pane', false),
              lynx: pointFor('lynx-pane', true),
            };
          })()`,
        ).catch(() => null);
        if (!webSidebarStateInputSent && sidebarPoints?.web) {
          await dispatchPointerClick(cdp, sessionId, sidebarPoints.web);
          await delay(100);
          continue;
        }
        if (!lynxSidebarStateInputSent && sidebarPoints?.lynx) {
          await dispatchPointerClick(cdp, sessionId, sidebarPoints.lynx);
          await delay(100);
          continue;
        }
      }
    }
    if (changedFilesTargetState && threadReadyForReview(state, expectThread)) {
      if (normalizedChangedFilesState(state?.web?.reviewMetrics) === changedFilesTargetState) {
        webChangedFilesInputSent = true;
      }
      if (normalizedChangedFilesState(state?.lynx?.reviewMetrics) === changedFilesTargetState) {
        lynxChangedFilesInputSent = true;
      }
      if (!webChangedFilesInputSent || !lynxChangedFilesInputSent) {
        const changedFilesPoints = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const pointFor = (frameId, shadow) => {
              const frame = document.getElementById(frameId);
              const doc = frame?.contentWindow?.document;
              const root = shadow
                ? doc?.getElementById('t3-lynx-preview')?.shadowRoot
                : doc;
              const card = root?.querySelector(
                '[data-review-checkpoint-card][data-review-checkpoint-status="ready"]'
              );
              const target =
                card?.querySelector('.turn-diff-card__toggle') ??
                card?.querySelector('button[aria-expanded]');
              if (!frame || !target) return null;
              target.scrollIntoView?.({ block: 'center', inline: 'nearest' });
              const frameRect = frame.getBoundingClientRect();
              const rect = target.getBoundingClientRect();
              return {
                x: frameRect.x + rect.x + rect.width / 2,
                y: frameRect.y + rect.y + rect.height / 2,
              };
            };
            return {
              web: pointFor('web-pane', false),
              lynx: pointFor('lynx-pane', true),
            };
          })()`,
        ).catch(() => null);
        if (!webChangedFilesInputSent && changedFilesPoints?.web) {
          await dispatchPointerClick(cdp, sessionId, changedFilesPoints.web);
          await delay(100);
          continue;
        }
        if (!lynxChangedFilesInputSent && changedFilesPoints?.lynx) {
          await dispatchPointerClick(cdp, sessionId, changedFilesPoints.lynx);
          await delay(100);
          continue;
        }
      }
    }
    if (isReviewState && threadReadyForReview(state, expectThread)) {
      const reviewTimelineKey = JSON.stringify({
        web: state?.web?.reviewMetrics ?? null,
        lynx: state?.lynx?.reviewMetrics ?? null,
      });
      if (reviewTimelineKey !== lastReviewTimelineKey) {
        reviewInteractionTimeline.push({
          elapsedMs: Date.now() - readyStart,
          ...JSON.parse(reviewTimelineKey),
        });
        lastReviewTimelineKey = reviewTimelineKey;
      }
      const panelPoints = await evaluate(
        cdp,
        sessionId,
        `(() => {
          const pointFor = (frameId, selector, shadow) => {
            const frame = document.getElementById(frameId);
            const doc = frame?.contentWindow?.document;
            const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
            const target = root?.querySelector(selector);
            if (!frame || !target) return null;
            const frameRect = frame.getBoundingClientRect();
            const rect = target.getBoundingClientRect();
            return {
              x: frameRect.x + rect.x + rect.width / 2,
              y: frameRect.y + rect.y + rect.height / 2,
            };
          };
          return {
            web: pointFor('web-pane', '[aria-label="Toggle right panel"]', false),
            lynx: pointFor('lynx-pane', '[aria-label="Toggle right panel"]', true),
          };
        })()`,
      ).catch(() => null);
      if (!webReviewPanelInputSent && !state?.web?.reviewMetrics?.panelOpen && panelPoints?.web) {
        await dispatchPointerClick(cdp, sessionId, panelPoints.web);
        webReviewPanelInputSent = true;
        await delay(100);
        continue;
      }
      if (
        !lynxReviewPanelInputSent &&
        !state?.lynx?.reviewMetrics?.panelOpen &&
        panelPoints?.lynx
      ) {
        await dispatchPointerClick(cdp, sessionId, panelPoints.lynx);
        lynxReviewPanelInputSent = true;
        await delay(100);
        continue;
      }
      const shouldOpenDiff = reviewExpectation === "diff";
      if (shouldOpenDiff && !webReviewDiffInputSent && !state?.web?.reviewMetrics?.diff) {
        const checkpointDiffPoint = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const frame = document.getElementById('web-pane');
            const doc = frame?.contentWindow?.document;
            const target = doc?.querySelector('[data-review-checkpoint-card] [data-review-open-diff]');
            if (!frame || !target) return null;
            const frameRect = frame.getBoundingClientRect();
            const rect = target.getBoundingClientRect();
            return {
              x: frameRect.x + rect.x + rect.width / 2,
              y: frameRect.y + rect.y + rect.height / 2,
            };
          })()`,
        ).catch(() => null);
        if (checkpointDiffPoint) {
          await dispatchPointerClick(cdp, sessionId, checkpointDiffPoint);
          webReviewDiffInputSent = true;
          await delay(100);
          continue;
        }
      }
      if (
        shouldOpenDiff &&
        state?.web?.reviewMetrics?.panelOpen &&
        state?.lynx?.reviewMetrics?.panelOpen
      ) {
        const diffPoints = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const pointFor = (frameId, shadow) => {
              const frame = document.getElementById(frameId);
              const doc = frame?.contentWindow?.document;
              const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
              const target = root?.querySelector('[data-right-panel-action="diff"]');
              if (!frame || !target || target.getAttribute('aria-disabled') === 'true') return null;
              const frameRect = frame.getBoundingClientRect();
              const rect = target.getBoundingClientRect();
              return {
                x: frameRect.x + rect.x + rect.width / 2,
                y: frameRect.y + rect.y + rect.height / 2,
              };
            };
            return {
              lynx: pointFor('lynx-pane', true),
            };
          })()`,
        ).catch(() => null);
        if (!lynxReviewDiffInputSent && !state?.lynx?.reviewMetrics?.diff && diffPoints?.lynx) {
          await dispatchPointerClick(cdp, sessionId, diffPoints.lynx);
          lynxReviewDiffInputSent = true;
          await delay(100);
          continue;
        }
      }
    }
    if (
      overlay &&
      !webOverlayInputSent &&
      state?.web?.connected === true &&
      state?.web?.productState?.selectedProject === expectProject &&
      state?.web?.productState?.overlay !== overlay
    ) {
      const triggerSelector =
        overlay === "quick-switch"
          ? ""
          : overlay === "file-picker"
            ? ""
            : overlay === "project-scope"
              ? '[data-testid="sidebar-v2-project-scope-trigger"]'
              : '[data-chat-provider-model-picker="true"]';
      const point = triggerSelector
        ? await evaluate(
            cdp,
            sessionId,
            `(() => {
          const frame = document.getElementById('web-pane');
          const doc = frame && frame.contentWindow && frame.contentWindow.document;
          const target = doc && doc.querySelector(${JSON.stringify(triggerSelector)});
          if (!frame || !target) return null;
          const fr = frame.getBoundingClientRect();
          const r = target.getBoundingClientRect();
          return { x: fr.x + r.x + r.width / 2, y: fr.y + r.y + r.height / 2 };
        })()`,
          ).catch(() => null)
        : null;
      if (point) {
        await cdp.send(
          "Input.dispatchMouseEvent",
          { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 },
          sessionId,
        );
        await cdp.send(
          "Input.dispatchMouseEvent",
          { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 },
          sessionId,
        );
        webOverlayInputSent = true;
        webOverlayWaitPolls = 0;
      } else if (
        (overlay === "quick-switch" || overlay === "file-picker") &&
        !webQuickSwitchKeyboardSent
      ) {
        const focusPoint = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const frame = document.getElementById('web-pane');
            const doc = frame?.contentWindow?.document;
            const target =
              doc?.querySelector('[data-chat-header]') ??
              doc?.querySelector('.composer-frame') ??
              doc?.body;
            if (!frame || !target) return null;
            const fr = frame.getBoundingClientRect();
            const r = target.getBoundingClientRect();
            return {
              x: fr.x + Math.min(Math.max(r.width / 2, 1), Math.max(r.width - 1, 1)),
              y: fr.y + Math.min(Math.max(r.height / 2, 1), Math.max(r.height - 1, 1)),
            };
          })()`,
        ).catch(() => null);
        if (focusPoint) {
          await cdp.send(
            "Input.dispatchMouseEvent",
            { type: "mousePressed", ...focusPoint, button: "left", clickCount: 1 },
            sessionId,
          );
          await cdp.send(
            "Input.dispatchMouseEvent",
            { type: "mouseReleased", ...focusPoint, button: "left", clickCount: 1 },
            sessionId,
          );
          const shortcutKey = overlay === "file-picker" ? "p" : "k";
          const shortcutCode = overlay === "file-picker" ? "KeyP" : "KeyK";
          const shortcutVirtualKeyCode = overlay === "file-picker" ? 80 : 75;
          await cdp.send(
            "Input.dispatchKeyEvent",
            {
              type: "rawKeyDown",
              modifiers: 4,
              key: shortcutKey,
              code: shortcutCode,
              windowsVirtualKeyCode: shortcutVirtualKeyCode,
            },
            sessionId,
          );
          await cdp.send(
            "Input.dispatchKeyEvent",
            {
              type: "keyUp",
              modifiers: 4,
              key: shortcutKey,
              code: shortcutCode,
              windowsVirtualKeyCode: shortcutVirtualKeyCode,
            },
            sessionId,
          );
          webQuickSwitchKeyboardSent = true;
          webOverlayInputSent = true;
          webShortcutInputChannel = `cdp-meta-${shortcutKey}`;
          webOverlayWaitPolls = 0;
        }
      }
    }
    if (overlay && webOverlayInputSent && state?.web?.productState?.overlay !== overlay) {
      webOverlayWaitPolls += 1;
      if (webOverlayWaitPolls >= 10) {
        webOverlayInputSent = false;
        webOverlayWaitPolls = 0;
        if (overlay === "quick-switch" || overlay === "file-picker") {
          webQuickSwitchKeyboardSent = false;
        }
      }
    }
    if (
      (overlay === "project-scope" || overlay === "quick-switch" || overlay === "file-picker") &&
      !lynxOverlayInputSent &&
      state?.lynx?.connected === true &&
      state?.lynx?.productState?.overlay !== overlay
    ) {
      if (overlay === "quick-switch" || overlay === "file-picker") {
        const dispatched = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const frame = document.getElementById('lynx-pane');
            return frame?.contentWindow?.__T3_LYNX_WEB_PREVIEW__?.dispatchKeyboardShortcut(
              ${JSON.stringify(overlay === "file-picker" ? "files" : "command")}
            ) ?? false;
          })()`,
        ).catch(() => false);
        if (dispatched) {
          lynxOverlayInputSent = true;
          lynxShortcutInputChannel =
            overlay === "file-picker"
              ? "lynx-host-keyboard-packet:meta-p"
              : "lynx-host-keyboard-packet:meta-k";
          lynxOverlayWaitPolls = 0;
        }
      } else {
        const point = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const frame = document.getElementById('lynx-pane');
            const doc = frame && frame.contentWindow && frame.contentWindow.document;
            const root = doc?.getElementById('t3-lynx-preview')?.shadowRoot;
            const target = root?.querySelector('[data-testid="sidebar-v2-project-scope-trigger"]');
            if (!frame || !target) return null;
            const fr = frame.getBoundingClientRect();
            const r = target.getBoundingClientRect();
            return { x: fr.x + r.x + r.width / 2, y: fr.y + r.y + r.height / 2 };
          })()`,
        ).catch(() => null);
        if (point) {
          await cdp.send(
            "Input.dispatchMouseEvent",
            { type: "mousePressed", ...point, button: "left", clickCount: 1 },
            sessionId,
          );
          await cdp.send(
            "Input.dispatchMouseEvent",
            { type: "mouseReleased", ...point, button: "left", clickCount: 1 },
            sessionId,
          );
          lynxOverlayInputSent = true;
        }
      }
    }
    if (
      (overlay === "quick-switch" || overlay === "file-picker") &&
      lynxOverlayInputSent &&
      state?.lynx?.productState?.overlay !== overlay
    ) {
      lynxOverlayWaitPolls += 1;
      if (lynxOverlayWaitPolls >= 10) {
        lynxOverlayInputSent = false;
        lynxOverlayWaitPolls = 0;
      }
    }
    if (
      overlay &&
      query &&
      !overlayQueryInputSent &&
      state?.web?.productState?.overlay === overlay &&
      state?.lynx?.productState?.overlay === overlay
    ) {
      const selectors =
        overlay === "quick-switch" || overlay === "file-picker"
          ? {
              web: '[data-command-palette="true"] [data-slot="autocomplete-input"]',
              lynx: ".qs-search__input",
            }
          : {
              web: '[data-model-picker-content] [data-slot="combobox-input"]',
              lynx: ".picker-search__input",
            };
      const inputPoints = await evaluate(
        cdp,
        sessionId,
        `(() => {
          const pointFor = (frameId, selector, shadow) => {
            const frame = document.getElementById(frameId);
            const doc = frame?.contentWindow?.document;
            const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
            const host = root?.querySelector(selector);
            const target = shadow ? host?.shadowRoot?.querySelector('input') : host;
            if (!frame || !target) return null;
            const fr = frame.getBoundingClientRect();
            const r = target.getBoundingClientRect();
            return { x: fr.x + r.x + r.width / 2, y: fr.y + r.y + r.height / 2 };
          };
          return {
            web: pointFor('web-pane', ${JSON.stringify(selectors.web)}, false),
            lynx: pointFor('lynx-pane', ${JSON.stringify(selectors.lynx)}, true),
          };
        })()`,
      ).catch(() => null);
      if (inputPoints?.web && inputPoints?.lynx) {
        await cdp.send(
          "Input.dispatchMouseEvent",
          { type: "mousePressed", ...inputPoints.web, button: "left", clickCount: 1 },
          sessionId,
        );
        await cdp.send(
          "Input.dispatchMouseEvent",
          { type: "mouseReleased", ...inputPoints.web, button: "left", clickCount: 1 },
          sessionId,
        );
        for (const character of query) {
          await cdp.send(
            "Input.dispatchKeyEvent",
            {
              type: "char",
              text: character,
              unmodifiedText: character,
            },
            sessionId,
          );
        }
        let lynxFocused = true;
        for (let index = 0; index < query.length; index += 1) {
          const character = query[index];
          const expectedPrefix = query.slice(0, index + 1);
          const focused = await focusRemoteElement(
            cdp,
            sessionId,
            `(() => {
              const frame = document.getElementById('lynx-pane');
              const innerDocument = frame?.contentWindow?.document;
              const root = innerDocument
                ?.getElementById('t3-lynx-preview')?.shadowRoot;
              const host = root?.querySelector(${JSON.stringify(selectors.lynx)});
              return host?.shadowRoot?.querySelector('input') ?? null;
            })()`,
          );
          if (!focused) {
            lynxFocused = false;
            break;
          }
          await cdp.send(
            "Input.dispatchKeyEvent",
            {
              type: "char",
              text: character,
              unmodifiedText: character,
            },
            sessionId,
          );
          const prefixDeadline = Date.now() + 1000;
          let prefixApplied = false;
          while (Date.now() < prefixDeadline) {
            const currentQuery = await evaluate(
              cdp,
              sessionId,
              `(() => window.__T3_WORKBENCH__?.read()?.lynx?.productState?.overlayQuery ?? "")()`,
            ).catch(() => "");
            if (currentQuery === expectedPrefix) {
              prefixApplied = true;
              break;
            }
            await delay(20);
          }
          if (!prefixApplied) {
            lynxFocused = false;
            break;
          }
        }
        overlayQueryInputSent = true;
        overlayQueryInputChannel = `web-cdp-pointer+key-char|lynx-dom-focus+key-char:${lynxFocused}`;
      }
    }
    if (
      overlay === "model-picker" &&
      providerId &&
      !providerInputSent &&
      modelPickerSemanticReadyPolls >= 3 &&
      state?.web?.productState?.overlay === overlay &&
      state?.lynx?.productState?.overlay === overlay
    ) {
      const providerPoints = await evaluate(
        cdp,
        sessionId,
        `(() => {
          const pointFor = (frameId, shadow) => {
            const frame = document.getElementById(frameId);
            const doc = frame?.contentWindow?.document;
            const root = shadow ? doc?.getElementById('t3-lynx-preview')?.shadowRoot : doc;
            const semanticTarget = root?.querySelector(
              ${JSON.stringify(`[data-model-picker-provider="${providerId}"]`)},
            );
            const target =
              semanticTarget?.matches('button,[role="button"]')
                ? semanticTarget
                : semanticTarget?.querySelector('button,[role="button"]') ?? semanticTarget;
            if (!frame || !target) return null;
            const fr = frame.getBoundingClientRect();
            const r = target.getBoundingClientRect();
            const localX = r.x + r.width / 2;
            const localY = r.y + r.height / 2;
            const documentHit = doc?.elementFromPoint(localX, localY);
            const shadowHit =
              shadow && root && "elementFromPoint" in root
                ? root.elementFromPoint(localX, localY)
                : null;
            return {
              x: fr.x + localX,
              y: fr.y + localY,
              target: {
                tagName: target.tagName,
                role: target.getAttribute('role'),
                rect: { x: r.x, y: r.y, width: r.width, height: r.height },
                documentHit: documentHit?.tagName ?? null,
                documentHitClass: documentHit?.getAttribute('class') ?? null,
                shadowHit: shadowHit?.tagName ?? null,
                shadowHitClass: shadowHit?.getAttribute('class') ?? null,
              },
            };
          };
          return {
            web: pointFor('web-pane', false),
            lynx: pointFor('lynx-pane', true),
          };
        })()`,
      ).catch(() => null);
      if (providerPoints?.web && providerPoints?.lynx) {
        providerInputDiagnostics = {
          web: providerPoints.web.target,
          lynx: providerPoints.lynx.target,
        };
        await dispatchPointerClick(cdp, sessionId, providerPoints.web);
        const lynxDomClicked = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const frame = document.getElementById('lynx-pane');
            const root = frame?.contentWindow?.document
              ?.getElementById('t3-lynx-preview')
              ?.shadowRoot;
            const target = root?.querySelector(
              ${JSON.stringify(`[data-model-picker-provider="${providerId}"]`)},
            );
            if (!target) return false;
            target.click();
            return true;
          })()`,
        ).catch(() => false);
        providerInputSent = true;
        providerInputChannel = `web-cdp-pointer|lynx-dom-click:${lynxDomClicked}`;
      }
    }
    if (
      composerInput &&
      !composerInputSent &&
      state?.web?.composerMetrics?.state === "idle" &&
      state?.lynx?.composerMetrics?.state === "idle" &&
      state?.web?.composerMetrics?.editor?.disabled === false &&
      state?.lynx?.composerMetrics?.editor?.disabled === false
    ) {
      const webComposerEditorFocused = await focusRemoteElement(
        cdp,
        sessionId,
        `(() => {
          const frame = document.getElementById('web-pane');
          return frame?.contentWindow?.document?.querySelector('[data-composer-editor="true"]') ?? null;
        })()`,
      );
      let lynxComposerEditorFocused = true;
      if (webComposerEditorFocused) {
        for (let index = 0; index < composerInput.length; index += 1) {
          const character = composerInput[index];
          await cdp.send(
            "Input.dispatchKeyEvent",
            { type: "char", text: character, unmodifiedText: character },
            sessionId,
          );
        }
        for (let index = 0; index < composerInput.length; index += 1) {
          const character = composerInput[index];
          const expectedPrefix = composerInput.slice(0, index + 1);
          const focused = await focusRemoteElement(
            cdp,
            sessionId,
            `(() => {
              const frame = document.getElementById('lynx-pane');
              const doc = frame?.contentWindow?.document;
              const root = doc?.getElementById('t3-lynx-preview')?.shadowRoot;
              const host = root?.querySelector('[data-composer-editor="true"]');
              return host?.shadowRoot?.querySelector('textarea') ?? host ?? null;
            })()`,
          );
          if (!focused) {
            lynxComposerEditorFocused = false;
            break;
          }
          await cdp.send("Input.insertText", { text: character }, sessionId);
          const prefixDeadline = Date.now() + 1000;
          let prefixApplied = false;
          while (Date.now() < prefixDeadline) {
            const currentValue = await evaluate(
              cdp,
              sessionId,
              `(() => window.__T3_WORKBENCH__?.read()?.lynx?.composerMetrics?.editor?.value ?? "")()`,
            ).catch(() => "");
            if (currentValue === expectedPrefix) {
              prefixApplied = true;
              break;
            }
            await delay(20);
          }
          if (!prefixApplied) {
            lynxComposerEditorFocused = false;
            break;
          }
        }
        composerInputSent = true;
        composerInputChannel = `web-dom-focus+key-char:${webComposerEditorFocused}|lynx-dom-focus+key-char:${lynxComposerEditorFocused}`;
      }
    }
    const overlayReady =
      !overlay ||
      (state?.web?.productState?.overlay === overlay &&
        state?.lynx?.productState?.overlay === overlay &&
        (!query ||
          (state?.web?.productState?.overlayQuery === query &&
            state?.lynx?.productState?.overlayQuery === query)) &&
        (!providerId ||
          (state?.web?.overlayMetrics?.selectedProviderId === providerId &&
            state?.lynx?.overlayMetrics?.selectedProviderId === providerId)));
    const currentModelPickerSemanticMatch =
      overlay !== "model-picker" ||
      (JSON.stringify(state?.web?.overlayMetrics?.semanticKeys ?? []) ===
        JSON.stringify(state?.lynx?.overlayMetrics?.semanticKeys ?? []) &&
        JSON.stringify(
          (state?.web?.overlayMetrics?.providerItems ?? []).map(({ id, active, disabled }) => ({
            id,
            active,
            disabled,
          })),
        ) ===
          JSON.stringify(
            (state?.lynx?.overlayMetrics?.providerItems ?? []).map(({ id, active, disabled }) => ({
              id,
              active,
              disabled,
            })),
          ) &&
        state?.web?.overlayMetrics?.selectedModelKey ===
          state?.lynx?.overlayMetrics?.selectedModelKey &&
        JSON.stringify(state?.web?.overlayMetrics?.selectedRowKeys ?? []) ===
          JSON.stringify(state?.lynx?.overlayMetrics?.selectedRowKeys ?? []) &&
        state?.web?.overlayMetrics?.selectedProviderId ===
          state?.lynx?.overlayMetrics?.selectedProviderId);
    modelPickerSemanticReadyPolls = currentModelPickerSemanticMatch
      ? modelPickerSemanticReadyPolls + 1
      : 0;
    if (providerId) {
      providerReadyPolls = overlayReady ? providerReadyPolls + 1 : 0;
    }
    const threadReady =
      !expectThread ||
      (webThreadInputSent &&
        lynxThreadInputSent &&
        state?.web?.productState?.selectedThread === expectThread &&
        state?.lynx?.productState?.selectedThread === expectThread);
    const settingsAsyncReady =
      stateId === "settings-source-control-loading"
        ? state?.web?.settingsMetrics?.loading === true &&
          state?.lynx?.settingsMetrics?.loading === true
        : stateId === "settings-source-control-error"
          ? state?.web?.settingsMetrics?.loading === false &&
            state?.lynx?.settingsMetrics?.loading === false &&
            (state?.web?.settingsMetrics?.errorTexts ?? []).some((text) =>
              text?.includes("Source-control discovery is unavailable"),
            ) &&
            (state?.lynx?.settingsMetrics?.errorTexts ?? []).some((text) =>
              text?.includes("Source-control discovery is unavailable"),
            )
          : stateId !== "settings-source-control" ||
            ((state?.web?.settingsMetrics?.rowIds ?? []).includes("source-control") &&
              (state?.lynx?.settingsMetrics?.rowIds ?? []).includes("source-control"));
    settingsAsyncReadyPolls = settingsAsyncReady ? settingsAsyncReadyPolls + 1 : 0;
    const webTimelineRows = state?.web?.timelineMetrics?.rows ?? [];
    const lynxTimelineRows = state?.lynx?.timelineMetrics?.rows ?? [];
    const transcriptReady =
      !stateId.startsWith("existing-thread-") ||
      (webTimelineRows.length > 0 &&
        JSON.stringify(webTimelineRows) === JSON.stringify(lynxTimelineRows));
    transcriptReadyPolls = transcriptReady ? transcriptReadyPolls + 1 : 0;
    const expectedPendingKind =
      stateId === "existing-thread-approval"
        ? "approval"
        : stateId === "existing-thread-question"
          ? "question"
          : null;
    const pendingRequestReady =
      expectedPendingKind === null ||
      (state?.web?.pendingRequestMetrics?.kind === expectedPendingKind &&
        state?.lynx?.pendingRequestMetrics?.kind === expectedPendingKind &&
        JSON.stringify(state?.web?.pendingRequestMetrics) ===
          JSON.stringify(state?.lynx?.pendingRequestMetrics));
    pendingRequestReadyPolls = pendingRequestReady ? pendingRequestReadyPolls + 1 : 0;
    const composerInputReady =
      !composerInput ||
      (state?.web?.composerMetrics?.editor?.value === composerInput &&
        state?.lynx?.composerMetrics?.editor?.value === composerInput);
    const composerStateReady =
      composerExpectation === null ||
      composerPairMatches(
        state?.web?.composerMetrics,
        state?.lynx?.composerMetrics,
        composerExpectation,
        height,
      );
    const composerReady =
      composerInputReady &&
      composerStateReady &&
      composerAnatomyMatches(state?.web?.composerMetrics, state?.lynx?.composerMetrics);
    const shortcutInputReady =
      !requiresShortcutInput ||
      (webOverlayInputSent &&
        lynxOverlayInputSent &&
        webShortcutInputChannel !== "pending" &&
        lynxShortcutInputChannel !== "pending");
    const sidebarSearchReady =
      !sidebarQuery ||
      (webSidebarSearchInputSent &&
        lynxSidebarSearchInputSent &&
        state?.web?.sidebarDiagnostics?.search?.value === sidebarQuery &&
        state?.lynx?.sidebarDiagnostics?.search?.value === sidebarQuery &&
        (state?.web?.sidebarDiagnostics?.search?.resultTitles?.length ?? 0) > 0 &&
        JSON.stringify(state?.web?.sidebarDiagnostics?.search?.resultTitles ?? []) ===
          JSON.stringify(state?.lynx?.sidebarDiagnostics?.search?.resultTitles ?? []));
    const sidebarStateReady =
      !sidebarTargetState ||
      (webSidebarStateInputSent &&
        lynxSidebarStateInputSent &&
        state?.web?.sidebarDiagnostics?.state === sidebarTargetState &&
        state?.lynx?.sidebarDiagnostics?.state === sidebarTargetState);
    const changedFilesStateReady =
      !changedFilesTargetState ||
      (webChangedFilesInputSent &&
        lynxChangedFilesInputSent &&
        normalizedChangedFilesState(state?.web?.reviewMetrics) === changedFilesTargetState &&
        normalizedChangedFilesState(state?.lynx?.reviewMetrics) === changedFilesTargetState);
    const coreGeometryReady = coreGeometryMatches(state?.web, state?.lynx);
    const reviewReady =
      reviewPairMatches(state?.web?.reviewMetrics, state?.lynx?.reviewMetrics, reviewExpectation) &&
      sidebarDiffPairMatches(
        state?.web?.sidebarDiagnostics,
        state?.lynx?.sidebarDiagnostics,
        reviewExpectation,
      );
    const lifecycleReady =
      !isLifecycleFaultState ||
      (ownedServerTerminated &&
        state?.web?.connected === false &&
        state?.lynx?.connected === false &&
        state?.web?.productState?.lifecycle === "connecting" &&
        state?.lynx?.productState?.lifecycle === "connecting");
    const semanticStateReady = isLifecycleFaultState
      ? lifecycleReady
      : state?.web?.semanticReady === true && state?.lynx?.semanticReady === true;
    if (
      state &&
      semanticStateReady &&
      overlayReady &&
      providerReadyPolls >= 3 &&
      modelPickerSemanticReadyPolls >= 3 &&
      threadReady &&
      settingsAsyncReadyPolls >= (stateId === "settings-source-control-loading" ? 1 : 10) &&
      transcriptReadyPolls >= 1 &&
      pendingRequestReadyPolls >= 1 &&
      composerReady &&
      shortcutInputReady &&
      sidebarSearchReady &&
      sidebarStateReady &&
      changedFilesStateReady &&
      coreGeometryReady &&
      reviewReady &&
      lifecycleReady
    ) {
      reachedTargetState = true;
      break;
    }
    await delay(100);
  }
  const readyMs = Date.now() - readyStart;
  const targetStateReady =
    state?.web?.semanticReady === true &&
    state?.lynx?.semanticReady === true &&
    (!overlay ||
      (state?.web?.productState?.overlay === overlay &&
        state?.lynx?.productState?.overlay === overlay));

  // Lynx-for-Web applies its compiled stylesheet ASYNCHRONOUSLY, a few frames
  // after semantic readiness, and its `<image>`-based icons apply their inline
  // px size only once rasterized. Screenshotting on readiness alone catches an
  // unstyled frame (icons at intrinsic size, rows overflowing). Gate the
  // capture on a style-applied probe: EVERY icon `<image>` in the Lynx shadow
  // root must have collapsed to an icon-sized box (<= 28px). Poll until no
  // oversized icon image remains.
  const styleDeadline = Date.now() + 10000;
  let lynxStyled = !targetStateReady;
  while (targetStateReady && Date.now() < styleDeadline) {
    lynxStyled = Boolean(
      await evaluate(
        cdp,
        sessionId,
        `(() => {
          const view = document.getElementById('lynx-pane');
          const doc = view && view.contentWindow && view.contentWindow.document;
          const lynx = doc && doc.getElementById('t3-lynx-preview');
          const sr = lynx && lynx.shadowRoot;
          if (!sr) return false;
          const imgs = [...sr.querySelectorAll('x-image, X-IMAGE, image, img')];
          if (imgs.length === 0) return false;
          // The wordmark is legitimately wider than tall; exclude it. Every
          // other icon image must be within an icon-sized box.
          const oversized = imgs.filter((el) => {
            const r = el.getBoundingClientRect();
            const className = el.getAttribute('class') || '';
            if (
              className.includes('authority') ||
              className.includes('sidebar-grain__tile')
            ) {
              return false;
            }
            // The T3 wordmark is legitimately wide (~54x16) and short; exclude
            // any image whose HEIGHT is icon-sized even if it is wide.
            if (r.height > 0 && r.height <= 28) return false;
            return r.width > 28 || r.height > 28;
          });
          return oversized.length === 0;
        })()`,
      ).catch(() => false),
    );
    if (lynxStyled) break;
    await delay(100);
  }
  // Diagnostic: if icons never settled, record what the oversized ones are so
  // the divergence is inspectable from the real capture context (not a
  // standalone probe).
  let lynxIconDiag = null;
  if (!lynxStyled) {
    lynxIconDiag = await evaluate(
      cdp,
      sessionId,
      `(() => {
        const view = document.getElementById('lynx-pane');
        const doc = view && view.contentWindow && view.contentWindow.document;
        const lynx = doc && doc.getElementById('t3-lynx-preview');
        const sr = lynx && lynx.shadowRoot;
        if (!sr) return { error: 'no shadow root' };
        const imgs = [...sr.querySelectorAll('x-image, X-IMAGE, image, img')];
        const big = imgs.map((el) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return { cls: (el.getAttribute('class')||'').slice(0,60), style: el.getAttribute('style')||'', w: Math.round(r.width), h: Math.round(r.height), cssW: cs.width, cssH: cs.height, objectFit: cs.objectFit };
        }).filter((x) => x.w > 28 || x.h > 28).slice(0, 8);
        return { imageCount: imgs.length, oversized: big };
      })()`,
    ).catch((e) => ({ error: String(e) }));
    console.log(
      `[shared-workbench] ${viewport.label} lynx icons not settled: ${JSON.stringify(lynxIconDiag)}`,
    );
  }
  // Two extra frames after the last icon settles, so raster is committed.
  // Model-picker provider/query transitions replace a custom-element subtree;
  // Lynx-for-Web updates its semantic shadow tree before Chromium commits the
  // corresponding compositor surface, so retain evidence only after that
  // additional paint window.
  await delay(
    overlay === "model-picker" && (providerId.length > 0 || query.length > 0) ? 1800 : 400,
  );
  state =
    (await evaluate(
      cdp,
      sessionId,
      `(() => { const w = window.__T3_WORKBENCH__; return w ? w.read() : null; })()`,
    ).catch(() => null)) ?? state;

  const lifecycleFaultReady =
    isLifecycleFaultState &&
    ownedServerTerminated &&
    state?.web?.connected === false &&
    state?.lynx?.connected === false &&
    state?.web?.productState?.lifecycle === "connecting" &&
    state?.lynx?.productState?.lifecycle === "connecting";
  const bothReady =
    lifecycleFaultReady || Boolean(state?.web?.semanticReady && state?.lynx?.semanticReady);
  const finalOverlayReady =
    !overlay ||
    (state?.web?.productState?.overlay === overlay &&
      state?.lynx?.productState?.overlay === overlay &&
      (!query ||
        (state?.web?.productState?.overlayQuery === query &&
          state?.lynx?.productState?.overlayQuery === query)) &&
      (!providerId ||
        (state?.web?.overlayMetrics?.selectedProviderId === providerId &&
          state?.lynx?.overlayMetrics?.selectedProviderId === providerId)));
  const finalShortcutInputReady =
    !requiresShortcutInput ||
    (webShortcutInputChannel !== "pending" && lynxShortcutInputChannel !== "pending");
  const finalSidebarSearchReady =
    !sidebarQuery ||
    (sidebarSearchInputChannel !== "pending" &&
      state?.web?.sidebarDiagnostics?.search?.value === sidebarQuery &&
      state?.lynx?.sidebarDiagnostics?.search?.value === sidebarQuery &&
      (state?.web?.sidebarDiagnostics?.search?.resultTitles?.length ?? 0) > 0 &&
      JSON.stringify(state?.web?.sidebarDiagnostics?.search?.resultTitles ?? []) ===
        JSON.stringify(state?.lynx?.sidebarDiagnostics?.search?.resultTitles ?? []));
  const finalSidebarStateReady =
    !sidebarTargetState ||
    (webSidebarStateInputSent &&
      lynxSidebarStateInputSent &&
      state?.web?.sidebarDiagnostics?.state === sidebarTargetState &&
      state?.lynx?.sidebarDiagnostics?.state === sidebarTargetState);
  const finalChangedFilesStateReady =
    !changedFilesTargetState ||
    (webChangedFilesInputSent &&
      lynxChangedFilesInputSent &&
      normalizedChangedFilesState(state?.web?.reviewMetrics) === changedFilesTargetState &&
      normalizedChangedFilesState(state?.lynx?.reviewMetrics) === changedFilesTargetState);
  const finalCoreGeometryReady = coreGeometryMatches(state?.web, state?.lynx);
  const finalComposerInputReady =
    !composerInput ||
    (state?.web?.composerMetrics?.editor?.value === composerInput &&
      state?.lynx?.composerMetrics?.editor?.value === composerInput);
  const finalComposerStateReady =
    composerExpectation === null ||
    composerPairMatches(
      state?.web?.composerMetrics,
      state?.lynx?.composerMetrics,
      composerExpectation,
      height,
    );
  const finalComposerReady =
    finalComposerInputReady &&
    finalComposerStateReady &&
    composerAnatomyMatches(state?.web?.composerMetrics, state?.lynx?.composerMetrics);
  const finalReviewReady =
    reviewPairMatches(state?.web?.reviewMetrics, state?.lynx?.reviewMetrics, reviewExpectation) &&
    sidebarDiffPairMatches(
      state?.web?.sidebarDiagnostics,
      state?.lynx?.sidebarDiagnostics,
      reviewExpectation,
    );
  const finalSettingsAsyncReady =
    stateId === "settings-source-control-loading"
      ? state?.web?.settingsMetrics?.loading === true &&
        state?.lynx?.settingsMetrics?.loading === true
      : stateId === "settings-source-control-error"
        ? state?.web?.settingsMetrics?.loading === false &&
          state?.lynx?.settingsMetrics?.loading === false &&
          (state?.web?.settingsMetrics?.errorTexts ?? []).some((text) =>
            text?.includes("Source-control discovery is unavailable"),
          ) &&
          (state?.lynx?.settingsMetrics?.errorTexts ?? []).some((text) =>
            text?.includes("Source-control discovery is unavailable"),
          )
        : stateId !== "settings-source-control" ||
          ((state?.web?.settingsMetrics?.rowIds ?? []).includes("source-control") &&
            (state?.lynx?.settingsMetrics?.rowIds ?? []).includes("source-control"));
  const finalTranscriptReady =
    !stateId.startsWith("existing-thread-") ||
    ((state?.web?.timelineMetrics?.rows?.length ?? 0) > 0 &&
      JSON.stringify(state?.web?.timelineMetrics?.rows ?? []) ===
        JSON.stringify(state?.lynx?.timelineMetrics?.rows ?? []) &&
      JSON.stringify(state?.web?.timelineMetrics?.codeBlocks ?? []) ===
        JSON.stringify(state?.lynx?.timelineMetrics?.codeBlocks ?? []) &&
      JSON.stringify(state?.web?.timelineMetrics?.turnFolds ?? []) ===
        JSON.stringify(state?.lynx?.timelineMetrics?.turnFolds ?? []) &&
      state?.web?.timelineMetrics?.workGroupCount ===
        state?.lynx?.timelineMetrics?.workGroupCount &&
      JSON.stringify(state?.web?.timelineMetrics?.workEntries ?? []) ===
        JSON.stringify(state?.lynx?.timelineMetrics?.workEntries ?? []) &&
      webTurnFoldInputSent &&
      lynxTurnFoldInputSent &&
      webThinkingInputSent &&
      lynxThinkingInputSent &&
      (!expandTurnId ||
        ((state?.web?.timelineMetrics?.workGroupCount ?? 0) > 0 &&
          (state?.lynx?.timelineMetrics?.workGroupCount ?? 0) > 0)) &&
      (!expandThinking ||
        ((state?.web?.timelineMetrics?.workEntries ?? []).some(
          (entry) => entry.tone === "thinking" && entry.state === "expanded" && entry.detail,
        ) &&
          (state?.lynx?.timelineMetrics?.workEntries ?? []).some(
            (entry) => entry.tone === "thinking" && entry.state === "expanded" && entry.detail,
          ))));
  const finalPendingRequestReady =
    stateId !== "existing-thread-approval" && stateId !== "existing-thread-question"
      ? true
      : JSON.stringify(state?.web?.pendingRequestMetrics ?? null) ===
          JSON.stringify(state?.lynx?.pendingRequestMetrics ?? null) &&
        state?.web?.pendingRequestMetrics?.kind ===
          (stateId === "existing-thread-approval" ? "approval" : "question");
  const webState = state?.web?.productState ?? null;
  const lynxState = state?.lynx?.productState ?? null;
  const stateIdentityMatch =
    Boolean(webState && lynxState) &&
    JSON.stringify({
      route: webState.route,
      semanticRoute: webState.semanticRoute,
      theme: webState.theme,
      density: webState.density,
      selectedProject: webState.selectedProject,
      selectedThread: webState.selectedThread,
      selectedModel: webState.selectedModel,
      lifecycle: webState.lifecycle,
      overlay: webState.overlay,
      overlayQuery: webState.overlayQuery,
    }) ===
      JSON.stringify({
        route: lynxState.route,
        semanticRoute: lynxState.semanticRoute,
        theme: lynxState.theme,
        density: lynxState.density,
        selectedProject: lynxState.selectedProject,
        selectedThread: lynxState.selectedThread,
        selectedModel: lynxState.selectedModel,
        lifecycle: lynxState.lifecycle,
        overlay: lynxState.overlay,
        overlayQuery: lynxState.overlayQuery,
      });
  const overlayGeometryDelta =
    state?.web?.overlayMetrics?.rect && state?.lynx?.overlayMetrics?.rect
      ? {
          x: Math.abs(state.web.overlayMetrics.rect.x - state.lynx.overlayMetrics.rect.x),
          y: Math.abs(state.web.overlayMetrics.rect.y - state.lynx.overlayMetrics.rect.y),
          width: Math.abs(
            state.web.overlayMetrics.rect.width - state.lynx.overlayMetrics.rect.width,
          ),
          height: Math.abs(
            state.web.overlayMetrics.rect.height - state.lynx.overlayMetrics.rect.height,
          ),
        }
      : null;
  const overlayAnchorOffsets =
    state?.web?.overlayMetrics?.rect &&
    state?.web?.overlayMetrics?.triggerRect &&
    state?.lynx?.overlayMetrics?.rect &&
    state?.lynx?.overlayMetrics?.triggerRect
      ? {
          web: {
            x: state.web.overlayMetrics.rect.x - state.web.overlayMetrics.triggerRect.x,
            y:
              state.web.overlayMetrics.rect.y -
              (state.web.overlayMetrics.triggerRect.y +
                state.web.overlayMetrics.triggerRect.height),
          },
          lynx: {
            x: state.lynx.overlayMetrics.rect.x - state.lynx.overlayMetrics.triggerRect.x,
            y:
              state.lynx.overlayMetrics.rect.y -
              (state.lynx.overlayMetrics.triggerRect.y +
                state.lynx.overlayMetrics.triggerRect.height),
          },
        }
      : null;
  const webOverlayRowLabels = state?.web?.overlayMetrics?.rowLabels ?? [];
  const lynxOverlayRowLabels = state?.lynx?.overlayMetrics?.rowLabels ?? [];
  const isModelPickerOverlay = webState?.overlay === "model-picker";
  const webOverlaySemanticKeys = state?.web?.overlayMetrics?.semanticKeys ?? [];
  const lynxOverlaySemanticKeys = state?.lynx?.overlayMetrics?.semanticKeys ?? [];
  const modelPickerSemanticMatch =
    JSON.stringify(webOverlaySemanticKeys) === JSON.stringify(lynxOverlaySemanticKeys) &&
    JSON.stringify(state?.web?.overlayMetrics?.providerIds ?? []) ===
      JSON.stringify(state?.lynx?.overlayMetrics?.providerIds ?? []) &&
    JSON.stringify(
      (state?.web?.overlayMetrics?.providerItems ?? []).map(({ id, active, disabled }) => ({
        id,
        active,
        disabled,
      })),
    ) ===
      JSON.stringify(
        (state?.lynx?.overlayMetrics?.providerItems ?? []).map(({ id, active, disabled }) => ({
          id,
          active,
          disabled,
        })),
      ) &&
    state?.web?.overlayMetrics?.selectedModelKey ===
      state?.lynx?.overlayMetrics?.selectedModelKey &&
    JSON.stringify(state?.web?.overlayMetrics?.selectedRowKeys ?? []) ===
      JSON.stringify(state?.lynx?.overlayMetrics?.selectedRowKeys ?? []) &&
    state?.web?.overlayMetrics?.selectedProviderId ===
      state?.lynx?.overlayMetrics?.selectedProviderId;
  const overlayContentMatch = isModelPickerOverlay
    ? modelPickerSemanticMatch
    : webOverlayRowLabels.length === 0 && lynxOverlayRowLabels.length === 0
      ? state?.web?.overlayMetrics?.emptyText === state?.lynx?.overlayMetrics?.emptyText
      : webOverlayRowLabels.every((label, index) => label && label === lynxOverlayRowLabels[index]);
  const settingsContentMatch = !semanticRoute.startsWith("settings-")
    ? true
    : stateId === "settings-source-control-loading"
      ? state?.web?.settingsMetrics?.loading === true &&
        state?.lynx?.settingsMetrics?.loading === true &&
        JSON.stringify(state?.web?.settingsMetrics?.navigationLabels ?? []) ===
          JSON.stringify(state?.lynx?.settingsMetrics?.navigationLabels ?? [])
      : stateId === "settings-source-control-error"
        ? JSON.stringify(state?.web?.settingsMetrics?.navigationLabels ?? []) ===
            JSON.stringify(state?.lynx?.settingsMetrics?.navigationLabels ?? []) &&
          JSON.stringify(state?.web?.settingsMetrics?.errorTexts ?? []) ===
            JSON.stringify(state?.lynx?.settingsMetrics?.errorTexts ?? []) &&
          (state?.web?.settingsMetrics?.sourceControlRetryLabels?.length ?? 0) > 0 &&
          (state?.lynx?.settingsMetrics?.sourceControlRetryLabels?.length ?? 0) > 0
        : JSON.stringify(state?.web?.settingsMetrics?.navigationLabels ?? []) ===
            JSON.stringify(state?.lynx?.settingsMetrics?.navigationLabels ?? []) &&
          ((state?.web?.settingsMetrics?.sectionTitles?.length ?? 0) === 0 ||
            (state?.lynx?.settingsMetrics?.sectionTitles?.length ?? 0) === 0 ||
            JSON.stringify(state?.web?.settingsMetrics?.sectionTitles ?? []) ===
              JSON.stringify(state?.lynx?.settingsMetrics?.sectionTitles ?? [])) &&
          JSON.stringify(state?.web?.settingsMetrics?.sourceControlRows ?? []) ===
            JSON.stringify(state?.lynx?.settingsMetrics?.sourceControlRows ?? []) &&
          JSON.stringify(state?.web?.settingsMetrics?.emptyTexts ?? []) ===
            JSON.stringify(state?.lynx?.settingsMetrics?.emptyTexts ?? []) &&
          JSON.stringify(state?.web?.settingsMetrics?.errorTexts ?? []) ===
            JSON.stringify(state?.lynx?.settingsMetrics?.errorTexts ?? []) &&
          ((state?.web?.settingsMetrics?.rowIds?.length ?? 0) === 0 ||
            (state?.lynx?.settingsMetrics?.rowIds?.length ?? 0) === 0 ||
            JSON.stringify(state?.web?.settingsMetrics?.rowIds ?? []) ===
              JSON.stringify(state?.lynx?.settingsMetrics?.rowIds ?? []));

  const layout = await evaluate(
    cdp,
    sessionId,
    `(() => {
      const web = document.getElementById("web-pane").getBoundingClientRect();
      const lynx = document.getElementById("lynx-pane").getBoundingClientRect();
      return { devicePixelRatio, webPane: { x: web.x, y: web.y, width: web.width, height: web.height }, lynxPane: { x: lynx.x, y: lynx.y, width: lynx.width, height: lynx.height } };
    })()`,
  );
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const dismissNotificationPoint = await evaluate(
      cdp,
      sessionId,
      `(() => {
        const pane = document.getElementById("web-pane");
        const doc = pane?.contentWindow?.document;
        const dismiss = doc?.querySelector('button[aria-label="Dismiss notification"]');
        if (!dismiss || !pane) return null;
        const paneRect = pane.getBoundingClientRect();
        const rect = dismiss.getBoundingClientRect();
        return {
          x: paneRect.x + rect.x + rect.width / 2,
          y: paneRect.y + rect.y + rect.height / 2,
        };
      })()`,
    );
    if (!dismissNotificationPoint) break;
    await cdp.send(
      "Input.dispatchMouseEvent",
      {
        type: "mouseMoved",
        x: dismissNotificationPoint.x,
        y: dismissNotificationPoint.y,
        button: "none",
      },
      sessionId,
    );
    await cdp.send(
      "Input.dispatchMouseEvent",
      {
        type: "mousePressed",
        x: dismissNotificationPoint.x,
        y: dismissNotificationPoint.y,
        button: "left",
        clickCount: 1,
      },
      sessionId,
    );
    await cdp.send(
      "Input.dispatchMouseEvent",
      {
        type: "mouseReleased",
        x: dismissNotificationPoint.x,
        y: dismissNotificationPoint.y,
        button: "left",
        clickCount: 1,
      },
      sessionId,
    );
    await delay(350);
  }
  const notificationDismissed = await evaluate(
    cdp,
    sessionId,
    `!document.getElementById("web-pane")?.contentWindow?.document
      ?.querySelector('button[aria-label="Dismiss notification"]')`,
  );
  if (!notificationDismissed) {
    throw new Error("Web provider-update notification did not dismiss before capture.");
  }
  const clip = (r) => ({
    x: Math.round(r.x),
    y: Math.round(r.y),
    width: Math.round(r.width),
    height: Math.round(r.height),
    scale: 1,
  });

  const webShot = await cdp.send(
    "Page.captureScreenshot",
    { format: "png", clip: clip(layout.webPane), captureBeyondViewport: true },
    sessionId,
  );
  const lynxShot = await cdp.send(
    "Page.captureScreenshot",
    { format: "png", clip: clip(layout.lynxPane), captureBeyondViewport: true },
    sessionId,
  );
  const webPng = Buffer.from(webShot.data, "base64");
  const lynxPng = Buffer.from(lynxShot.data, "base64");
  const webPath = path.join(cellDir, "web.png");
  const lynxPath = path.join(cellDir, "lynx.png");
  await Promise.all([writeFile(webPath, webPng), writeFile(lynxPath, lynxPng)]);
  const webAssertionsPath = path.join(cellDir, "web-assertions.json");
  const lynxAssertionsPath = path.join(cellDir, "lynx-assertions.json");
  const consolePath = path.join(cellDir, "console.txt");

  const webDims = pngDimensions(webPng);
  const lynxDims = pngDimensions(lynxPng);
  const sameDims = webDims.width === lynxDims.width && webDims.height === lynxDims.height;

  let sideBySide = null;
  let diff = null;
  if (sameDims) {
    const sbsPath = path.join(cellDir, "side-by-side.png");
    const diffPath = path.join(cellDir, "diff.png");
    const sbs = runFfmpeg([
      "-i",
      webPath,
      "-i",
      lynxPath,
      "-filter_complex",
      "hstack=inputs=2",
      sbsPath,
    ]);
    const dff = runFfmpeg([
      "-i",
      webPath,
      "-i",
      lynxPath,
      "-filter_complex",
      "blend=all_mode=difference",
      diffPath,
    ]);
    sideBySide = sbs.ok ? path.relative(repoRoot, sbsPath) : { error: sbs.reason };
    diff = dff.ok ? path.relative(repoRoot, diffPath) : { error: dff.reason };
  }

  await browserCdp.send("Target.closeTarget", { targetId }).catch(() => undefined);

  // Shared-server identity gate: both panes rendered the seeded project.
  const identityMatch =
    stateIdentityMatch &&
    (lifecycleFaultReady ||
      (state?.web?.connected === true &&
        (state?.lynx?.connected === true || state?.lynx?.semanticReady === true)));

  const consoleErrors = console_.filter(
    (e) =>
      e.level === "error" &&
      !/NYI: (profileStart|isProfileRecording|profileEnd)\./.test(e.text) &&
      !/allow-scripts and allow-same-origin/.test(e.text) &&
      !/Failed to load resource.*404/.test(e.text) &&
      !/favicon\.ico/.test(e.text) &&
      !(
        isLifecycleFaultState &&
        (/WebSocket connection .* failed:/.test(e.text) ||
          /SocketReadError: An error occurred during Read/.test(e.text))
      ),
  );

  const pass =
    reachedTargetState &&
    bothReady &&
    identityMatch &&
    finalOverlayReady &&
    finalShortcutInputReady &&
    finalSidebarSearchReady &&
    finalSidebarStateReady &&
    finalChangedFilesStateReady &&
    finalCoreGeometryReady &&
    finalComposerReady &&
    finalReviewReady &&
    finalSettingsAsyncReady &&
    finalTranscriptReady &&
    finalPendingRequestReady &&
    settingsContentMatch !== false &&
    lynxStyled &&
    consoleErrors.length === 0 &&
    sameDims;
  if (!pass)
    failuresNote(viewport.label, {
      reachedTargetState,
      bothReady,
      identityMatch,
      finalOverlayReady,
      finalShortcutInputReady,
      finalSidebarSearchReady,
      finalSidebarStateReady,
      finalChangedFilesStateReady,
      finalCoreGeometryReady,
      finalComposerReady,
      finalReviewReady,
      finalSettingsAsyncReady,
      finalTranscriptReady,
      finalPendingRequestReady,
      settingsContentMatch,
      lynxStyled,
      consoleClean: consoleErrors.length === 0,
      sameDims,
    });

  await Promise.all([
    writeFile(
      webAssertionsPath,
      `${JSON.stringify(
        {
          client: "web",
          stateId,
          semanticReady: state?.web?.semanticReady === true,
          heroPresent: state?.web?.heroPresent === true,
          productState: webState,
          literalRoute: state?.web?.literalRoute ?? null,
          visibleModelLabel: webState?.visibleModelLabel ?? null,
          overlayMetrics: state?.web?.overlayMetrics ?? null,
          sidebarDiagnostics: state?.web?.sidebarDiagnostics ?? null,
          composerMetrics: state?.web?.composerMetrics ?? null,
          timelineMetrics: state?.web?.timelineMetrics ?? null,
          reviewMetrics: state?.web?.reviewMetrics ?? null,
          pendingRequestMetrics: state?.web?.pendingRequestMetrics ?? null,
          settingsMetrics: state?.web?.settingsMetrics ?? null,
        },
        null,
        2,
      )}\n`,
    ),
    writeFile(
      lynxAssertionsPath,
      `${JSON.stringify(
        {
          client: "lynx",
          stateId,
          semanticReady: state?.lynx?.semanticReady === true,
          heroPresent: state?.lynx?.heroPresent === true,
          productState: lynxState,
          visibleModelLabel: lynxState?.visibleModelLabel ?? null,
          overlayMetrics: state?.lynx?.overlayMetrics ?? null,
          sidebarDiagnostics: state?.lynx?.sidebarDiagnostics ?? null,
          composerMetrics: state?.lynx?.composerMetrics ?? null,
          timelineMetrics: state?.lynx?.timelineMetrics ?? null,
          reviewMetrics: state?.lynx?.reviewMetrics ?? null,
          pendingRequestMetrics: state?.lynx?.pendingRequestMetrics ?? null,
          settingsMetrics: state?.lynx?.settingsMetrics ?? null,
          rendererErrors: state?.lynx?.rendererErrors ?? [],
        },
        null,
        2,
      )}\n`,
    ),
    writeFile(
      consolePath,
      consoleErrors.map((entry) => `${entry.level}: ${entry.text}`).join("\n"),
    ),
  ]);

  return {
    stateId,
    viewport: viewport.label,
    commit,
    bundles: { web: webBundle.sha256.slice(0, 12), lynx: lynxBundle.sha256.slice(0, 12) },
    seedHash,
    readyMs,
    lynxStyled,
    readiness: { bothReady, web: state?.web ?? null, lynx: state?.lynx ?? null },
    identity: {
      match: identityMatch,
      stateIdentityMatch,
      expectProject,
      webState,
      lynxState,
      overlayGeometryDelta,
      overlayAnchorOffsets,
      overlayContentMatch,
      modelPickerSemanticMatch,
      settingsContentMatch,
      overlayRowCountMatch: isModelPickerOverlay
        ? webOverlaySemanticKeys.length === lynxOverlaySemanticKeys.length
        : state?.web?.overlayMetrics?.rowCount === state?.lynx?.overlayMetrics?.rowCount,
      webProjectSelectionStage,
      webShortcutInputChannel,
      lynxShortcutInputChannel,
      sidebarQuery,
      sidebarSearchInputChannel,
      sidebarTargetState,
      sidebarStateInputChannel:
        sidebarTargetState.length === 0 ? "not-required" : "web-pointer-click|lynx-pointer-click",
      changedFilesTargetState,
      changedFilesInputChannel:
        changedFilesTargetState.length === 0
          ? "not-required"
          : "web-pointer-click|lynx-pointer-click",
      overlayQueryInputChannel,
      providerInputChannel,
      providerInputDiagnostics,
      providerPostconditionTimeline,
      composerInputChannel,
      reviewInteractionTimeline,
    },
    images: {
      web: path.relative(repoRoot, webPath),
      lynx: path.relative(repoRoot, lynxPath),
      sideBySide,
      diff,
      webDims,
      lynxDims,
      sameDimensions: sameDims,
    },
    console: { errors: consoleErrors },
    assertions: {
      web: path.relative(repoRoot, webAssertionsPath),
      lynx: path.relative(repoRoot, lynxAssertionsPath),
      console: path.relative(repoRoot, consolePath),
    },
    pass,
  };
}

async function admitBrowserPairToManifest({ manifestPath, outputRoot, stateId, result }) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const state = manifest.states.find((candidate) => candidate.id === stateId);
  if (!state) throw new Error(`Manifest state not found: ${stateId}`);
  if (!result.identity.stateIdentityMatch) {
    throw new Error(`Refusing manifest admission: ${stateId} product state differs across panes`);
  }
  const relativeFromManifest = (absolutePath) =>
    path.relative(path.dirname(manifestPath), absolutePath).split(path.sep).join("/");
  const stateEcho = {
    route: result.identity.webState.route,
    semanticRoute: result.identity.webState.semanticRoute,
    theme: result.identity.webState.theme,
    density: result.identity.webState.density,
    selectedProject: result.identity.webState.selectedProject,
    selectedThread: result.identity.webState.selectedThread,
    selectedModel: result.identity.webState.selectedModel,
    lifecycle: result.identity.webState.lifecycle,
    overlay: result.identity.webState.overlay,
    overlayQuery: result.identity.webState.overlayQuery,
  };
  state.state = {
    ...state.state,
    route: stateEcho.route,
    semanticRoute: stateEcho.semanticRoute,
    selectedProject: stateEcho.selectedProject,
    selectedThread: stateEcho.selectedThread,
    selectedModel: stateEcho.selectedModel,
    lifecycle: stateEcho.lifecycle,
    overlay: stateEcho.overlay,
    overlayQuery: stateEcho.overlayQuery,
    snapshotSha256: result.seedHash,
  };
  const contentGate =
    result.identity.webState.semanticRoute.startsWith("settings-") &&
    result.identity.settingsContentMatch === null
      ? "unassessed"
      : (result.identity.webState.lifecycle !== "ready" ||
            result.identity.webState.semanticRoute.startsWith("settings-") ||
            result.identity.webState.visibleModelLabel ===
              result.identity.lynxState.visibleModelLabel) &&
          result.identity.settingsContentMatch !== false &&
          result.identity.overlayContentMatch !== false
        ? "pass"
        : "gap";
  const visualGate =
    (result.identity.webState.semanticRoute.startsWith("settings-") ||
      result.identity.webState.visibleModelLabel === result.identity.lynxState.visibleModelLabel) &&
    result.identity.settingsContentMatch !== false &&
    result.identity.overlayContentMatch !== false
      ? "pass"
      : "gap";
  const overlayDelta = result.identity.overlayGeometryDelta;
  const overlayAnchorOffsets = result.identity.overlayAnchorOffsets;
  const webOverlayMetrics = result.readiness.web.overlayMetrics;
  const lynxOverlayMetrics = result.readiness.lynx.overlayMetrics;
  const anchoredOverlaySizeDelta =
    webOverlayMetrics?.rect &&
    webOverlayMetrics?.triggerRect &&
    lynxOverlayMetrics?.rect &&
    lynxOverlayMetrics?.triggerRect
      ? {
          width: Math.abs(
            webOverlayMetrics.rect.width -
              webOverlayMetrics.triggerRect.width -
              (lynxOverlayMetrics.rect.width - lynxOverlayMetrics.triggerRect.width),
          ),
          height: Math.abs(webOverlayMetrics.rect.height - lynxOverlayMetrics.rect.height),
        }
      : null;
  const overlayVisualGate =
    overlayDelta === null
      ? "unassessed"
      : (stateEcho.overlay === "model-picker" || stateEcho.overlay === "project-scope") &&
          overlayAnchorOffsets &&
          anchoredOverlaySizeDelta
        ? (stateEcho.overlay === "model-picker"
            ? overlayDelta.width <= 8 && overlayDelta.height <= 8
            : anchoredOverlaySizeDelta.width <= 8 && anchoredOverlaySizeDelta.height <= 8) &&
          Math.abs(overlayAnchorOffsets.web.x - overlayAnchorOffsets.lynx.x) <= 8 &&
          Math.abs(overlayAnchorOffsets.web.y - overlayAnchorOffsets.lynx.y) <= 8
          ? "pass"
          : "gap"
        : Object.values(overlayDelta).every((delta) => delta <= 8)
          ? "pass"
          : "gap";
  const commonGates = {
    harness: "capture-valid",
    content: contentGate,
    visual: overlayVisualGate,
    interaction: "not-required",
    sourceReuse: "unassessed",
  };
  for (const client of ["web", "lynx"]) {
    const imagePath = path.join(outputRoot, result.viewport, `${client}.png`);
    const assertionsPath = path.join(outputRoot, result.viewport, `${client}-assertions.json`);
    const consolePath = path.join(outputRoot, result.viewport, "console.txt");
    state.evidence[client] = {
      status: "retained",
      path: relativeFromManifest(imagePath),
      captureTier: "browser",
      buildSha256: result.bundles[client],
      snapshotSha256: result.seedHash,
      image: result.images[`${client}Dims`],
      sha256: createHash("sha256")
        .update(await readFile(imagePath))
        .digest("hex"),
      assertions: relativeFromManifest(assertionsPath),
      console: relativeFromManifest(consolePath),
      stateEcho,
      gates: commonGates,
    };
  }
  state.verdict = visualGate === "gap" ? "visual-gap" : "capture-valid";
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function failuresNote(label, gates) {
  const failed = Object.entries(gates)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  console.log(`[shared-workbench] ${label} FAIL gates: ${failed.join(", ")}`);
}

function renderComparisonHtml(summary) {
  const esc = (v) =>
    String(v).replace(
      /[&<>"]/g,
      (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch],
    );
  const rel = (p) =>
    typeof p === "string" ? esc(p.replace(/^apps\/lynxtron\/evidence\/[^/]+\/[^/]+\//, "")) : null;
  const passCount = summary.cells.filter((c) => c.pass).length;
  const badge = (ok, label) =>
    `<span class="badge ${ok ? "badge--ok" : "badge--bad"}">${esc(label)}</span>`;
  const frame = (label, src, alt) =>
    src
      ? `<article class="frame"><div class="frame-head"><span class="frame-label">${esc(label)}</span></div><button class="image-button" type="button"><img src="${src}" alt="${esc(alt)}" loading="lazy" /></button></article>`
      : `<article class="frame"><div class="frame-head"><span class="frame-label">${esc(label)}</span></div><div class="frame-missing">not retained</div></article>`;
  const cards = summary.cells
    .map((cell, index) => {
      const dir = `${cell.viewport}`;
      const gates = [
        badge(cell.readiness?.bothReady, "both-ready"),
        badge(cell.identity?.match, "same-server-identity"),
        badge(cell.images?.sameDimensions, "dims"),
        badge((cell.console?.errors?.length ?? 0) === 0, "clean-console"),
      ].join(" ");
      return `
        <article class="case" data-pass="${cell.pass}">
          <header class="case-header">
            <span class="case-index">${String(index + 1).padStart(2, "0")}</span>
            <h2>Shared server · ${esc(cell.viewport)}</h2>
            <span class="case-meta">seed ${esc((cell.seedHash ?? "").slice(0, 10))} · dark</span>
            <span class="case-verdict ${cell.pass ? "ok" : "bad"}">${cell.pass ? "PASS" : "FAIL"}</span>
          </header>
          <div class="gates">${gates}</div>
          <div class="frames">
            ${frame("Real Web app", `${dir}/web.png`, `Web · ${cell.viewport}`)}
            ${frame("Lynx-for-Web", `${dir}/lynx.png`, `Lynx Web · ${cell.viewport}`)}
            ${frame("Diagnostic diff", rel(cell.images?.diff), `diff · ${cell.viewport}`)}
          </div>
          <div class="frames frames--wide">${frame("Side by side", rel(cell.images?.sideBySide), `side by side · ${cell.viewport}`)}</div>
        </article>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>T3 Code · Single-server dual-frontend evidence</title>
<style>
  :root { color-scheme: dark; --page:#0b0b0c; --surface:#191c1f; --surface2:#202428; --ink:#f0f1f2; --muted:#a5abb2; --line:#353a3f; --ok:#79d8a6; --bad:#ff8a8a; --accent:#8ac6ff; }
  *{box-sizing:border-box;} body{margin:0;background:var(--page);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}
  .shell{width:min(1840px,calc(100% - 32px));margin:0 auto;padding:28px 0 80px;}
  .masthead{border-bottom:1px solid var(--line);padding-bottom:20px;}
  .eyebrow{color:var(--accent);font-size:12px;font-weight:700;letter-spacing:0.17em;text-transform:uppercase;margin:0 0 8px;}
  h1{margin:0;font-size:clamp(28px,4vw,52px);font-weight:600;letter-spacing:-0.02em;}
  .intro{margin:12px 0 0;max-width:860px;color:var(--muted);line-height:1.6;}
  .summary{display:flex;gap:24px;margin:20px 0 0;flex-wrap:wrap;}
  .summary div{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:14px 18px;min-width:150px;}
  .summary strong{display:block;font-size:26px;} .summary span{color:var(--muted);font-size:13px;}
  .case{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:18px;margin:22px 0 0;}
  .case-header{display:flex;align-items:baseline;gap:12px;} .case-index{color:var(--muted);}
  .case-header h2{margin:0;font-size:20px;font-weight:600;} .case-meta{color:var(--muted);font-size:13px;}
  .case-verdict{margin-left:auto;font-weight:700;font-size:13px;padding:2px 10px;border-radius:999px;}
  .case-verdict.ok{color:var(--ok);} .case-verdict.bad{color:var(--bad);}
  .gates{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0;}
  .badge{font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid var(--line);}
  .badge--ok{color:var(--ok);} .badge--bad{color:var(--bad);}
  .frames{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;} .frames--wide{grid-template-columns:1fr;margin-top:12px;}
  .frame{background:var(--surface2);border:1px solid var(--line);border-radius:10px;overflow:hidden;}
  .frame-head{display:flex;justify-content:space-between;padding:8px 10px;font-size:12px;color:var(--muted);border-bottom:1px solid var(--line);}
  .frame-label{color:var(--ink);font-weight:600;}
  .image-button{display:block;width:100%;border:0;padding:0;background:#000;cursor:zoom-in;} .image-button img{display:block;width:100%;height:auto;}
  .frame-missing{padding:24px;color:var(--muted);text-align:center;font-size:13px;}
</style></head>
<body><div class="shell">
  <header class="masthead">
    <p class="eyebrow">Single-server dual-frontend harness</p>
    <h1>Real Web vs Lynx-for-Web</h1>
    <p class="intro">Both panes are the shipping frontends connected to ONE seeded, isolated T3 Code server. The left pane is the real Web app (single-origin, paired); the right pane is the compiled ReactLynx bundle driven by the dev-only live connector transport against the same server. Any pane difference is a real renderer/composition difference, not a reference-fidelity artifact. Native Lynxtron correlation is Plan 11A BW5. Generated ${esc(summary.generatedAt)} · commit ${esc((summary.commit ?? "").slice(0, 12))}.</p>
    <div class="summary">
      <div><strong>${passCount}/${summary.cells.length}</strong><span>cells passing</span></div>
      <div><strong>${esc(summary.server?.expectProject ?? "")}</strong><span>seeded project</span></div>
      <div><strong>${summary.pass ? "PASS" : "FAIL"}</strong><span>overall</span></div>
    </div>
  </header>
  <section id="gallery">${cards}</section>
</div></body></html>`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
