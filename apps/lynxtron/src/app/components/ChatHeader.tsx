import { useMemo, useState } from "@lynx-js/react";
import {
  buildMenuItems,
  resolveQuickAction,
  type GitQuickAction,
} from "@t3tools/client-runtime/state/git-actions";
import type {
  EditorId,
  ExecutionEnvironmentPlatformOs,
  ResolvedKeybindingsConfig,
  ProjectScript,
  T3ProjectFileScript,
  VcsStatusResult,
} from "@t3tools/contracts";
import { ChatHeaderSurface } from "../../../../web/src/components/chat/ChatHeaderSurface";
import { ProjectFavicon } from "../../../../web/src/components/ProjectFavicon.lynx";
import {
  projectThreadActionConfirmation,
  resolveRenameCommit,
} from "@t3tools/lynx-logic/threadActions";
import { effectiveSettled } from "@t3tools/client-runtime/state/thread-settled";
import { useThreadShells } from "../../../../web/src/state/entities";
import { showNativeConfirm } from "../platform/clientCapabilities.lynx";
import { useClientSettingsState } from "../state/prefsStore";
import { t3ClientActions, useT3ClientState } from "../state/t3Client";
import { openThreadActionMenu } from "./threadActionMenu";
import { LYNX_PRIMARY_ENVIRONMENT_ID } from "../state/environment";
import { uiActions } from "../state/uiState";
import { useNativeInputValue } from "../hooks/useNativeInputValue";
import { Icon, type IconName } from "./Icon";
import { OpenInPicker } from "./OpenInPicker";
import { shouldCompactHeaderActions } from "./chatHeaderLayout";
import { importableProjectScripts, importedProjectScript } from "./projectActionImports.logic";

