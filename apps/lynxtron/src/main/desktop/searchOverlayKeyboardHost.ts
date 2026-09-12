import {
  T3_SEARCH_OVERLAY_RETURN_FOCUS_METHOD,
  isSearchOverlayReturnFocusParams,
} from "../../shared/searchOverlayKeyboardProtocol.ts";

interface BridgeRegistry {
  handle(method: string, handler: (params: unknown) => unknown): void;
  removeHandler(method: string): void;
}

export function startSearchOverlayKeyboardHost(
  bridge: BridgeRegistry,
  setAcceleratorEnabled: (enabled: boolean) => void,
): { dispose(): void } {
  setAcceleratorEnabled(false);
  bridge.handle(T3_SEARCH_OVERLAY_RETURN_FOCUS_METHOD, (params) => {
    if (!isSearchOverlayReturnFocusParams(params)) return false;
    setAcceleratorEnabled(params.focused);
    return true;
  });
  return {
    dispose: () => {
      setAcceleratorEnabled(false);
      bridge.removeHandler(T3_SEARCH_OVERLAY_RETURN_FOCUS_METHOD);
    },
  };
}
