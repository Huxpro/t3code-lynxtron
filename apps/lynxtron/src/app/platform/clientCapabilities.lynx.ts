import type { ClientUiCapabilities } from "@t3tools/client-runtime/platform";

import { T3_HOST_METHODS, isHostReply } from "../../shared/hostProtocol";
import { appAtomRegistry } from "../state/atomRegistry";
import { connectionStatusAtom } from "../state/connectionStatus";
import { callBridge, type BridgeCallModule } from "../state/mainConnectorTransport";

interface PlatformBridge {
  getPrefs?: () => Record<string, unknown>;
  setPrefs?: (patch: Record<string, unknown>) => Record<string, unknown>;
}

declare const NativeModules: {
  nodejs?: { exposed?: PlatformBridge };
  bridge?: BridgeCallModule;
} & Record<string, unknown>;

function mainBridge(): BridgeCallModule | undefined {
  "background only";
  try {
    const bridge = NativeModules?.bridge;
    return typeof bridge?.call === "function" ? bridge : undefined;
  } catch {
    return undefined;
  }
}

// Clipboard and navigation run in main (see shared/hostProtocol.ts).
async function callHost(method: string, params: Record<string, unknown>): Promise<void> {
  "background only";
  const bridge = mainBridge();
  if (!bridge) throw new Error("The Lynxtron host is unavailable");
  const reply = await callBridge(bridge, method, params);
  if (!isHostReply(reply)) throw new Error(`Unexpected reply from ${method}`);
  if (reply.error) throw new Error(reply.error);
}

function bridge(): PlatformBridge | undefined {
  "background only";
  try {
    return NativeModules?.nodejs?.exposed;
  } catch {
    return undefined;
  }
}

const storage = {
  getItem(key: string): string | null {
    "background only";
    const value = bridge()?.getPrefs?.()[key];
    return value === undefined ? null : JSON.stringify(value);
  },
  setItem(key: string, value: string): void {
    "background only";
    bridge()?.setPrefs?.({ [key]: JSON.parse(value) });
  },
  removeItem(key: string): void {
    "background only";
    bridge()?.setPrefs?.({ [key]: null });
  },
};

export const clientCapabilities: ClientUiCapabilities = {
  storage,
  clipboard: {
    available: () => {
      "background only";
      return mainBridge() !== undefined;
    },
    writeText: (value) => callHost(T3_HOST_METHODS.writeClipboardText, { text: value }),
  },
  connectivity: {
    isOnline: () => {
      "background only";
      // Backed by the main-owned connector status stream (AR2); the preload
      // no longer exposes connector state.
      return appAtomRegistry.get(connectionStatusAtom) !== "error";
    },
  },
  keyboard: {
    // R5: Lynxtron 0.0.5 has no renderer keyboard event API.
    available: false,
    subscribe: () => () => {},
  },
  mediaQuery: {
    // Lynxtron currently targets a fixed desktop window.
    matches: (query) => !query.includes("max-width"),
  },
  navigation: {
    canOpenExternal: () => {
      "background only";
      return mainBridge() !== undefined;
    },
    canOpenPath: () => {
      "background only";
      return mainBridge() !== undefined;
    },
    openExternal: (url) => callHost(T3_HOST_METHODS.openExternal, { url }),
    openPath: (path) => callHost(T3_HOST_METHODS.openPath, { path }),
  },
};
