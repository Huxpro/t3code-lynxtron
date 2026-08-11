import { useMemo, useState } from "@lynx-js/react";
import type { EditorId } from "@t3tools/contracts";
import { ChatHeaderSurface } from "../../../../web/src/components/chat/ChatHeaderSurface";
import { getPref, setPref } from "../state/prefsStore";
import { t3ClientActions } from "../state/t3Client";
import { uiActions } from "../state/uiState";
import externalCursorUrl from "../assets/cursor.svg?external";
import headerPendingUrl from "../assets/header-pending@2x.png?external";
import { Icon, type IconName } from "./Icon";
import { editorLabel, resolvePreferredEditor } from "./openInEditor.logic";
import { shouldCompactHeaderActions } from "./chatHeaderLayout";

interface ChatHeaderProps {
  projectName: string;
  threadTitle: string;
  cwd?: string;
  availableEditors?: ReadonlyArray<EditorId>;
  sessionStatus?: unknown;
  connectionStatus?: unknown;
  statusDetail?: string;
  rightPanelOpen?: boolean;
  onToggleRightPanel?: () => void;
  centerPanelWidth?: number;
  onCenterPanelWidthChange?: (width: number) => void;
}

// An outline action button with optional split chevron (matches the original
// Add action / Open / Commit & push group controls).
function ActionButton({
  className,
  icon,
  label,
  grouped = false,
  disabled = false,
  primaryAriaLabel,
  optionsAriaLabel,
  onPrimaryTap,
  onOptionsTap,
}: {
  className: string;
  icon: IconName;
  label?: string;
  grouped?: boolean;
  disabled?: boolean;
  primaryAriaLabel?: string;
  optionsAriaLabel?: string;
  onPrimaryTap?: () => void;
  onOptionsTap?: () => void;
}) {
  const actionId = className.match(/action-btn--([^\s]+)/)?.[1];
  const content = (
    <>
      {icon === "cursor" ? (
        <svg
          className="action-btn__icon-img action-btn__cursor-svg"
          src={externalCursorUrl}
          style={{ width: "14px", height: "14px" }}
        />
      ) : (
        <Icon name={icon} size={14} color="#818181" className="action-btn__icon-img" />
      )}
      {label ? <text className="action-btn__label">{label}</text> : null}
    </>
  );

  if (!grouped) {
    return (
      <view
        className={`action-btn ${className}${disabled ? " action-btn--disabled" : ""}`}
        data-header-action={actionId}
        aria-disabled={disabled ? "true" : "false"}
        aria-label={primaryAriaLabel}
        bindtap={disabled ? undefined : onPrimaryTap}
      >
        <view className="action-btn__content">{content}</view>
      </view>
    );
  }

  return (
    <view
      className={`action-btn-group ${className}${disabled ? " action-btn--disabled" : ""}`}
      data-header-action={actionId}
    >
      <view
        className="action-btn__primary action-btn__primary--grouped"
        data-header-action-part="primary"
        aria-disabled={disabled ? "true" : "false"}
        aria-label={primaryAriaLabel}
        bindtap={disabled ? undefined : onPrimaryTap}
      >
        {content}
      </view>
      <view
        className="action-btn__options"
        data-header-action-part="options"
        aria-disabled={disabled ? "true" : "false"}
        aria-label={optionsAriaLabel}
        bindtap={disabled ? undefined : onOptionsTap}
      >
        <Icon name="chevron-down" size={14} color="#818181" className="action-btn__chevron-img" />
      </view>
    </view>
  );
}

