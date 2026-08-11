import {
  T3_THEME_EVENT,
  T3_THEME_READY_METHOD,
  isLynxtronThemeSnapshot,
  type LynxtronThemeSnapshot,
} from "../../shared/themeProtocol.ts";
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

let snapshot: LynxtronThemeSnapshot = {
  theme: "dark",
  sequence: 0,
};
let started = false;
let startup: Promise<void> | undefined;
const listeners = new Set<() => void>();

export function applySystemThemeSnapshot(input: unknown): boolean {
  if (!isLynxtronThemeSnapshot(input) || input.sequence < snapshot.sequence) return false;
  if (input.sequence === snapshot.sequence && input.theme === snapshot.theme) return false;
  snapshot = input;
  for (const listener of listeners) listener();
  return true;
}

export function getSystemThemeSnapshot(): LynxtronThemeSnapshot {
  return snapshot;
}

export function subscribeSystemTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function startSystemThemeStore(): Promise<void> {
  "background only";
  if (startup) return startup;
  startup = Promise.resolve();
  if (started) return startup;
  started = true;

  let registry: GlobalEventListenerRegistry | undefined;
  try {
    registry = typeof lynx !== "undefined" ? lynx.getJSModule?.("GlobalEventEmitter") : undefined;
  } catch {
    registry = undefined;
  }
  registry?.addListener(T3_THEME_EVENT, applySystemThemeSnapshot);

  const bridge = NativeModules?.bridge;
  if (!bridge) return startup;
  startup = callBridge(bridge, T3_THEME_READY_METHOD, {}).then(
    (value) => {
      applySystemThemeSnapshot(value);
    },
    (error) => {
      console.log(`[theme] ready probe failed: ${String(error)}`);
    },
  );
  return startup;
}
