/**
 * Diagnostic: read the Lynx-for-Web pane's rendered computed styles to find why
 * icons/layout diverge from Web. Launches the seeded server + front proxy +
 * headless Chrome, loads ONLY the Lynx pane against the live server, and dumps
 * computed geometry for the chat header, its buttons, and icon SVGs.
 *
 * Not a capture; a throwaway probe. Usage:
 *   node scripts/diagnose-lynx-styles.mjs
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, request as httpRequestRaw } from "node:http";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const lynxAppDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(lynxAppDir, "../..");
const LYNX_BUILD_DIR = path.join(lynxAppDir, "output/browser-preview");
const SERVER_BIN = path.join(repoRoot, "apps/server/dist/bin.mjs");
const CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const HOST = "127.0.0.1";
const baseDir = path.join(lynxAppDir, ".t3-workbench");
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".bundle": "application/octet-stream" };

function findFreePort() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.on("error", rej);
    s.listen(0, HOST, () => {
      const p = s.address().port;
      s.close(() => res(p));
    });
  });
}
function httpRequest(port, p, method, headers, body) {
  return new Promise((resolve, reject) => {
    const req = httpRequestRaw({ host: HOST, port, path: p, method, headers, timeout: 8000 }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: d }));
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    if (body) req.write(body);
    req.end();
  });
}
const PROXY = ["/api", "/ws", "/oauth", "/.well-known"];
function startFront(serverPort) {
  const server = createServer(async (req, res) => {
    const u = new URL(req.url ?? "/", `http://${HOST}`);
    const pn = decodeURIComponent(u.pathname);
    if (PROXY.some((x) => pn === x || pn.startsWith(x + "/") || pn.startsWith(x + "?"))) {
      const pr = httpRequestRaw({ host: HOST, port: serverPort, path: req.url, method: req.method, headers: req.headers }, (pres) => {
        res.writeHead(pres.statusCode ?? 502, pres.headers);
        pres.pipe(res);
      });
      pr.on("error", () => res.writeHead(502).end());
      req.pipe(pr);
      return;
    }
    let fp = null;
    if (pn.startsWith("/lynx/")) fp = path.join(LYNX_BUILD_DIR, pn.slice("/lynx/".length));
    if (!fp) return void res.writeHead(404).end();
    const info = await stat(fp).catch(() => null);
    if (!info?.isFile()) return void res.writeHead(404).end();
    res.writeHead(200, { "content-type": MIME[path.extname(fp)] ?? "application/octet-stream", "cache-control": "no-store" });
    createReadStream(fp).pipe(res);
  });
  server.on("upgrade", (req, socket, head) => {
    const up = net.connect(serverPort, HOST, () => {
      up.write([`${req.method} ${req.url} HTTP/1.1`, ...Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`), "", ""].join("\r\n"));
      if (head?.length) up.write(head);
      socket.pipe(up);
      up.pipe(socket);
    });
    up.on("error", () => socket.destroy());
    socket.on("error", () => up.destroy());
  });
  return new Promise((res) => server.listen(0, HOST, () => res({ server, port: server.address().port })));
}

class Cdp {
  constructor(u) { this.u = u; this.id = 1; this.p = new Map(); this.l = new Set(); }
  async connect() {
    this.s = new WebSocket(this.u);
    await new Promise((res, rej) => { this.s.addEventListener("open", res, { once: true }); this.s.addEventListener("error", rej, { once: true }); });
    this.s.addEventListener("message", (e) => {
      const m = JSON.parse(String(e.data));
      if (typeof m.id === "number") { const x = this.p.get(m.id); if (!x) return; this.p.delete(m.id); m.error ? x.reject(new Error(m.error.message)) : x.resolve(m.result ?? {}); }
    });
  }
  send(method, params = {}, sessionId) {
    const id = this.id++;
    const pl = { id, method, params };
    if (sessionId) pl.sessionId = sessionId;
    return new Promise((res, rej) => { this.p.set(id, { resolve: res, reject: rej }); this.s.send(JSON.stringify(pl)); });
  }
}
async function fetchJson(ep, p) { return (await fetch(new URL(p, ep))).json(); }
function waitDevtools(chrome) {
  return new Promise((res, rej) => {
    let b = "";
    const on = (c) => { b += String(c); const m = b.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (m) res(m[1].replace(/^ws:\/\//, "http://").replace(/\/devtools\/browser\/.*$/, "")); };
    chrome.stderr.on("data", on);
    chrome.stdout.on("data", on);
    setTimeout(() => rej(new Error("no devtools")), 15000);
  });
}
async function ev(cdp, sid, expr) {
  const r = await cdp.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }, sid);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result?.value;
}

async function main() {
  const serverPort = await findFreePort();
  const bt = randomBytes(24).toString("hex");
  const env = { mode: "desktop", noBrowser: true, port: serverPort, host: HOST, desktopBootstrapToken: bt, tailscaleServeEnabled: false, tailscaleServePort: 3774 };
  const child = spawn("node", [SERVER_BIN, "serve", "--bootstrap-fd", "3", "--base-dir", baseDir], { stdio: ["ignore", "pipe", "pipe", "pipe"], env: { ...process.env, SHELL: "/bin/sh" } });
  child.stdio[3].write(JSON.stringify(env) + "\n");
  child.stdio[3].end();
  let exited = false;
  child.on("exit", () => (exited = true));
  const kill = () => { try { child.kill("SIGKILL"); } catch {} };
  try {
    let ready = false;
    for (let i = 0; i < 120; i++) { if (exited) throw new Error("server exited"); try { const r = await httpRequest(serverPort, "/.well-known/t3/environment", "GET", {}); if (r.status === 200) { ready = true; break; } } catch {} await delay(500); }
    if (!ready) throw new Error("not ready");
    // mint ticket
    const form = new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:token-exchange", subject_token: bt, subject_token_type: "urn:t3:params:oauth:token-type:environment-bootstrap", requested_token_type: "urn:ietf:params:oauth:token-type:access_token", client_label: "diag", client_device_type: "desktop" }).toString();
    const ex = await httpRequest(serverPort, "/oauth/token", "POST", { "content-type": "application/x-www-form-urlencoded", "content-length": String(Buffer.byteLength(form)) }, form);
    const bearer = JSON.parse(ex.body).access_token;
    const tk = await httpRequest(serverPort, "/api/auth/websocket-ticket", "POST", { authorization: "Bearer " + bearer, "content-type": "application/json", "content-length": "2" }, "{}");
    const ticket = JSON.parse(tk.body).ticket;
    const front = await startFront(serverPort);
    const socketUrl = `ws://${HOST}:${front.port}/ws?wsTicket=${encodeURIComponent(ticket)}`;
    const chrome = spawn(CHROME_BIN, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=/tmp/diag-${process.pid}`, "--no-first-run", "--disable-gpu", "--force-device-scale-factor=1", "about:blank"], { stdio: ["ignore", "pipe", "pipe"] });
    const ep = await waitDevtools(chrome);
    const v = await fetchJson(ep, "/json/version");
    const cdp = new Cdp(v.webSocketDebuggerUrl);
    await cdp.connect();
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false }, sessionId);
    const url = `http://${HOST}:${front.port}/lynx/index.html?live=1&socket=${encodeURIComponent(socketUrl)}&width=1280&height=820`;
    await cdp.send("Page.navigate", { url }, sessionId);
    // wait for ready
    for (let i = 0; i < 60; i++) { const s = await ev(cdp, sessionId, "window.__T3_LYNX_WEB_PREVIEW__ && window.__T3_LYNX_WEB_PREVIEW__.semanticReady").catch(() => false); if (s) break; await delay(500); }
    await delay(500);
    // Dump computed styles inside the lynx-view shadow root.
    const dump = await ev(cdp, sessionId, `(() => {
      const view = document.getElementById('t3-lynx-preview');
      const sr = view && view.shadowRoot;
      if (!sr) return { error: 'no shadow root' };
      // The working-status container.
      const work = sr.querySelector('[class*="animate-sidebar-working-text"]');
      if (!work) return { note: 'no working status visible (thread not in working state)' };
      const r = work.getBoundingClientRect();
      const kids = [...work.querySelectorAll('*')].slice(0,6).map((el)=>{const cr=el.getBoundingClientRect();const cs=getComputedStyle(el);return {tag:el.tagName, cls:(el.getAttribute('class')||'').slice(0,40), style:el.getAttribute('style')||'', w:Math.round(cr.width), h:Math.round(cr.height), cssW:cs.width, cssH:cs.height, display:cs.display, flex:cs.flex, contain:cs.contain};});
      return { workBox:{w:Math.round(r.width),h:Math.round(r.height)}, children: kids, workHTML: (work.outerHTML||'').slice(0,400) };
    })()`);
    console.log(JSON.stringify(dump, null, 2));
    try { chrome.kill("SIGKILL"); } catch {}
    front.server.close();
  } finally {
    kill();
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
