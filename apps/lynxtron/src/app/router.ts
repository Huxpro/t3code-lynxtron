// Lynx-safe single-authority navigation.
//
// ReactLynx renders from this pathname Atom directly. RouterProvider cannot
// own the renderer because its async remount loses the BTS snapshot, so a
// second memory-history writer here would only create route flash-back.
import { useAtomValue } from "@effect/atom-react";
import { Atom } from "effect/unstable/reactivity";

import { appAtomRegistry } from "./state/atomRegistry";

const SETTINGS_SECTIONS = new Set([
  "archive",
  "archived",
  "beta",
  "connections",
  "diagnostics",
  "general",
  "keybindings",
  "providers",
  "source-control",
]);

export function normalizeLynxPathname(to: string): string {
  if (to === "/settings" || to === "/settings/") return "/settings/general";
  if (to === "/") return "/";
  if (to.startsWith("/settings/")) {
    const section = to.slice("/settings/".length).split("/")[0];
    return SETTINGS_SECTIONS.has(section) ? "/settings/" + section : "/settings/general";
  }
  if (/^\/[^/]+\/[^/]+$/u.test(to)) return to;
  return "/";
}

const pathnameAtom = Atom.make("/").pipe(Atom.withLabel("lynx-router-pathname"));

export function navigate(to: string, _opts?: { replace?: boolean }): void {
  const normalized = normalizeLynxPathname(to);
  if (appAtomRegistry.get(pathnameAtom) !== normalized) {
    appAtomRegistry.set(pathnameAtom, normalized);
  }
}

function installDevToolNavigation(): void {
  "background only";
  const target = globalThis as typeof globalThis & {
    __T3_LYNXTRON_NAVIGATE__?: (to: string) => void;
    __T3_LYNXTRON_ROUTE__?: () => string;
  };
  target.__T3_LYNXTRON_NAVIGATE__ = navigate;
  target.__T3_LYNXTRON_ROUTE__ = getPathname;
}

installDevToolNavigation();

export function getPathname(): string {
  return appAtomRegistry.get(pathnameAtom);
}

export function usePathname(): string {
  return useAtomValue(pathnameAtom);
}
