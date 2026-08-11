import { useCallback, useSyncExternalStore } from "@lynx-js/react";
import {
  matchesViewportMediaQuery,
  normalizeMediaQuery,
  type MediaQueryInput,
  type ResponsiveBreakpointQuery,
} from "@t3tools/client-runtime/platform";

import { clientCapabilities } from "../platform/clientCapabilities";

export type { MediaQueryInput };

function getServerSnapshot(): boolean {
  return false;
}

export function useMediaQuery(
  query: ResponsiveBreakpointQuery | MediaQueryInput | (string & {}),
): boolean {
  const normalized = normalizeMediaQuery(query);
  const subscribe = useCallback(
    (listener: () => void) => clientCapabilities.mediaQuery.subscribe(normalized, listener),
    [normalized],
  );
  const getSnapshot = useCallback(
    () =>
      clientCapabilities.mediaQuery.matches(normalized) ||
      matchesViewportMediaQuery(clientCapabilities.mediaQuery.getViewport(), normalized),
    [normalized],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useIsMobile(): boolean {
  return useMediaQuery("max-md");
}
