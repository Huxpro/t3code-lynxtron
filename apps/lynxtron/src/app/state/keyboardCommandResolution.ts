import type { KeybindingCommand, ResolvedKeybindingsConfig } from "@t3tools/contracts";
import {
  isRendererNeutralKeyboardPacket,
  keyboardPacketPlatform,
  keyboardPacketToEvent,
  resolveRendererNeutralShortcutCommand,
} from "@t3tools/shared/keyboard";

export function resolveKeyboardPacketCommand(
  input: unknown,
  keybindings: ResolvedKeybindingsConfig,
): KeybindingCommand | null {
  if (!isRendererNeutralKeyboardPacket(input)) return null;
  return resolveRendererNeutralShortcutCommand(keyboardPacketToEvent(input), keybindings, {
    platform: keyboardPacketPlatform(input),
    context: {
      terminalFocus: false,
      terminalOpen: false,
      previewFocus: false,
      previewOpen: false,
    },
  });
}
