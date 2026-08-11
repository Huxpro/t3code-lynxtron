import {
  matchesViewportMediaQuery,
  type ClientUiCapabilities,
} from "@t3tools/client-runtime/platform";

import { appAtomRegistry } from "../state/atomRegistry";
import { connectionStatusAtom } from "../state/connectionStatus";
import { getViewportSnapshot, subscribeViewport } from "../state/viewportStore";

interface PlatformBridge {
  getPrefs?: () => Record<string, unknown>;
  setPrefs?: (patch: Record<string, unknown>) => Record<string, unknown>;
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
    matches: (query) => matchesViewportMediaQuery(getViewportSnapshot(), query),
    getViewport: getViewportSnapshot,
    subscribe: (_query, listener) => subscribeViewport(listener),
    subscribeViewport,
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
