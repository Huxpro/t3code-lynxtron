import {
  T3_TERMINAL_RETURN_FOCUS_METHOD,
  isTerminalReturnFocusParams,
} from "../../shared/terminalKeyboardProtocol.ts";

interface BridgeRegistry {
  handle(method: string, handler: (params: unknown) => unknown): void;
  removeHandler(method: string): void;
}

export function startTerminalKeyboardHost(
  bridge: BridgeRegistry,
  setAcceleratorEnabled: (enabled: boolean) => void,
): { dispose(): void } {
  setAcceleratorEnabled(false);
  bridge.handle(T3_TERMINAL_RETURN_FOCUS_METHOD, (params) => {
    if (!isTerminalReturnFocusParams(params)) return false;
    setAcceleratorEnabled(params.focused);
    return true;
  });
  return {
    dispose: () => {
      setAcceleratorEnabled(false);
      bridge.removeHandler(T3_TERMINAL_RETURN_FOCUS_METHOD);
    },
  };
}
