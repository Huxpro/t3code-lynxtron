import { isRendererNeutralKeyboardPacket } from "@t3tools/shared/keyboard";

import { navigate } from "../router";
import { getT3ClientSnapshot, t3ClientActions } from "./t3Client";
import { uiActions } from "./uiState";
import { resolveKeyboardPacketCommand } from "./keyboardCommandResolution";
import { requestSidebarToggle } from "../../../../web/src/components/ui/sidebarCommandBus.lynx";

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
  const state = getT3ClientSnapshot();
  const command = resolveKeyboardPacketCommand(input, state.serverConfig?.keybindings ?? []);

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
