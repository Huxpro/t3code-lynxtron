import { isRendererNeutralKeyboardPacket } from "@t3tools/shared/keyboard";

import { T3_COMPOSER_RETURN_FOCUS_METHOD } from "../../shared/composerKeyboardProtocol.ts";
import { callBridge, type BridgeCallModule } from "./mainConnectorTransport";

declare const NativeModules:
  | {
      bridge?: BridgeCallModule;
    }
  | undefined;

type SubmitHandler = () => boolean;

export function createComposerReturnController(options: {
  readonly setHostFocus: (focused: boolean) => Promise<unknown>;
  readonly onError?: (error: unknown) => void;
}) {
  let focused = false;
  let submit: SubmitHandler | undefined;
  let lastSequence = -1;

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
        input.type !== "keydown" ||
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

export const composerReturnController = createComposerReturnController({
  setHostFocus: (focused) =>
    bridge
      ? callBridge(bridge, T3_COMPOSER_RETURN_FOCUS_METHOD, { focused })
      : Promise.resolve(false),
  onError: (error) =>
    console.error(`[lynx-composer] Return focus handshake failed: ${String(error)}`),
});
