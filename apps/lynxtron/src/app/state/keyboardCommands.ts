import { isRendererNeutralKeyboardPacket } from "@t3tools/shared/keyboard";

import { navigate } from "../router";
import { getT3ClientSnapshot, t3ClientActions } from "./t3Client";
import { dismissOpenSearchOverlay, uiActions } from "./uiState";
import { resolveKeyboardPacketCommand } from "./keyboardCommandResolution";
import { requestSidebarToggle } from "../../../../web/src/components/ui/sidebarCommandBus.lynx";
import { threadJumpIndexFromCommand } from "../../../../web/src/keybindings";
import { terminalReturnController } from "./terminalKeyboard";
import { requestSidebarThreadJump } from "./sidebarThreadNavigation";

interface GlobalEventEmitterLike {
  addListener?: (eventName: string, listener: (...args: unknown[]) => void) => void;
}

declare const lynx: {
  getJSModule?: (name: string) => GlobalEventEmitterLike | undefined;
};

export const T3_KEYBOARD_EVENT = "t3:keyboard";

let lastSequence = -1;

export function dispatchKeyboardPacket(input: unknown): boolean {
  if (!isRendererNeutralKeyboardPacket(input) || input.sequence <= lastSequence) {
    return false;
  }
  lastSequence = input.sequence;
  if (terminalReturnController.dispatch(input)) return true;
  if (
    input.key.toLowerCase() === "escape" &&
    !input.modifiers.meta &&
    !input.modifiers.ctrl &&
    !input.modifiers.shift &&
    !input.modifiers.alt
  ) {
    return dismissOpenSearchOverlay();
  }
  const state = getT3ClientSnapshot();
  const command = resolveKeyboardPacketCommand(input, state.serverConfig?.keybindings ?? []);
  const jumpIndex = threadJumpIndexFromCommand(command ?? "");
  if (jumpIndex !== null) return requestSidebarThreadJump(jumpIndex);

  switch (command) {
    case "sidebar.toggle":
      requestSidebarToggle();
      return true;
    case "chat.new":
    case "chat.newLocal":
      void t3ClientActions.createThread();
      return true;
    case "commandPalette.toggle":
      uiActions.toggleQuickSwitch("command");
      return true;
    case "filePicker.toggle":
      uiActions.toggleQuickSwitch("files");
      return true;
    case "settings.open":
      uiActions.closeQuickSwitch();
      navigate("/settings/general");
      return true;
    default:
      return false;
  }
}

export function registerKeyboardCommands(): void {
  "background only";
  try {
    const emitter =
      typeof lynx !== "undefined" ? lynx.getJSModule?.("GlobalEventEmitter") : undefined;
    emitter?.addListener?.(T3_KEYBOARD_EVENT, dispatchKeyboardPacket);
  } catch (error) {
    console.log(`[keyboard] listener registration failed: ${String(error)}`);
  }
}
