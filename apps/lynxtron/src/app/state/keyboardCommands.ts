import { isRendererNeutralKeyboardPacket } from "@t3tools/shared/keyboard";

import { navigate } from "../router";
import { getT3ClientSnapshot, t3ClientActions } from "./t3Client";
import { dismissOpenSearchOverlay, isModelPickerOpen, uiActions } from "./uiState";
import { resolveKeyboardPacketCommand } from "./keyboardCommandResolution";
import { dispatchResolvedKeyboardCommand } from "./keyboardCommandDispatch";
import { requestSidebarToggle } from "../../../../web/src/components/ui/sidebarCommandBus.lynx";
import { requestModelPickerJump } from "./modelPickerJump";
import { terminalReturnController } from "./terminalKeyboard";
import { requestSidebarThreadJump } from "./sidebarThreadNavigation";
import { updateLynxShortcutModifierState } from "./shortcutModifierState";

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
  updateLynxShortcutModifierState({
    metaKey: input.modifiers.meta,
    ctrlKey: input.modifiers.ctrl,
    shiftKey: input.modifiers.shift,
    altKey: input.modifiers.alt,
  });
  if (input.type === "keyup") return true;
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
  const modelPickerOpen = isModelPickerOpen();
  const command = resolveKeyboardPacketCommand(input, state.serverConfig?.keybindings ?? [], {
    modelPickerOpen,
  });
  return dispatchResolvedKeyboardCommand(command, modelPickerOpen, {
    createThread: () => void t3ClientActions.createThread(),
    jumpModel: requestModelPickerJump,
    jumpThread: requestSidebarThreadJump,
    openFilePicker: () => uiActions.toggleQuickSwitch("files"),
    openQuickSwitch: () => uiActions.toggleQuickSwitch("command"),
    openSettings: () => {
      uiActions.closeQuickSwitch();
      navigate("/settings/general");
    },
    toggleSidebar: requestSidebarToggle,
  });
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
