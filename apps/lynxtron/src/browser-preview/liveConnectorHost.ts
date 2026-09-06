/**
 * SB1 dev-only live connector host for the Lynx-for-Web pane.
 *
 * Plan 11B connects the Lynx pane to the SAME shared T3 Code server the real
 * Web app uses, instead of feeding it a hand-authored scenario snapshot. This
 * host is a drop-in for `BrowserPreviewConnectorHost`: it answers the same
 * renderer-facing bridge methods (`t3:connector.ready`/`resync`/`command`) and
 * pushes the same sequenced `T3_CONNECTOR_EVENT` envelopes. The only difference
 * is the data source — a live Effect-RPC WebSocket subscription rather than a
 * static object.
 *
 * It reuses the browser-safe path the shipping code already relies on:
 *   - `globalThis.WebSocket` as the socket constructor (as in connector.ts and
 *     client-runtime/rpc/session.ts),
 *   - the shared `WsRpcGroup` client and `WS_METHODS`/`ORCHESTRATION_WS_METHODS`,
 *   - the pure `@t3tools/client-runtime` state/presentation projections.
 *
 * It is DEVELOPMENT-ONLY and lives under `src/browser-preview` so production
 * main/preload/connector code never imports it (asserted by
 * liveConnectorHost.test.ts). The harness — which owns the server bootstrap
 * secret — mints the WebSocket ticket and injects a ready `socketUrl`; no
 * credential is minted in the browser. Capabilities the browser cannot satisfy
 * (filesystem, shell, keyboard, clipboard, native navigation) stay explicitly
 * unavailable. The live host does forward terminal RPC because it is connected
 * to a real shared server; the static preview remains shell-free.
 */
import {
  WsRpcGroup,
  WS_METHODS,
  ORCHESTRATION_WS_METHODS,
  CommandId,
  type DispatchableClientOrchestrationCommand,
  MessageId,
  ThreadId,
  type AuthAccessSnapshot,
  type AssetCreateUrlInput,
  type AssetCreateUrlResult,
  type AuthAccessStreamEvent,
  type FilesystemBrowseInput,
  type FilesystemBrowseResult,
  type OrchestrationShellSnapshot,
  type OrchestrationShellStreamItem,
  type OrchestrationGetTurnDiffInput,
  type OrchestrationGetTurnDiffResult,
  type OrchestrationThreadShell,
  type OrchestrationThread,
  type OrchestrationThreadStreamItem,
  type ProjectListEntriesResult,
  type ProjectReadFileResult,
  type ProjectSearchEntriesResult,
  type ProjectWriteFileInput,
  type ProjectWriteFileResult,
  type ServerConfig,
  type ServerRemoveKeybindingInput,
  type ServerRemoveKeybindingResult,
  type ServerSettings,
  type ServerSettingsPatch,
  type ServerUpsertKeybindingInput,
  type ServerUpsertKeybindingResult,
  type SourceControlDiscoveryResult,
  type SourceControlCloneRepositoryInput,
  type SourceControlCloneRepositoryResult,
  type SourceControlRepositoryLookupInput,
  type SourceControlRepositoryInfo,
  type SourceControlPublishRepositoryInput,
  type SourceControlPublishRepositoryResult,
  type ServerConfigStreamEvent,
  type TerminalAttachStreamEvent,
  type TerminalCloseInput,
  type TerminalOpenInput,
  type TerminalResizeInput,
  type TerminalSessionSnapshot,
  type TerminalWriteInput,
  type ThreadTurnStartBootstrap,
  type VcsStatusResult,
} from "@t3tools/contracts";
import { buildThreadTurnStartCommand } from "@t3tools/client-runtime/operations/thread-dispatch";
import { projectAuthAccess } from "@t3tools/client-runtime/presentation/connections";
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
import {
  deriveActivePlanState,
  findLatestProposedPlan,
} from "@t3tools/client-runtime/presentation/thread";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as Fiber from "effect/Fiber";
import * as Scope from "effect/Scope";
import * as Schedule from "effect/Schedule";
import { RpcClient, RpcSerialization } from "effect/unstable/rpc";
import * as Socket from "effect/unstable/socket/Socket";

import {
  T3_CONNECTOR_EVENT,
  T3_CONNECTOR_METHODS,
  decodeConnectorCommandParams,
  encodeConnectorCommandResult,
  encodeConnectorServerConfig,
  isConnectorCommandName,
  resolveConnectorAssetUrl,
  type ConnectorCommandRequest,
  type ConnectorAssetUrlResult,
  type ConnectorConnectionStatus,
  type ConnectorEventEnvelope,
  type ConnectorEventPayload,
  type ConnectorServerConfig,
  type ConnectorShellPayload,
  type ConnectorSnapshot,
  type ConnectorStatusPayload,
  type ConnectorSyncReply,
  type TerminalSessionPresentation,
  type ConnectorThreadPayload,
  projectRepoContext,
  type ProjectRepoContext,
} from "../shared/connectorProtocol.ts";

