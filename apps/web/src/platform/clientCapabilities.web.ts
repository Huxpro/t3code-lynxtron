import type { ClientUiCapabilities } from "@t3tools/client-runtime/platform";

const memory = new Map<string, string>();
let viewportSnapshot = {
  width: globalThis.innerWidth ?? 0,
  height: globalThis.innerHeight ?? 0,
  pointer: globalThis.matchMedia?.("(pointer: coarse)").matches ? ("coarse" as const) : ("fine" as const),
};

function readViewportSnapshot() {
  const next = {
    width: globalThis.innerWidth ?? 0,
    height: globalThis.innerHeight ?? 0,
    pointer: globalThis.matchMedia?.("(pointer: coarse)").matches
      ? ("coarse" as const)
      : ("fine" as const),
  };
  if (
    next.width !== viewportSnapshot.width ||
    next.height !== viewportSnapshot.height ||
    next.pointer !== viewportSnapshot.pointer
  ) {
    viewportSnapshot = next;
  }
  return viewportSnapshot;
}

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
    getViewport: readViewportSnapshot,
    subscribe: (query, listener) => {
      if (typeof window === "undefined") return () => {};
      const mediaQuery = window.matchMedia(query);
      mediaQuery.addEventListener("change", listener);
      return () => mediaQuery.removeEventListener("change", listener);
    },
    subscribeViewport: (listener) => {
      if (typeof window === "undefined") return () => {};
      const onResize = () => {
        readViewportSnapshot();
        listener();
      };
      const coarsePointer = window.matchMedia("(pointer: coarse)");
      window.addEventListener("resize", onResize);
      coarsePointer.addEventListener("change", onResize);
      return () => {
        window.removeEventListener("resize", onResize);
        coarsePointer.removeEventListener("change", onResize);
      };
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
