/**
 * Main-owned connector host (AR1 spike).
 *
 * Owns the T3Connector lifecycle inside the Lynxtron main process and exposes
 * one typed internal protocol to the renderer:
 *   - `ready` / `resync` return one serializable snapshot plus the latest
 *     monotonic sequence,
 *   - `command` dispatches allowlisted connector commands,
 *   - every connector callback is mirrored to the renderer as a sequenced
 *     `sendGlobalEvent` envelope.
 *
 * The class is deliberately free of Lynxtron/runtime imports: the window,
 * handler registry, and connector factory are injected so focused tests and
 * the node smoke script can drive it without the Lynxtron binary. The wiring
 * that binds it to `lynxBridge` and the prebuilt connector bundle lives in
 * `main.ts`.
 */
import {
  T3_CONNECTOR_EVENT,
  T3_CONNECTOR_METHODS,
  decodeConnectorCommandParams,
  encodeConnectorCommandResult,
  encodeConnectorServerConfig,
  isConnectorCommandName,
  type ConnectorCommandRequest,
  type ConnectorEventEnvelope,
  type ConnectorEventPayload,
  type ConnectorServerConfig,
  type ConnectorShellPayload,
  type ConnectorSnapshot,
  type ConnectorStatusPayload,
  type ConnectorSyncReply,
  type ConnectorThreadPayload,
  type TerminalSessionPresentation,
} from "../../shared/connectorProtocol.ts";
import type { AuthAccessPresentation } from "@t3tools/lynx-logic/connections";
import { isTransportConnectionErrorMessage } from "@t3tools/client-runtime/errors";
import type { ServerConfig } from "@t3tools/contracts";

export interface MainConnectorWindow {
  sendGlobalEvent(eventName: string, ...args: unknown[]): boolean;
}

export type MainConnectorHandler = (params: unknown) => unknown | Promise<unknown>;

export async function settleMainConnectorHandler(
  handler: MainConnectorHandler,
  params: unknown,
): Promise<unknown> {
  try {
    return await handler(params);
  } catch (error) {
    return {
      __t3BridgeError: error instanceof Error ? error.message : String(error),
    };
  }
}

export interface ConnectorLike {
  connect(): Promise<unknown>;
  readonly connectionKind?: "owned-local" | "existing-environment";
  readonly pathsResolveLocally?: boolean;
  recoverTransport?(): Promise<void>;
  dispose(): void;
  [method: string]: unknown;
}

export interface ConnectorEventCallbacks {
  onStatus: (status: string, detail?: string) => void;
  onConfig: (config: ServerConfig) => void;
  onAccess: (access: AuthAccessPresentation) => void;
  onShell: (payload: ConnectorShellPayload) => void;
  onThread: (threadId: string, payload: ConnectorThreadPayload) => void;
  onTerminal: (threadId: string, terminalId: string, payload: TerminalSessionPresentation) => void;
  onLog: (line: string) => void;
}

export interface MainConnectorHostOptions {
  readonly window: MainConnectorWindow;
  readonly registerHandler: (method: string, handler: MainConnectorHandler) => void;
  readonly removeHandler?: (method: string) => void;
  readonly createConnector: (events: ConnectorEventCallbacks) => ConnectorLike;
  readonly onLog?: (line: string) => void;
  readonly testSocketOpenErrorForThreadModelSelectionOnce?: boolean;
  readonly testSendPromptErrorOnce?: boolean;
}

const EMPTY_ACCESS: AuthAccessPresentation = {
  pairingLinks: [],
  clientSessions: [],
  pairingLinkCount: 0,
  clientSessionCount: 0,
  hasEntries: false,
};

const RETRYABLE_COMMANDS = new Set<ConnectorCommandRequest["method"]>([
  "setModelSelection",
  "setThreadRuntimeMode",
  "setThreadInteractionMode",
]);

/**
 * Dispatch one allowlisted command to the connector. Request shapes mirror
 * the established preload bridge surface so the renderer command path is
 * identical in both transports; per-command adapters keep the connector's
 * positional signatures out of the wire protocol.
 */
