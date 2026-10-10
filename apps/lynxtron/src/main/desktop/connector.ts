/**
 * The server the main process finds or starts for the app (Node host layer).
 *
 * It does what only the main process can:
 *   1. with no environment to attach to, spawns the prebuilt t3 server
 *      (apps/server/dist/bin.mjs) with a desktop bootstrap envelope on fd 3
 *      (seamless local auth, no DPoP) and waits for it to answer over HTTP;
 *      otherwise pairs to the environment the launch names,
 *   2. exchanges the bootstrap credential for a bearer,
 *   3. hands the address and bearer to the renderer (`primaryConnection`) and
 *      reports its status.
 *
 * It opens no connection to the server beyond those HTTP requests: the
 * renderer talks to the server itself, through upstream's client runtime.
 *
 * It is bundled into a single self-contained .cjs and loaded by the main
 * process via __non_webpack_require__.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import * as crypto from "node:crypto";
import * as http from "node:http";
import * as https from "node:https";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";

import { resolveRemotePairingTarget } from "@t3tools/shared/remote";
import { discoverDesktopLocalEnvironment } from "./localEnvironmentRendezvous.ts";
import { resolveNodeExecutable, resolveServerBin } from "./serverPaths";

export interface ConnectorEvents {
  onStatus: (status: string, detail?: string) => void;
  onLog: (line: string) => void;
}

export interface ConnectorConnectResult {
  status: string;
}

/** Ask the OS for a free loopback TCP port so the server never collides with a
 *  leftover instance on a randomly-guessed port. */
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

function httpRequest(
  baseUrl: string,
  requestPath: string,
  method: string,
  headers: Record<string, string>,
  body?: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(requestPath, baseUrl);
    const request = url.protocol === "https:" ? https.request : http.request;
    const req = request(url, { method, headers, timeout: 8000 }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("http timeout")));
    if (body) req.write(body);
    req.end();
  });
}

export type ConnectorLaunchTarget =
  | {
      readonly kind: "owned-local";
      readonly baseDir: string;
    }
  | {
      readonly kind: "existing-environment";
      readonly httpBaseUrl: string;
      readonly wsBaseUrl: string;
      readonly credential: string;
      readonly source: "explicit-pairing-url" | "desktop-rendezvous";
      readonly expectedEnvironmentId?: string;
    };

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Whether file paths reported by the target environment name files on this
 * machine: true for an owned server, the desktop rendezvous, and loopback
 * pairing URLs; false for any other host (LAN, relay, tunnel).
 */
