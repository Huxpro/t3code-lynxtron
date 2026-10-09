/**
 * T3 backend connector (Node host layer).
 *
 * This module runs in the Lynxtron preload/host (full Node.js). It:
 *   1. spawns the prebuilt t3 server (apps/server/dist/bin.mjs) with a desktop
 *      bootstrap envelope on fd 3 (seamless local auth, no DPoP),
 *   2. waits for HTTP readiness,
 *   3. exchanges the bootstrap token for a bearer, then a websocket ticket,
 *   4. opens the Effect-RPC WebSocket client (reusing @t3tools/contracts'
 *      WsRpcGroup) and drives the orchestration protocol,
 *   5. exposes a small imperative API + an event callback for the UI bridge.
 *
 * It is bundled into a single self-contained .cjs (against t3code's patched
 * effect + contracts) and loaded from preload via __non_webpack_require__.
 */
import { spawn, type ChildProcess } from "node:child_process";
import * as crypto from "node:crypto";
import * as http from "node:http";
import * as https from "node:https";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";

import { projectAuthAccess, type AuthAccessPresentation } from "@t3tools/lynx-logic/connections";
import { isTransportConnectionErrorMessage } from "@t3tools/client-runtime/errors";
import { buildThreadTurnStartCommand } from "@t3tools/lynx-logic/threadDispatch";
import { deriveProviderModelSelectionProjection } from "@t3tools/lynx-logic/modelPicker";
import { selectRecoverableDisposableThreadIds } from "@t3tools/lynx-logic/threadActions";
import { applyShellStreamEvent } from "@t3tools/client-runtime/state/shell";
import {
  applyAuthAccessStreamEvent,
  EMPTY_AUTH_ACCESS_SNAPSHOT,
} from "@t3tools/client-runtime/state/auth";
import {
  applyServerConfigProjection,
  type ServerConfigProjection,
} from "@t3tools/client-runtime/state/server";
import { sortThreads } from "@t3tools/client-runtime/state/thread-sort";
import { applyThreadDetailEvent } from "@t3tools/client-runtime/state/threads";
import {
  applyTerminalAttachStreamEvent,
  EMPTY_TERMINAL_BUFFER_STATE,
  type TerminalBufferState,
} from "@t3tools/client-runtime/state/terminal";
import { deriveActivePlanState, findLatestProposedPlan } from "@t3tools/lynx-logic/thread";
import { buildProviderInstanceEnabledPatch } from "@t3tools/lynx-logic/providerSettings";
import {
  WsRpcGroup,
  WS_METHODS,
  ORCHESTRATION_WS_METHODS,
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  MessageId,
  ThreadId,
  type EditorId,
  type AssetCreateUrlInput,
  type AssetCreateUrlResult,
  type FilesystemBrowseInput,
  type FilesystemBrowseResult,
  type GitActionProgressEvent,
  type GitRunStackedActionInput,
  type GitRunStackedActionResult,
  type AuthAccessSnapshot,
  type ApprovalRequestId,
  type AuthAccessStreamEvent,
  type DispatchResult,
  type ModelSelection,
  type OrchestrationShellSnapshot,
  type OrchestrationShellStreamItem,
  type OrchestrationGetTurnDiffInput,
  type OrchestrationGetTurnDiffResult,
  type ReviewDiffPreviewInput,
  type ReviewDiffPreviewResult,
  type OrchestrationThread,
  type OrchestrationThreadShell,
  type ProviderInteractionMode,
  type ProviderDriverKind,
  type ProviderApprovalDecision,
  type ProviderUserInputAnswers,
  type OrchestrationThreadStreamItem,
  type ProviderInstanceId,
  type ProjectListEntriesResult,
  type ProjectSearchEntriesInput,
  type ProjectSearchEntriesResult,
  type ProjectScript,
  type ProjectReadFileResult,
  type ProjectWriteFileResult,
  type ServerConfig,
  type ServerConfigStreamEvent,
  type ServerRemoveKeybindingInput,
  type ServerRemoveKeybindingResult,
  type ServerUpsertKeybindingInput,
  type ServerUpsertKeybindingResult,
  type ServerSettings,
  type ServerSettingsPatch,
  type SourceControlDiscoveryResult,
  type SourceControlCloneRepositoryInput,
  type SourceControlCloneRepositoryResult,
  type SourceControlRepositoryLookupInput,
  type SourceControlRepositoryInfo,
  type SourceControlPublishRepositoryInput,
  type SourceControlPublishRepositoryResult,
  type TerminalAttachStreamEvent,
  type TerminalCloseInput,
  type TerminalOpenInput,
  type TerminalResizeInput,
  type TerminalSessionSnapshot,
  type TerminalWriteInput,
  type TurnId,
  type RuntimeMode,
  type VcsInitInput,
  type VcsStatusResult,
} from "@t3tools/contracts";
import type { ThreadTurnStartBootstrap, UploadChatAttachment } from "@t3tools/contracts";
import { buildTemporaryWorktreeBranchName } from "@t3tools/shared/git";
import { resolveRemotePairingTarget } from "@t3tools/shared/remote";
import { discoverDesktopLocalEnvironment } from "./localEnvironmentRendezvous.ts";
import {
  projectRepoContext,
  resolveConnectorAssetUrl,
  type ConnectorAssetUrlResult,
  type ProjectRepoContext,
  type TerminalSessionPresentation,
} from "../../shared/connectorProtocol.ts";
import {
  acknowledgePendingMutationAtSequence,
  enqueueSerialMutation,
  reconcilePendingMutation,
  rejectPendingMutation,
  setLatestPendingMutation,
  type LatestPendingMutation,
} from "../../shared/latestPendingMutation.ts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as Fiber from "effect/Fiber";
import * as Scope from "effect/Scope";
import * as Runtime from "effect/Runtime";
import * as Schedule from "effect/Schedule";
import { RpcClient, RpcSerialization } from "effect/unstable/rpc";
import * as Socket from "effect/unstable/socket/Socket";

import { resolveNodeExecutable, resolveServerBin } from "./serverPaths";

export interface ConnectorEvents {
  onStatus: (status: string, detail?: string) => void;
  onConfig: (config: ServerConfig) => void;
  onAccess?: (access: AuthAccessPresentation) => void;
  onShell: (payload: unknown) => void;
  onThread: (threadId: string, payload: unknown) => void;
  onTerminal?: (threadId: string, terminalId: string, payload: TerminalSessionPresentation) => void;
  onLog: (line: string) => void;
}

export interface ConnectorConnectResult {
  status: string;
  detail?: string;
  config?: ServerConfig;
  cwd?: string;
}

interface OpenRpcTransport {
  readonly appScope: Scope.Closeable;
  readonly client: any;
  readonly config: ServerConfig;
  readonly protocolContext: Context.Context<Scope.Scope | RpcClient.Protocol>;
}

