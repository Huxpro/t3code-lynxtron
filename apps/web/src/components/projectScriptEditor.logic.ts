import type {
  ProjectScript,
  ProjectScriptIcon,
  ResolvedKeybindingsConfig,
} from "@t3tools/contracts";

import {
  decodeProjectScriptKeybindingRule,
  keybindingValueForCommand,
} from "../lib/projectScriptKeybindings";
import { commandForProjectScript, nextProjectScriptId } from "../projectScripts";

/** Script icons offered by the add/edit action editors, in picker order. */
export const SCRIPT_ICONS: ReadonlyArray<{
  readonly id: ProjectScriptIcon;
  readonly label: string;
}> = [
  { id: "play", label: "Play" },
  { id: "test", label: "Test" },
  { id: "lint", label: "Lint" },
  { id: "configure", label: "Configure" },
  { id: "build", label: "Build" },
  { id: "debug", label: "Debug" },
];

export interface NewProjectScriptInput {
  name: string;
  command: string;
  icon: ProjectScriptIcon;
  runOnWorktreeCreate: boolean;
  keybinding: string | null;
  /** Optional URL to open in the in-app preview when this script runs. */
  previewUrl: string | null;
  /** When true, automatically open the preview panel pointed at `previewUrl`. */
  autoOpenPreview: boolean;
}

export const EMPTY_PROJECT_SCRIPT_INPUT: NewProjectScriptInput = {
  name: "",
  command: "",
  icon: "play",
  runOnWorktreeCreate: false,
  keybinding: null,
  previewUrl: null,
  autoOpenPreview: false,
};

/** What the editor dialog should open with. `scriptId: null` means "add". */
export interface ProjectScriptEditorRequest {
  scriptId: string | null;
  initial: NewProjectScriptInput;
  /** Validation error to show immediately (e.g. a failed t3.json import). */
  error?: string;
}

export function editorRequestForScript(
  script: ProjectScript,
  keybindings: ResolvedKeybindingsConfig,
): ProjectScriptEditorRequest {
  return {
    scriptId: script.id,
    initial: {
      name: script.name,
      command: script.command,
      icon: script.icon,
      runOnWorktreeCreate: script.runOnWorktreeCreate,
      keybinding: keybindingValueForCommand(keybindings, commandForProjectScript(script.id)),
      previewUrl: script.previewUrl ?? null,
      autoOpenPreview: script.autoOpenPreview ?? false,
    },
  };
}

/**
 * Validates the editor form and normalizes it into the payload the save path
 * persists. Used by every add/edit action editor so the rules stay identical.
 */
export function resolveProjectScriptEditorPayload(input: {
  readonly scriptId: string | null;
  readonly scripts: ReadonlyArray<ProjectScript>;
  readonly form: NewProjectScriptInput;
}):
  | { readonly ok: true; readonly payload: NewProjectScriptInput }
  | { readonly ok: false; readonly error: string } {
  const name = input.form.name.trim();
  const command = input.form.command.trim();
  if (name.length === 0) return { ok: false, error: "Name is required." };
  if (command.length === 0) return { ok: false, error: "Command is required." };
  try {
    const scriptIdForValidation =
      input.scriptId ??
      nextProjectScriptId(
        name,
        input.scripts.map((script) => script.id),
      );
    const keybindingRule = decodeProjectScriptKeybindingRule({
      keybinding: input.form.keybinding,
      command: commandForProjectScript(scriptIdForValidation),
    });
    const previewUrl = input.form.previewUrl?.trim() ?? "";
    return {
      ok: true,
      payload: {
        name,
        command,
        icon: input.form.icon,
        runOnWorktreeCreate: input.form.runOnWorktreeCreate,
        keybinding: keybindingRule?.key ?? null,
        previewUrl: previewUrl.length > 0 ? previewUrl : null,
        autoOpenPreview: previewUrl.length > 0 ? input.form.autoOpenPreview : false,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to save action.",
    };
  }
}