export function dispatchConnectorCommand(
  connector: ConnectorLike,
  request: ConnectorCommandRequest,
): unknown {
  const params = decodeConnectorCommandParams(request.method, request.params) as
    | Record<string, unknown>
    | undefined;
  switch (request.method) {
    case "selectThread":
      return (connector.selectThread as (threadId: string) => void)(params as unknown as string);
    case "revokePairingLink":
      return (connector.revokePairingLink as (id: string) => Promise<boolean>)(
        params?.id as string,
      );
    case "revokeClientSession":
      return (connector.revokeClientSession as (sessionId: string) => Promise<boolean>)(
        params?.sessionId as string,
      );
    case "revokeOtherClientSessions":
      return (connector.revokeOtherClientSessions as () => Promise<number>)();
    case "discoverSourceControl":
      return (connector.discoverSourceControl as () => Promise<unknown>)();
    default: {
      const fn = connector[request.method];
      if (typeof fn !== "function") {
        throw new Error(`Connector does not implement command "${request.method}"`);
      }
      return (fn as (input: unknown) => unknown).call(connector, params ?? {});
    }
  }
}

export class MainConnectorHost {
  private readonly options: MainConnectorHostOptions;
  private connector: ConnectorLike | undefined;
  private connectPromise: Promise<unknown> | undefined;
  private reconnectPromise: Promise<unknown> | undefined;
  private connectorGeneration = 0;
  private disposed = false;
  private testSocketOpenErrorForThreadModelSelectionPending: boolean;
  private testSendPromptErrorPending: boolean;
  private seq = 0;
  private status: ConnectorStatusPayload = { status: "idle" };
  private config: ConnectorServerConfig | null = null;
  private access: AuthAccessPresentation = EMPTY_ACCESS;
  private shell: ConnectorShellPayload = { projects: [], threads: [] };
  private readonly threads: Record<string, ConnectorThreadPayload> = {};
  private readonly terminals: Record<string, TerminalSessionPresentation> = {};

  constructor(options: MainConnectorHostOptions) {
    this.options = options;
    this.testSocketOpenErrorForThreadModelSelectionPending =
      options.testSocketOpenErrorForThreadModelSelectionOnce === true;
    this.testSendPromptErrorPending = options.testSendPromptErrorOnce === true;
  }

  /** Register the typed renderer->main handlers. Idempotent. */
  attach(): void {
    const { registerHandler } = this.options;
    registerHandler(T3_CONNECTOR_METHODS.ready, () => this.syncReply());
    registerHandler(T3_CONNECTOR_METHODS.resync, () => this.syncReply());
    registerHandler(T3_CONNECTOR_METHODS.command, (params) => this.handleCommand(params));
    registerHandler(T3_CONNECTOR_METHODS.primaryConnection, () => {
      const read = this.connector?.primaryConnection;
      return typeof read === "function" ? read.call(this.connector) : null;
    });
  }

  /** Boot the connector (and its spawned server). Idempotent. */
  connect(): Promise<unknown> {
    if (this.disposed) return Promise.reject(new Error("connector host is disposed"));
    if (this.connectPromise) return this.connectPromise;
    return this.startConnector(false);
  }

  /** Current sequence, exposed for diagnostics and tests. */
  get currentSeq(): number {
    return this.seq;
  }

  private syncReply(): ConnectorSyncReply {
    return {
      seq: this.seq,
      snapshot: {
        status: this.status,
        config: this.config,
        access: this.access,
        shell: this.shell,
        threads: { ...this.threads },
        terminals: { ...this.terminals },
      },
    };
  }

  private async handleCommand(params: unknown): Promise<unknown> {
    if (this.disposed) {
      return Promise.reject(new Error("connector host is disposed"));
    }
    const request = params as ConnectorCommandRequest | null | undefined;
    if (!request || !isConnectorCommandName(request.method)) {
      return Promise.reject(
        new Error(
          `Rejected connector command: ${String((request as { method?: unknown } | null)?.method)}`,
        ),
      );
    }
    if (request.method === "reconnect") {
      return this.reconnect();
    }
    const dispatch = () => {
      const connector = this.connector;
      if (!connector) throw new Error("connector is not started");
      if (
        this.testSocketOpenErrorForThreadModelSelectionPending &&
        request.method === "setModelSelection" &&
        typeof (request.params as { threadId?: unknown } | undefined)?.threadId === "string"
      ) {
        this.testSocketOpenErrorForThreadModelSelectionPending = false;
        throw new Error('SocketOpenError: timeout waiting for "open"');
      }
      if (this.testSendPromptErrorPending && request.method === "sendPrompt") {
        this.testSendPromptErrorPending = false;
        throw new Error("Injected sendPrompt failure");
      }
      return Promise.resolve(dispatchConnectorCommand(connector, request));
    };
    try {
      return encodeConnectorCommandResult(request.method, await dispatch());
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      if (
        !RETRYABLE_COMMANDS.has(request.method) ||
        !isTransportConnectionErrorMessage(cause.message)
      ) {
        throw cause;
      }
      this.options.onLog?.(
        `[main-connector] ${request.method} hit a stale transport; reconnecting once`,
      );
      const connector = this.connector;
      if (connector?.recoverTransport) {
        await connector.recoverTransport();
      } else {
        await this.reconnect();
      }
      return encodeConnectorCommandResult(request.method, await dispatch());
    }
  }

