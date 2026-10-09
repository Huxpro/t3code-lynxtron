import { isRendererNeutralKeyboardPacket } from "@t3tools/lynx-logic/keyboard";

import { T3_SEARCH_OVERLAY_RETURN_FOCUS_METHOD } from "../../shared/searchOverlayKeyboardProtocol.ts";
import { callBridge, type BridgeCallModule } from "./mainConnectorTransport";

declare const NativeModules:
  | {
      bridge?: BridgeCallModule;
    }
  | undefined;

type SubmitHandler = () => boolean;

export function createSearchOverlayReturnController(options: {
  readonly setHostFocus: (focused: boolean) => Promise<unknown>;
  readonly onError?: (error: unknown) => void;
}) {
  let submit: SubmitHandler | undefined;
  let lastSequence = -1;

  return {
    mount(handler: SubmitHandler): () => void {
      submit = handler;
      void options.setHostFocus(true).catch((error) => options.onError?.(error));
      return () => {
        if (submit !== handler) return;
        submit = undefined;
        void options.setHostFocus(false).catch((error) => options.onError?.(error));
      };
    },
    dispatch(input: unknown): boolean {
      if (
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
  };
}

const bridge = typeof NativeModules === "undefined" ? undefined : NativeModules?.bridge;

export const searchOverlayReturnController = createSearchOverlayReturnController({
  setHostFocus: (focused) =>
    bridge
      ? callBridge(bridge, T3_SEARCH_OVERLAY_RETURN_FOCUS_METHOD, { focused })
      : Promise.resolve(false),
  onError: (error) =>
    console.error(`[lynx-search-overlay] Return focus handshake failed: ${String(error)}`),
});
