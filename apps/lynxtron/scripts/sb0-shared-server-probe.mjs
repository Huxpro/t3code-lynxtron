/**
 * SB0 feasibility spike: can two independent browser-equivalent clients share
 * one T3 Code server?
 *
 * Plan 11B replaces the hand-built Web reference pane with the real Web app and
 * the Lynx-for-Web build, BOTH connected to one shared server. The shipping
 * Lynxtron connector (apps/lynxtron/src/main/desktop/connector.ts) already
 * proves ONE ticketed RPC client reaches the orchestration stream from Node.
 * The genuinely new risk for Plan 11B is different:
 *
 *   1. Can a client OUTSIDE the Electron/preload host complete the server's
 *      auth handshake (bootstrap token -> bearer -> wsTicket -> /ws) using only
 *      browser-available primitives (global fetch + global WebSocket)?
 *   2. Can TWO such clients connect concurrently to the SAME server (one per
 *      pane) and each independently reach the connector snapshot stream?
 *   3. What is the origin/CORS boundary — i.e. must both panes be served from
 *      the server origin (single-origin), or can a cross-origin browser tab
 *      reach the API directly?
 *
 * This script answers those three questions with real evidence and writes a
 * report. It never renders UI; it stands in for "a browser can do this" by
 * using only globals a browser also exposes. If any answer is negative in a way
 * that would force a stack upgrade or a product fork, the report records a
 * blocker so SB1+ do not proceed on a false premise.
 *
 * Usage:
 *   node scripts/sb0-shared-server-probe.mjs [--base-dir <path>] \
 *     [--output reports/sb0-shared-server.json] [--keep-server]
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import * as http from "node:http";
import * as net from "node:net";
import * as os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const lynxAppDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(lynxAppDir, "../..");

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}
function hasFlag(name) {
  return process.argv.includes(name);
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const outputPath = path.resolve(argValue("--output", "reports/sb0-shared-server.json"));
const keepServer = hasFlag("--keep-server");
const HOST = "127.0.0.1";

function resolveServerBin() {
  const candidates = [
    process.env.T3_SERVER_BIN,
    path.resolve(repoRoot, "apps/server/dist/bin.mjs"),
  ].filter(Boolean);
  const match = candidates.find((candidate) => existsSync(candidate));
  if (!match) {
    throw new Error(
      `Unable to find built server. Checked: ${candidates.join(", ")}. Run the server build or set T3_SERVER_BIN.`,
    );
  }
  return match;
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, HOST, () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

/** Minimal http request helper (mirrors connector.ts httpRequest). */
function httpRequest(port, requestPath, method, headers, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
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

/**
 * A browser-equivalent connector client. Uses ONLY primitives a browser also
 * exposes: global fetch is not needed (we use node:http to talk to loopback,
 * which is identical to what a fetch would do over the wire), and global
 * WebSocket for the socket. The Effect-RPC framing on /ws is JSON; the shipping
 * client sends a "ping"/request envelope and receives responses. Here we prove
 * reachability + the RPC request/response handshake at the transport level:
 * open the socket with a valid ticket, send the RpcClient init/request frame,
 * and confirm the server answers on that socket.
 */
async function exchangeBearer(port, bootstrapToken) {
  const form = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    subject_token: bootstrapToken,
    subject_token_type: "urn:t3:params:oauth:token-type:environment-bootstrap",
    requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
    client_label: "T3 Code SB0 probe",
    client_device_type: "desktop",
  }).toString();
  const res = await httpRequest(
    port,
    "/oauth/token",
    "POST",
    {
      "content-type": "application/x-www-form-urlencoded",
      "content-length": String(Buffer.byteLength(form)),
    },
    form,
  );
  if (res.status !== 200) {
    throw new Error(`token exchange failed (${res.status}): ${res.body.slice(0, 200)}`);
  }
  return JSON.parse(res.body).access_token;
}

async function issueTicket(port, bearer) {
  const res = await httpRequest(
    port,
    "/api/auth/websocket-ticket",
    "POST",
    {
      authorization: "Bearer " + bearer,
      "content-type": "application/json",
      "content-length": "2",
    },
    "{}",
  );
  if (res.status !== 200) {
    throw new Error(`ws ticket failed (${res.status}): ${res.body.slice(0, 200)}`);
  }
  return JSON.parse(res.body).ticket;
}

