import type { KeybindingShortcut, ResolvedKeybindingsConfig } from "@t3tools/contracts";
import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";
import { describe, expect, it } from "vite-plus/test";

import { shortcutLabelForCommand } from "../../../../web/src/keybindings";
import { formatKeybindingShortcutLabel } from "./keybindings";

const modK: KeybindingShortcut = {
  key: "k",
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  modKey: true,
};

function bindingWhen(name: string, negate = false): ResolvedKeybindingsConfig {
  const identifier = { type: "identifier", name } as const;
  return [
    {
      command: "chat.new",
      shortcut: modK,
      whenAst: negate ? { type: "not", node: identifier } : identifier,
    },
  ];
}

describe("upstream keybindings on Lynx", () => {
  it("evaluates the shortcut context as a desktop client", () => {
    expect(shortcutLabelForCommand(bindingWhen("isDesktop"), "chat.new", "MacIntel")).toBe("⌘K");
    expect(shortcutLabelForCommand(bindingWhen("isWeb"), "chat.new", "MacIntel")).toBeNull();
    expect(
      shortcutLabelForCommand(bindingWhen("editableFocus"), "chat.new", "MacIntel"),
    ).toBeNull();
    expect(
      shortcutLabelForCommand(bindingWhen("editableFocus", true), "chat.new", "MacIntel"),
    ).toBe("⌘K");
  });

  it("labels the default thread jump shortcut, which is bound for desktop only", () => {
    expect(
      shortcutLabelForCommand(DEFAULT_RESOLVED_KEYBINDINGS, "thread.jump.1", "MacIntel"),
    ).not.toBeNull();
  });

  it("formats labels for the server's OS name as well as navigator.platform", () => {
    expect(formatKeybindingShortcutLabel(modK, "darwin")).toBe("⌘K");
    expect(formatKeybindingShortcutLabel(modK, "MacIntel")).toBe("⌘K");
    expect(formatKeybindingShortcutLabel(modK, "linux")).toBe("Ctrl+K");
  });
});
