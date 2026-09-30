// Lynx-safe navigation layer on top of TanStack Router core.
//
// Why not <RouterProvider>? On ReactLynx, RouterProvider's async load
// transition remounts the matched tree right after the initial commit, which
// crashes the BTS→main snapshot pipeline ("BackgroundSnapshot not found") and
// leaves the main thread painting a stale frame forever (verified 2026-07-26:
// components unmounted, never re-mounted, screen frozen at initial state).
//
// We still reuse TanStack Router core for what it's good at: memory history,
// path matching, navigation semantics, redirects (e.g. /settings ->
// /settings/general). Rendering is done by a plain pathname switch in
// index.tsx, which ReactLynx updates reliably.
import { useAtomValue } from "@effect/atom-react";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { Atom } from "effect/unstable/reactivity";

import { routeTree } from "./routeTree.gen";
import { appAtomRegistry } from "./state/atomRegistry";

const memoryHistory = createMemoryHistory({
  initialEntries: ["/"],
});

export const router = createRouter({
  routeTree,
  history: memoryHistory,
  isServer: false,
});

// Load the router core once so router.navigate() resolves (without a
// RouterProvider, nothing else triggers the initial load; a navigate() call
// on an unloaded router never settles — observed as "tap does nothing").
void router.load().catch(() => {});

// --- pathname subscription (temporary R4 module-level host adapter) ---

const pathnameAtom = Atom.make(memoryHistory.location?.pathname ?? "/").pipe(
  Atom.withLabel("lynx-router-pathname"),
);

function setPathname(next: string) {
  if (next !== appAtomRegistry.get(pathnameAtom)) {
    appAtomRegistry.set(pathnameAtom, next);
  }
}

function syncPathname() {
  setPathname(router.state.location.pathname);
}

// history.subscribe covers push/replace; router.subscribe('onResolved')
// covers redirects resolved by route loaders. History is the source of truth
// for a push: router.state still holds the previous location until its load
// resolves, and syncing from it would bounce a fresh navigation back.
memoryHistory.subscribe(() => {
  setPathname(memoryHistory.location.pathname);
});
router.subscribe("onResolved", syncPathname);

export function navigate(to: string, opts?: { replace?: boolean }): void {
  // Drive the UI switch synchronously — router core navigation can hang or
  // throw (observed for "/" with a pathless layout route), and taps must
  // never be lost. The router core is still notified best-effort afterwards
  // to keep history/redirect semantics in sync.
  if (appAtomRegistry.get(pathnameAtom) !== to) {
    appAtomRegistry.set(pathnameAtom, to);
  }
  try {
    void router
      .navigate({ to, replace: opts?.replace ?? false })
      .then(syncPathname)
      .catch(() => {});
  } catch {
    /* router core rejected the location — the local switch already happened */
  }
}

function installDevToolNavigation(): void {
  "background only";
  (
    globalThis as typeof globalThis & {
      __T3_LYNXTRON_NAVIGATE__?: (to: string) => void;
    }
  ).__T3_LYNXTRON_NAVIGATE__ = (to) => {
    if (to === "/" || to === "/settings" || to.indexOf("/settings/") === 0) {
      appAtomRegistry.set(pathnameAtom, to);
    }
  };
}

// Deterministic DevTool capture navigation. This does not alter normal startup
// or expose host capabilities; it only drives the same in-renderer router used
// by sidebar taps.
installDevToolNavigation();

export function getPathname(): string {
  return appAtomRegistry.get(pathnameAtom);
}

export function usePathname(): string {
  return useAtomValue(pathnameAtom);
}