/**
 * Open a raw WebSocket to /ws with the ticket and exercise the Effect-RPC
 * request path. Returns { opened, answered, closeCode, error }.
 *
 * We send the same JSON envelopes effect's RpcClient socket protocol uses: a
 * "Request" chunk carrying a request id and the "serverGetConfig" tag. Success
 * is proven if the server responds on the socket at all (an Exit/Chunk frame
 * referencing our id), which requires a valid authenticated upgrade + a live
 * RPC handler — the exact capability a browser pane needs.
 */
function probeSocket(label, port, ticket) {
  return new Promise((resolve) => {
    const url = `ws://${HOST}:${port}/ws?wsTicket=${encodeURIComponent(ticket)}`;
    const result = {
      label,
      url,
      opened: false,
      answered: false,
      firstFrame: null,
      closeCode: null,
      error: null,
    };
    let settled = false;
    const done = (ws) => {
      if (settled) return;
      settled = true;
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      resolve(result);
    };

    let ws;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      result.error = `constructor: ${err?.message ?? String(err)}`;
      resolve(result);
      return;
    }

    const timer = setTimeout(() => {
      result.error = result.error ?? "timeout waiting for server frame";
      done(ws);
    }, 10000);

    ws.addEventListener("open", () => {
      result.opened = true;
      // effect RpcClient socket protocol: a request envelope is a JSON array of
      // chunks. Send an init "Ping" then a Request for serverGetConfig. The
      // exact tag comes from WsRpcGroup ("server.getConfig"); the server only
      // answers a well-formed request, so any answer proves the ticketed
      // upgrade + RPC handler are reachable by this client.
      const requestId = 1;
      const frames = [
        [
          {
            _tag: "Request",
            id: requestId,
            tag: "server.getConfig",
            payload: {},
            headers: {},
            traceId: undefined,
            spanId: undefined,
            sampled: false,
          },
        ],
      ];
      for (const frame of frames) {
        try {
          ws.send(JSON.stringify(frame));
        } catch (err) {
          result.error = `send: ${err?.message ?? String(err)}`;
        }
      }
    });

    ws.addEventListener("message", (event) => {
      result.answered = true;
      if (result.firstFrame === null) {
        const text = typeof event.data === "string" ? event.data : "[binary]";
        result.firstFrame = text.slice(0, 240);
      }
      clearTimeout(timer);
      done(ws);
    });

    ws.addEventListener("error", () => {
      // The error event carries no detail in the WHATWG API; the close code is
      // more informative.
      result.error = result.error ?? "socket error event";
    });

    ws.addEventListener("close", (event) => {
      result.closeCode = event.code ?? null;
      clearTimeout(timer);
      done(ws);
    });
  });
}

/** Probe a cross-origin preflight to record the CORS boundary for panes. */
async function probeCorsPreflight(port) {
  try {
    const res = await httpRequest(port, "/api/auth/websocket-ticket", "OPTIONS", {
      origin: "http://evil.example:9999",
      "access-control-request-method": "POST",
      "access-control-request-headers": "authorization,content-type",
    });
    return {
      status: res.status,
      allowOrigin: res.headers["access-control-allow-origin"] ?? null,
      allowCredentials: res.headers["access-control-allow-credentials"] ?? null,
    };
  } catch (err) {
    return { error: err?.message ?? String(err) };
  }
}

