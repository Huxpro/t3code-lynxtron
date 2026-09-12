import {
  T3_COMPOSER_RETURN_FOCUS_METHOD,
  isComposerReturnFocusParams,
} from "../../shared/composerKeyboardProtocol.ts";

interface BridgeRegistry {
  handle(method: string, handler: (params: unknown) => unknown): void;
  removeHandler(method: string): void;
}

export function startComposerKeyboardHost(
  bridge: BridgeRegistry,
  setAcceleratorEnabled: (enabled: boolean) => void,
): { dispose(): void } {
  setAcceleratorEnabled(false);
  bridge.handle(T3_COMPOSER_RETURN_FOCUS_METHOD, (params) => {
    if (!isComposerReturnFocusParams(params)) return false;
    setAcceleratorEnabled(params.focused);
    return true;
  });
  return {
    dispose: () => {
      setAcceleratorEnabled(false);
      bridge.removeHandler(T3_COMPOSER_RETURN_FOCUS_METHOD);
    },
  };
}