const EMPTY_ACCESS = projectAuthAccess(EMPTY_AUTH_ACCESS_SNAPSHOT);

export interface LiveConnectorHostOptions {
  /** Ready WebSocket URL including the wsTicket query param (minted by the harness). */
  readonly socketUrl: string;
  /** Optional initial route/overlay to record in diagnostics (parity with scenarios). */
  readonly route?: string;
  readonly overlay?: string | null;
  readonly theme?: "light" | "dark";
  readonly onLog?: (line: string) => void;
}

type EmitGlobalEvent = (eventName: string, params: [ConnectorEventEnvelope]) => void;

export interface LiveConnectorDiagnostics {
  readonly hostKind: "live-browser-preview";
  route: string;
  lastSequence: number;
  nativeModuleReady: boolean;
  readyCalls: number;
  resyncCalls: number;
  connected: boolean;
  error: string | null;
  initialStateCalls: number;
  initialStateResult: {
    readonly route: string;
    readonly overlay: string | null;
    readonly theme: "light" | "dark";
  } | null;
  readonly commands: Array<{
    sequence: number;
    method: string;
    terminalGrid?: { readonly terminalId: string; readonly cols: number; readonly rows: number };
  }>;
  lastCommandResult: { readonly method: string; readonly value: unknown } | null;
  readonly commandResults: Array<{ readonly method: string; readonly value: unknown }>;
  readonly unsupportedCapabilities: readonly [
    "keyboard",
    "filesystem",
    "clipboard",
    "native-navigation",
  ];
}

/** Commands the isolated browser pane cannot satisfy (no local fs/shell). */
const UNSUPPORTED_COMMANDS = new Set<string>();

type ThreadTurnStartCommand = Extract<
  DispatchableClientOrchestrationCommand,
  { type: "thread.turn.start" }
>;

