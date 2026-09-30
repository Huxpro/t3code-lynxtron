import { useCallback, useEffect, useState } from "@lynx-js/react";
import type {
  KeybindingCommand,
  ProjectScript,
  ProjectScriptIcon,
  ResolvedKeybindingsConfig,
} from "@t3tools/contracts";
import type { ProjectSummary } from "../bridge";

import { uiActions } from "../state/uiState";
import { t3ClientActions, useT3ClientState } from "../state/t3Client";
import {
  PROJECT_SCRIPT_KEYBINDING_HELPER,
  commandForProjectScript,
} from "../../../../web/src/projectScripts";
import {
  keybindingValueForCommand,
  projectScriptKeybindingChange,
} from "../../../../web/src/lib/projectScriptKeybindings";
import {
  EMPTY_PROJECT_SCRIPT_INPUT,
  resolveProjectScriptEditorPayload,
  type ProjectScriptEditorRequest,
} from "../../../../web/src/components/projectScriptEditor.logic";
import { nextProjectScriptsForSubmit } from "../../../../web/src/components/settings/ProjectSettingsPanel.logic";
import { useViewportSnapshot } from "../../../../web/src/hooks/useViewportSnapshot";
import { showNativeConfirm } from "../platform/clientCapabilities.lynx";
import { Icon, type IconName } from "./Icon";

const SCRIPT_ICONS: ReadonlyArray<{ readonly id: ProjectScriptIcon; readonly icon: IconName }> = [
  { id: "play", icon: "play" },
  { id: "test", icon: "flask-conical" },
  { id: "lint", icon: "check" },
  { id: "configure", icon: "wrench" },
  { id: "build", icon: "hammer" },
  { id: "debug", icon: "terminal" },
];

export function projectScriptIconName(icon: ProjectScriptIcon): IconName {
  return SCRIPT_ICONS.find((option) => option.id === icon)?.icon ?? "play";
}

const ADD_ACTION_REQUEST: ProjectScriptEditorRequest = {
  scriptId: null,
  initial: EMPTY_PROJECT_SCRIPT_INPUT,
};

/**
 * Writes a project's whole scripts array, then the keybinding-config change
 * for `command`. The previous binding is read before the write so a cleared
 * or deleted shortcut is removed and a changed one replaces the old rule.
 */
export async function persistProjectScripts(input: {
  readonly projectId: string;
  readonly scripts: ReadonlyArray<ProjectScript>;
  readonly keybinding: string | null;
  readonly command: KeybindingCommand;
  readonly keybindings: ResolvedKeybindingsConfig;
}): Promise<void> {
  const previousKeybinding = keybindingValueForCommand(input.keybindings, input.command);
  await t3ClientActions.updateProjectScripts(input.projectId, input.scripts);
  const change = projectScriptKeybindingChange({
    previousKeybinding,
    keybinding: input.keybinding,
    command: input.command,
  });
  if (change.kind === "upsert") await t3ClientActions.upsertKeybinding(change.input);
  else if (change.kind === "remove") await t3ClientActions.removeKeybinding(change.input);
}

/**
 * Add/edit dialog for a project action, shared by the chat-header actions
 * menu (add) and the project settings page (add, edit, delete).
 */
