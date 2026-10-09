import {
  KeybindingRule as KeybindingRuleSchema,
  type KeybindingCommand,
  type KeybindingRule,
  type ResolvedKeybindingsConfig,
  type ServerRemoveKeybindingInput,
  type ServerUpsertKeybindingInput,
} from "@t3tools/contracts";
import { parseKeybindingShortcut } from "@t3tools/shared/keybindings";
import * as Schema from "effect/Schema";

export const PROJECT_SCRIPT_KEYBINDING_INVALID_MESSAGE = "Invalid keybinding.";

const decodeKeybindingRule = Schema.decodeUnknownOption(KeybindingRuleSchema);

function normalizeProjectScriptKeybindingInput(
  keybinding: string | null | undefined,
): string | null {
  const trimmed = keybinding?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function decodeProjectScriptKeybindingRule(input: {
  keybinding: string | null | undefined;
  command: KeybindingCommand;
}): KeybindingRule | null {
  const normalizedKey = normalizeProjectScriptKeybindingInput(input.keybinding);
  if (!normalizedKey) return null;
  if (!parseKeybindingShortcut(normalizedKey)) {
    throw new Error(PROJECT_SCRIPT_KEYBINDING_INVALID_MESSAGE);
  }

  const decoded = decodeKeybindingRule({
    key: normalizedKey,
    command: input.command,
  });
  if (decoded._tag === "None") {
    throw new Error(PROJECT_SCRIPT_KEYBINDING_INVALID_MESSAGE);
  }
  return decoded.value;
}

export function keybindingValueForCommand(
  keybindings: ResolvedKeybindingsConfig,
  command: KeybindingCommand,
): string | null {
  for (let index = keybindings.length - 1; index >= 0; index -= 1) {
    const binding = keybindings[index];
    if (!binding || binding.command !== command) continue;

    const parts: string[] = [];
    if (binding.shortcut.modKey) parts.push("mod");
    if (binding.shortcut.ctrlKey) parts.push("ctrl");
    if (binding.shortcut.metaKey) parts.push("meta");
    if (binding.shortcut.altKey) parts.push("alt");
    if (binding.shortcut.shiftKey) parts.push("shift");
    const keyToken =
      binding.shortcut.key === " "
        ? "space"
        : binding.shortcut.key === "escape"
          ? "esc"
          : binding.shortcut.key;
    parts.push(keyToken);
    return parts.join("+");
  }
  return null;
}

export type ProjectScriptKeybindingChange =
  | { readonly kind: "upsert"; readonly input: ServerUpsertKeybindingInput }
  | { readonly kind: "remove"; readonly input: ServerRemoveKeybindingInput }
  | { readonly kind: "none" };

/**
 * The keybinding-config write that follows a script save. A changed shortcut
 * replaces the command's previous rule instead of appending a second one that
 * would keep the old shortcut alive; a cleared or deleted binding is removed.
 */
export function projectScriptKeybindingChange(input: {
  readonly previousKeybinding: string | null;
  readonly keybinding: string | null | undefined;
  readonly command: KeybindingCommand;
}): ProjectScriptKeybindingChange {
  const next = decodeProjectScriptKeybindingRule({
    keybinding: input.keybinding,
    command: input.command,
  });
  const previous = input.previousKeybinding
    ? decodeProjectScriptKeybindingRule({
        keybinding: input.previousKeybinding,
        command: input.command,
      })
    : null;
  if (next) {
    return {
      kind: "upsert",
      input: previous && previous.key !== next.key ? { ...next, replace: previous } : next,
    };
  }
  return previous ? { kind: "remove", input: previous } : { kind: "none" };
}
