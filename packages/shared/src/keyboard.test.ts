import { assert, describe, it } from "vite-plus/test";

import type { ResolvedKeybindingsConfig } from "@t3tools/contracts";
import {
  isRendererNeutralKeyboardPacket,
  keyboardPacketPlatform,
  keyboardPacketToEvent,
  resolveRendererNeutralShortcutCommand,
  type RendererNeutralKeyboardPacket,
} from "./keyboard.ts";

function packet(
  overrides: Partial<RendererNeutralKeyboardPacket> = {},
): RendererNeutralKeyboardPacket {
  return {
    type: "keydown",
    key: "k",
    code: "KeyK",
    modifiers: { meta: true, ctrl: false, shift: false, alt: false },
    repeat: false,
    source: { kind: "lynxtron-menu", platform: "darwin" },
    sequence: 1,
    ...overrides,
  };
}

const keybindings: ResolvedKeybindingsConfig = [
  {
    command: "commandPalette.toggle",
    shortcut: {
      key: "k",
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      modKey: true,
    },
    whenAst: { type: "not", node: { type: "identifier", name: "terminalFocus" } },
  },
];

describe("renderer-neutral keyboard packets", () => {
  it("validates the complete packet contract", () => {
    assert.isTrue(isRendererNeutralKeyboardPacket(packet()));
    assert.isFalse(isRendererNeutralKeyboardPacket({ ...packet(), sequence: -1 }));
    assert.isFalse(
      isRendererNeutralKeyboardPacket({
        ...packet(),
        modifiers: { meta: true, ctrl: false, shift: false },
      }),
    );
  });

  it("projects packets into the shared keybinding resolver", () => {
    const input = packet();
    assert.equal(
      resolveRendererNeutralShortcutCommand(keyboardPacketToEvent(input), keybindings, {
        platform: keyboardPacketPlatform(input),
      }),
      "commandPalette.toggle",
    );
    assert.isNull(
      resolveRendererNeutralShortcutCommand(keyboardPacketToEvent(input), keybindings, {
        platform: keyboardPacketPlatform(input),
        context: { terminalFocus: true },
      }),
    );
  });

  it("resolves mod as ctrl on non-macOS hosts", () => {
    const input = packet({
      modifiers: { meta: false, ctrl: true, shift: false, alt: false },
      source: { kind: "lynxtron-menu", platform: "linux" },
    });
    assert.equal(
      resolveRendererNeutralShortcutCommand(keyboardPacketToEvent(input), keybindings, {
        platform: keyboardPacketPlatform(input),
      }),
      "commandPalette.toggle",
    );
  });
});