  /** Replace the owned connector while keeping the renderer protocol stable. */
  private reconnect(): Promise<unknown> {
    if (this.reconnectPromise) return this.reconnectPromise;
    const reconnect = this.startConnector(true);
    const tracked = reconnect.finally(() => {
      if (this.reconnectPromise === tracked) this.reconnectPromise = undefined;
    });
    this.reconnectPromise = tracked;
    return tracked;
  }

  private startConnector(reconnecting: boolean): Promise<unknown> {
    const generation = ++this.connectorGeneration;
    const previous = this.connector;
    this.connector = undefined;
    this.connectPromise = undefined;
    // Invalidate the old generation before disposal: its process exit callback
    // is expected and must not overwrite the new lifecycle state.
    previous?.dispose();

    if (reconnecting) {
      this.emit({ kind: "status", payload: { status: "reconnecting" } });
    }

    const isCurrent = () => !this.disposed && generation === this.connectorGeneration;
    const emitCurrent = (event: ConnectorEventPayload) => {
      if (isCurrent()) this.emit(event);
    };
    const connector = this.options.createConnector({
      onStatus: (status, detail) => {
        const nextStatus =
          reconnecting && (status === "starting-server" || status === "connecting")
            ? "reconnecting"
            : (status as ConnectorStatusPayload["status"]);
        const connectionKind = connector.connectionKind as
          | "owned-local"
          | "existing-environment"
          | undefined;
        emitCurrent({
          kind: "status",
          payload: {
            status: nextStatus,
            ...(detail === undefined ? {} : { detail }),
            ...(connectionKind === undefined ? {} : { connectionKind }),
            ...(typeof connector.pathsResolveLocally === "boolean"
              ? { pathsResolveLocally: connector.pathsResolveLocally }
              : {}),
          },
        });
      },
      onConfig: (config) =>
        emitCurrent({ kind: "config", payload: encodeConnectorServerConfig(config) }),
      onAccess: (access) => emitCurrent({ kind: "access", payload: access }),
      onShell: (payload) => emitCurrent({ kind: "shell", payload }),
      onThread: (threadId, payload) => emitCurrent({ kind: "thread", threadId, payload }),
      onTerminal: (threadId, terminalId, payload) =>
        emitCurrent({ kind: "terminal", threadId, terminalId, payload }),
      onLog: (line) => {
        if (!isCurrent()) return;
        this.options.onLog?.(line);
        this.emit({ kind: "log", payload: line });
      },
    });
    this.connector = connector;
    const connect = connector.connect().catch((error: unknown) => {
      if (isCurrent() && this.status.status !== "error") {
        this.emit({
          kind: "status",
          payload: {
            status: "error",
            detail: error instanceof Error ? error.message : String(error),
          },
        });
      }
      throw error;
    });
    this.connectPromise = connect;
    return connect;
  }

  private emit(event: ConnectorEventPayload): void {
    if (this.disposed) return;
    switch (event.kind) {
      case "status":
        this.status = event.payload;
        break;
      case "config":
        this.config = event.payload;
        break;
      case "access":
        this.access = event.payload;
        break;
      case "shell":
        this.shell = event.payload;
        break;
      case "thread":
        this.threads[event.threadId] = event.payload;
        break;
      case "terminal":
        this.terminals[`${event.threadId}\u0000${event.terminalId}`] = event.payload;
        break;
      case "log":
        break;
    }
    this.seq += 1;
    const envelope: ConnectorEventEnvelope = { ...event, seq: this.seq };
    const delivered = this.options.window.sendGlobalEvent(T3_CONNECTOR_EVENT, envelope);
    if (!delivered) {
      this.options.onLog?.(
        `[main-connector] event seq=${envelope.seq} kind=${event.kind} was not delivered to the renderer`,
      );
    }
  }

  /** Tear down handlers and connector-owned processes/ports. Idempotent. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.connectorGeneration += 1;
    for (const method of Object.values(T3_CONNECTOR_METHODS)) {
      this.options.removeHandler?.(method);
    }
    this.connector?.dispose();
    this.connector = undefined;
  }
}
