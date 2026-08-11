import { useSyncExternalStore } from "@lynx-js/react";

import { clientCapabilities } from "../platform/clientCapabilities";

export function useViewportSnapshot() {
  return useSyncExternalStore(
    clientCapabilities.mediaQuery.subscribeViewport,
    clientCapabilities.mediaQuery.getViewport,
    clientCapabilities.mediaQuery.getViewport,
  );
}
