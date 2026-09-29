/**
 * Renderer side of the main-owned connector transport (AR1 spike).
 *
 * Probes the typed `lynxBridge` request path once at startup; when main
 * answers, connector state flows as pushed sequenced events fed into the same
 * Effect Atom application functions the polling path uses. When the probe
 * fails the caller falls back to the established preload polling path, which
 * remains the default transport.
 *
 * The only timer here is a one-shot guard around the readiness probe so a
 * missing main handler cannot hang startup; there is no polling loop.
 */
import {
  T3_CONNECTOR_EVENT,
  T3_CONNECTOR_METHODS,
  classifyConnectorSequence,
  isConnectorEventEnvelope,
  isConnectorSyncReply,
  type ConnectorCommandName,
  type ConnectorEventEnvelope,
  type ConnectorSnapshot,
} from "../../shared/connectorProtocol.ts";

export interface BridgeCallModule {
  call(name: string, params: Record<string, unknown>, cb: (...args: unknown[]) => void): unknown;
}

export interface GlobalEventListenerRegistry {
  addListener(eventName: string, listener: (...args: unknown[]) => void, context?: unknown): void;
  removeListener?(
    eventName: string,
    listener: (...args: unknown[]) => void,
    context?: unknown,
  ): void;
}

export interface MainConnectorTransportOptions {
  readonly bridge: BridgeCallModule | undefined;
  readonly eventRegistry: GlobalEventListenerRegistry | undefined;
  readonly applySnapshot: (snapshot: ConnectorSnapshot) => void;
  readonly applyEvent: (event: ConnectorEventEnvelope) => void;
  readonly onLog?: (line: string) => void;
  /** One-shot readiness-probe guard; not a transport timer. */
  readonly readyTimeoutMs?: number;
}

export interface MainConnectorTransport {
  readonly kind: "main";
  readonly lastSeq: number;
  invoke(method: ConnectorCommandName, params?: unknown): Promise<unknown>;
  reconnect(): Promise<void>;
  /** Force a full resync; used by tests and the DevTool hook. */
  resync(): Promise<void>;
  dispose(): void;
}

const DEFAULT_READY_TIMEOUT_MS = 3_000;

function callBridge(
  bridge: BridgeCallModule,
  method: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (value: unknown) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    try {
      const returned = bridge.call(method, params, (...args: unknown[]) => {
        settle(args.length <= 1 ? args[0] : args[args.length - 1]);
      });
      if (
        returned !== null &&
        (typeof returned === "object" || typeof returned === "function") &&
        typeof (returned as { then?: unknown }).then === "function"
      ) {
        (returned as Promise<unknown>).then(settle, reject);
      }
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

/**
 * Start the push transport when main owns the connector. Returns `null` when
 * the typed bridge is unavailable or main did not answer the readiness probe
 * with a well-formed sync reply.
 */
export async function startMainConnectorTransport(
  options: MainConnectorTransportOptions,
): Promise<MainConnectorTransport | null> {
  const { bridge, eventRegistry } = options;
  if (!bridge || typeof bridge.call !== "function") return null;
  if (!eventRegistry || typeof eventRegistry.addListener !== "function") return null;
  const bridgeModule = bridge;
  const registry = eventRegistry;

  const log = (line: string) => options.onLog?.(line);
  let lastSeq = 0;
  let resyncInFlight = false;
  let disposed = false;
  let bootstrapping = true;
  const bufferedEvents: ConnectorEventEnvelope[] = [];
  let resolveBootstrap: ((ready: boolean) => void) | undefined;

  const invoke = (method: ConnectorCommandName, params?: unknown): Promise<unknown> =>
    callBridge(bridgeModule, T3_CONNECTOR_METHODS.command, {
      method,
      ...(params === undefined ? {} : { params: params as Record<string, unknown> }),
    } as Record<string, unknown>);

  async function requestSync(method: string): Promise<boolean> {
    try {
      const reply = await callBridge(bridgeModule, method, { lastSeq });
      if (!isConnectorSyncReply(reply)) {
        log(`[main-transport] ${method} returned a malformed sync reply`);
        return false;
      }
      if (reply.seq >= lastSeq) {
        options.applySnapshot(reply.snapshot);
        lastSeq = reply.seq;
      }
      return true;
    } catch (error) {
      log(
        `[main-transport] ${method} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  async function resync(): Promise<void> {
    if (resyncInFlight || disposed) return;
    resyncInFlight = true;
    try {
      await requestSync(T3_CONNECTOR_METHODS.resync);
    } finally {
      resyncInFlight = false;
    }
  }

  const listener = (...args: unknown[]) => {
    if (disposed) return;
    const envelope = args[0];
    if (!isConnectorEventEnvelope(envelope)) return;
    if (envelope.kind === "snapshot") {
      if (envelope.seq < lastSeq) return;
      options.applySnapshot(envelope.payload);
      lastSeq = envelope.seq;
      bootstrapping = false;
      resolveBootstrap?.(true);
      resolveBootstrap = undefined;
      return;
    }
    if (bootstrapping) {
      bufferedEvents.push(envelope);
      return;
    }
    const disposition = classifyConnectorSequence(lastSeq, envelope.seq);
    if (disposition === "duplicate") return;
    if (disposition === "gap") {
      log(`[main-transport] sequence gap at seq=${envelope.seq} (last=${lastSeq}); resyncing`);
      void resync();
      return;
    }
    lastSeq = envelope.seq;
    options.applyEvent(envelope);
  };

  registry.addListener(T3_CONNECTOR_EVENT, listener);
  const readyTimeoutMs = options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const readyPromise = new Promise<boolean>((resolve) => {
    resolveBootstrap = resolve;
    timeout = setTimeout(() => resolve(false), readyTimeoutMs);
  });
  // The Lynxtron callback reply path can fail independently from one-way
  // invokes. Startup therefore depends only on the sequenced snapshot push.
  bridgeModule.call(T3_CONNECTOR_METHODS.subscribe, { lastSeq }, () => {});
  const ready = await readyPromise;
  clearTimeout(timeout);
  if (!ready) {
    registry.removeListener?.(T3_CONNECTOR_EVENT, listener);
    return null;
  }
  bootstrapping = false;
  bufferedEvents.sort((left, right) => left.seq - right.seq);
  for (const envelope of bufferedEvents) listener(envelope);
  bufferedEvents.length = 0;
  log(`[main-transport] push transport active at seq=${lastSeq}`);

  return {
    kind: "main",
    get lastSeq() {
      return lastSeq;
    },
    invoke,
    reconnect: async () => {
      const reply = await callBridge(bridgeModule, T3_CONNECTOR_METHODS.reconnect, { lastSeq });
      if (!isConnectorSyncReply(reply)) {
        throw new Error("Main connector reconnect returned a malformed sync reply");
      }
      options.applySnapshot(reply.snapshot);
      lastSeq = reply.seq;
    },
    resync,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      registry.removeListener?.(T3_CONNECTOR_EVENT, listener);
    },
  };
}
