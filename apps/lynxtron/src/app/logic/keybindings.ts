import type { KeybindingShortcut, ModelPickerJumpKeybindingCommand } from "@t3tools/contracts";

import {
  formatShortcutLabel,
  modelPickerJumpCommandForIndex,
} from "../../../../web/src/keybindings";

/**
 * Formats a shortcut for a platform given either as `navigator.platform` or as
 * the server's OS name, where macOS is `darwin`.
 */
export function formatKeybindingShortcutLabel(
  shortcut: KeybindingShortcut,
  platform: string,
): string {
  return formatShortcutLabel(shortcut, platform.toLowerCase() === "darwin" ? "MacIntel" : platform);
}

/**
 * Pair each enabled model, in the order the picker lists it, with its jump
 * command. The shortcut labels and the jump action both read this list.
 */
export function resolveModelPickerJumpTargets<T>(
  items: ReadonlyArray<T>,
  isDisabled: (item: T) => boolean,
): ReadonlyArray<{ readonly item: T; readonly command: ModelPickerJumpKeybindingCommand }> {
  const targets: Array<{ readonly item: T; readonly command: ModelPickerJumpKeybindingCommand }> =
    [];
  for (const item of items) {
    if (isDisabled(item)) continue;
    const command = modelPickerJumpCommandForIndex(targets.length);
    if (!command) break;
    targets.push({ item, command });
  }
  return targets;
}