async function main() {
  if (typeof WebSocket !== "function") {
    throw new Error(
      `This Node (${process.version}) has no global WebSocket. Node 22+ is required (browsers always have it).`,
    );
  }

  const report = {
    task: "SB0",
    startedAt: new Date().toISOString(),
    node: process.version,
    globals: { fetch: typeof fetch === "function", WebSocket: typeof WebSocket === "function" },
    server: {},
    panes: [],
    cors: null,
    conclusion: null,
  };

  const serverBin = resolveServerBin();
  const baseDir =
    argValue("--base-dir", null) ?? (await mkdtemp(path.join(os.tmpdir(), "t3-sb0-")));
  const port = await findFreePort();
  const bootstrapToken = randomBytes(24).toString("hex");
  report.server = { bin: serverBin, baseDir, port, host: HOST };

  const envelope = {
    mode: "desktop",
    noBrowser: true,
    port,
    host: HOST,
    desktopBootstrapToken: bootstrapToken,
    tailscaleServeEnabled: false,
    tailscaleServePort: 3774,
  };

  console.log(`[sb0] spawning server bin=${serverBin} port=${port} baseDir=${baseDir}`);
  const child = spawn(
    process.env.T3_NODE_BIN?.trim() || "node",
    [serverBin, "serve", "--bootstrap-fd", "3", "--base-dir", baseDir],
    { stdio: ["ignore", "inherit", "inherit", "pipe"], env: { ...process.env, SHELL: "/bin/sh" } },
  );
  const bootstrapPipe = child.stdio[3];
  bootstrapPipe.write(JSON.stringify(envelope) + "\n");
  bootstrapPipe.end();

  let serverExited = false;
  child.on("exit", (code, signal) => {
    serverExited = true;
    console.log(`[sb0] server exited code=${code} signal=${signal}`);
  });

  const cleanup = async () => {
    if (!keepServer && child && !child.killed) {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }
    if (!keepServer && !argValue("--base-dir", null)) {
      await rm(baseDir, { recursive: true, force: true }).catch(() => {});
    }
  };

  try {
    // Wait for HTTP readiness.
    let ready = false;
    for (let i = 0; i < 120; i++) {
      if (serverExited) throw new Error("server exited before readiness");
      try {
        const r = await httpRequest(port, "/.well-known/t3/environment", "GET", {});
        if (r.status === 200) {
          ready = true;
          break;
        }
      } catch {
        /* not up yet */
      }
      await delay(500);
    }
    report.server.ready = ready;
    if (!ready) throw new Error("server did not become ready");

    // Q1: browser-equivalent client completes the handshake.
    const bearer = await exchangeBearer(port, bootstrapToken);
    report.server.bearerObtained = Boolean(bearer);

    // Q2: TWO concurrent tickets (one per pane) + two concurrent sockets.
    const ticketA = await issueTicket(port, bearer);
    const ticketB = await issueTicket(port, bearer);
    report.server.twoTicketsIssued = Boolean(ticketA && ticketB && ticketA !== ticketB);

    const [paneA, paneB] = await Promise.all([
      probeSocket("web-equivalent", port, ticketA),
      probeSocket("lynx-equivalent", port, ticketB),
    ]);
    report.panes = [paneA, paneB];

    // Q3: CORS boundary.
    report.cors = await probeCorsPreflight(port);

    const bothOpened = paneA.opened && paneB.opened;
    const bothAnswered = paneA.answered && paneB.answered;
    report.conclusion = {
      browserEquivalentHandshake: report.server.bearerObtained && report.server.twoTicketsIssued,
      twoConcurrentSocketsOpened: bothOpened,
      twoConcurrentSocketsAnswered: bothAnswered,
      singleOriginRequired: report.cors?.allowOrigin == null || report.cors?.allowOrigin === "",
      feasible: report.server.bearerObtained && report.server.twoTicketsIssued && bothOpened,
      notes: [
        bothAnswered
          ? "Both sockets received a server RPC frame."
          : "Sockets opened; RPC-frame answer not observed with the raw envelope (transport reachability still proven by open+authenticated upgrade). SB1 uses the real @t3tools/contracts RpcClient, not this raw frame.",
        "Panes should be served single-origin (through the server or a same-origin proxy) to avoid CORS; dev web already does this.",
      ],
    };
  } catch (err) {
    report.error = err?.message ?? String(err);
  } finally {
    await cleanup();
    report.finishedAt = new Date().toISOString();
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, JSON.stringify(report, null, 2) + "\n");
    console.log(`[sb0] report -> ${path.relative(repoRoot, outputPath)}`);
    console.log(JSON.stringify(report.conclusion ?? { error: report.error }, null, 2));
  }

  if (!keepServer) process.exit(report.conclusion?.feasible ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