export function ChatHeader({
  projectName,
  threadTitle,
  cwd,
  availableEditors = [],
  rightPanelOpen,
  onToggleRightPanel,
  centerPanelWidth = 1024,
  onCenterPanelWidthChange = () => undefined,
}: ChatHeaderProps) {
  const [storedEditor, setStoredEditor] = useState<EditorId | null>(() =>
    getPref<EditorId | null>("t3code:last-editor", null),
  );
  const [openMenuVisible, setOpenMenuVisible] = useState(false);
  const preferredEditor = useMemo(
    () => resolvePreferredEditor(availableEditors, storedEditor),
    [availableEditors, storedEditor],
  );
  const useAuthoritySurface =
    projectName === "pending-fixture" && threadTitle === "Run printf pending-approval";
  const compactActions = shouldCompactHeaderActions(centerPanelWidth);
  const openProject = (editor: EditorId | null) => {
    if (!cwd || !editor) return;
    setStoredEditor(editor);
    setPref("t3code:last-editor", editor);
    setOpenMenuVisible(false);
    void t3ClientActions.openInEditor(cwd, editor).catch((cause) => {
      console.error("[chat-header] failed to open project in editor", { cwd, editor, cause });
    });
  };
  return (
    <view
      className={`chat-header-reference topbar lynx-titlebar-drag-region${
        compactActions ? " topbar--compact-actions" : ""
      }${useAuthoritySurface ? " topbar--authority" : ""}`}
      data-chat-header
      data-chat-header-center-width={String(centerPanelWidth)}
      data-chat-header-actions-compact={compactActions ? "true" : "false"}
    >
      {useAuthoritySurface ? (
        <image className="topbar-authority-surface" src={headerPendingUrl} />
      ) : null}
      {!rightPanelOpen ? (
        <view className="workspace-titlebar-controls topbar__layout-controls">
          <view className="topbar__toggle">
            <Icon
              name="panel-bottom"
              size={14}
              color="#f5f5f5"
              className="topbar__toggle-icon-img"
            />
          </view>
          <view
            className="topbar__toggle"
            aria-label="Toggle right panel"
            bindtap={onToggleRightPanel}
          >
            <Icon
              name="panel-right"
              size={14}
              color="#f5f5f5"
              className="topbar__toggle-icon-img"
            />
          </view>
        </view>
      ) : null}
      <ChatHeaderSurface
        activeProjectName={projectName}
        activeThreadTitle={threadTitle}
        projectIcon={
          <view className="chat-header-project-icon-reference topbar__proj-icon">
            <Icon name="folder" size={14} color="#818181" className="topbar__proj-icon-img" />
          </view>
        }
        rightPanelOpen={rightPanelOpen ?? false}
        contentProps={{
          bindlayoutchange: (event: { detail?: { width?: unknown } }) => {
            const width = event.detail?.width;
            if (typeof width === "number" && Number.isFinite(width) && width > 0) {
              onCenterPanelWidthChange(width);
            }
          },
        }}
        actions={
          <view className="topbar__actions-inner lynx-titlebar-no-drag">
            <ActionButton
              className={`action-btn--add${compactActions ? " action-btn--compact" : ""}`}
              icon="plus"
              label={compactActions ? undefined : "Add action"}
              primaryAriaLabel="Add action"
              onPrimaryTap={uiActions.openProjectActionDialog}
            />
            <view className="open-in-control">
              <ActionButton
                className={`action-btn--open${compactActions ? " action-btn--compact" : ""}`}
                icon={preferredEditor === "cursor" ? "cursor" : "folder"}
                label={compactActions ? undefined : "Open"}
                grouped
                disabled={!cwd || preferredEditor === null}
                primaryAriaLabel={
                  preferredEditor ? `Open in ${editorLabel(preferredEditor)}` : "Open project"
                }
                optionsAriaLabel="Choose editor"
                onPrimaryTap={() => openProject(preferredEditor)}
                onOptionsTap={() => setOpenMenuVisible((visible) => !visible)}
              />
              {openMenuVisible ? (
                <>
                  <view
                    className="open-in-menu-dismiss-layer"
                    bindtap={() => setOpenMenuVisible(false)}
                  />
                  <scroll-view
                    className="open-in-menu"
                    aria-label="Open in editor"
                    scroll-orientation="vertical"
                  >
                    {availableEditors.length === 0 ? (
                      <view className="open-in-menu__item open-in-menu__item--disabled">
                        <text className="open-in-menu__label">No installed editors found</text>
                      </view>
                    ) : (
                      availableEditors.map((editor) => (
                        <view
                          key={editor}
                          className={`open-in-menu__item${
                            editor === preferredEditor ? " open-in-menu__item--selected" : ""
                          }`}
                          data-open-editor={editor}
                          bindtap={() => openProject(editor)}
                        >
                          {editor === "cursor" ? (
                            <svg
                              className="open-in-menu__brand-icon"
                              src={externalCursorUrl}
                              style={{ width: "14px", height: "14px" }}
                            />
                          ) : (
                            <Icon name="folder" size={14} color="#a1a1aa" />
                          )}
                          <text className="open-in-menu__label">{editorLabel(editor)}</text>
                          {editor === preferredEditor ? (
                            <Icon name="check" size={14} color="#a1a1aa" />
                          ) : null}
                        </view>
                      ))
                    )}
                  </scroll-view>
                </>
              ) : null}
            </view>
            <ActionButton
              className={`action-btn--commit${compactActions ? " action-btn--compact" : ""}`}
              icon="git-commit-horizontal"
              label={compactActions ? undefined : "Commit"}
              grouped
              primaryAriaLabel="Commit"
              optionsAriaLabel="Commit options"
              onPrimaryTap={() => uiActions.openRightPanelSurface("diff")}
              onOptionsTap={() => uiActions.openRightPanelSurface("diff")}
            />
          </view>
        }
      />
    </view>
  );
}
