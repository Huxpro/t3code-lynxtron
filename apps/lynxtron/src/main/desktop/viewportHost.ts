import {
  T3_VIEWPORT_EVENT,
  T3_VIEWPORT_READY_METHOD,
  T3_VIEWPORT_SET_FOR_TEST_METHOD,
  type LynxtronViewportSnapshot,
} from "../../shared/viewportProtocol.ts";

export interface ViewportHostWindow {
  getContentSize(): number[];
  setContentSize(width: number, height: number): void;
  on(event: "resize" | "resized" | "closed", listener: () => void): unknown;
  removeListener?(event: "resize" | "resized", listener: () => void): unknown;
  sendGlobalEvent(eventName: string, ...args: unknown[]): boolean;
}

export interface ViewportHostBridge {
  handle(method: string, handler: (params?: unknown) => unknown): void;
  removeHandler(method: string): void;
}

export interface LynxtronViewportHost {
  snapshot(): LynxtronViewportSnapshot;
  dispose(): void;
}

export function startLynxtronViewportHost(
  window: ViewportHostWindow,
  bridge: ViewportHostBridge,
  options: { readonly allowTestResize?: boolean } = {},
): LynxtronViewportHost {
  let sequence = 0;
  let disposed = false;
  let lastWidth = -1;
  let lastHeight = -1;

  const snapshot = (): LynxtronViewportSnapshot => {
    const [width = 0, height = 0] = window.getContentSize();
    return {
      width,
      height,
      pointer: "fine",
      sequence,
      ...(options.allowTestResize ? { testResize: true } : {}),
    };
  };

  const publish = () => {
    if (disposed) return;
    const [width = 0, height = 0] = window.getContentSize();
    if (width === lastWidth && height === lastHeight) return;
    lastWidth = width;
    lastHeight = height;
    sequence += 1;
    window.sendGlobalEvent(T3_VIEWPORT_EVENT, {
      width,
      height,
      pointer: "fine",
      sequence,
      ...(options.allowTestResize ? { testResize: true } : {}),
    } satisfies LynxtronViewportSnapshot);
  };

  bridge.handle(T3_VIEWPORT_READY_METHOD, snapshot);
  if (options.allowTestResize) {
    bridge.handle(T3_VIEWPORT_SET_FOR_TEST_METHOD, (params) => {
      if (typeof params !== "object" || params === null) return false;
      const { width, height } = params as { readonly width?: unknown; readonly height?: unknown };
      if (
        typeof width !== "number" ||
        typeof height !== "number" ||
        !Number.isInteger(width) ||
        !Number.isInteger(height) ||
        width < 320 ||
        height < 320
      ) {
        return false;
      }
      window.setContentSize(width, height);
      return true;
    });
  }
  window.on("resize", publish);
  window.on("resized", publish);

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    bridge.removeHandler(T3_VIEWPORT_READY_METHOD);
    if (options.allowTestResize) bridge.removeHandler(T3_VIEWPORT_SET_FOR_TEST_METHOD);
    window.removeListener?.("resize", publish);
    window.removeListener?.("resized", publish);
  };

  window.on("closed", dispose);
  publish();
  return { snapshot, dispose };
}