export async function dispatchLivePrompt<A>(input: {
  readonly params: {
    readonly threadId: string;
    readonly text: string;
    readonly bootstrap?: ThreadTurnStartBootstrap;
  };
  readonly thread:
    | Pick<OrchestrationThreadShell, "modelSelection" | "runtimeMode" | "interactionMode">
    | undefined;
  readonly dispatch: (command: ThreadTurnStartCommand) => Promise<A>;
  readonly selectThread: (threadId: string) => void;
  readonly commandId?: string;
  readonly messageId?: string;
  readonly createdAt?: string;
}): Promise<A> {
  const command = buildThreadTurnStartCommand({
    threadId: ThreadId.make(input.params.threadId),
    text: input.params.text,
    thread: input.thread,
    bootstrap: input.params.bootstrap,
    commandId: CommandId.make(input.commandId ?? globalThis.crypto.randomUUID()),
    messageId: MessageId.make(input.messageId ?? globalThis.crypto.randomUUID()),
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
  if (!command) {
    throw new Error(`thread ${input.params.threadId} is not present in the canonical snapshot`);
  }
  const value = await input.dispatch(command);
  if (!input.thread && input.params.bootstrap?.createThread) {
    input.selectThread(input.params.threadId);
  }
  return value;
}

export class LiveConnectorHost {
  readonly diagnostics: LiveConnectorDiagnostics;
  #emitGlobalEvent: EmitGlobalEvent;
  #options: LiveConnectorHostOptions;

  // Accumulated connector state (mirrors MainConnectorHost's fields).
  #status: ConnectorStatusPayload = { status: "connecting" };
  #config: ConnectorServerConfig | null = null;
  #access = EMPTY_ACCESS;
  #shell: ConnectorShellPayload = { projects: [], threads: [] };
  #threads: Record<string, ConnectorThreadPayload> = {};

  // Live RPC plumbing.
  #client: any;
  #protocolContext: any;
  #appScope: Scope.Closeable | undefined;
  #configProjection: Option.Option<ServerConfigProjection> = Option.none();
  #authSnapshot: AuthAccessSnapshot = EMPTY_AUTH_ACCESS_SNAPSHOT;
  #shellSnapshot: OrchestrationShellSnapshot | undefined;
  #archivedThreads: ReadonlyArray<OrchestrationThreadShell> = [];
  #threadSnapshots = new Map<string, OrchestrationThread>();
  #threadSequences = new Map<string, number>();
  #threadFibers = new Map<string, Fiber.Fiber<unknown, unknown>>();
  #terminalFibers = new Map<string, Fiber.Fiber<unknown, unknown>>();
  #terminalStates = new Map<string, TerminalSessionPresentation>();
  #disposed = false;
  #startPromise: Promise<void> | null = null;

  constructor(options: LiveConnectorHostOptions, emitGlobalEvent: EmitGlobalEvent) {
    this.#options = options;
    this.#emitGlobalEvent = emitGlobalEvent;
    this.diagnostics = {
      hostKind: "live-browser-preview",
      route: options.route ?? "/",
      lastSequence: 0,
      nativeModuleReady: false,
      readyCalls: 0,
      resyncCalls: 0,
      connected: false,
      error: null,
      initialStateCalls: 0,
      initialStateResult: null,
      commands: [],
      lastCommandResult: null,
      commandResults: [],
      unsupportedCapabilities: ["keyboard", "filesystem", "clipboard", "native-navigation"],
    };
  }

  /** Open the live RPC connection and start subscriptions. Idempotent. */
  start(): Promise<void> {
    if (this.#startPromise) return this.#startPromise;
    if (this.#disposed) return Promise.resolve();
    this.#startPromise = this.#start();
    return this.#startPromise;
  }

  async #start(): Promise<void> {
    try {
      const config = await this.#openRpc(this.#options.socketUrl);
      this.#setConfig(config, { version: 1, type: "snapshot", config });
      this.#subscribeConfig();
      this.#subscribeAuthAccess();
      this.#subscribeShell();
      this.diagnostics.connected = true;
      this.#setStatus("ready");
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.diagnostics.error = detail;
      this.#setStatus("error", detail);
    }
  }

  handleNativeCall(method: string, data: unknown, moduleName: string): unknown {
    if (moduleName !== "bridge") {
      throw new Error(`Unsupported preview native module: ${moduleName}`);
    }
    if (method === "t3:preview.module-ready") {
      this.diagnostics.nativeModuleReady = true;
      return { ok: true };
    }
    if (method === "t3:preview.initial-state") {
      const result = {
        route: this.#options.route ?? "/",
        overlay: this.#options.overlay ?? null,
        theme: this.#options.theme ?? "dark",
      };
      this.diagnostics.initialStateCalls += 1;
      this.diagnostics.initialStateResult = result;
      return result;
    }
    if (method === T3_CONNECTOR_METHODS.ready) {
      this.diagnostics.readyCalls += 1;
      return this.#syncReply();
    }
    if (method === T3_CONNECTOR_METHODS.resync) {
      this.diagnostics.resyncCalls += 1;
      return this.#syncReply();
    }
    if (method === T3_CONNECTOR_METHODS.command) {
      return this.#handleCommand(data);
    }
    throw new Error(`Unsupported preview bridge method: ${method}`);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const fiber of this.#threadFibers.values()) {
      Effect.runFork(Fiber.interrupt(fiber));
    }
    this.#threadFibers.clear();
    for (const fiber of this.#terminalFibers.values()) {
      Effect.runFork(Fiber.interrupt(fiber));
    }
    this.#terminalFibers.clear();
    if (this.#appScope) {
      Effect.runFork(Scope.close(this.#appScope, Exit.void));
      this.#appScope = undefined;
    }
  }

  // --- snapshot + emit (mirror of MainConnectorHost) --------------------------

  #syncReply(): ConnectorSyncReply {
    return {
      seq: this.diagnostics.lastSequence,
      snapshot: {
        status: this.#status,
        config: this.#config,
        access: this.#access,
        shell: this.#shell,
        threads: { ...this.#threads },
        terminals: Object.fromEntries(this.#terminalStates),
      },
    };
  }

  #emit(event: ConnectorEventPayload): void {
    if (this.#disposed) return;
    switch (event.kind) {
      case "status":
        this.#status = event.payload;
        break;
      case "config":
        this.#config = event.payload;
        break;
      case "access":
        this.#access = event.payload;
        break;
      case "shell":
        this.#shell = event.payload;
        break;
      case "thread":
        this.#threads[event.threadId] = event.payload;
        break;
      case "terminal":
        this.#terminalStates.set(`${event.threadId}\u0000${event.terminalId}`, event.payload);
        break;
      case "log":
        break;
    }
    this.diagnostics.lastSequence += 1;
    const envelope = { ...event, seq: this.diagnostics.lastSequence } as ConnectorEventEnvelope;
    this.#emitGlobalEvent(T3_CONNECTOR_EVENT, [envelope]);
  }

  #setStatus(status: ConnectorConnectionStatus, detail?: string): void {
    this.#emit({
      kind: "status",
      payload: detail === undefined ? { status } : { status, detail },
    });
  }

  #setConfig(config: ServerConfig, event: ServerConfigStreamEvent): void {
    this.#configProjection = applyServerConfigProjection(this.#configProjection, event);
    if (Option.isSome(this.#configProjection)) {
      this.#emit({
        kind: "config",
        payload: encodeConnectorServerConfig(this.#configProjection.value.config),
      });
    }
  }

  // --- live RPC (browser-safe, mirrors connector.ts) --------------------------

  #openRpc(socketUrl: string): Promise<ServerConfig> {
    const self = this;
    const program = Effect.gen(function* () {
      const wsCtor = Socket.WebSocketConstructor.of(
        (url: string) => new (globalThis as any).WebSocket(url) as any,
      );
      const socketLayer = Socket.layerWebSocket(socketUrl, { openTimeout: "15 seconds" }).pipe(
        Layer.provide(Layer.succeed(Socket.WebSocketConstructor, wsCtor)),
      );
      const protocolLayer = Layer.effect(
        RpcClient.Protocol,
        RpcClient.makeProtocolSocket({
          retryTransientErrors: false,
          retryPolicy: Schedule.recurs(0),
        }),
      ).pipe(Layer.provide(Layer.mergeAll(socketLayer, RpcSerialization.layerJson)));

      const appScope = yield* Scope.make();
      self.#appScope = appScope;
      const built = yield* Layer.buildWithScope(protocolLayer, appScope);
      const protocolContext = Context.add(built, Scope.Scope, appScope);
      self.#protocolContext = protocolContext;
      const client = yield* RpcClient.make(WsRpcGroup).pipe(Effect.provide(protocolContext));
      self.#client = client;
      const cfg = yield* client[WS_METHODS.serverGetConfig]({}).pipe(
        Effect.provide(protocolContext),
      );
      return cfg;
    });
    return Effect.runPromise(program as Effect.Effect<ServerConfig, unknown, never>);
  }

  #forkClient(effect: Effect.Effect<unknown, unknown, any>): Fiber.Fiber<unknown, unknown> {
    return Effect.runFork(
      Effect.provide(effect, this.#protocolContext) as Effect.Effect<unknown, unknown, never>,
    ) as Fiber.Fiber<unknown, unknown>;
  }

  #runClient<A>(effect: Effect.Effect<A, unknown, any>): Promise<A> {
    return Effect.runPromise(
      Effect.provide(effect, this.#protocolContext) as Effect.Effect<A, unknown, never>,
    );
  }

  #watchConnectionFiber(fiber: Fiber.Fiber<unknown, unknown>): void {
    fiber.addObserver(() => {
      if (this.#disposed || !this.diagnostics.connected) return;
      this.diagnostics.connected = false;
      const label = this.#config?.environment.label ?? "T3 Code";
      this.diagnostics.error = `${label} could not establish a WebSocket connection.`;
      this.#setStatus("reconnecting", this.diagnostics.error);
    });
  }

  #subscribeConfig(): void {
    const stream = this.#client[WS_METHODS.subscribeServerConfig]({});
    const fiber = this.#forkClient(
      Stream.runForEach(stream as Stream.Stream<ServerConfigStreamEvent, unknown, any>, (event) =>
        Effect.sync(() => {
          this.#configProjection = applyServerConfigProjection(this.#configProjection, event);
          if (Option.isSome(this.#configProjection)) {
            this.#emit({
              kind: "config",
              payload: encodeConnectorServerConfig(this.#configProjection.value.config),
            });
          }
        }),
      ),
    );
    this.#watchConnectionFiber(fiber);
  }

  #subscribeAuthAccess(): void {
    const stream = this.#client[WS_METHODS.subscribeAuthAccess]({});
    const fiber = this.#forkClient(
      Stream.runForEach(stream as Stream.Stream<AuthAccessStreamEvent, unknown, any>, (event) =>
        Effect.sync(() => {
          this.#authSnapshot = applyAuthAccessStreamEvent(this.#authSnapshot, event);
          this.#emit({ kind: "access", payload: projectAuthAccess(this.#authSnapshot) });
        }),
      ),
    );
    this.#watchConnectionFiber(fiber);
  }

  #subscribeShell(): void {
    const stream = this.#client[ORCHESTRATION_WS_METHODS.subscribeShell]({});
    const fiber = this.#forkClient(
      Stream.runForEach(
        stream as Stream.Stream<OrchestrationShellStreamItem, unknown, any>,
        (item) => Effect.sync(() => this.#handleShellItem(item)),
      ),
    );
    this.#watchConnectionFiber(fiber);
  }

  #handleShellItem(item: OrchestrationShellStreamItem): void {
    if (item.kind === "snapshot") {
      this.#shellSnapshot = item.snapshot;
    } else if (item.kind !== "synchronized" && this.#shellSnapshot) {
      this.#shellSnapshot = applyShellStreamEvent(this.#shellSnapshot, item);
    }
    void this.#refreshArchived();
    this.#emitShell();
  }

  async #refreshArchived(): Promise<void> {
    if (!this.#client) return;
    const snapshot = await this.#runClient<OrchestrationShellSnapshot>(
      this.#client[ORCHESTRATION_WS_METHODS.getArchivedShellSnapshot]({}),
    );
    this.#archivedThreads = snapshot.threads;
    this.#emitShell();
  }

  #emitShell(): void {
    const projects = this.#shellSnapshot?.projects ?? [];
    const threads = sortThreads(
      (this.#shellSnapshot?.threads ?? []).filter((thread) => !thread.archivedAt),
      "updated_at",
    );
    this.#emit({
      kind: "shell",
      payload: { projects, threads, archivedThreads: this.#archivedThreads },
    });
  }

  #selectThread(threadId: string): void {
    if (this.#threadFibers.has(threadId)) {
      this.#emitThread(threadId);
      return;
    }
    if (!this.#client) return;
    const stream = this.#client[ORCHESTRATION_WS_METHODS.subscribeThread]({
      threadId,
      requestCompletionMarker: false,
    });
    const fiber = this.#forkClient(
      Stream.runForEach(
        stream as Stream.Stream<OrchestrationThreadStreamItem, unknown, any>,
        (item) => Effect.sync(() => this.#handleThreadItem(threadId, item)),
      ),
    );
    this.#threadFibers.set(threadId, fiber);
  }

  #handleThreadItem(threadId: string, item: OrchestrationThreadStreamItem): void {
    if (item.kind === "snapshot") {
      this.#threadSequences.set(threadId, item.snapshot.snapshotSequence);
      this.#threadSnapshots.set(threadId, item.snapshot.thread);
    } else if (item.kind === "event") {
      const sequence = this.#threadSequences.get(threadId) ?? 0;
      if (item.event.sequence <= sequence) return;
      this.#threadSequences.set(threadId, item.event.sequence);
      const current = this.#threadSnapshots.get(threadId);
      if (!current) return;
      const result = applyThreadDetailEvent(current, item.event);
      if (result.kind === "updated") this.#threadSnapshots.set(threadId, result.thread);
      else if (result.kind === "deleted") this.#threadSnapshots.delete(threadId);
    }
    this.#emitThread(threadId);
  }

  #emitThread(threadId: string): void {
    const thread = this.#threadSnapshots.get(threadId);
    if (!thread) return;
    const activePlan = deriveActivePlanState(
      thread.activities,
      thread.latestTurn?.turnId ?? undefined,
    );
    const activeProposedPlan = findLatestProposedPlan(
      thread.proposedPlans,
      thread.latestTurn?.turnId,
    );
    this.#emit({
      kind: "thread",
      threadId,
      payload: {
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
      },
    });
  }

  #terminalKey(threadId: string, terminalId: string): string {
    return `${threadId}\u0000${terminalId}`;
  }

  #emitTerminal(state: TerminalSessionPresentation): void {
    this.#emit({
      kind: "terminal",
      threadId: state.threadId,
      terminalId: state.terminalId,
      payload: state,
    });
  }

  async #postAuthJson<A>(
    requestPath: string,
    payload?: Readonly<Record<string, unknown>>,
  ): Promise<A> {
    const response = await fetch(requestPath, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload ?? {}),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 240);
      throw new Error(`access request failed (${response.status}): ${detail}`);
    }
    return (await response.json()) as A;
  }

  #subscribeTerminal(input: TerminalOpenInput): void {
    const key = this.#terminalKey(input.threadId, input.terminalId);
    const existingFiber = this.#terminalFibers.get(key);
    if (existingFiber) Effect.runFork(Fiber.interrupt(existingFiber));
    let buffer: TerminalBufferState = EMPTY_TERMINAL_BUFFER_STATE;
    const stream = this.#client[WS_METHODS.terminalAttach]({
      ...input,
      restartIfNotRunning: true,
    });
    const fiber = this.#forkClient(
      Stream.runForEach(stream as Stream.Stream<TerminalAttachStreamEvent, unknown, any>, (event) =>
        Effect.sync(() => {
          buffer = applyTerminalAttachStreamEvent(buffer, event);
          this.#emitTerminal({
            threadId: input.threadId,
            terminalId: input.terminalId,
            cwd: input.cwd,
            status: buffer.status,
            history: buffer.buffer,
            error: buffer.error,
            updatedAt: buffer.updatedAt,
          });
        }),
      ),
    );
    this.#terminalFibers.set(key, fiber);
  }

  #handleCommand(value: unknown): unknown {
    if (typeof value !== "object" || value === null) {
      throw new Error("Malformed live connector command");
    }
    const request = value as ConnectorCommandRequest;
    if (!isConnectorCommandName(request.method)) {
      throw new Error(`Rejected live connector command: ${String(request.method)}`);
    }
    const terminalGrid =
      request.method === "openTerminal" || request.method === "resizeTerminal"
        ? (() => {
            const input = request.params as TerminalOpenInput | TerminalResizeInput;
            return {
              terminalId: input.terminalId,
              cols: input.cols ?? 80,
              rows: input.rows ?? 24,
            };
          })()
        : undefined;
    this.diagnostics.commands.push({
      sequence: this.diagnostics.commands.length + 1,
      method: request.method,
      ...(terminalGrid ? { terminalGrid } : {}),
    });
    if (UNSUPPORTED_COMMANDS.has(request.method)) {
      throw new Error(`${request.method} is unavailable in the isolated browser preview`);
    }
    if (request.method === "selectThread") {
      this.#selectThread(request.params as unknown as string);
      return undefined;
    }
    if (!this.#client) throw new Error("Live connector is not connected");
    if (request.method === "createPairingCredential") {
      const params = (request.params ?? {}) as { readonly label?: string };
      return this.#postAuthJson<{
        readonly id: string;
        readonly credential: string;
        readonly label?: string;
        readonly expiresAt: string;
      }>("/api/auth/pairing-token", params).then((value) => {
        this.#recordCommandResult(request.method, { ...value, credential: "[redacted]" });
        return value;
      });
    }
    if (request.method === "createAssetUrl") {
      const params = request.params as AssetCreateUrlInput;
      return this.#runClient<AssetCreateUrlResult>(
        this.#client[WS_METHODS.assetsCreateUrl](params),
      ).then((value) => {
        const result: ConnectorAssetUrlResult = resolveConnectorAssetUrl(
          this.#options.socketUrl,
          value,
        );
        this.#recordCommandResult(request.method, result);
        return result;
      });
    }
    if (request.method === "revokePairingLink") {
      const params = request.params as { readonly id: string };
      return this.#postAuthJson<{ readonly revoked: boolean }>(
        "/api/auth/pairing-links/revoke",
        params,
      ).then((value) => {
        this.#recordCommandResult(request.method, value);
        return value.revoked;
      });
    }
    if (request.method === "revokeClientSession") {
      const params = request.params as { readonly sessionId: string };
      return this.#postAuthJson<{ readonly revoked: boolean }>(
        "/api/auth/clients/revoke",
        params,
      ).then((value) => {
        this.#recordCommandResult(request.method, value);
        return value.revoked;
      });
    }
    if (request.method === "revokeOtherClientSessions") {
      return this.#postAuthJson<{ readonly revokedCount: number }>(
        "/api/auth/clients/revoke-others",
      ).then((value) => {
        this.#recordCommandResult(request.method, value);
        return value.revokedCount;
      });
    }
    if (request.method === "openTerminal") {
      const params = request.params as TerminalOpenInput;
      return this.#runClient<TerminalSessionSnapshot>(
        this.#client[WS_METHODS.terminalOpen](params),
      ).then((value) => {
        this.#subscribeTerminal(params);
        this.#recordCommandResult(request.method, value);
        return value;
      });
    }
    if (request.method === "writeTerminal") {
      const params = request.params as TerminalWriteInput;
      return this.#runClient(this.#client[WS_METHODS.terminalWrite](params)).then((value) => {
        this.#recordCommandResult(request.method, value);
        return value;
      });
    }
    if (request.method === "resizeTerminal") {
      const params = request.params as TerminalResizeInput;
      return this.#runClient(this.#client[WS_METHODS.terminalResize](params)).then((value) => {
        this.#recordCommandResult(request.method, value);
        return value;
      });
    }
    if (request.method === "closeTerminal") {
      const params = request.params as TerminalCloseInput;
      return this.#runClient(this.#client[WS_METHODS.terminalClose](params)).then((value) => {
        if (params.terminalId) {
          const key = this.#terminalKey(params.threadId, params.terminalId);
          const fiber = this.#terminalFibers.get(key);
          if (fiber) Effect.runFork(Fiber.interrupt(fiber));
          this.#terminalFibers.delete(key);
          this.#emitTerminal({
            threadId: params.threadId,
            terminalId: params.terminalId,
            cwd: this.#terminalStates.get(key)?.cwd ?? ".",
            status: "closed",
            history: "",
            error: null,
            updatedAt: new Date().toISOString(),
          });
        }
        this.#recordCommandResult(request.method, value);
        return value;
      });
    }
    if (request.method === "sendPrompt") {
      const params = request.params as {
        threadId: string;
        text: string;
        bootstrap?: ThreadTurnStartBootstrap;
      };
      const thread =
        this.#shellSnapshot?.threads.find((candidate) => candidate.id === params.threadId) ??
        this.#threadSnapshots.get(params.threadId);
      return dispatchLivePrompt({
        params,
        thread,
        dispatch: (command) =>
          this.#runClient(this.#client[ORCHESTRATION_WS_METHODS.dispatchCommand](command)),
        selectThread: (threadId) => this.#selectThread(threadId),
      }).then((value) => {
        this.#recordCommandResult(request.method, value);
        return value;
      });
    }
    if (request.method === "discoverSourceControl") {
      return this.#runClient<SourceControlDiscoveryResult>(
        this.#client[WS_METHODS.serverDiscoverSourceControl]({}),
      ).then((value) => {
        this.#recordCommandResult(request.method, value);
        return value;
      });
    }
    if (request.method === "lookupRepository") {
      const params = request.params as SourceControlRepositoryLookupInput;
      return this.#runClient<SourceControlRepositoryInfo>(
        this.#client[WS_METHODS.sourceControlLookupRepository](params),
      ).then((value) => {
        this.#recordCommandResult(request.method, value);
        return value;
      });
    }
    if (request.method === "cloneRepository") {
      const params = request.params as SourceControlCloneRepositoryInput;
      return this.#runClient<SourceControlCloneRepositoryResult>(
        this.#client[WS_METHODS.sourceControlCloneRepository](params),
      ).then((value) => {
        this.#recordCommandResult(request.method, value);
        return value;
      });
    }
    if (request.method === "browseFilesystem") {
      const params = request.params as FilesystemBrowseInput;
      return this.#runClient<FilesystemBrowseResult>(
        this.#client[WS_METHODS.filesystemBrowse](params),
      ).then((value) => {
        this.#recordCommandResult(request.method, value);
        return value;
      });
    }
    if (request.method === "createProject") {
      const params = request.params as { workspaceRoot: string };
      const workspaceRoot = params.workspaceRoot.trim().replace(/[\\/]+$/u, "");
      const projectId = globalThis.crypto.randomUUID();
      const title = workspaceRoot.split(/[\\/]/u).filter(Boolean).at(-1) ?? "Workspace";
      return this.#runClient(
        this.#client[ORCHESTRATION_WS_METHODS.dispatchCommand]({
          type: "project.create",
          commandId: globalThis.crypto.randomUUID(),
          projectId,
          title,
          workspaceRoot,
          createWorkspaceRootIfMissing: true,
          defaultModelSelection: null,
          createdAt: new Date().toISOString(),
        }),
      ).then(() => {
        const value = { projectId };
        this.#recordCommandResult(request.method, value);
        return value;
      });
    }
    if (request.method === "updateProject" || request.method === "deleteProject") {
      const params = request.params as { projectId: string; title?: string; force?: boolean };
      const command =
        request.method === "updateProject"
          ? {
              type: "project.meta.update" as const,
              commandId: globalThis.crypto.randomUUID(),
              projectId: params.projectId,
              title: params.title?.trim(),
            }
          : {
              type: "project.delete" as const,
              commandId: globalThis.crypto.randomUUID(),
              projectId: params.projectId,
              ...(params.force === true ? { force: true } : {}),
            };
      return this.#runClient(this.#client[ORCHESTRATION_WS_METHODS.dispatchCommand](command)).then(
        (value) => {
          this.#recordCommandResult(request.method, value);
          return value;
        },
      );
    }
    if (request.method === "listProjectEntries") {
      const params = request.params as { cwd: string };
      return this.#runClient<ProjectListEntriesResult>(
        this.#client[WS_METHODS.projectsListEntries]({ cwd: params.cwd }),
      ).then((value) => {
        this.#recordCommandResult(request.method, value);
        return value;
      });
    }
    if (request.method === "readProjectFile") {
      const params = request.params as { cwd: string; relativePath: string };
      return this.#runClient<ProjectReadFileResult>(
        this.#client[WS_METHODS.projectsReadFile](params),
      ).then((value) => {
        this.#recordCommandResult(request.method, value);
        return value;
      });
    }
    if (request.method === "writeProjectFile") {
      const params = request.params as ProjectWriteFileInput;
      return this.#runClient<ProjectWriteFileResult>(
        this.#client[WS_METHODS.projectsWriteFile](params),
      ).then((value) => {
        this.#recordCommandResult(request.method, value);
        return value;
      });
    }
    if (request.method === "upsertKeybinding") {
      return this.#runClient<ServerUpsertKeybindingResult>(
        this.#client[WS_METHODS.serverUpsertKeybinding](
          request.params as ServerUpsertKeybindingInput,
        ),
      ).then((value) => {
        this.#recordCommandResult(request.method, value);
        return value;
      });
    }
    if (request.method === "removeKeybinding") {
      return this.#runClient<ServerRemoveKeybindingResult>(
        this.#client[WS_METHODS.serverRemoveKeybinding](
          request.params as ServerRemoveKeybindingInput,
        ),
      ).then((value) => {
        this.#recordCommandResult(request.method, value);
        return value;
      });
    }
    if (request.method === "searchProjectEntries") {
      const params = request.params as {
        cwd: string;
        query: string;
        limit: number;
        kind?: "file" | "directory";
      };
      return this.#runClient<ProjectSearchEntriesResult>(
        this.#client[WS_METHODS.projectsSearchEntries](params),
      ).then((value) => {
        this.#recordCommandResult(request.method, value);
        return value;
      });
    }
    if (request.method === "readProjectBranch") {
      const params = request.params as { cwd: string };
      return this.#runClient<VcsStatusResult>(
        this.#client[WS_METHODS.vcsRefreshStatus]({ cwd: params.cwd }),
      ).then((value) => {
        const context: ProjectRepoContext = projectRepoContext(value);
        this.#recordCommandResult(request.method, context);
        return context;
      });
    }
    if (request.method === "readVcsStatus") {
      const params = request.params as { cwd: string };
      return this.#runClient<VcsStatusResult>(
        this.#client[WS_METHODS.vcsRefreshStatus]({ cwd: params.cwd }),
      ).then((value) => {
        this.#recordCommandResult(request.method, value);
        return value;
      });
    }
    if (request.method === "publishRepository") {
      const params = request.params as SourceControlPublishRepositoryInput;
      return this.#runClient<SourceControlPublishRepositoryResult>(
        this.#client[WS_METHODS.sourceControlPublishRepository](params),
      ).then((value) => {
        this.#recordCommandResult(request.method, value);
        return value;
      });
    }
    if (request.method === "updateServerSettings") {
      const patch = (
        decodeConnectorCommandParams(request.method, request.params) as {
          patch: ServerSettingsPatch;
        }
      ).patch;
      return this.#runClient<ServerSettings>(
        this.#client[WS_METHODS.serverUpdateSettings]({ patch }),
      ).then(async (settings) => {
        const config = await this.#runClient<ServerConfig>(
          this.#client[WS_METHODS.serverGetConfig]({}),
        );
        this.#setConfig(
          { ...config, settings },
          { version: 1, type: "settingsUpdated", payload: { settings } },
        );
        return encodeConnectorCommandResult(request.method, { ...config, settings });
      });
    }
    if (request.method === "getTurnDiff") {
      const params = request.params as OrchestrationGetTurnDiffInput;
      return this.#runClient<OrchestrationGetTurnDiffResult>(
        this.#client[ORCHESTRATION_WS_METHODS.getTurnDiff](params),
      ).then((value) => {
        this.#recordCommandResult(request.method, value);
        return value;
      });
    }
    if (request.method === "respondToUserInput") {
      const params = request.params as {
        threadId: string;
        requestId: string;
        answers: Record<string, unknown>;
      };
      return this.#runClient(
        this.#client[ORCHESTRATION_WS_METHODS.dispatchCommand]({
          type: "thread.user-input.respond",
          commandId: globalThis.crypto.randomUUID(),
          threadId: params.threadId,
          requestId: params.requestId,
          answers: params.answers,
          createdAt: new Date().toISOString(),
        }),
      ).then((value) => {
        this.#recordCommandResult(request.method, value);
        return value;
      });
    }
    if (request.method === "archiveThread" || request.method === "deleteThread") {
      const params = request.params as { threadId: string; unarchive?: boolean };
      const command =
        request.method === "deleteThread"
          ? {
              type: "thread.delete" as const,
              commandId: globalThis.crypto.randomUUID(),
              threadId: params.threadId,
            }
          : {
              type: params.unarchive ? ("thread.unarchive" as const) : ("thread.archive" as const),
              commandId: globalThis.crypto.randomUUID(),
              threadId: params.threadId,
            };
      return this.#runClient(this.#client[ORCHESTRATION_WS_METHODS.dispatchCommand](command)).then(
        () => this.#refreshArchived(),
      );
    }
    return undefined;
  }

  #recordCommandResult(method: string, value: unknown): void {
    const result = { method, value };
    this.diagnostics.lastCommandResult = result;
    this.diagnostics.commandResults.push(result);
    if (this.diagnostics.commandResults.length > 32) {
      this.diagnostics.commandResults.splice(0, this.diagnostics.commandResults.length - 32);
    }
  }
}
