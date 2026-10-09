import { isRendererNeutralKeyboardPacket } from "@t3tools/lynx-logic/keyboard";

import { T3_TERMINAL_RETURN_FOCUS_METHOD } from "../../shared/terminalKeyboardProtocol.ts";
import { callBridge, type BridgeCallModule } from "./mainConnectorTransport";

declare const NativeModules:
  | {
      bridge?: BridgeCallModule;
    }
  | undefined;

type SubmitHandler = () => boolean;

export function createTerminalReturnController(options: {
  readonly setHostFocus: (focused: boolean) => Promise<unknown>;
  readonly onError?: (error: unknown) => void;
}) {
  let focused = false;
  let lastSequence = -1;
  let submit: SubmitHandler | undefined;

  return {
    setSubmitHandler(handler: SubmitHandler | undefined): void {
      submit = handler;
    },
    setFocused(nextFocused: boolean): void {
      focused = nextFocused;
      void options.setHostFocus(nextFocused).catch((error) => options.onError?.(error));
    },
    dispatch(input: unknown): boolean {
      if (
        !focused ||
        !submit ||
        !isRendererNeutralKeyboardPacket(input) ||
        input.sequence <= lastSequence ||
        input.key.toLowerCase() !== "enter" ||
        input.modifiers.meta ||
        input.modifiers.ctrl ||
        input.modifiers.shift ||
        input.modifiers.alt
      ) {
        return false;
      }
      lastSequence = input.sequence;
      return submit();
    },
    dispose(): void {
      focused = false;
      submit = undefined;
      void options.setHostFocus(false).catch((error) => options.onError?.(error));
    },
  };
}

const bridge = typeof NativeModules === "undefined" ? undefined : NativeModules?.bridge;

export const terminalReturnController = createTerminalReturnController({
  setHostFocus: (focused) =>
    bridge
      ? callBridge(bridge, T3_TERMINAL_RETURN_FOCUS_METHOD, { focused })
      : Promise.resolve(false),
  onError: (error) =>
    console.error(`[lynx-terminal] Return focus handshake failed: ${String(error)}`),
});
