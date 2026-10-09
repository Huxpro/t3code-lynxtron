import {
  T3_RELOAD_FOR_TEST_METHOD,
  T3_VIEWPORT_EVENT,
  T3_VIEWPORT_READY_METHOD,
  T3_VIEWPORT_SET_FOR_TEST_METHOD,
  isLynxtronViewportSnapshot,
  type LynxtronViewportSnapshot,
} from "../../shared/viewportProtocol.ts";
import type { BridgeCallModule, GlobalEventListenerRegistry } from "./mainConnectorTransport.ts";
import { callBridge } from "./mainConnectorTransport.ts";

declare const NativeModules:
  | {
      bridge?: BridgeCallModule;
    }
  | undefined;

declare const lynx:
  | {
      getJSModule?: (name: string) => GlobalEventListenerRegistry | undefined;
    }
  | undefined;

const DEFAULT_VIEWPORT: LynxtronViewportSnapshot = {
  width: 1180,
  height: 748,
  pointer: "fine",
  sequence: 0,
};

let snapshot = DEFAULT_VIEWPORT;
let started = false;
const listeners = new Set<() => void>();

interface ViewportTestProbeTarget {
  __T3_LYNXTRON_VIEWPORT_PROBE__?: (width: number, height: number) => Promise<unknown>;
  __T3_LYNXTRON_RELOAD_PROBE__?: () => Promise<unknown>;
}

function emit(): void {
  for (const listener of listeners) listener();
}

export function applyViewportSnapshot(input: unknown): boolean {
  if (!isLynxtronViewportSnapshot(input) || input.sequence < snapshot.sequence) return false;
  if (
    input.sequence === snapshot.sequence &&
    input.width === snapshot.width &&
    input.height === snapshot.height
  ) {
    return false;
  }
  snapshot = input;
  installViewportProbe();
  emit();
  return true;
}

function installViewportProbe(): void {
  const bridge = typeof NativeModules === "undefined" ? undefined : NativeModules?.bridge;
  installViewportTestProbes(
    bridge,
    snapshot.testResize === true,
    globalThis as ViewportTestProbeTarget,
  );
}

export function installViewportTestProbes(
  bridge: BridgeCallModule | undefined,
  enabled: boolean,
  target: ViewportTestProbeTarget,
): void {
  if (!enabled || !bridge) {
    delete target.__T3_LYNXTRON_VIEWPORT_PROBE__;
    delete target.__T3_LYNXTRON_RELOAD_PROBE__;
    return;
  }
  target.__T3_LYNXTRON_VIEWPORT_PROBE__ = (width, height) =>
    callBridge(bridge, T3_VIEWPORT_SET_FOR_TEST_METHOD, { width, height });
  target.__T3_LYNXTRON_RELOAD_PROBE__ = () => callBridge(bridge, T3_RELOAD_FOR_TEST_METHOD, {});
}

export function getViewportSnapshot(): LynxtronViewportSnapshot {
  return snapshot;
}

export function subscribeViewport(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function startViewportStore(): void {
  "background only";
  if (started) return;
  started = true;

  let registry: GlobalEventListenerRegistry | undefined;
  try {
    registry = typeof lynx !== "undefined" ? lynx.getJSModule?.("GlobalEventEmitter") : undefined;
  } catch {
    registry = undefined;
  }
  registry?.addListener(T3_VIEWPORT_EVENT, (value: unknown) => {
    applyViewportSnapshot(value);
  });

  const bridge = NativeModules?.bridge;
  if (!bridge) return;
  void callBridge(bridge, T3_VIEWPORT_READY_METHOD, {}).then(applyViewportSnapshot, (error) => {
    console.log(`[viewport] ready probe failed: ${String(error)}`);
  });
}
