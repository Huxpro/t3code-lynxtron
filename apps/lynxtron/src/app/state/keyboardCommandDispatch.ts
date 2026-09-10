import type { KeybindingCommand } from "@t3tools/contracts";

import {
  modelPickerJumpIndexFromCommand,
  threadJumpIndexFromCommand,
} from "../../../../web/src/keybindings";

export interface KeyboardCommandActions {
  readonly createThread: () => void;
  readonly jumpModel: (index: number) => boolean;
  readonly jumpThread: (index: number) => boolean;
  readonly openFilePicker: () => void;
  readonly openQuickSwitch: () => void;
  readonly openSettings: () => void;
  readonly toggleSidebar: () => void;
}

export function dispatchResolvedKeyboardCommand(
  command: KeybindingCommand | null,
  modelPickerOpen: boolean,
  actions: KeyboardCommandActions,
): boolean {
  const modelJumpIndex = modelPickerJumpIndexFromCommand(command ?? "");
  if (modelPickerOpen && modelJumpIndex !== null) return actions.jumpModel(modelJumpIndex);
  const jumpIndex = threadJumpIndexFromCommand(command ?? "");
  if (jumpIndex !== null) return actions.jumpThread(jumpIndex);

  switch (command) {
    case "sidebar.toggle":
      actions.toggleSidebar();
      return true;
    case "chat.new":
    case "chat.newLocal":
      actions.createThread();
      return true;
    case "commandPalette.toggle":
      actions.openQuickSwitch();
      return true;
    case "filePicker.toggle":
      actions.openFilePicker();
      return true;
    case "settings.open":
      actions.openSettings();
      return true;
    default:
      return false;
  }
}
