import { useCallback, useEffect, useState } from "@lynx-js/react";
import type { ProjectScriptIcon } from "@t3tools/contracts";
import type { ProjectSummary } from "../bridge";

import { uiActions } from "../state/uiState";
import { t3ClientActions } from "../state/t3Client";
import {
  buildProjectScript,
  commandForProjectScript,
  nextProjectScriptId,
} from "../../../../web/src/projectScripts";
import { decodeProjectScriptKeybindingRule } from "../../../../web/src/lib/projectScriptKeybindings";
import { useViewportSnapshot } from "../../../../web/src/hooks/useViewportSnapshot";
import { Icon, type IconName } from "./Icon";

const SCRIPT_ICONS: ReadonlyArray<{ readonly id: ProjectScriptIcon; readonly icon: IconName }> = [
  { id: "play", icon: "arrow-up" },
  { id: "test", icon: "flask-conical" },
  { id: "lint", icon: "check" },
  { id: "configure", icon: "wrench" },
  { id: "build", icon: "hammer" },
  { id: "debug", icon: "terminal" },
];

export function ProjectActionDialog({ project }: { project: ProjectSummary | null }) {
  const viewport = useViewportSnapshot();
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [keybinding, setKeybinding] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [icon, setIcon] = useState<ProjectScriptIcon>("play");
  const [runOnWorktreeCreate, setRunOnWorktreeCreate] = useState(false);
  const [autoOpenPreview, setAutoOpenPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const close = uiActions.closeProjectActionDialog;
  const handleInput = useCallback(
    (setter: (value: string) => void) => (event: { detail?: { value?: unknown } }) => {
      if (typeof event.detail?.value === "string") setter(event.detail.value);
    },
    [],
  );
  const save = useCallback(() => {
    const trimmedName = name.trim();
    const trimmedCommand = command.trim();
    if (!project) {
      setError("No project is selected.");
      return;
    }
    if (!trimmedName) {
      setError("Name is required.");
      return;
    }
    if (!trimmedCommand) {
      setError("Command is required.");
      return;
    }
    const id = nextProjectScriptId(
      trimmedName,
      project.scripts.map((script) => script.id),
    );
    let keybindingRule: ReturnType<typeof decodeProjectScriptKeybindingRule>;
    try {
      keybindingRule = decodeProjectScriptKeybindingRule({
        keybinding,
        command: commandForProjectScript(id),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid keybinding.");
      return;
    }
    const script = buildProjectScript(id, {
      name: trimmedName,
      command: trimmedCommand,
      icon,
      runOnWorktreeCreate,
      previewUrl: previewUrl.trim() || null,
      autoOpenPreview: previewUrl.trim().length > 0 && autoOpenPreview,
    });
    setSaving(true);
    setError(null);
    void t3ClientActions
      .updateProjectScripts(project.id, [...project.scripts, script])
      .then(() => (keybindingRule ? t3ClientActions.upsertKeybinding(keybindingRule) : undefined))
      .then(close)
      .catch((cause) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => setSaving(false));
  }, [autoOpenPreview, command, icon, keybinding, name, previewUrl, project, runOnWorktreeCreate]);
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

  return (
    <>
      <view className="project-action-overlay" bindtap={close} />
      <view
        className="project-action-dialog"
        aria-label="Add Action"
        data-project-action-dialog="true"
      >
        <view className="project-action-dialog__close" aria-label="Close" bindtap={close}>
          <Icon name="x" size={16} color="#818181" />
        </view>
        <view className="project-action-dialog__header">
          <text className="project-action-dialog__title">Add Action</text>
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
                <Icon
                  name={SCRIPT_ICONS.find((option) => option.id === icon)?.icon ?? "arrow-up"}
                  size={16}
                  color="#818181"
                />
                <Icon name="chevron-down" size={12} color="#818181" />
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
              Enter a shortcut such as mod+shift+y. Use Backspace to clear.
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
              {saving ? "Saving…" : "Save action"}
            </text>
          </view>
        </view>
      </view>
    </>
  );
}
