import {
  matchesViewportMediaQuery,
  type ClientUiCapabilities,
  type ViewportSnapshot,
} from "@t3tools/client-runtime/platform";

import { appAtomRegistry } from "../state/atomRegistry";
import { connectionStatusAtom } from "../state/connectionStatus";

interface PlatformBridge {
  getPrefs?: () => Record<string, unknown>;
  setPrefs?: (patch: Record<string, unknown>) => Record<string, unknown>;
  getViewport?: () => ViewportSnapshot;
  writeClipboardText?: (value: string) => void;
  openExternal?: (url: string) => Promise<void>;
  openPath?: (path: string) => Promise<void>;
}

declare const NativeModules: {
  nodejs?: { exposed?: PlatformBridge };
} & Record<string, unknown>;

function bridge(): PlatformBridge | undefined {
  "background only";
  try {
    return NativeModules?.nodejs?.exposed;
  } catch {
    return undefined;
  }
}

export function isClientStorageAvailable(): boolean {
  "background only";
  const target = bridge();
  return Boolean(target?.getPrefs && target.setPrefs);
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
const FALLBACK_VIEWPORT: ViewportSnapshot = { width: 1280, height: 820, pointer: "fine" };

function getViewport(): ViewportSnapshot {
  "background only";
  return bridge()?.getViewport?.() ?? FALLBACK_VIEWPORT;
}

export const clientCapabilities: ClientUiCapabilities = {
  storage,
  clipboard: {
    available: () => {
      "background only";
      return Boolean(bridge()?.writeClipboardText);
    },
    writeText: async (value) => {
      "background only";
      const target = bridge();
      if (!target?.writeClipboardText) throw new Error("Clipboard is unavailable");
      target.writeClipboardText(value);
    },
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
    // Lynxtron exposes an explicit launch viewport. Runtime resize events are
    // not available yet, so subscriptions are intentionally inert until the
    // host can publish a measured viewport update.
    matches: (query) => matchesViewportMediaQuery(getViewport(), query),
    getViewport,
    subscribe: () => () => {},
    subscribeViewport: () => () => {},
  },
  navigation: {
    canOpenExternal: () => {
      "background only";
      return Boolean(bridge()?.openExternal);
    },
    canOpenPath: () => {
      "background only";
      return Boolean(bridge()?.openPath);
    },
    openExternal: async (url) => {
      "background only";
      const target = bridge();
      if (!target?.openExternal) throw new Error("External navigation is unavailable");
      await target.openExternal(url);
    },
    openPath: async (path) => {
      "background only";
      const target = bridge();
      if (!target?.openPath) throw new Error("Native path navigation is unavailable");
      await target.openPath(path);
    },
  },
};
