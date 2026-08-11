// Lynx-safe navigation authority.
//
// ReactLynx cannot mount TanStack RouterProvider without triggering the R4
// background-snapshot crash. The renderer therefore owns one synchronous
// pathname Atom and renders it through the plain switch in index.tsx. Web
// continues to use TanStack Router unchanged through lib/router.ts.
import { useAtomValue } from "@effect/atom-react";
import { Atom } from "effect/unstable/reactivity";

import type { SettingsSectionPath } from "../../../web/src/components/settings/SettingsNavigationContent.logic";
import { appAtomRegistry } from "./state/atomRegistry";

export type LynxSettingsPath = "/settings" | SettingsSectionPath;

export function normalizeLynxPathname(to: string): string {
  if (to === "/settings" || to === "/settings/") return "/settings/general";
  // Older Lynx captures used the singular path. Keep it as an input alias,
  // while the shared Settings navigation owns the canonical plural route.
  if (to === "/settings/archive") return "/settings/archived";
  return to;
}

const pathnameAtom = Atom.make(normalizeLynxPathname("/")).pipe(
  Atom.withLabel("lynx-router-pathname"),
);

export function navigate(to: string, _opts?: { replace?: boolean }): void {
  const next = normalizeLynxPathname(to);
  if (appAtomRegistry.get(pathnameAtom) !== next) {
    appAtomRegistry.set(pathnameAtom, next);
  }
}

function installDevToolNavigation(): void {
  "background only";
  (
    globalThis as typeof globalThis & {
      __T3_LYNXTRON_NAVIGATE__?: (to: string) => void;
      __T3_LYNXTRON_ROUTE__?: () => string;
    }
  ).__T3_LYNXTRON_NAVIGATE__ = (to) => {
    if (to === "/" || to === "/settings" || to.indexOf("/settings/") === 0) {
      navigate(to);
    }
  };
  (
    globalThis as typeof globalThis & {
      __T3_LYNXTRON_ROUTE__?: () => string;
    }
  ).__T3_LYNXTRON_ROUTE__ = getPathname;
}

// Deterministic DevTool capture navigation writes through the same authority
// as product taps. The companion route hook is read-only.
installDevToolNavigation();

export function getPathname(): string {
  return appAtomRegistry.get(pathnameAtom);
}

export function usePathname(): string {
  return useAtomValue(pathnameAtom);
}
