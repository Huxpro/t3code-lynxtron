import type { ClientUiCapabilities } from "@t3tools/client-runtime/platform";

interface PlatformBridge {
  getPrefs?: () => Record<string, unknown>;
  setPrefs?: (patch: Record<string, unknown>) => Record<string, unknown>;
  writeClipboardText?: (value: string) => void;
  openExternal?: (url: string) => Promise<void>;
  openPath?: (path: string) => Promise<void>;
  getStatus?: () => { status: string };
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
      return bridge()?.getStatus?.().status !== "error";
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
