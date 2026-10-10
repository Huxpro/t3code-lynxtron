/**
 * Main-side host of the server connection.
 *
 * Owns the T3Connector lifecycle inside the Lynxtron main process and tells
 * the renderer about it:
 *   - `ready` / `resync` return the current status plus the latest monotonic
 *     sequence,
 *   - `primaryConnection` returns the address and bearer of the server, which
 *     the renderer connects to itself,
 *   - `command` takes `reconnect`, which replaces the connector and with it
 *     the server it owns,
 *   - every status change and log line is pushed to the renderer as a
 *     sequenced `sendGlobalEvent` envelope.
 *
 * The class is deliberately free of Lynxtron/runtime imports: the window,
 * handler registry, and connector factory are injected so focused tests can
 * drive it without the Lynxtron binary. The wiring that binds it to
 * `lynxBridge` and the prebuilt connector bundle lives in `main.ts`.
 */
import {
  T3_CONNECTOR_EVENT,
  T3_CONNECTOR_METHODS,
  type ConnectorCommandRequest,
  type ConnectorEventEnvelope,
  type ConnectorEventPayload,
  type ConnectorStatusPayload,
  type ConnectorSyncReply,
} from "../../shared/connectorProtocol.ts";

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
  readonly connectionKind?: "owned-local" | "existing-environment" | undefined;
  readonly pathsResolveLocally?: boolean | undefined;
  /** The server's address and bearer, or null before there is one. */
  primaryConnection?(): unknown;
  dispose(): void;
}

export interface ConnectorEventCallbacks {
  onStatus: (status: string, detail?: string) => void;
  onLog: (line: string) => void;
}

export interface MainConnectorHostOptions {
  readonly window: MainConnectorWindow;
  readonly registerHandler: (method: string, handler: MainConnectorHandler) => void;
  readonly removeHandler?: (method: string) => void;
  readonly createConnector: (events: ConnectorEventCallbacks) => ConnectorLike;
  readonly onLog?: (line: string) => void;
}

/** What the main process pushes: its status and its log. */
type MainConnectorEvent = Extract<ConnectorEventPayload, { readonly kind: "status" | "log" }>;

/** The address a ready connector reached, as the status payload carries it. */
function readyServerAddress(connector: ConnectorLike): { readonly httpBaseUrl?: string } {
  const connection = connector.primaryConnection?.() ?? null;
  const httpBaseUrl =
    typeof connection === "object" && connection !== null && "httpBaseUrl" in connection
      ? connection.httpBaseUrl
      : undefined;
  return typeof httpBaseUrl === "string" ? { httpBaseUrl } : {};
}

export class MainConnectorHost {
  private readonly options: MainConnectorHostOptions;
  private connector: ConnectorLike | undefined;
  private connectPromise: Promise<unknown> | undefined;
  private reconnectPromise: Promise<unknown> | undefined;
  private connectorGeneration = 0;
  private disposed = false;
  private seq = 0;
  private status: ConnectorStatusPayload = { status: "idle" };

  constructor(options: MainConnectorHostOptions) {
    this.options = options;
  }

  /** Register the typed renderer->main handlers. Idempotent. */
  attach(): void {
    const { registerHandler } = this.options;
    registerHandler(T3_CONNECTOR_METHODS.ready, () => this.syncReply());
    registerHandler(T3_CONNECTOR_METHODS.resync, () => this.syncReply());
    registerHandler(T3_CONNECTOR_METHODS.command, (params) => this.handleCommand(params));
    registerHandler(
      T3_CONNECTOR_METHODS.primaryConnection,
      () => this.connector?.primaryConnection?.() ?? null,
    );
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
    return { seq: this.seq, snapshot: { status: this.status } };
  }

  /** The one command the main process takes: restarting the connection. */
  private handleCommand(params: unknown): Promise<unknown> {
    if (this.disposed) {
      return Promise.reject(new Error("connector host is disposed"));
    }
    const method = (params as Partial<ConnectorCommandRequest> | null | undefined)?.method;
    if (method !== "reconnect") {
      return Promise.reject(new Error(`Rejected connector command: ${String(method)}`));
    }
    return this.reconnect();
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
    const connector = this.options.createConnector({
      onStatus: (status, detail) => {
        if (!isCurrent()) return;
        const nextStatus =
          reconnecting && (status === "starting-server" || status === "connecting")
            ? "reconnecting"
            : (status as ConnectorStatusPayload["status"]);
        const { connectionKind, pathsResolveLocally } = connector;
        this.emit({
          kind: "status",
          payload: {
            status: nextStatus,
            ...(detail === undefined ? {} : { detail }),
            ...(connectionKind === undefined ? {} : { connectionKind }),
            ...(pathsResolveLocally === undefined ? {} : { pathsResolveLocally }),
            ...(nextStatus === "ready" ? readyServerAddress(connector) : {}),
          },
        });
      },
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

  private emit(event: MainConnectorEvent): void {
    if (this.disposed) return;
    if (event.kind === "status") this.status = event.payload;
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
