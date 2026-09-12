import { isRendererNeutralKeyboardPacket } from "@t3tools/shared/keyboard";

import { navigate } from "../router";
import { getT3ClientSnapshot, t3ClientActions } from "./t3Client";
import {
  dismissOpenSearchOverlay,
  isModelPickerOpen,
  isSearchOverlayOpen,
  uiActions,
} from "./uiState";
import { resolveKeyboardPacketCommand } from "./keyboardCommandResolution";
import { dispatchResolvedKeyboardCommand } from "./keyboardCommandDispatch";
import { requestSidebarToggle } from "../../../../web/src/components/ui/sidebarCommandBus.lynx";
import { requestModelPickerJump } from "./modelPickerJump";
import { terminalReturnController } from "./terminalKeyboard";
import { searchOverlayReturnController } from "./searchOverlayKeyboard";
import { composerReturnController } from "./composerKeyboard";
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

interface KeyboardDispatchProbe {
  readonly sequence: number;
  readonly type: "keydown" | "keyup";
  readonly key: string;
  readonly modelPickerOpen: boolean;
  readonly command: string | null;
  readonly handled: boolean;
}

function recordKeyboardDispatchProbe(value: KeyboardDispatchProbe): void {
  const target = globalThis as typeof globalThis & {
    __T3_LYNXTRON_VIEWPORT_PROBE__?: unknown;
    __T3_LYNXTRON_LAST_KEYBOARD_DISPATCH__?: KeyboardDispatchProbe;
  };
  if (typeof target.__T3_LYNXTRON_VIEWPORT_PROBE__ !== "function") return;
  target.__T3_LYNXTRON_LAST_KEYBOARD_DISPATCH__ = value;
}

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
  const modelPickerOpen = isModelPickerOpen();
  if (input.type === "keyup") {
    recordKeyboardDispatchProbe({
      sequence: input.sequence,
      type: input.type,
      key: input.key,
      modelPickerOpen,
      command: null,
      handled: true,
    });
    return true;
  }
  if (searchOverlayReturnController.dispatch(input)) {
    recordKeyboardDispatchProbe({
      sequence: input.sequence,
      type: input.type,
      key: input.key,
      modelPickerOpen,
      command: "search-overlay.submit",
      handled: true,
    });
    return true;
  }
  if (!modelPickerOpen && !isSearchOverlayOpen() && composerReturnController.dispatch(input)) {
    recordKeyboardDispatchProbe({
      sequence: input.sequence,
      type: input.type,
      key: input.key,
      modelPickerOpen,
      command: "composer.submit",
      handled: true,
    });
    return true;
  }
  if (terminalReturnController.dispatch(input)) {
    recordKeyboardDispatchProbe({
      sequence: input.sequence,
      type: input.type,
      key: input.key,
      modelPickerOpen,
      command: "terminal.submit",
      handled: true,
    });
    return true;
  }
  if (
    input.key.toLowerCase() === "escape" &&
    !input.modifiers.meta &&
    !input.modifiers.ctrl &&
    !input.modifiers.shift &&
    !input.modifiers.alt
  ) {
    const handled = dismissOpenSearchOverlay();
    recordKeyboardDispatchProbe({
      sequence: input.sequence,
      type: input.type,
      key: input.key,
      modelPickerOpen,
      command: "dismiss-overlay",
      handled,
    });
    return handled;
  }
  const state = getT3ClientSnapshot();
  const command = resolveKeyboardPacketCommand(input, state.serverConfig?.keybindings ?? [], {
    modelPickerOpen,
  });
  const handled = dispatchResolvedKeyboardCommand(command, modelPickerOpen, {
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
  recordKeyboardDispatchProbe({
    sequence: input.sequence,
    type: input.type,
    key: input.key,
    modelPickerOpen,
    command,
    handled,
  });
  return handled;
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
