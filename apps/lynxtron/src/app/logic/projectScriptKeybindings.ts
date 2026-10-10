import type {
  KeybindingCommand,
  ServerRemoveKeybindingInput,
  ServerUpsertKeybindingInput,
} from "@t3tools/contracts";

import { decodeProjectScriptKeybindingRule } from "../../../../web/src/lib/projectScriptKeybindings";

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
  readonly command: KeybindingCommand | null;
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
