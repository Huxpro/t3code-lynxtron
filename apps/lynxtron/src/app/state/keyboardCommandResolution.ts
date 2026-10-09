import type { KeybindingCommand, ResolvedKeybindingsConfig } from "@t3tools/contracts";
import {
  isRendererNeutralKeyboardPacket,
  keyboardPacketPlatform,
  keyboardPacketToEvent,
  resolveRendererNeutralShortcutCommand,
} from "@t3tools/lynx-logic/keyboard";

export function resolveKeyboardPacketCommand(
  input: unknown,
  keybindings: ResolvedKeybindingsConfig,
  context: Readonly<Record<string, boolean>> = {},
): KeybindingCommand | null {
  if (!isRendererNeutralKeyboardPacket(input) || input.type !== "keydown") return null;
  return resolveRendererNeutralShortcutCommand(keyboardPacketToEvent(input), keybindings, {
    platform: keyboardPacketPlatform(input),
    context: {
      terminalFocus: false,
      terminalOpen: false,
      previewFocus: false,
      previewOpen: false,
      ...context,
    },
  });
}
