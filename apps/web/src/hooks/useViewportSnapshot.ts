import { useSyncExternalStore } from "react";

import { clientCapabilities } from "../platform/clientCapabilities";

export function useViewportSnapshot() {
  return useSyncExternalStore(
    clientCapabilities.mediaQuery.subscribeViewport,
    clientCapabilities.mediaQuery.getViewport,
    clientCapabilities.mediaQuery.getViewport,
  );
}
