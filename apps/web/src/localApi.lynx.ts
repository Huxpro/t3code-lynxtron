import type { LocalApi } from "@t3tools/contracts";

function unavailable(): never {
  throw new Error("The Web LocalApi is not available in the Lynx host.");
}

/**
 * Lynx host boundary for Electron/Web-only dialogs and native context menus.
 * The shared Sidebar treats an absent API as a supported no-op path.
 */
export function readLocalApi(): LocalApi | undefined {
  return undefined;
}

export function createLocalApi(): LocalApi {
  return unavailable();
}

export function ensureLocalApi(): LocalApi {
  return unavailable();
}

export async function __resetLocalApiForTests(): Promise<void> {}
