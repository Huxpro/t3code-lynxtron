import { useCallback, useSyncExternalStore } from "react";
import {
  matchesViewportMediaQuery,
  normalizeMediaQuery,
  type MediaQueryInput,
  type ResponsiveBreakpointQuery,
} from "@t3tools/client-runtime/platform";

import { clientCapabilities } from "../platform/clientCapabilities";

function getServerSnapshot(): boolean {
  return false;
}

export type { MediaQueryInput };

export function useMediaQuery(
  query: ResponsiveBreakpointQuery | MediaQueryInput | (string & {}),
): boolean {
  const mediaQuery = normalizeMediaQuery(query);

  const subscribe = useCallback(
    (callback: () => void) => clientCapabilities.mediaQuery.subscribe(mediaQuery, callback),
    [mediaQuery],
  );

  const getSnapshot = useCallback(
    () =>
      clientCapabilities.mediaQuery.matches(mediaQuery) ||
      matchesViewportMediaQuery(clientCapabilities.mediaQuery.getViewport(), mediaQuery),
    [mediaQuery],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useIsMobile(): boolean {
  return useMediaQuery("max-md");
}
