import type { ClientUiCapabilities } from "@t3tools/client-runtime/platform";

const memory = new Map<string, string>();

const fallbackStorage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memory.set(key, value);
  },
  removeItem: (key: string) => {
    memory.delete(key);
  },
};

export const clientCapabilities: ClientUiCapabilities = {
  storage: typeof window === "undefined" ? fallbackStorage : window.localStorage,
  clipboard: {
    available: () => Boolean(globalThis.navigator?.clipboard?.writeText),
    writeText: async (value) => {
      if (!globalThis.navigator?.clipboard?.writeText) {
        throw new Error("Clipboard is unavailable");
      }
      await navigator.clipboard.writeText(value);
    },
  },
  connectivity: {
    isOnline: () => globalThis.navigator?.onLine ?? true,
  },
  keyboard: {
    available: typeof window !== "undefined",
    subscribe: (listener) => {
      if (typeof window === "undefined") return () => {};
      const onKeyDown = (event: KeyboardEvent) => listener(event.key);
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    },
  },
  mediaQuery: {
    matches: (query) => globalThis.matchMedia?.(query).matches ?? false,
    getViewport: () => ({
      width: typeof window === "undefined" ? 1280 : window.innerWidth,
      height: typeof window === "undefined" ? 820 : window.innerHeight,
      pointer: globalThis.matchMedia?.("(pointer: coarse)").matches ? "coarse" : "fine",
    }),
    subscribe: (query, listener) => {
      if (!globalThis.matchMedia) return () => {};
      const mediaQuery = globalThis.matchMedia(query);
      mediaQuery.addEventListener("change", listener);
      return () => mediaQuery.removeEventListener("change", listener);
    },
    subscribeViewport: (listener) => {
      if (typeof window === "undefined") return () => {};
      window.addEventListener("resize", listener);
      return () => window.removeEventListener("resize", listener);
    },
  },
  navigation: {
    canOpenExternal: () => typeof window !== "undefined",
    canOpenPath: () => false,
    openExternal: async (url) => {
      if (typeof window === "undefined") throw new Error("External navigation is unavailable");
      window.open(url, "_blank", "noopener,noreferrer");
    },
    openPath: async () => {
      throw new Error("Native path navigation is unavailable");
    },
  },
};