export function ProjectActionDialog({
  project,
  request = ADD_ACTION_REQUEST,
  onClose = uiActions.closeProjectActionDialog,
}: {
  readonly project: Pick<ProjectSummary, "id" | "scripts"> | null;
  readonly request?: ProjectScriptEditorRequest;
  readonly onClose?: () => void;
}) {
  const viewport = useViewportSnapshot();
  const { serverConfig } = useT3ClientState();
  const keybindings = serverConfig?.keybindings ?? [];
  const isEditing = request.scriptId !== null;
  const [name, setName] = useState(request.initial.name);
  const [command, setCommand] = useState(request.initial.command);
  const [keybinding, setKeybinding] = useState(request.initial.keybinding ?? "");
  const [previewUrl, setPreviewUrl] = useState(request.initial.previewUrl ?? "");
  const [icon, setIcon] = useState<ProjectScriptIcon>(request.initial.icon);
  const [runOnWorktreeCreate, setRunOnWorktreeCreate] = useState(
    request.initial.runOnWorktreeCreate,
  );
  const [autoOpenPreview, setAutoOpenPreview] = useState(request.initial.autoOpenPreview);
  const [error, setError] = useState<string | null>(request.error ?? null);
  const [saving, setSaving] = useState(false);
  const close = onClose;
  const handleInput = useCallback(
    (setter: (value: string) => void) => (event: { detail?: { value?: unknown } }) => {
      if (typeof event.detail?.value === "string") setter(event.detail.value);
    },
    [],
  );
  const save = useCallback(() => {
    if (!project) {
      setError("No project is selected.");
      return;
    }
    const resolved = resolveProjectScriptEditorPayload({
      scriptId: request.scriptId,
      scripts: project.scripts,
      form: {
        name,
        command,
        icon,
        runOnWorktreeCreate,
        keybinding,
        previewUrl,
        autoOpenPreview,
      },
    });
    if (!resolved.ok) {
      setError(resolved.error);
      return;
    }
    const next = nextProjectScriptsForSubmit(project.scripts, request.scriptId, resolved.payload);
    setSaving(true);
    setError(null);
    void persistProjectScripts({
      projectId: project.id,
      scripts: next.scripts,
      keybinding: resolved.payload.keybinding,
      command: commandForProjectScript(next.scriptId),
      keybindings,
    })
      .then(close)
      .catch((cause) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => setSaving(false));
  }, [
    autoOpenPreview,
    close,
    command,
    icon,
    keybinding,
    keybindings,
    name,
    previewUrl,
    project,
    request.scriptId,
    runOnWorktreeCreate,
  ]);
  const remove = useCallback(() => {
    const scriptId = request.scriptId;
    if (!project || scriptId === null) return;
    setError(null);
    void showNativeConfirm({
      message: `Delete action "${name}"?`,
      detail: "This action cannot be undone.",
      confirmLabel: "Delete action",
    })
      .then((confirmed) => {
        if (!confirmed) return;
        setSaving(true);
        return persistProjectScripts({
          projectId: project.id,
          scripts: project.scripts.filter((script) => script.id !== scriptId),
          keybinding: null,
          command: commandForProjectScript(scriptId),
          keybindings,
        }).then(close);
      })
      .catch((cause) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => setSaving(false));
  }, [close, keybindings, name, project, request.scriptId]);
  const fillForTest = useCallback(
    (input: {
      readonly name?: string;
      readonly command?: string;
      readonly keybinding?: string;
      readonly previewUrl?: string;
    }) => {
      if (input.name !== undefined) setName(input.name);
      if (input.command !== undefined) setCommand(input.command);
      if (input.keybinding !== undefined) setKeybinding(input.keybinding);
      if (input.previewUrl !== undefined) setPreviewUrl(input.previewUrl);
    },
    [],
  );

  useEffect(() => {
    if (!viewport.testResize) return;
    const target = globalThis as {
      __T3_LYNXTRON_PROJECT_ACTION_PROBE__?: typeof fillForTest;
    };
    target.__T3_LYNXTRON_PROJECT_ACTION_PROBE__ = fillForTest;
    return () => {
      if (target.__T3_LYNXTRON_PROJECT_ACTION_PROBE__ === fillForTest) {
        delete target.__T3_LYNXTRON_PROJECT_ACTION_PROBE__;
      }
    };
  }, [fillForTest, viewport.testResize]);

  const title = isEditing ? "Edit Action" : "Add Action";
  return (
    <>
      <view className="project-action-overlay" bindtap={close} />
      <view className="project-action-dialog" aria-label={title} data-project-action-dialog="true">
        <view className="project-action-dialog__close" aria-label="Close" bindtap={close}>
          <Icon name="x" size={16} color="#818181" />
        </view>
        <view className="project-action-dialog__header">
          <text className="project-action-dialog__title">{title}</text>
          <text className="project-action-dialog__description">
            Actions are project-scoped commands you can run from the top bar or keybindings.
          </text>
        </view>
        <scroll-view className="project-action-dialog__body" scroll-orientation="vertical">
          <view className="project-action-field">
            <text className="project-action-field__label">Name</text>
            <view className="project-action-field__name-row">
              <view
                className="project-action-field__icon"
                aria-label="Action icon"
                bindtap={() => {
                  const current = SCRIPT_ICONS.findIndex((option) => option.id === icon);
                  setIcon(SCRIPT_ICONS[(current + 1) % SCRIPT_ICONS.length]?.id ?? "play");
                }}
              >
                <Icon name={projectScriptIconName(icon)} size={16} color="#818181" />
              </view>
              <input
                className="project-action-field__input project-action-field__input--name"
                placeholder="Test"
                {...({ value: name } as object)}
                bindinput={handleInput(setName)}
              />
            </view>
          </view>
          <view className="project-action-field">
            <text className="project-action-field__label">Keybinding</text>
            <input
              className="project-action-field__input"
              data-keybinding-input-mode="canonical-text"
              placeholder="Press shortcut"
              {...({ value: keybinding } as object)}
              bindinput={handleInput(setKeybinding)}
            />
            <text className="project-action-field__hint">
              {`${PROJECT_SCRIPT_KEYBINDING_HELPER.prefix}${PROJECT_SCRIPT_KEYBINDING_HELPER.key}${PROJECT_SCRIPT_KEYBINDING_HELPER.suffix}`}
            </text>
          </view>
          <view className="project-action-field">
            <text className="project-action-field__label">Command</text>
            <textarea
              className="project-action-field__textarea"
              placeholder="bun test"
              {...({ value: command } as object)}
              bindinput={handleInput(setCommand)}
            />
          </view>
          <view className="project-action-field">
            <text className="project-action-field__label">Preview URL (optional)</text>
            <input
              className="project-action-field__input"
              placeholder="http://localhost:5173"
              {...({ value: previewUrl } as object)}
              bindinput={handleInput(setPreviewUrl)}
            />
            <text className="project-action-field__hint">
              Open this URL in the in-app preview when this action runs.
            </text>
          </view>
          <view
            className="project-action-option"
            bindtap={() => setRunOnWorktreeCreate((current) => !current)}
          >
            <text className="project-action-option__label">
              Run automatically on worktree creation
            </text>
            <view
              className={`project-action-option__switch${
                runOnWorktreeCreate ? " project-action-option__switch--on" : ""
              }`}
              aria-checked={runOnWorktreeCreate ? "true" : "false"}
            >
              <view className="project-action-option__switch-thumb" />
            </view>
          </view>
          <view
            className={`project-action-option${
              previewUrl.trim().length === 0 ? " project-action-option--disabled" : ""
            }`}
            bindtap={
              previewUrl.trim().length === 0
                ? undefined
                : () => setAutoOpenPreview((current) => !current)
            }
          >
            <text className="project-action-option__label">
              Open preview automatically when this action runs
            </text>
            <view
              className={`project-action-option__switch${
                autoOpenPreview ? " project-action-option__switch--on" : ""
              }`}
              aria-checked={autoOpenPreview ? "true" : "false"}
            >
              <view className="project-action-option__switch-thumb" />
            </view>
          </view>
          {error ? <text className="project-action-dialog__error">{error}</text> : null}
        </scroll-view>
        <view className="project-action-dialog__footer">
          {isEditing ? (
            <view
              className={`project-action-dialog__button project-action-dialog__button--danger${
                saving ? " project-action-dialog__button--disabled" : ""
              }`}
              aria-disabled={saving ? "true" : "false"}
              bindtap={saving ? undefined : remove}
            >
              <text className="project-action-dialog__button-label project-action-dialog__button-label--danger">
                Delete
              </text>
            </view>
          ) : null}
          <view className="project-action-dialog__button" bindtap={close}>
            <text className="project-action-dialog__button-label">Cancel</text>
          </view>
          <view
            className={`project-action-dialog__button project-action-dialog__button--primary${
              saving ? " project-action-dialog__button--disabled" : ""
            }`}
            aria-disabled={saving ? "true" : "false"}
            bindtap={saving ? undefined : save}
          >
            <text className="project-action-dialog__button-label">
              {saving ? "Saving…" : isEditing ? "Save changes" : "Save action"}
            </text>
          </view>
        </view>
      </view>
    </>
  );
}