interface ChatHeaderProps {
  projectName: string;
  threadTitle: string;
  cwd?: string;
  vcsStatus?: VcsStatusResult | null;
  vcsStatusPending?: boolean;
  availableEditors?: ReadonlyArray<EditorId>;
  platform?: ExecutionEnvironmentPlatformOs;
  keybindings?: ResolvedKeybindingsConfig;
  projectId?: string;
  projectScripts?: ReadonlyArray<ProjectScript>;
  fileScripts?: ReadonlyArray<T3ProjectFileScript>;
  sessionStatus?: unknown;
  connectionStatus?: unknown;
  statusDetail?: string;
  rightPanelOpen?: boolean;
  centerPanelWidth?: number;
  onCenterPanelWidthChange?: (width: number) => void;
  gitMenuOpen?: boolean;
  onGitMenuOpenChange?: (open: boolean) => void;
  onRunProjectScript?: (script: ProjectScript) => Promise<void>;
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
  trailingChevron = false,
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
  trailingChevron?: boolean;
  gitAction?: GitQuickAction | undefined;
}) {
  const actionId = className.match(/action-btn--([^\s]+)/)?.[1];
  const content = (
    <>
      <Icon name={icon} size={14} color="#818181" className="action-btn__icon-img" />
      {label ? <text className="action-btn__label">{label}</text> : null}
      {trailingChevron ? (
        <Icon name="chevron-down" size={14} color="#818181" className="action-btn__chevron-img" />
      ) : null}
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
  projectId,
  projectScripts = [],
  fileScripts = [],
  rightPanelOpen,
  centerPanelWidth = 1024,
  onCenterPanelWidthChange = () => undefined,
  gitMenuOpen = false,
  onGitMenuOpenChange = () => undefined,
  onRunProjectScript,
}: ChatHeaderProps) {
  const { activeThreadId, serverConfig } = useT3ClientState();
  const threadShells = useThreadShells();
  const [clientSettings] = useClientSettingsState();
  const activeShell = threadShells.find((thread) => thread.id === activeThreadId);
  const [renaming, setRenaming] = useState<{
    readonly threadId: string;
    readonly draft: string;
  } | null>(null);
  const renameActive = renaming !== null && renaming.threadId === activeShell?.id;
  const renameInput = useNativeInputValue(renameActive ? renaming.draft : "");
  const commitRename = () => {
    if (!renaming || !activeShell) return;
    const resolution = resolveRenameCommit({
      title: renaming.draft,
      originalTitle: activeShell.title,
    });
    setRenaming(null);
    if (resolution.action === "commit") {
      void t3ClientActions.renameThread(activeShell.id, resolution.title).catch(() => undefined);
    }
  };
  // Upstream #5592: the header title opens the same thread action menu as a
  // sidebar row; rename edits the title in place and delete asks first.
  const openTitleMenu = () => {
    if (!activeShell) return;
    void openThreadActionMenu({
      thread: activeShell,
      projectPath: cwd ?? null,
      settled:
        serverConfig?.environment.capabilities.threadSettlement === true &&
        effectiveSettled(activeShell, {
          now: new Date().toISOString(),
          autoSettleAfterDays: clientSettings.sidebarAutoSettleAfterDays,
        }),
      serverConfig,
      onRename: () => setRenaming({ threadId: activeShell.id, draft: activeShell.title }),
      onDelete: () => {
        const confirmation = projectThreadActionConfirmation({
          action: "delete",
          threadTitle: activeShell.title,
        });
        void showNativeConfirm({
          message: confirmation.title,
          ...(confirmation.description ? { detail: confirmation.description } : {}),
          confirmLabel: confirmation.confirmLabel,
        })
          .then((confirmed) =>
            confirmed ? t3ClientActions.deleteThread(activeShell.id) : undefined,
          )
          .catch(() => undefined);
      },
    }).catch(() => undefined);
  };
  const titleElement = activeShell ? (
    renameActive ? (
      <>
        {/* Lynx inputs keep focus when the user taps elsewhere, so a
            transparent layer commits the rename, like a blur on Web. */}
        <view className="chat-header-title-rename-dismiss" bindtap={commitRename} />
        <input
          ref={renameInput.ref}
          className="chat-header-title-rename topbar__thread"
          data-chat-header-title-rename={activeShell.id}
          {...({ focus: true } as object)}
          bindinput={(event: { detail?: { value?: string } }) => {
            const draft = event.detail?.value ?? "";
            renameInput.noteInput(draft);
            setRenaming({ threadId: activeShell.id, draft });
          }}
          bindconfirm={commitRename}
          bindblur={commitRename}
        />
      </>
    ) : (
      <view
        className="chat-header-title-button lynx-titlebar-no-drag"
        data-chat-header-title-menu={activeShell.id}
        aria-label={`${threadTitle}, thread actions`}
        bindtap={openTitleMenu}
      >
        <text className="chat-header-thread-title-reference topbar__thread" text-maxline="1">
          {threadTitle}
        </text>
      </view>
    )
  ) : undefined;
  const [gitInitPending, setGitInitPending] = useState(false);
  const [gitActionPending, setGitActionPending] = useState(false);
  const [projectActionsMenuOpen, setProjectActionsMenuOpen] = useState(false);
  const [projectActionError, setProjectActionError] = useState<string | null>(null);
  const compactActions = shouldCompactHeaderActions(centerPanelWidth);
  const importableActions = useMemo(
    () => importableProjectScripts(projectScripts, fileScripts),
    [fileScripts, projectScripts],
  );
  const hasProjectActions = projectScripts.length > 0 || importableActions.length > 0;
  const importAction = (fileScript: T3ProjectFileScript) => {
    if (!projectId) return;
    const script = importedProjectScript(projectScripts, fileScript);
    setProjectActionError(null);
    void t3ClientActions
      .updateProjectScripts(projectId, [...projectScripts, script])
      .then(() => setProjectActionsMenuOpen(false))
      .catch((cause) =>
        setProjectActionError(cause instanceof Error ? cause.message : String(cause)),
      );
  };
  const runProjectAction = (script: ProjectScript) => {
    if (!onRunProjectScript) return;
    setProjectActionError(null);
    void onRunProjectScript(script)
      .then(() => setProjectActionsMenuOpen(false))
      .catch((cause) =>
        setProjectActionError(cause instanceof Error ? cause.message : String(cause)),
      );
  };
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
  const gitMenuItems = useMemo(
    () => buildMenuItems(vcsStatus, vcsStatusPending || gitInitPending || gitActionPending),
    [gitActionPending, gitInitPending, vcsStatus, vcsStatusPending],
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
  const runGitAction = (action: "commit") => {
    if (!cwd || gitActionPending) return;
    setGitActionPending(true);
    void t3ClientActions
      .runGitAction({ actionId: `lynx-${action}-${Date.now()}`, cwd, action })
      .catch((cause) => {
        console.error("[chat-header] git action failed", { action, cause });
      })
      .finally(() => setGitActionPending(false));
  };
  const gitActionImplemented =
    gitQuickAction.kind === "initialize_repo" ||
    gitQuickAction.kind === "open_publish" ||
    (gitQuickAction.kind === "run_action" && gitQuickAction.action === "commit");
  const handleGitPrimaryTap = () => {
    if (gitQuickAction.kind === "initialize_repo") {
      initializeRepository();
    } else if (gitQuickAction.kind === "open_publish") {
      uiActions.openGitPublishDialog();
    } else if (gitQuickAction.kind === "run_action" && gitQuickAction.action === "commit") {
      runGitAction("commit");
    }
  };
  return (
    <view
      className={`chat-header-reference topbar lynx-titlebar-drag-region${
        compactActions ? " topbar--compact-actions" : ""
      }`}
      data-chat-header
      data-chat-header-center-width={String(centerPanelWidth)}
      data-chat-header-actions-compact={compactActions ? "true" : "false"}
    >
      <ChatHeaderSurface
        activeProjectName={projectName}
        activeThreadTitle={threadTitle}
        titleElement={titleElement}
        projectIcon={
          cwd ? (
            <ProjectFavicon
              environmentId={LYNX_PRIMARY_ENVIRONMENT_ID}
              cwd={cwd}
              className="chat-header-project-icon-reference topbar__proj-icon"
            />
          ) : null
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
              className={`action-btn--add${hasProjectActions ? " action-btn--add-menu" : ""}${compactActions ? " action-btn--compact" : ""}`}
              icon="plus"
              label={compactActions ? undefined : "Add action"}
              trailingChevron={!compactActions && hasProjectActions}
              primaryAriaLabel={hasProjectActions ? "Project actions" : "Add action"}
              onPrimaryTap={
                hasProjectActions
                  ? () => setProjectActionsMenuOpen((open) => !open)
                  : uiActions.openProjectActionDialog
              }
            />
            {projectActionsMenuOpen ? (
              <>
                <view
                  className="topbar-project-action-menu-dismiss"
                  bindtap={() => setProjectActionsMenuOpen(false)}
                />
                <view className="topbar-project-action-menu" catchtap={() => undefined}>
                  {projectScripts.map((script) => (
                    <view
                      key={script.id}
                      className="topbar-project-action-menu__item"
                      bindtap={() => runProjectAction(script)}
                    >
                      <Icon name="play" size={14} color="#818181" />
                      <text className="topbar-project-action-menu__label">{script.name}</text>
                    </view>
                  ))}
                  {importableActions.map((script) => (
                    <view
                      key={`${script.name}:${script.command}`}
                      className="topbar-project-action-menu__item"
                      bindtap={() => importAction(script)}
                    >
                      <Icon name="cloud-upload" size={14} color="#818181" />
                      <text className="topbar-project-action-menu__label">
                        Import {script.name}
                      </text>
                    </view>
                  ))}
                  <view
                    className="topbar-project-action-menu__item"
                    bindtap={() => {
                      setProjectActionsMenuOpen(false);
                      uiActions.openProjectActionDialog();
                    }}
                  >
                    <Icon name="plus" size={14} color="#818181" />
                    <text className="topbar-project-action-menu__label">Add action</text>
                  </view>
                  {projectActionError ? (
                    <text className="topbar-project-action-menu__error">{projectActionError}</text>
                  ) : null}
                </view>
              </>
            ) : null}
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
                  : () => onGitMenuOpenChange(!gitMenuOpen)
              }
            />
            {gitMenuOpen ? (
              <view className="topbar-git-menu" data-git-action-menu catchtap={() => undefined}>
                {gitMenuItems
                  .filter((item) => item.id === "commit")
                  .map((item) => (
                    <view
                      key={item.id}
                      className={`topbar-git-menu__item${
                        item.disabled ? " topbar-git-menu__item--disabled" : ""
                      }`}
                      aria-disabled={item.disabled ? "true" : "false"}
                      data-git-menu-action={item.id}
                      bindtap={
                        item.disabled
                          ? undefined
                          : () => {
                              onGitMenuOpenChange(false);
                              runGitAction("commit");
                            }
                      }
                    >
                      <Icon name="git-commit-horizontal" size={16} color="#818181" />
                      <text className="topbar-git-menu__label">{item.label}</text>
                    </view>
                  ))}
                {vcsStatus?.isRepo && !vcsStatus.hasPrimaryRemote ? (
                  <view
                    className="topbar-git-menu__item"
                    data-git-menu-action="publish"
                    bindtap={() => {
                      onGitMenuOpenChange(false);
                      uiActions.openGitPublishDialog();
                    }}
                  >
                    <Icon name="cloud-upload" size={16} color="#818181" />
                    <text className="topbar-git-menu__label">Publish repository…</text>
                  </view>
                ) : null}
              </view>
            ) : null}
          </view>
        }
      />
    </view>
  );
}
