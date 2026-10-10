// A WebSocket for the Lynx thread, backed by the preload's Node socket. It has
// the members Effect's socket layer and upstream's client runtime use, so it
// can be provided wherever they expect the browser constructor.

type HostSocketEventType = "open" | "message" | "close" | "error";

interface HostSocketHandle {
  readonly send: (data: string | Uint8Array) => void;
  readonly close: (code?: number, reason?: string) => void;
}

interface HostSocketModule {
  readonly openSocket?: (
    url: string,
    protocols: string | ReadonlyArray<string> | undefined,
    onEvent: (type: HostSocketEventType, payload?: unknown) => void,
  ) => HostSocketHandle;
}

declare const NativeModules: { readonly nodejs?: { readonly exposed?: HostSocketModule } };

interface HostSocketEvent {
  readonly type: HostSocketEventType;
  readonly data?: string | Uint8Array;
  readonly code?: number;
  readonly reason?: string;
}

type HostSocketListener = (event: HostSocketEvent) => void;

export class HostWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly url: string;
  readyState: number = HostWebSocket.CONNECTING;
  binaryType: "arraybuffer" | "blob" = "arraybuffer";
  private readonly handle: HostSocketHandle | null;
  private readonly listeners = new Map<
    HostSocketEventType,
    Array<{ readonly listener: HostSocketListener; readonly once: boolean }>
  >();

  constructor(url: string | URL, protocols?: string | ReadonlyArray<string>) {
    this.url = String(url);
    const openSocket = NativeModules?.nodejs?.exposed?.openSocket;
    if (typeof openSocket !== "function") {
      this.handle = null;
      this.readyState = HostWebSocket.CLOSED;
      setTimeout(() => {
        this.dispatch({ type: "error" });
        this.dispatch({ type: "close", code: 1006, reason: "The host provides no socket." });
      }, 0);
      return;
    }
    this.handle = openSocket(this.url, protocols, (type, payload) => {
      if (type === "open") {
        this.readyState = HostWebSocket.OPEN;
        this.dispatch({ type });
      } else if (type === "message") {
        this.dispatch({ type, data: payload as string | Uint8Array });
      } else if (type === "close") {
        this.readyState = HostWebSocket.CLOSED;
        const detail = payload as { readonly code?: number; readonly reason?: string } | undefined;
        this.dispatch({ type, code: detail?.code ?? 1006, reason: detail?.reason ?? "" });
      } else {
        this.dispatch({ type });
      }
    });
  }

  addEventListener(
    type: HostSocketEventType,
    listener: HostSocketListener,
    options?: { readonly once?: boolean },
  ): void {
    const entries = this.listeners.get(type) ?? [];
    entries.push({ listener, once: options?.once === true });
    this.listeners.set(type, entries);
  }

  removeEventListener(type: HostSocketEventType, listener: HostSocketListener): void {
    const entries = this.listeners.get(type);
    if (!entries) return;
    this.listeners.set(
      type,
      entries.filter((entry) => entry.listener !== listener),
    );
  }

  send(data: string | Uint8Array): void {
    this.handle?.send(data);
  }

  close(code?: number, reason?: string): void {
    if (this.readyState >= HostWebSocket.CLOSING) return;
    this.readyState = HostWebSocket.CLOSING;
    this.handle?.close(code, reason);
  }

  private dispatch(event: HostSocketEvent): void {
    const entries = this.listeners.get(event.type);
    if (!entries) return;
    this.listeners.set(
      event.type,
      entries.filter((entry) => !entry.once),
    );
    for (const entry of entries) entry.listener(event);
  }
}
