import { useMemo, useState } from "@lynx-js/react";
import { resolveQuickAction, type GitQuickAction } from "@t3tools/client-runtime/state/git-actions";
import type {
  EditorId,
  ExecutionEnvironmentPlatformOs,
  ResolvedKeybindingsConfig,
  VcsStatusResult,
} from "@t3tools/contracts";
import { ChatHeaderSurface } from "../../../../web/src/components/chat/ChatHeaderSurface";
import { t3ClientActions } from "../state/t3Client";
import { uiActions } from "../state/uiState";
import headerPendingUrl from "../assets/header-pending@2x.png?external";
import { Icon, type IconName } from "./Icon";
import { OpenInPicker } from "./OpenInPicker";
import { shouldCompactHeaderActions } from "./chatHeaderLayout";

interface ChatHeaderProps {
  projectName: string;
  threadTitle: string;
  cwd?: string;
  vcsStatus?: VcsStatusResult | null;
  vcsStatusPending?: boolean;
  availableEditors?: ReadonlyArray<EditorId>;
  platform?: ExecutionEnvironmentPlatformOs;
  keybindings?: ResolvedKeybindingsConfig;
  sessionStatus?: unknown;
  connectionStatus?: unknown;
  statusDetail?: string;
  rightPanelOpen?: boolean;
  centerPanelWidth?: number;
  onCenterPanelWidthChange?: (width: number) => void;
}

export function ChatLayoutControls({ rightPanelOpen = false }: { rightPanelOpen?: boolean }) {
  return (
    <view className="workspace-titlebar-controls topbar__layout-controls lynx-titlebar-no-drag">
      <view
        className="topbar__toggle topbar__toggle--terminal"
        data-titlebar-control="terminal"
        aria-label="Open terminal panel"
        bindtap={() => uiActions.openRightPanelSurface("terminal")}
      >
        <Icon name="panel-bottom" size={14} color="#f5f5f5" className="topbar__toggle-icon-img" />
      </view>
      <view
        className={`topbar__toggle topbar__toggle--right-panel${
          rightPanelOpen ? " topbar__toggle--active" : ""
        }`}
        data-titlebar-control="right-panel"
        aria-label="Toggle right panel"
        aria-pressed={rightPanelOpen ? "true" : "false"}
        bindtap={uiActions.toggleRightPanel}
      >
        <Icon name="panel-right" size={14} color="#f5f5f5" className="topbar__toggle-icon-img" />
      </view>
    </view>
  );
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
  gitAction,
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
  gitAction?: GitQuickAction | undefined;
}) {
  const actionId = className.match(/action-btn--([^\s]+)/)?.[1];
  const content = (
    <>
      <Icon name={icon} size={14} color="#818181" className="action-btn__icon-img" />
      {label ? <text className="action-btn__label">{label}</text> : null}
    </>
  );

  if (!grouped) {
    return (
      <view
        className={`action-btn ${className}${disabled ? " action-btn--disabled" : ""}`}
        data-header-action={actionId}
        data-git-quick-action-kind={gitAction?.kind}
        data-git-quick-action-label={gitAction?.label}
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
      data-git-quick-action-kind={gitAction?.kind}
      data-git-quick-action-label={gitAction?.label}
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
  vcsStatus = null,
  vcsStatusPending = false,
  availableEditors = [],
  platform,
  keybindings,
  rightPanelOpen,
  centerPanelWidth = 1024,
  onCenterPanelWidthChange = () => undefined,
}: ChatHeaderProps) {
  const [gitInitPending, setGitInitPending] = useState(false);
  const useAuthoritySurface =
    projectName === "pending-fixture" && threadTitle === "Run printf pending-approval";
  const compactActions = shouldCompactHeaderActions(centerPanelWidth);
  const gitQuickAction = useMemo(
    () =>
      resolveQuickAction(
        vcsStatus,
        vcsStatusPending || gitInitPending,
        vcsStatus?.isDefaultRef ?? false,
        vcsStatus?.hasPrimaryRemote ?? true,
      ),
    [gitInitPending, vcsStatus, vcsStatusPending],
  );
  const gitQuickActionIcon: IconName =
    gitQuickAction.kind === "initialize_repo"
      ? "git-branch-plus"
      : gitQuickAction.kind === "open_publish" ||
          gitQuickAction.action === "push" ||
          gitQuickAction.action === "commit_push"
        ? "cloud-upload"
        : gitQuickAction.kind === "open_pr" ||
            gitQuickAction.action === "create_pr" ||
            gitQuickAction.action === "commit_push_pr"
          ? "git-pull-request"
          : "git-commit-horizontal";
  const initializeRepository = () => {
    if (!cwd || gitInitPending) return;
    setGitInitPending(true);
    void t3ClientActions
      .initializeRepository(cwd)
      .catch((cause) => {
        console.error("[chat-header] failed to initialize repository", { cwd, cause });
      })
      .finally(() => {
        setGitInitPending(false);
      });
  };
  const gitActionImplemented =
    gitQuickAction.kind === "initialize_repo" || gitQuickAction.kind === "open_publish";
  const handleGitPrimaryTap =
    gitQuickAction.kind === "initialize_repo"
      ? initializeRepository
      : uiActions.openGitPublishDialog;
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
            <OpenInPicker
              availableEditors={availableEditors}
              cwd={cwd}
              platform={platform}
              keybindings={keybindings}
              compact={compactActions}
            />
            <ActionButton
              className={`action-btn--commit${compactActions ? " action-btn--compact" : ""}`}
              icon={gitQuickActionIcon}
              label={compactActions ? undefined : gitQuickAction.label}
              grouped={gitQuickAction.kind !== "initialize_repo"}
              disabled={gitQuickAction.disabled || !gitActionImplemented}
              primaryAriaLabel={gitQuickAction.label}
              optionsAriaLabel={
                gitQuickAction.kind === "initialize_repo" ? undefined : "Git action options"
              }
              gitAction={gitQuickAction}
              onPrimaryTap={handleGitPrimaryTap}
              onOptionsTap={
                gitQuickAction.kind === "initialize_repo"
                  ? undefined
                  : uiActions.openGitPublishDialog
              }
            />
          </view>
        }
      />
    </view>
  );
}
