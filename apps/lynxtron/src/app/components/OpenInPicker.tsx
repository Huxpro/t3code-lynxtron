import { useMemo, useState } from "@lynx-js/react";
import type { EditorId, ExecutionEnvironmentPlatformOs } from "@t3tools/contracts";

import externalCursorUrl from "../assets/cursor.svg?external";
import externalTraeUrl from "../assets/trae.svg?external";
import externalVsCodeUrl from "../assets/vscode.svg?external";
import { usePreferredEditorState } from "../state/prefsStore";
import { t3ClientActions } from "../state/t3Client";
import { Icon } from "./Icon";
import { editorIconKind, platformEditorLabel, resolvePreferredEditor } from "./openInEditor.logic";

function EditorIcon({ editor }: { readonly editor: EditorId }) {
  const kind = editorIconKind(editor);
  const source =
    kind === "cursor" ? externalCursorUrl : kind === "trae" ? externalTraeUrl : externalVsCodeUrl;
  return kind === "folder" ? (
    <Icon name="folder" size={14} color="#a1a1aa" />
  ) : (
    <svg
      className="open-in-menu__brand-icon"
      src={source}
      style={{ width: "14px", height: "14px" }}
    />
  );
}

export function OpenInPicker({
  availableEditors,
  cwd,
  platform,
  compact = false,
  anchor = "header-open-in-menu",
}: {
  readonly availableEditors: ReadonlyArray<EditorId>;
  readonly cwd: string | null | undefined;
  readonly platform: ExecutionEnvironmentPlatformOs | undefined;
  readonly compact?: boolean;
  readonly anchor?: "header-open-in-menu" | "file-open-in-menu";
}) {
  const [storedEditor, setStoredEditor] = usePreferredEditorState();
  const [open, setOpen] = useState(false);
  const preferredEditor = useMemo(
    () => resolvePreferredEditor(availableEditors, storedEditor),
    [availableEditors, storedEditor],
  );
  const launch = (editor: EditorId | null) => {
    if (!cwd || !editor) return;
    setStoredEditor(editor);
    setOpen(false);
    void t3ClientActions.openInEditor(cwd, editor).catch((cause) => {
      console.error("[open-in-picker] failed to open path in editor", { cwd, editor, cause });
    });
  };

  return (
    <view
      className={`open-in-control${compact ? " open-in-control--compact" : ""}`}
      data-floating-anchor={anchor}
    >
      <view className="open-in-picker__group" aria-label="Open in editor">
        <view
          className="open-in-picker__primary"
          aria-label={
            preferredEditor ? `Open in ${platformEditorLabel(preferredEditor, platform)}` : "Open"
          }
          aria-disabled={!cwd || preferredEditor === null ? "true" : "false"}
          bindtap={() => launch(preferredEditor)}
        >
          {preferredEditor ? (
            <EditorIcon editor={preferredEditor} />
          ) : (
            <Icon name="folder" size={14} color="#818181" />
          )}
          {!compact ? <text className="action-btn__label">Open</text> : null}
        </view>
        <view
          className="open-in-picker__options"
          aria-label="Choose editor"
          aria-expanded={open ? "true" : "false"}
          bindtap={() => setOpen((visible) => !visible)}
        >
          <Icon name="chevron-down" size={14} color="#818181" />
        </view>
      </view>
      {open ? (
        <>
          <view className="open-in-menu-dismiss-layer" bindtap={() => setOpen(false)} />
          <scroll-view
            className="open-in-menu"
            aria-label="Open in editor"
            data-floating-popup={anchor}
            scroll-orientation="vertical"
            style={{ height: `${Math.min(Math.max(availableEditors.length, 1) * 32 + 10, 288)}px` }}
          >
            {availableEditors.length === 0 ? (
              <view className="open-in-menu__item open-in-menu__item--disabled">
                <text className="open-in-menu__label">No installed editors found</text>
              </view>
            ) : (
              availableEditors.map((editor) => (
                <view
                  key={editor}
                  className="open-in-menu__item"
                  data-open-editor={editor}
                  bindtap={() => launch(editor)}
                >
                  <EditorIcon editor={editor} />
                  <text className="open-in-menu__label">
                    {platformEditorLabel(editor, platform)}
                  </text>
                </view>
              ))
            )}
          </scroll-view>
        </>
      ) : null}
    </view>
  );
}