export async function retryRpcTransportOpen<A>(options: {
  readonly open: () => Promise<A>;
  readonly onFailure: (attempt: number, error: unknown) => void;
  readonly wait: (milliseconds: number) => Promise<void>;
  readonly attempts?: number;
}): Promise<A> {
  const attempts = options.attempts ?? 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await options.open();
    } catch (error) {
      lastError = error;
      options.onFailure(attempt, error);
      if (attempt < attempts) {
        await options.wait(attempt * 250);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function dispatchWithTransportRecovery<Command, Result>(options: {
  readonly command: Command;
  readonly dispatch: (command: Command) => Promise<Result>;
  readonly recover: () => Promise<void>;
  readonly onRetry?: (error: Error) => void;
}): Promise<Result> {
  try {
    return await options.dispatch(options.command);
  } catch (error) {
    const cause = error instanceof Error ? error : new Error(String(error));
    if (!isTransportConnectionErrorMessage(cause.message)) {
      throw cause;
    }
    options.onRetry?.(cause);
    await options.recover();
    return options.dispatch(options.command);
  }
}

export function materializeTurnBootstrap(
  bootstrap: ThreadTurnStartBootstrap | undefined,
  randomId: () => string = crypto.randomUUID,
): ThreadTurnStartBootstrap | undefined {
  if (!bootstrap?.prepareWorktree) return bootstrap;
  return {
    ...bootstrap,
    prepareWorktree: {
      ...bootstrap.prepareWorktree,
      branch: bootstrap.prepareWorktree.branch ?? buildTemporaryWorktreeBranchName(randomId),
    },
  };
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
  private client: any;
  private protocolContext: any;
  private appScope: Scope.Closeable | undefined;
  private threadFibers = new Map<string, Fiber.Fiber<unknown, unknown>>();
  private terminalFibers = new Map<string, Fiber.Fiber<unknown, unknown>>();
  private terminalStates = new Map<string, TerminalSessionPresentation>();
  private terminalAttachInputs = new Map<string, TerminalOpenInput>();
  private modelSelection: ModelSelection | undefined;
  private pendingThreadModelSelections = new Map<string, ModelSelection>();
  private pendingThreadRuntimeModes = new Map<string, LatestPendingMutation<RuntimeMode>>();
  private pendingThreadInteractionModes = new Map<
    string,
    LatestPendingMutation<ProviderInteractionMode>
  >();
  private pendingThreadModeCommands = new Map<string, Promise<unknown>>();
  private pendingDisposableThreadDeletes = new Set<string>();
  private attemptedDisposableThreadDeletes = new Set<string>();
  private serverConfig: ServerConfig | undefined;
  private authAccessSnapshot: AuthAccessSnapshot = EMPTY_AUTH_ACCESS_SNAPSHOT;
  private configProjection: Option.Option<ServerConfigProjection> = Option.none();
  private defaultProjectId: string | undefined;
  private ready = false;
  private serverExited = false;
  private disposed = false;
  private rpcTransportGeneration = 0;
  private transportRecoveryPromise: Promise<void> | undefined;

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
      this.ready = false;
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

    // Exchange bootstrap token -> bearer.
    const form = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      subject_token: bootstrapToken,
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
    const bearer = JSON.parse(exchange.body).access_token as string;
    this.bearer = bearer;
    return this.finishConnection({ ensureProject: true });
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
      this.bearer = session.bearer;
      try {
        return await this.finishConnection({ ensureProject: false });
      } catch (error) {
        if (error instanceof Error && /ws ticket failed \((401|403)\)/u.test(error.message)) {
          pairedSessions.delete(sessionKey);
          throw new Error(REMOTE_SESSION_EXPIRED_MESSAGE);
        }
        throw error;
      }
    }
    const form = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      subject_token: target.credential,
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
    this.bearer = JSON.parse(exchange.body).access_token as string;
    if (typeof environmentId === "string") {
      pairedSessions.set(sessionKey, { bearer: this.bearer, environmentId });
    }
    return this.finishConnection({ ensureProject: false });
  }

  private async finishConnection(options: {
    ensureProject: boolean;
  }): Promise<ConnectorConnectResult> {
    const config = await this.openRpc(await this.issueSocketUrl());
    this.setServerConfig(config, {
      version: 1,
      type: "snapshot",
      config,
    });
    this.reconcileModelSelection(config);
    const modelCount = config.providers.reduce(
      (count, provider) => count + provider.models.length,
      0,
    );
    this.log(`[connector] ${modelCount} models, selection=${JSON.stringify(this.modelSelection)}`);

    // Keep canonical server config (providers + settings) live, then subscribe
    // to the orchestration shell.
    this.subscribeConfig();
    this.subscribeAuthAccess();
    this.subscribeShell();

    // Ensure at least one project exists to chat in (fresh isolated base dir
    // starts empty). Point it at this repo's cwd.
    if (options.ensureProject) {
      await this.ensureProject();
    }

    this.ready = true;
    this.events.onStatus("ready", undefined);
    return {
      status: "ready",
      config,
      cwd: config.cwd,
    };
  }

  private async issueSocketUrl(): Promise<string> {
    if (!this.bearer) throw new Error("not connected");
    const ticketRes = await httpRequest(
      this.httpBaseUrl,
      "/api/auth/websocket-ticket",
      "POST",
      {
        authorization: `Bearer ${this.bearer}`,
        "content-type": "application/json",
        "content-length": "2",
      },
      "{}",
    );
    if (ticketRes.status !== 200) {
      throw new Error(`ws ticket failed (${ticketRes.status}): ${ticketRes.body.slice(0, 200)}`);
    }
    const wsTicket = JSON.parse(ticketRes.body).ticket as string;
    const socketUrl = new URL(this.wsBaseUrl);
    socketUrl.pathname = "/ws";
    socketUrl.search = "";
    socketUrl.hash = "";
    socketUrl.searchParams.set("wsTicket", wsTicket);
    this.log(`[connector] socket ${socketUrl.protocol}//${socketUrl.host}${socketUrl.pathname}`);
    return socketUrl.toString();
  }

  async recoverTransport(): Promise<void> {
    if (this.disposed) throw new Error("connector is disposed");
    if (this.serverExited || (this.ownsServer && !this.child)) {
      throw new Error("t3 server is not running");
    }
    if (this.transportRecoveryPromise) return this.transportRecoveryPromise;
    const recovery = this.rebuildRpcTransport();
    const tracked = recovery.finally(() => {
      if (this.transportRecoveryPromise === tracked) {
        this.transportRecoveryPromise = undefined;
      }
    });
    this.transportRecoveryPromise = tracked;
    return tracked;
  }

  private async rebuildRpcTransport(): Promise<void> {
    this.ready = false;
    this.events.onStatus("reconnecting", "Restoring backend connection…");
    const selectedThreadIds = [...this.threadFibers.keys()];
    const terminalInputs = [...this.terminalAttachInputs.values()];
    for (const fiber of this.threadFibers.values()) {
      Effect.runFork(Fiber.interrupt(fiber));
    }
    this.threadFibers.clear();
    for (const fiber of this.terminalFibers.values()) {
      Effect.runFork(Fiber.interrupt(fiber));
    }
    this.terminalFibers.clear();
    const previousScope = this.appScope;
    this.rpcTransportGeneration += 1;
    this.client = undefined;
    this.protocolContext = undefined;
    this.appScope = undefined;
    if (previousScope) {
      await Effect.runPromise(Scope.close(previousScope, undefined as any));
    }

    const config = await retryRpcTransportOpen({
      open: async () => this.openRpc(await this.issueSocketUrl()),
      onFailure: (attempt, error) => {
        this.log(
          `[connector] RPC transport recovery attempt ${attempt}/3 failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      },
      wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    });
    this.setServerConfig(config, {
      version: 1,
      type: "snapshot",
      config,
    });
    this.reconcileModelSelection(config);
    this.subscribeConfig();
    this.subscribeAuthAccess();
    this.subscribeShell();
    for (const threadId of selectedThreadIds) {
      this.selectThread(threadId);
    }
    for (const input of terminalInputs) {
      this.subscribeTerminal(input);
    }
    this.ready = true;
    this.events.onStatus("ready", undefined);
  }

  private handleRpcDisconnect(generation: number): void {
    if (
      this.disposed ||
      this.serverExited ||
      !this.ready ||
      generation !== this.rpcTransportGeneration
    ) {
      return;
    }
    this.ready = false;
    this.log(`[connector] RPC transport generation ${generation} disconnected; recovering`);
    queueMicrotask(() => {
      if (this.disposed || this.serverExited || generation !== this.rpcTransportGeneration) {
        return;
      }
      void this.recoverTransport().catch((error: unknown) => {
        const detail = error instanceof Error ? error.message : String(error);
        this.log(`[connector] RPC transport recovery failed: ${detail}`);
        if (!this.disposed && !this.serverExited) {
          this.events.onStatus("error", detail);
        }
      });
    });
  }

  private setServerConfig(config: ServerConfig, event: ServerConfigStreamEvent): void {
    this.serverConfig = config;
    this.configProjection = Option.some({
      config,
      latestEvent: event,
      source: "live",
    });
    this.events.onConfig(config);
  }

  private subscribeConfig(): void {
    if (!this.client || !this.protocolContext) return;
    const stream = this.client[WS_METHODS.subscribeServerConfig]({});
    const consume = Stream.runForEach(
      stream as Stream.Stream<ServerConfigStreamEvent, unknown, any>,
      (event) =>
        Effect.sync(() => {
          const next = applyServerConfigProjection(this.configProjection, event);
          this.configProjection = next;
          if (Option.isSome(next)) {
            this.serverConfig = next.value.config;
            this.reconcileModelSelection(next.value.config);
            this.events.onConfig(next.value.config);
          }
        }),
    );
    this.forkClient(consume);
  }

  private subscribeAuthAccess(): void {
    if (!this.client || !this.protocolContext) return;
    const stream = this.client[WS_METHODS.subscribeAuthAccess]({});
    const consume = Stream.runForEach(
      stream as Stream.Stream<AuthAccessStreamEvent, unknown, any>,
      (event) =>
        Effect.sync(() => {
          this.authAccessSnapshot = applyAuthAccessStreamEvent(this.authAccessSnapshot, event);
          this.events.onAccess?.(projectAuthAccess(this.authAccessSnapshot));
        }),
    );
    this.forkClient(consume);
  }

  private reconcileModelSelection(config: ServerConfig): void {
    this.modelSelection = deriveProviderModelSelectionProjection(config, [
      this.modelSelection,
    ]).selection;
  }

  private openRpc(socketUrl: string): Promise<ServerConfig> {
    const self = this;
    const generation = ++this.rpcTransportGeneration;
    let pendingScope: Scope.Closeable | undefined;
    const buildProgram = Effect.gen(function* () {
      // Node 22 exposes a global WebSocket that satisfies the constructor.
      const wsCtor = Socket.WebSocketConstructor.of(
        (url: string) => new (globalThis as any).WebSocket(url) as any,
      );

      const socketLayer = Socket.layerWebSocket(socketUrl, {
        openTimeout: "15 seconds",
      }).pipe(Layer.provide(Layer.succeed(Socket.WebSocketConstructor, wsCtor)));

      const protocolLayer = Layer.effect(
        RpcClient.Protocol,
        RpcClient.makeProtocolSocket({
          retryTransientErrors: false,
          retryPolicy: Schedule.recurs(0),
        }),
      ).pipe(
        Layer.provide(
          Layer.mergeAll(
            socketLayer,
            RpcSerialization.layerJson,
            Layer.succeed(
              RpcClient.ConnectionHooks,
              RpcClient.ConnectionHooks.of({
                onConnect: Effect.void,
                onDisconnect: Effect.sync(() => self.handleRpcDisconnect(generation)),
              }),
            ),
          ),
        ),
      );

      // A scope that stays open for the whole connection lifetime. All client
      // calls (which need the protocol context) run provided with this context;
      // the scope is only closed in dispose().
      const appScope = yield* Scope.make();
      pendingScope = appScope;
      const builtContext = yield* Layer.buildWithScope(protocolLayer, appScope);
      // Merge the long-lived Scope into the context so RpcClient.make (which
      // allocates scoped resources) and every later client call resolve the
      // ambient Scope service instead of failing with "Service not found".
      const protocolContext = Context.add(builtContext, Scope.Scope, appScope);
      const client = yield* RpcClient.make(WsRpcGroup).pipe(Effect.provide(protocolContext));
      const cfg = yield* client[WS_METHODS.serverGetConfig]({}).pipe(
        Effect.provide(protocolContext),
      );
      return {
        appScope,
        client,
        config: cfg,
        protocolContext,
      } satisfies OpenRpcTransport;
    });

    // Run the build without an enclosing Effect.scoped so the appScope we made
    // is NOT auto-closed when this promise resolves.
    return Effect.runPromise(buildProgram as Effect.Effect<OpenRpcTransport, unknown, never>).then(
      ({ appScope, client, config, protocolContext }) => {
        if (self.disposed || generation !== self.rpcTransportGeneration) {
          return Effect.runPromise(Scope.close(appScope, undefined as any)).then(() => {
            throw new Error("RPC transport was superseded while opening");
          });
        }
        self.appScope = appScope;
        self.protocolContext = protocolContext;
        self.client = client;
        pendingScope = undefined;
        return config;
      },
      async (error: unknown) => {
        if (pendingScope) {
          await Effect.runPromise(Scope.close(pendingScope, undefined as any));
          pendingScope = undefined;
        }
        throw error;
      },
    );
  }

  /** Run a client Effect within the persistent protocol context. */
  private runClient<A>(effect: Effect.Effect<A, unknown, any>): Promise<A> {
    if (!this.protocolContext) return Promise.reject(new Error("not connected"));
    return Effect.runPromise(
      Effect.provide(effect, this.protocolContext) as Effect.Effect<A, unknown, never>,
    );
  }

  private async awaitRecoveredTransport(): Promise<void> {
    if (this.transportRecoveryPromise) {
      await this.transportRecoveryPromise;
    }
    if (!this.client || !this.protocolContext) {
      throw new Error("not connected");
    }
  }

  private async dispatchOrchestrationCommand(command: unknown): Promise<DispatchResult> {
    await this.awaitRecoveredTransport();
    return dispatchWithTransportRecovery({
      command,
      dispatch: (currentCommand) =>
        this.runClient<DispatchResult>(
          this.client[ORCHESTRATION_WS_METHODS.dispatchCommand](currentCommand),
        ),
      recover: () => this.recoverTransport(),
      onRetry: (error) => {
        this.log(
          `[connector] orchestration command hit a stale transport; recovering once: ${error.message}`,
        );
      },
    });
  }

  private queueThreadModeCommand<Result>(
    threadId: string,
    dispatch: () => Promise<Result>,
  ): Promise<Result> {
    return enqueueSerialMutation(this.pendingThreadModeCommands, threadId, dispatch);
  }

  /** Fork a long-lived client Effect (e.g. a stream) within the context. */
  private forkClient(effect: Effect.Effect<unknown, unknown, any>): Fiber.Fiber<unknown, unknown> {
    return Effect.runFork(
      Effect.provide(effect, this.protocolContext!) as Effect.Effect<unknown, unknown, never>,
    ) as Fiber.Fiber<unknown, unknown>;
  }

  private subscribeShell() {
    if (!this.client || !this.protocolContext) return;
    const self = this;
    const stream = this.client[ORCHESTRATION_WS_METHODS.subscribeShell]({});
    const consume = Stream.runForEach(
      stream as Stream.Stream<OrchestrationShellStreamItem, unknown, any>,
      (item) =>
        Effect.sync(() => {
          self.handleShellItem(item);
        }),
    );
    this.forkClient(consume);
  }

  // Archived threads are excluded from the shell stream; they need a separate
  // one-shot RPC (orchestration.getArchivedShellSnapshot), refreshed after the
  // initial snapshot and whenever an archive-related item arrives.
  private archivedThreads: ReadonlyArray<OrchestrationThreadShell> = [];
  private archivedFetchPending = false;

  private refreshArchived(): void {
    if (!this.client || this.archivedFetchPending) return;
    this.archivedFetchPending = true;
    this.runClient(this.client[ORCHESTRATION_WS_METHODS.getArchivedShellSnapshot]({}))
      .then((snapshot: OrchestrationShellSnapshot) => {
        this.archivedFetchPending = false;
        this.archivedThreads = snapshot.threads;
        this.emitShell();
      })
      .catch(() => {
        this.archivedFetchPending = false;
      });
  }

  private shellSnapshot: OrchestrationShellSnapshot | undefined;

  private handleShellItem(item: OrchestrationShellStreamItem) {
    if (item.kind === "snapshot") {
      this.shellSnapshot = item.snapshot;
    } else if (item.kind !== "synchronized" && this.shellSnapshot) {
      this.shellSnapshot = applyShellStreamEvent(this.shellSnapshot, item);
    }
    for (const [threadId, selection] of this.pendingThreadModelSelections) {
      const thread = this.shellSnapshot?.threads.find((candidate) => candidate.id === threadId);
      if (thread && JSON.stringify(thread.modelSelection) === JSON.stringify(selection)) {
        this.pendingThreadModelSelections.delete(threadId);
      }
    }
    for (const threadId of this.pendingThreadRuntimeModes.keys()) {
      const thread = this.shellSnapshot?.threads.find((candidate) => candidate.id === threadId);
      if (thread) {
        reconcilePendingMutation(this.pendingThreadRuntimeModes, threadId, thread.runtimeMode);
      }
    }
    for (const threadId of this.pendingThreadInteractionModes.keys()) {
      const thread = this.shellSnapshot?.threads.find((candidate) => candidate.id === threadId);
      if (thread) {
        reconcilePendingMutation(
          this.pendingThreadInteractionModes,
          threadId,
          thread.interactionMode,
        );
      }
    }
    if (item.kind !== "synchronized" && this.shellSnapshot) {
      this.scheduleDisposableThreadCleanup();
    }
    // Archive/unarchive/delete all surface here as plain upserts/removes, so
    // refresh the (stream-excluded) archived snapshot on every shell item.
    this.refreshArchived();
    this.emitShell();
  }

  private emitShell() {
    const projects = this.shellSnapshot?.projects ?? [];
    if (!this.defaultProjectId && projects.length > 0) {
      this.defaultProjectId = projects[0].id;
    }
    const allThreads = this.shellSnapshot?.threads ?? [];
    const threads = sortThreads(
      allThreads
        // Archived threads leave the sidebar (they surface in Settings > Archive).
        .filter((thread) => !thread.archivedAt)
        .filter((thread) => !this.pendingDisposableThreadDeletes.has(thread.id)),
      "updated_at",
    ).map((thread) => {
      const pendingSelection = this.pendingThreadModelSelections.get(thread.id);
      const pendingRuntimeMode = this.pendingThreadRuntimeModes.get(thread.id);
      const pendingInteractionMode = this.pendingThreadInteractionModes.get(thread.id);
      return pendingSelection || pendingRuntimeMode || pendingInteractionMode
        ? {
            ...thread,
            ...(pendingSelection ? { modelSelection: pendingSelection } : {}),
            ...(pendingRuntimeMode ? { runtimeMode: pendingRuntimeMode.value } : {}),
            ...(pendingInteractionMode ? { interactionMode: pendingInteractionMode.value } : {}),
          }
        : thread;
    });
    const archivedThreads = this.archivedThreads
      .slice()
      .sort((a, b) => ((b.archivedAt ?? "") > (a.archivedAt ?? "") ? 1 : -1));
    this.events.onShell({ projects, threads, archivedThreads });
  }

  private scheduleDisposableThreadCleanup(): void {
    const threads = this.shellSnapshot?.threads ?? [];
    const candidates = selectRecoverableDisposableThreadIds(threads).filter(
      (threadId) => !this.attemptedDisposableThreadDeletes.has(threadId),
    );
    if (candidates.length === 0) return;
    for (const threadId of candidates) {
      this.attemptedDisposableThreadDeletes.add(threadId);
      this.pendingDisposableThreadDeletes.add(threadId);
    }
    queueMicrotask(() => {
      if (this.disposed) return;
      void Promise.all(
        candidates.map(async (threadId) => {
          try {
            const currentThread = this.shellSnapshot?.threads.find(
              (thread) => thread.id === threadId,
            );
            if (
              !currentThread ||
              !selectRecoverableDisposableThreadIds([currentThread]).includes(threadId)
            ) {
              this.pendingDisposableThreadDeletes.delete(threadId);
              this.attemptedDisposableThreadDeletes.delete(threadId);
              this.emitShell();
              return;
            }
            await this.deleteThread({ threadId });
            this.log(`[connector] removed disposable empty thread ${threadId}`);
          } catch (error) {
            this.pendingDisposableThreadDeletes.delete(threadId);
            this.attemptedDisposableThreadDeletes.delete(threadId);
            this.log(
              `[connector] failed to remove disposable empty thread ${threadId}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
            this.emitShell();
          }
        }),
      );
    });
  }

  private threadSnapshots = new Map<string, OrchestrationThread>();
  private threadSequences = new Map<string, number>();

  selectThread(threadId: string): void {
    if (this.threadFibers.has(threadId)) {
      this.emitThread(threadId);
      return;
    }
    if (!this.client || !this.protocolContext) return;
    const self = this;
    const stream = this.client[ORCHESTRATION_WS_METHODS.subscribeThread]({
      threadId,
      requestCompletionMarker: false,
    });
    const consume = Stream.runForEach(
      stream as Stream.Stream<OrchestrationThreadStreamItem, unknown, any>,
      (item) =>
        Effect.sync(() => {
          self.handleThreadItem(threadId, item);
        }),
    );
    const fiber = this.forkClient(consume);
    this.threadFibers.set(threadId, fiber);
  }

  private handleThreadItem(threadId: string, item: OrchestrationThreadStreamItem) {
    if (process.env.T3_LYNXTRON_DEBUG_THREAD === "1") {
      this.log(`[thread-item] ${JSON.stringify(item).slice(0, 500)}`);
    }
    if (item.kind === "snapshot") {
      this.threadSequences.set(threadId, item.snapshot.snapshotSequence);
      this.threadSnapshots.set(threadId, item.snapshot.thread);
    } else if (item.kind === "event") {
      const sequence = this.threadSequences.get(threadId) ?? 0;
      if (item.event.sequence <= sequence) return;
      this.threadSequences.set(threadId, item.event.sequence);
      const current = this.threadSnapshots.get(threadId);
      if (!current) return;
      const result = applyThreadDetailEvent(current, item.event);
      if (result.kind === "updated") {
        this.threadSnapshots.set(threadId, result.thread);
      } else if (result.kind === "deleted") {
        this.threadSnapshots.delete(threadId);
      }
    }
    this.emitThread(threadId);
  }

  private emitThread(threadId: string) {
    const thread = this.threadSnapshots.get(threadId);
    if (!thread) return;
    const activePlan = deriveActivePlanState(
      thread.activities,
      thread.latestTurn?.turnId ?? undefined,
    );
    const activeProposedPlan = findLatestProposedPlan(
      thread.proposedPlans,
      thread.latestTurn?.turnId,
    );
    this.events.onThread(threadId, {
      threadId,
      messages: thread.messages,
      checkpoints: thread.checkpoints,
      sessionStatus: thread.session?.status ?? "idle",
      sessionError: thread.session?.lastError ?? null,
      activities: thread.activities,
      activePlan,
      activeProposedPlan,
      latestTurn: thread.latestTurn ?? null,
      proposedPlans: thread.proposedPlans,
      activeTurnId: thread.session?.activeTurnId ?? null,
    });
  }

  async ensureProject(): Promise<void> {
    // Wait briefly for the shell snapshot to populate existing projects.
    await new Promise((r) => setTimeout(r, 1200));
    const projects = this.shellSnapshot?.projects ?? [];
    if (this.defaultProjectId || projects.length > 0) {
      if (!this.defaultProjectId) {
        this.defaultProjectId = projects[0]?.id;
      }
      return;
    }
    if (!this.client) return;
    const workspaceRoot = process.env.T3_LYNXTRON_PROJECT_CWD ?? process.cwd();
    const projectId = crypto.randomUUID();
    const command = {
      type: "project.create",
      commandId: crypto.randomUUID(),
      projectId,
      title: path.basename(workspaceRoot) || "Workspace",
      workspaceRoot,
      createWorkspaceRootIfMissing: false,
      defaultModelSelection: this.modelSelection ?? null,
      createdAt: new Date().toISOString(),
    };
    try {
      await this.dispatchOrchestrationCommand(command);
      this.defaultProjectId = projectId;
      this.log(`[connector] created project ${projectId} at ${workspaceRoot}`);
    } catch (e: any) {
      this.log(`[connector] project.create failed: ${e?.message}`);
    }
  }

  async createProject(input: { workspaceRoot: string }): Promise<{ projectId: string }> {
    await this.awaitRecoveredTransport();
    const requestedRoot = input.workspaceRoot.trim();
    const workspaceRoot = path.resolve(
      requestedRoot === "~"
        ? os.homedir()
        : requestedRoot.startsWith("~/")
          ? path.join(os.homedir(), requestedRoot.slice(2))
          : requestedRoot,
    );
    const existing = this.shellSnapshot?.projects.find(
      (project) => path.resolve(project.workspaceRoot) === workspaceRoot,
    );
    if (existing) {
      this.defaultProjectId = existing.id;
      return { projectId: existing.id };
    }
    const projectId = crypto.randomUUID();
    await this.dispatchOrchestrationCommand({
      type: "project.create",
      commandId: crypto.randomUUID(),
      projectId,
      title: path.basename(workspaceRoot) || "Workspace",
      workspaceRoot,
      createWorkspaceRootIfMissing: true,
      defaultModelSelection: this.modelSelection ?? null,
      createdAt: new Date().toISOString(),
    });
    this.defaultProjectId = projectId;
    return { projectId };
  }

  async createThread(input: { projectId?: string; title?: string }): Promise<{ threadId: string }> {
    await this.awaitRecoveredTransport();
    const threadId = crypto.randomUUID();
    const projectId = input.projectId ?? this.defaultProjectId;
    if (!projectId) throw new Error("no project available");
    const command = {
      type: "thread.create",
      commandId: crypto.randomUUID(),
      threadId,
      projectId,
      title: input.title ?? "New thread",
      modelSelection: this.modelSelection,
      runtimeMode: DEFAULT_RUNTIME_MODE,
      interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
      branch: null,
      worktreePath: null,
      createdAt: new Date().toISOString(),
    };
    await this.dispatchOrchestrationCommand(command);
    this.selectThread(threadId);
    return { threadId };
  }

  async sendPrompt(input: {
    threadId: string;
    text: string;
    attachments?: ReadonlyArray<UploadChatAttachment>;
    bootstrap?: ThreadTurnStartBootstrap;
    planModeEnabled: boolean;
  }): Promise<void> {
    await this.awaitRecoveredTransport();
    const bootstrap = materializeTurnBootstrap(input.bootstrap);
    const thread =
      this.shellSnapshot?.threads.find((candidate) => candidate.id === input.threadId) ??
      this.threadSnapshots.get(input.threadId);
    const command = buildThreadTurnStartCommand({
      threadId: ThreadId.make(input.threadId),
      text: input.text,
      attachments: input.attachments,
      thread,
      pendingModelSelection: this.pendingThreadModelSelections.get(input.threadId),
      bootstrap,
      planModeEnabled: input.planModeEnabled,
      commandId: CommandId.make(crypto.randomUUID()),
      messageId: MessageId.make(crypto.randomUUID()),
      createdAt: new Date().toISOString(),
    });
    if (!command) {
      throw new Error(`thread ${input.threadId} is not present in the canonical snapshot`);
    }
    await this.dispatchOrchestrationCommand(command);
    if (!thread && bootstrap?.createThread) {
      this.selectThread(input.threadId);
    }
  }

  async interrupt(input: { threadId: string; turnId?: TurnId }): Promise<void> {
    await this.awaitRecoveredTransport();
    const command = {
      type: "thread.turn.interrupt",
      commandId: crypto.randomUUID(),
      threadId: input.threadId,
      ...(input.turnId ? { turnId: input.turnId } : {}),
      createdAt: new Date().toISOString(),
    };
    this.log(
      `[connector] interrupt dispatch thread=${input.threadId} turn=${input.turnId ?? "active"}`,
    );
    try {
      await this.dispatchOrchestrationCommand(command);
      this.log(
        `[connector] interrupt acknowledged thread=${input.threadId} turn=${input.turnId ?? "active"}`,
      );
    } catch (error) {
      this.log(
        `[connector] interrupt failed thread=${input.threadId} turn=${input.turnId ?? "active"}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }

  async revertCheckpoint(input: { threadId: string; turnCount: number }): Promise<void> {
    await this.dispatchOrchestrationCommand({
      type: "thread.checkpoint.revert",
      commandId: crypto.randomUUID(),
      threadId: input.threadId,
      turnCount: input.turnCount,
      createdAt: new Date().toISOString(),
    });
  }

  async respondToApproval(input: {
    threadId: string;
    requestId: ApprovalRequestId;
    decision: ProviderApprovalDecision;
  }): Promise<void> {
    await this.dispatchOrchestrationCommand({
      type: "thread.approval.respond",
      commandId: crypto.randomUUID(),
      threadId: input.threadId,
      requestId: input.requestId,
      decision: input.decision,
      createdAt: new Date().toISOString(),
    });
  }

  async respondToUserInput(input: {
    threadId: string;
    requestId: ApprovalRequestId;
    answers: ProviderUserInputAnswers;
  }): Promise<void> {
    await this.dispatchOrchestrationCommand({
      type: "thread.user-input.respond",
      commandId: crypto.randomUUID(),
      threadId: input.threadId,
      requestId: input.requestId,
      answers: input.answers,
      createdAt: new Date().toISOString(),
    });
  }

  async deleteThread(input: { threadId: string }): Promise<void> {
    await this.dispatchOrchestrationCommand({
      type: "thread.delete",
      commandId: crypto.randomUUID(),
      threadId: input.threadId,
    });
    this.threadFibers.get(input.threadId) &&
      Effect.runFork(Fiber.interrupt(this.threadFibers.get(input.threadId)!));
    this.threadFibers.delete(input.threadId);
    this.threadSnapshots.delete(input.threadId);
    this.threadSequences.delete(input.threadId);
    this.pendingThreadModelSelections.delete(input.threadId);
    this.pendingThreadRuntimeModes.delete(input.threadId);
    this.pendingThreadInteractionModes.delete(input.threadId);
    this.pendingThreadModeCommands.delete(input.threadId);
  }

  async archiveThread(input: { threadId: string; unarchive?: boolean }): Promise<void> {
    await this.dispatchOrchestrationCommand({
      type: input.unarchive ? "thread.unarchive" : "thread.archive",
      commandId: crypto.randomUUID(),
      threadId: input.threadId,
    });
  }

  async settleThread(input: { threadId: string }): Promise<void> {
    await this.dispatchOrchestrationCommand({
      type: "thread.settle",
      commandId: crypto.randomUUID(),
      threadId: input.threadId,
    });
  }

  async unsettleThread(input: { threadId: string }): Promise<void> {
    await this.dispatchOrchestrationCommand({
      type: "thread.unsettle",
      commandId: crypto.randomUUID(),
      threadId: input.threadId,
      reason: "user",
    });
  }

  async pinThread(input: { threadId: string; orderKey?: string }): Promise<void> {
    await this.dispatchOrchestrationCommand({
      type: "thread.pin",
      commandId: crypto.randomUUID(),
      threadId: input.threadId,
      ...(input.orderKey ? { orderKey: input.orderKey } : {}),
    });
  }

  async unpinThread(input: { threadId: string }): Promise<void> {
    await this.dispatchOrchestrationCommand({
      type: "thread.unpin",
      commandId: crypto.randomUUID(),
      threadId: input.threadId,
    });
  }

  async renameThread(input: { threadId: string; title: string }): Promise<void> {
    const title = input.title.trim();
    if (!title) return;
    await this.dispatchOrchestrationCommand({
      type: "thread.meta.update",
      commandId: crypto.randomUUID(),
      threadId: input.threadId,
      title,
    });
  }

  async regenerateThreadTitle(input: { threadId: string }): Promise<void> {
    await this.dispatchOrchestrationCommand({
      type: "thread.meta.update",
      commandId: crypto.randomUUID(),
      threadId: input.threadId,
      regenerateTitle: true,
    });
  }

  async snoozeThread(input: { threadId: string; snoozedUntil: string }): Promise<void> {
    await this.dispatchOrchestrationCommand({
      type: "thread.snooze",
      commandId: crypto.randomUUID(),
      threadId: input.threadId,
      snoozedUntil: input.snoozedUntil,
    });
  }

  async unsnoozeThread(input: { threadId: string }): Promise<void> {
    await this.dispatchOrchestrationCommand({
      type: "thread.unsnooze",
      commandId: crypto.randomUUID(),
      threadId: input.threadId,
      reason: "user",
    });
  }

  async updateProject(input: { projectId: string; title: string }): Promise<void> {
    const title = input.title.trim();
    if (!title) return;
    await this.dispatchOrchestrationCommand({
      type: "project.meta.update",
      commandId: crypto.randomUUID(),
      projectId: input.projectId,
      title,
    });
  }

  async deleteProject(input: { projectId: string; force?: boolean }): Promise<void> {
    await this.dispatchOrchestrationCommand({
      type: "project.delete",
      commandId: crypto.randomUUID(),
      projectId: input.projectId,
      ...(input.force === true ? { force: true } : {}),
    });
  }

  async updateProjectScripts(input: {
    projectId: string;
    scripts: ReadonlyArray<ProjectScript>;
  }): Promise<void> {
    await this.dispatchOrchestrationCommand({
      type: "project.meta.update",
      commandId: crypto.randomUUID(),
      projectId: input.projectId,
      scripts: input.scripts,
    });
  }

  async upsertKeybinding(
    input: ServerUpsertKeybindingInput,
  ): Promise<ServerUpsertKeybindingResult> {
    if (!this.client) throw new Error("not connected");
    return this.runClient<ServerUpsertKeybindingResult>(
      this.client[WS_METHODS.serverUpsertKeybinding](input),
    );
  }

  async removeKeybinding(
    input: ServerRemoveKeybindingInput,
  ): Promise<ServerRemoveKeybindingResult> {
    if (!this.client) throw new Error("not connected");
    return this.runClient<ServerRemoveKeybindingResult>(
      this.client[WS_METHODS.serverRemoveKeybinding](input),
    );
  }

  async openInEditor(input: { cwd: string; editor: EditorId }): Promise<void> {
    if (!this.client) throw new Error("not connected");
    await this.runClient(this.client[WS_METHODS.shellOpenInEditor](input));
  }

  async browseFilesystem(input: FilesystemBrowseInput): Promise<FilesystemBrowseResult> {
    if (!this.client) throw new Error("not connected");
    return this.runClient<FilesystemBrowseResult>(this.client[WS_METHODS.filesystemBrowse](input));
  }

  async createAssetUrl(input: AssetCreateUrlInput): Promise<ConnectorAssetUrlResult> {
    if (!this.client) throw new Error("not connected");
    const result = await this.runClient<AssetCreateUrlResult>(
      this.client[WS_METHODS.assetsCreateUrl](input),
    );
    return resolveConnectorAssetUrl(this.httpBaseUrl, result);
  }

  async listProjectEntries(input: { cwd: string }): Promise<ProjectListEntriesResult> {
    if (!this.client) throw new Error("not connected");
    return this.runClient<ProjectListEntriesResult>(
      this.client[WS_METHODS.projectsListEntries]({ cwd: input.cwd }),
    );
  }

  async searchProjectEntries(
    input: ProjectSearchEntriesInput,
  ): Promise<ProjectSearchEntriesResult> {
    if (!this.client) throw new Error("not connected");
    return this.runClient<ProjectSearchEntriesResult>(
      this.client[WS_METHODS.projectsSearchEntries](input),
    );
  }

  async readProjectFile(input: {
    cwd: string;
    relativePath: string;
  }): Promise<ProjectReadFileResult> {
    if (!this.client) throw new Error("not connected");
    return this.runClient<ProjectReadFileResult>(
      this.client[WS_METHODS.projectsReadFile]({
        cwd: input.cwd,
        relativePath: input.relativePath,
      }),
    );
  }

  async writeProjectFile(input: {
    cwd: string;
    relativePath: string;
    contents: string;
  }): Promise<ProjectWriteFileResult> {
    if (!this.client) throw new Error("not connected");
    return this.runClient<ProjectWriteFileResult>(this.client[WS_METHODS.projectsWriteFile](input));
  }

  private terminalKey(threadId: string, terminalId: string): string {
    return `${threadId}\u0000${terminalId}`;
  }

  private emitTerminal(state: TerminalSessionPresentation): void {
    this.terminalStates.set(this.terminalKey(state.threadId, state.terminalId), state);
    this.events.onTerminal?.(state.threadId, state.terminalId, state);
  }

  private subscribeTerminal(input: TerminalOpenInput): void {
    if (!this.client || !this.protocolContext) return;
    const key = this.terminalKey(input.threadId, input.terminalId);
    const existingFiber = this.terminalFibers.get(key);
    if (existingFiber) Effect.runFork(Fiber.interrupt(existingFiber));
    this.terminalAttachInputs.set(key, input);
    let buffer: TerminalBufferState = EMPTY_TERMINAL_BUFFER_STATE;
    const stream = this.client[WS_METHODS.terminalAttach]({
      ...input,
      restartIfNotRunning: true,
    });
    const consume = Stream.runForEach(
      stream as Stream.Stream<TerminalAttachStreamEvent, unknown, any>,
      (event) =>
        Effect.sync(() => {
          buffer = applyTerminalAttachStreamEvent(buffer, event);
          this.emitTerminal({
            threadId: input.threadId,
            terminalId: input.terminalId,
            cwd: input.cwd,
            status: buffer.status,
            history: buffer.buffer,
            error: buffer.error,
            updatedAt: buffer.updatedAt,
          });
        }),
    );
    this.terminalFibers.set(key, this.forkClient(consume));
  }

  async openTerminal(input: TerminalOpenInput): Promise<TerminalSessionSnapshot> {
    if (!this.client) throw new Error("not connected");
    const snapshot = await this.runClient<TerminalSessionSnapshot>(
      this.client[WS_METHODS.terminalOpen](input),
    );
    this.subscribeTerminal(input);
    return snapshot;
  }

  async writeTerminal(input: TerminalWriteInput): Promise<void> {
    if (!this.client) throw new Error("not connected");
    await this.runClient(this.client[WS_METHODS.terminalWrite](input));
  }

  async resizeTerminal(input: TerminalResizeInput): Promise<void> {
    if (!this.client) throw new Error("not connected");
    await this.runClient(this.client[WS_METHODS.terminalResize](input));
  }

  async closeTerminal(input: TerminalCloseInput): Promise<void> {
    if (!this.client) throw new Error("not connected");
    await this.runClient(this.client[WS_METHODS.terminalClose](input));
    if (!input.terminalId) return;
    const key = this.terminalKey(input.threadId, input.terminalId);
    const fiber = this.terminalFibers.get(key);
    if (fiber) Effect.runFork(Fiber.interrupt(fiber));
    this.terminalFibers.delete(key);
    this.terminalAttachInputs.delete(key);
    this.emitTerminal({
      threadId: input.threadId,
      terminalId: input.terminalId,
      cwd: this.terminalStates.get(key)?.cwd ?? ".",
      status: "closed",
      history: "",
      error: null,
      updatedAt: new Date().toISOString(),
    });
  }

  async getTurnDiff(input: OrchestrationGetTurnDiffInput): Promise<OrchestrationGetTurnDiffResult> {
    if (!this.client) throw new Error("not connected");
    return this.runClient<OrchestrationGetTurnDiffResult>(
      this.client[ORCHESTRATION_WS_METHODS.getTurnDiff](input),
    );
  }

  async getDiffPreview(input: ReviewDiffPreviewInput): Promise<ReviewDiffPreviewResult> {
    if (!this.client) throw new Error("not connected");
    return this.runClient<ReviewDiffPreviewResult>(
      this.client[WS_METHODS.reviewGetDiffPreview](input),
    );
  }

  async readProjectBranch(input: { cwd: string }): Promise<ProjectRepoContext> {
    const status = await this.readVcsStatus(input);
    return projectRepoContext(status);
  }

  async readVcsStatus(input: { cwd: string }): Promise<VcsStatusResult> {
    if (!this.client) throw new Error("not connected");
    return this.runClient<VcsStatusResult>(this.client[WS_METHODS.vcsRefreshStatus](input));
  }

  async initializeRepository(input: VcsInitInput): Promise<void> {
    if (!this.client) throw new Error("not connected");
    await this.runClient(this.client[WS_METHODS.vcsInit](input));
  }

  async runGitAction(input: GitRunStackedActionInput): Promise<GitRunStackedActionResult> {
    if (!this.client || !this.protocolContext) throw new Error("not connected");
    let result: GitRunStackedActionResult | null = null;
    let failure: string | null = null;
    const stream = this.client[WS_METHODS.gitRunStackedAction](input);
    await this.runClient(
      Stream.runForEach(stream as Stream.Stream<GitActionProgressEvent, unknown, any>, (event) =>
        Effect.sync(() => {
          if (event.kind === "action_finished") result = event.result;
          if (event.kind === "action_failed") failure = event.message;
        }),
      ),
    );
    if (failure) throw new Error(failure);
    if (!result) throw new Error("Git action completed without a result.");
    return result;
  }

  async publishRepository(
    input: SourceControlPublishRepositoryInput,
  ): Promise<SourceControlPublishRepositoryResult> {
    if (!this.client) throw new Error("not connected");
    return this.runClient<SourceControlPublishRepositoryResult>(
      this.client[WS_METHODS.sourceControlPublishRepository](input),
    );
  }

  async lookupRepository(
    input: SourceControlRepositoryLookupInput,
  ): Promise<SourceControlRepositoryInfo> {
    if (!this.client) throw new Error("not connected");
    return this.runClient<SourceControlRepositoryInfo>(
      this.client[WS_METHODS.sourceControlLookupRepository](input),
    );
  }

  async cloneRepository(
    input: SourceControlCloneRepositoryInput,
  ): Promise<SourceControlCloneRepositoryResult> {
    if (!this.client) throw new Error("not connected");
    return this.runClient<SourceControlCloneRepositoryResult>(
      this.client[WS_METHODS.sourceControlCloneRepository](input),
    );
  }

  async discoverSourceControl(): Promise<SourceControlDiscoveryResult> {
    if (!this.client) throw new Error("not connected");
    return this.runClient<SourceControlDiscoveryResult>(
      this.client[WS_METHODS.serverDiscoverSourceControl]({}),
    );
  }

  private async postAuthJson<A>(
    requestPath: string,
    payload?: Readonly<Record<string, unknown>>,
  ): Promise<A> {
    if (!this.bearer) throw new Error("not connected");
    const body = JSON.stringify(payload ?? {});
    const response = await httpRequest(
      this.httpBaseUrl,
      requestPath,
      "POST",
      {
        authorization: `Bearer ${this.bearer}`,
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(body)),
      },
      body,
    );
    if (response.status !== 200) {
      let detail = response.body.slice(0, 240);
      try {
        const decoded = JSON.parse(response.body) as {
          readonly message?: string;
          readonly reason?: string;
        };
        detail = decoded.message ?? decoded.reason ?? detail;
      } catch {
        // Preserve the bounded response body when the server did not return JSON.
      }
      throw new Error(`access request failed (${response.status}): ${detail}`);
    }
    return JSON.parse(response.body) as A;
  }

  async createPairingCredential(input?: { readonly label?: string }): Promise<{
    readonly id: string;
    readonly credential: string;
    readonly label?: string;
    readonly expiresAt: string;
  }> {
    const label = input?.label?.trim();
    return this.postAuthJson("/api/auth/pairing-token", label ? { label } : {});
  }

  async revokePairingLink(id: string): Promise<boolean> {
    const result = await this.postAuthJson<{ readonly revoked: boolean }>(
      "/api/auth/pairing-links/revoke",
      { id },
    );
    return result.revoked;
  }

  async revokeClientSession(sessionId: string): Promise<boolean> {
    const result = await this.postAuthJson<{ readonly revoked: boolean }>(
      "/api/auth/clients/revoke",
      { sessionId },
    );
    return result.revoked;
  }

  async revokeOtherClientSessions(): Promise<number> {
    const result = await this.postAuthJson<{ readonly revokedCount: number }>(
      "/api/auth/clients/revoke-others",
    );
    return result.revokedCount;
  }

  async setModelSelection(input: { threadId?: string; selection: ModelSelection }): Promise<void> {
    this.modelSelection = input.selection;
    this.log(`[connector] model selection changed: ${JSON.stringify(input.selection)}`);
    if (!input.threadId) return;
    await this.awaitRecoveredTransport();
    this.pendingThreadModelSelections.set(input.threadId, input.selection);
    try {
      await this.dispatchOrchestrationCommand({
        type: "thread.meta.update",
        commandId: crypto.randomUUID(),
        threadId: input.threadId,
        modelSelection: input.selection,
      });
    } catch (error) {
      this.pendingThreadModelSelections.delete(input.threadId);
      throw error;
    }
  }

  async setThreadRuntimeMode(input: { threadId: string; runtimeMode: RuntimeMode }): Promise<void> {
    await this.awaitRecoveredTransport();
    const previousMode =
      this.pendingThreadRuntimeModes.get(input.threadId)?.value ??
      this.shellSnapshot?.threads.find((thread) => thread.id === input.threadId)?.runtimeMode;
    if (!previousMode) throw new Error(`thread ${input.threadId} is not present in the shell`);
    const mutation = setLatestPendingMutation(
      this.pendingThreadRuntimeModes,
      input.threadId,
      input.runtimeMode,
      previousMode,
    );
    try {
      const result = await this.queueThreadModeCommand(input.threadId, () =>
        this.dispatchOrchestrationCommand({
          type: "thread.runtime-mode.set",
          commandId: crypto.randomUUID(),
          threadId: input.threadId,
          runtimeMode: input.runtimeMode,
          createdAt: new Date().toISOString(),
        }),
      );
      acknowledgePendingMutationAtSequence({
        pendingMutations: this.pendingThreadRuntimeModes,
        key: input.threadId,
        mutation,
        canonicalValue: this.shellSnapshot?.threads.find((thread) => thread.id === input.threadId)
          ?.runtimeMode,
        canonicalSequence: this.shellSnapshot?.snapshotSequence,
        mutationSequence: result.sequence,
      });
      this.emitShell();
    } catch (error) {
      if (rejectPendingMutation(this.pendingThreadRuntimeModes, input.threadId, mutation).changed) {
        this.emitShell();
      }
      throw error;
    }
  }

  async setThreadInteractionMode(input: {
    threadId: string;
    interactionMode: ProviderInteractionMode;
  }): Promise<void> {
    await this.awaitRecoveredTransport();
    const previousMode =
      this.pendingThreadInteractionModes.get(input.threadId)?.value ??
      this.shellSnapshot?.threads.find((thread) => thread.id === input.threadId)?.interactionMode;
    if (!previousMode) throw new Error(`thread ${input.threadId} is not present in the shell`);
    const mutation = setLatestPendingMutation(
      this.pendingThreadInteractionModes,
      input.threadId,
      input.interactionMode,
      previousMode,
    );
    try {
      const result = await this.queueThreadModeCommand(input.threadId, () =>
        this.dispatchOrchestrationCommand({
          type: "thread.interaction-mode.set",
          commandId: crypto.randomUUID(),
          threadId: input.threadId,
          interactionMode: input.interactionMode,
          createdAt: new Date().toISOString(),
        }),
      );
      acknowledgePendingMutationAtSequence({
        pendingMutations: this.pendingThreadInteractionModes,
        key: input.threadId,
        mutation,
        canonicalValue: this.shellSnapshot?.threads.find((thread) => thread.id === input.threadId)
          ?.interactionMode,
        canonicalSequence: this.shellSnapshot?.snapshotSequence,
        mutationSequence: result.sequence,
      });
      this.emitShell();
    } catch (error) {
      if (
        rejectPendingMutation(this.pendingThreadInteractionModes, input.threadId, mutation).changed
      ) {
        this.emitShell();
      }
      throw error;
    }
  }

  async updateServerSettings(input: { patch: ServerSettingsPatch }): Promise<ServerConfig> {
    if (!this.client || !this.serverConfig) {
      throw new Error("not connected");
    }
    const settings = await this.runClient<ServerSettings>(
      this.client[WS_METHODS.serverUpdateSettings]({ patch: input.patch }),
    );
    const refreshed = await this.runClient<ServerConfig>(
      this.client[WS_METHODS.serverGetConfig]({}),
    );
    this.setServerConfig(
      { ...refreshed, settings },
      {
        version: 1,
        type: "settingsUpdated",
        payload: { settings },
      },
    );
    this.reconcileModelSelection(this.serverConfig);
    return this.serverConfig;
  }

  async refreshProviders(input?: { instanceId?: ProviderInstanceId }): Promise<ServerConfig> {
    if (!this.client || !this.serverConfig) {
      throw new Error("not connected");
    }
    const result = await this.runClient<{ providers: ServerConfig["providers"] }>(
      this.client[WS_METHODS.serverRefreshProviders](
        input?.instanceId ? { instanceId: input.instanceId } : {},
      ),
    );
    const config = {
      ...this.serverConfig,
      providers: result.providers,
    };
    this.setServerConfig(config, {
      version: 1,
      type: "providerStatuses",
      payload: { providers: result.providers },
    });
    this.reconcileModelSelection(config);
    return config;
  }

  async updateProvider(input: {
    provider: ProviderDriverKind;
    instanceId?: ProviderInstanceId;
  }): Promise<ServerConfig> {
    if (!this.client || !this.serverConfig) {
      throw new Error("not connected");
    }
    const result = await this.runClient<{ providers: ServerConfig["providers"] }>(
      this.client[WS_METHODS.serverUpdateProvider](input),
    );
    const config = {
      ...this.serverConfig,
      providers: result.providers,
    };
    this.setServerConfig(config, {
      version: 1,
      type: "providerStatuses",
      payload: { providers: result.providers },
    });
    this.reconcileModelSelection(config);
    return config;
  }

  async setProviderEnabled(input: {
    instanceId: ProviderInstanceId;
    enabled: boolean;
  }): Promise<ServerConfig> {
    if (!this.client || !this.serverConfig) {
      throw new Error("not connected");
    }
    const entry = deriveProviderModelSelectionProjection(this.serverConfig).entries.find(
      (candidate) => candidate.instanceId === input.instanceId,
    );
    if (!entry) {
      throw new Error(`provider instance not found: ${input.instanceId}`);
    }

    const patch = buildProviderInstanceEnabledPatch({
      settings: this.serverConfig.settings,
      entry,
      enabled: input.enabled,
    });
    const config = await this.updateServerSettings({ patch });
    this.log(
      `[connector] provider ${input.instanceId} enabled=${input.enabled}, selection=${JSON.stringify(this.modelSelection)}`,
    );
    return config;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.rpcTransportGeneration += 1;
    for (const fiber of this.threadFibers.values()) {
      Effect.runFork(Fiber.interrupt(fiber));
    }
    for (const fiber of this.terminalFibers.values()) {
      Effect.runFork(Fiber.interrupt(fiber));
    }
    if (this.appScope) {
      Effect.runFork(Scope.close(this.appScope, undefined as any));
    }
    this.child?.kill("SIGKILL");
  }
}