export function targetResolvesPathsLocally(target: ConnectorLaunchTarget): boolean {
  if (target.kind === "owned-local" || target.source === "desktop-rendezvous") return true;
  try {
    return LOOPBACK_HOSTS.has(new URL(target.httpBaseUrl).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Sessions exchanged from single-use pairing credentials, keyed by server and
 * credential. The Reconnect action rebuilds the connector from the same launch
 * target, so it must reuse the session instead of re-spending the credential,
 * and it must land on the same environment identity.
 */
const pairedSessions = new Map<
  string,
  { readonly bearer: string; readonly environmentId: string }
>();

export const REMOTE_SESSION_EXPIRED_MESSAGE =
  "This device's session with the remote environment expired or was revoked. Pair this device again.";

function pairedSessionKey(httpBaseUrl: string, credential: string): string {
  return `${httpBaseUrl}\u0000${credential}`;
}

export function resolveConnectorLaunchTarget(
  env: Readonly<Record<string, string | undefined>> = process.env,
  discoverLocalEnvironment: typeof discoverDesktopLocalEnvironment = discoverDesktopLocalEnvironment,
): ConnectorLaunchTarget {
  const pairingUrl = env.T3_LYNXTRON_PAIRING_URL?.trim();
  if (pairingUrl) {
    return {
      kind: "existing-environment",
      source: "explicit-pairing-url",
      ...resolveRemotePairingTarget({ pairingUrl }),
    };
  }
  const explicitBaseDir = env.T3_LYNXTRON_BASE_DIR?.trim();
  if (!explicitBaseDir) {
    const rendezvous = discoverLocalEnvironment();
    if (rendezvous) {
      return {
        kind: "existing-environment",
        source: "desktop-rendezvous",
        httpBaseUrl: rendezvous.httpBaseUrl,
        wsBaseUrl: rendezvous.wsBaseUrl,
        credential: rendezvous.bootstrapCredential,
        expectedEnvironmentId: rendezvous.environmentId,
      };
    }
  }
  return {
    kind: "owned-local",
    baseDir: explicitBaseDir || path.join(os.homedir(), ".t3-lynxtron"),
  };
}

/** The directory a server this process owns gets its first project from. */
function startupProjectCwd(): string {
  return process.env.T3_LYNXTRON_PROJECT_CWD ?? process.cwd();
}

export class T3Connector {
  private child: ChildProcess | undefined;
  private httpBaseUrl = "";
  private wsBaseUrl = "";
  private ownsServer = false;
  /** The launch target kind resolved by the latest connect(). */
  connectionKind: "owned-local" | "existing-environment" | undefined;
  /** Whether environment file paths are paths on this machine. */
  pathsResolveLocally: boolean | undefined;
  private bearer: string | undefined;
  private events: ConnectorEvents;
  private serverExited = false;
  private disposed = false;

  constructor(events: ConnectorEvents) {
    this.events = events;
  }

  private log(line: string) {
    this.events.onLog(line);
  }

  async connect(): Promise<ConnectorConnectResult> {
    const target = resolveConnectorLaunchTarget();
    this.connectionKind = target.kind;
    this.pathsResolveLocally = targetResolvesPathsLocally(target);
    if (target.kind === "existing-environment") {
      return this.connectExistingEnvironment(target);
    }
    return this.connectOwnedLocalServer(target);
  }

  private async connectOwnedLocalServer(
    target: Extract<ConnectorLaunchTarget, { kind: "owned-local" }>,
  ): Promise<ConnectorConnectResult> {
    const serverBin = resolveServerBin({
      explicitPath: process.env.T3_SERVER_BIN,
      connectorDirectory: __dirname,
    });
    const host = "127.0.0.1";
    const port = await findFreePort();
    this.httpBaseUrl = `http://${host}:${port}/`;
    this.wsBaseUrl = `ws://${host}:${port}/`;
    this.ownsServer = true;
    const bootstrapToken = crypto.randomBytes(24).toString("hex");
    const envelope = {
      mode: "desktop",
      noBrowser: true,
      port,
      host,
      desktopBootstrapToken: bootstrapToken,
      tailscaleServeEnabled: false,
      tailscaleServePort: 3774,
    };
    const serverOutput = process.env.T3_LYNXTRON_SERVER_STDIO === "ignore" ? "ignore" : "inherit";

    this.events.onStatus("starting-server", `Launching t3 server on :${port}`);
    this.child = spawn(
      resolveNodeExecutable(),
      [serverBin, "serve", "--bootstrap-fd", "3", "--base-dir", target.baseDir],
      {
        // Do NOT pipe stdout/stderr: the server floods stdout with migration
        // logs + a QR code at startup, and draining that in-process starves the
        // readiness HTTP polling on the same event loop. Inherit instead (goes to
        // the host process's own stdio, which the Lynxtron host owns).
        stdio: ["ignore", serverOutput, serverOutput, "pipe"],
        env: { ...process.env, SHELL: "/bin/sh" },
      },
    );
    const bootstrapPipe = this.child.stdio[3] as NodeJS.WritableStream;
    bootstrapPipe.write(JSON.stringify(envelope) + "\n");
    bootstrapPipe.end();
    this.child.on("error", (err) => this.log(`[srv] spawn error: ${err.message}`));
    this.child.on("exit", (code, signal) => {
      this.log(`[srv] exited code=${code} signal=${signal}`);
      this.serverExited = true;
      if (!this.disposed) {
        this.events.onStatus("error", `Server exited (code=${code} signal=${signal}).`);
      }
    });

    // Wait for readiness. Bail early if the server process dies (e.g. a port
    // collision) so the caller can surface an actionable error quickly.
    this.events.onStatus("connecting", "Waiting for server…");
    let ready = false;
    for (let i = 0; i < 120; i++) {
      if (this.serverExited) {
        throw new Error("t3 server process exited before becoming ready");
      }
      try {
        const r = await httpRequest(this.httpBaseUrl, "/.well-known/t3/environment", "GET", {});
        if (r.status === 200) {
          ready = true;
          break;
        }
      } catch {
        /* not up yet */
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!ready) throw new Error("t3 server did not become ready");

    this.bearer = await this.exchangeCredential(bootstrapToken);
    return this.declareReady();
  }

  private async connectExistingEnvironment(
    target: Extract<ConnectorLaunchTarget, { kind: "existing-environment" }>,
  ): Promise<ConnectorConnectResult> {
    this.httpBaseUrl = target.httpBaseUrl;
    this.wsBaseUrl = target.wsBaseUrl;
    this.ownsServer = false;
    this.serverExited = false;
    this.events.onStatus("connecting", "Connecting to existing T3 environment…");
    const descriptor = await httpRequest(
      this.httpBaseUrl,
      "/.well-known/t3/environment",
      "GET",
      {},
    );
    if (descriptor.status !== 200) {
      throw new Error(`environment descriptor failed (${descriptor.status})`);
    }
    const environmentId = (JSON.parse(descriptor.body) as { environmentId?: unknown })
      .environmentId;
    const sessionKey = pairedSessionKey(target.httpBaseUrl, target.credential);
    const session = pairedSessions.get(sessionKey);
    const expectedEnvironmentId = target.expectedEnvironmentId ?? session?.environmentId;
    if (expectedEnvironmentId !== undefined && environmentId !== expectedEnvironmentId) {
      throw new Error(
        `environment identity mismatch (expected ${expectedEnvironmentId}, received ${String(environmentId)})`,
      );
    }
    if (session) {
      if (!(await this.sessionIsLive(session.bearer))) {
        pairedSessions.delete(sessionKey);
        throw new Error(REMOTE_SESSION_EXPIRED_MESSAGE);
      }
      this.bearer = session.bearer;
      return this.declareReady();
    }
    this.bearer = await this.exchangeCredential(target.credential);
    if (typeof environmentId === "string") {
      pairedSessions.set(sessionKey, { bearer: this.bearer, environmentId });
    }
    return this.declareReady();
  }

  /** Exchanges a bootstrap credential for the bearer the renderer connects with. */
  private async exchangeCredential(credential: string): Promise<string> {
    const form = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      subject_token: credential,
      subject_token_type: "urn:t3:params:oauth:token-type:environment-bootstrap",
      requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
      client_label: "T3 Code Lynxtron",
      client_device_type: "desktop",
    }).toString();
    const exchange = await httpRequest(
      this.httpBaseUrl,
      "/oauth/token",
      "POST",
      {
        "content-type": "application/x-www-form-urlencoded",
        "content-length": String(Buffer.byteLength(form)),
      },
      form,
    );
    if (exchange.status !== 200) {
      throw new Error(`token exchange failed (${exchange.status}): ${exchange.body.slice(0, 200)}`);
    }
    return JSON.parse(exchange.body).access_token as string;
  }

  /**
   * Whether the server still accepts a bearer kept from an earlier pairing.
   * It is asked for a websocket ticket, the request a client's connection
   * starts with; the ticket itself is not used.
   */
  private async sessionIsLive(bearer: string): Promise<boolean> {
    const ticket = await httpRequest(
      this.httpBaseUrl,
      "/api/auth/websocket-ticket",
      "POST",
      {
        authorization: `Bearer ${bearer}`,
        "content-type": "application/json",
        "content-length": "2",
      },
      "{}",
    );
    if (ticket.status === 401 || ticket.status === 403) return false;
    if (ticket.status !== 200) {
      throw new Error(`ws ticket failed (${ticket.status}): ${ticket.body.slice(0, 200)}`);
    }
    return true;
  }

  /**
   * Reports the server reachable and the bearer in hand, unless the server
   * exited meanwhile: the exit was reported as an error already, and a ready
   * after it would tell the client to connect to a server that is gone.
   */
  private declareReady(): ConnectorConnectResult {
    if (this.serverExited) throw new Error("t3 server is not running");
    this.log(`[connector] server ready at ${this.httpBaseUrl}`);
    this.events.onStatus("ready", undefined);
    return { status: "ready" };
  }

  /**
   * What a client in the renderer needs to reach this environment itself: the
   * same address and bearer Electron's main process hands upstream's Web
   * renderer through `desktopBridge`.
   */
  primaryConnection(): {
    readonly httpBaseUrl: string;
    readonly wsBaseUrl: string;
    readonly bearer: string;
    /**
     * The directory the renderer makes this server's first project from when
     * the server has none. Present only for a server this process owns.
     */
    readonly startupProjectCwd?: string;
  } | null {
    if (!this.bearer || !this.httpBaseUrl) return null;
    return {
      httpBaseUrl: this.httpBaseUrl,
      wsBaseUrl: this.wsBaseUrl,
      bearer: this.bearer,
      // Named only when it exists: the renderer creates the project through
      // the add-project command, which would create a missing directory.
      ...(this.ownsServer && existsSync(startupProjectCwd())
        ? { startupProjectCwd: startupProjectCwd() }
        : {}),
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.child?.kill("SIGKILL");
  }
}
