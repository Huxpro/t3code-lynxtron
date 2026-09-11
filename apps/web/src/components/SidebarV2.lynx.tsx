import { useCallback, useEffect, useMemo, useState } from "react";

import { t3ClientActions, useT3ClientState } from "../../../lynxtron/src/app/state/t3Client";
import { uiActions, useProjectScopeKey } from "../../../lynxtron/src/app/state/uiState";
import { Icon } from "../../../lynxtron/src/app/components/Icon";
import {
  canSnooze,
  effectiveSettled,
  effectiveSnoozed,
  resolveSnoozePresets,
} from "@t3tools/client-runtime/state/thread-settled";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { DEFAULT_SIDEBAR_AUTO_SETTLE_AFTER_DAYS } from "@t3tools/contracts/settings";
import { formatRelativeTimeLabel } from "../timestampFormat";
import {
  shortcutLabelForCommand,
  shouldShowThreadJumpHintsForModifiers,
  threadJumpCommandForIndex,
} from "../keybindings";
import { useProjects, useThreadShells } from "../state/entities";
import { useViewportSnapshot } from "../hooks/useViewportSnapshot";
import { ProjectFavicon } from "./ProjectFavicon";
import {
  resolveSidebarV2Status,
  resolveWorkingStartedAt,
  resolveSettledTimestamp,
  formatWorkingDurationLabel,
  searchSidebarThreadsByTitle,
  shouldChooseProjectForNewThread,
  sortScopedProjectsForSidebar,
  sortSettledThreadsForSidebarV2,
  sortThreadsForSidebarV2,
  type SidebarV2Status,
} from "./Sidebar.logic";
import { SidebarV2CompositionSurface } from "./sidebar/SidebarV2CompositionSurface";
import { SidebarV2RowSurface, type SidebarV2RowStatus } from "./sidebar/SidebarV2RowSurface";
import { HostText } from "./ui/hostElements";
import { useSidebar } from "./ui/sidebar";
import { TooltipPopup } from "./ui/tooltip";
import type { ProviderInstanceEntry } from "@t3tools/client-runtime/presentation/provider";
import {
  clientCapabilities,
  showNativeContextMenu,
} from "../../../lynxtron/src/app/platform/clientCapabilities.lynx";
import { ProviderBrandIcon } from "../../../lynxtron/src/app/components/ProviderBrandIcon";
import { ProjectSettingsDialog } from "../../../lynxtron/src/app/components/ProjectSettingsDialog";
import { isDisposableEmptyThread } from "@t3tools/client-runtime/presentation/thread-actions";
import {
  hasUnseenThreadCompletion,
  markThreadUnreadInTimestampRecord,
  markThreadVisitedInTimestampRecord,
  projectSidebarThreadDetailsRows,
  sanitizeThreadVisitedTimestampRecord,
} from "@t3tools/client-runtime/presentation/sidebar";
import { getPref, setPref } from "../../../lynxtron/src/app/state/prefsStore";
import { onSidebarThreadJump } from "../../../lynxtron/src/app/state/sidebarThreadNavigation";
import { useLynxShortcutModifierState } from "../../../lynxtron/src/app/state/shortcutModifierState";

const THREAD_VISITED_TIMESTAMPS_PREF = "threadLastVisitedAtById";

function compactSidebarTimeLabel(label: string): string {
  if (label === "just now") return "now";
  return label.endsWith(" ago") ? label.slice(0, -4) : label;
}

function settledTimeLabel(thread: ReturnType<typeof useThreadShells>[number]): string {
  const timestamp = resolveSettledTimestamp(thread);
  return timestamp === null ? "" : compactSidebarTimeLabel(formatRelativeTimeLabel(timestamp));
}

function LynxWorkingDuration({
  thread,
}: {
  readonly thread: ReturnType<typeof useThreadShells>[number];
}) {
  const startedAt = resolveWorkingStartedAt(thread);
  const startedMs = startedAt === null ? Number.NaN : Date.parse(startedAt);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (Number.isNaN(startedMs)) return;
    const interval = setInterval(() => setTick((tick) => tick + 1), 1_000);
    return () => clearInterval(interval);
  }, [startedMs]);
  if (Number.isNaN(startedMs)) return null;
  return (
    <HostText className="sidebar-v2-working-duration font-mono tabular-nums">
      {formatWorkingDurationLabel(Date.now() - startedMs)}
    </HostText>
  );
}

function statusPresentation(
  status: SidebarV2Status,
  thread: ReturnType<typeof useThreadShells>[number],
): SidebarV2RowStatus | null {
  switch (status) {
    case "working":
      return {
        label: "Working",
        className:
          "animate-sidebar-working-text text-sky-600 motion-reduce:animate-none dark:text-sky-400",
        icon: <Icon name="circle-dashed" size={16} color="#a1a1aa" className="size-4 shrink-0" />,
        workingDuration: <LynxWorkingDuration thread={thread} />,
      };
    case "connecting":
      return {
        label: "Connecting",
        className: "text-sidebar-muted-foreground",
        icon: null,
        workingDuration: null,
      };
    case "approval":
      return {
        label: "Approval",
        className: "text-amber-700 dark:text-amber-300",
        icon: null,
        workingDuration: null,
      };
    case "input":
      return {
        label: "Input",
        className: "text-indigo-600 dark:text-indigo-300",
        icon: null,
        workingDuration: null,
      };
    case "failed":
      return {
        label: "Failed",
        className: "text-red-700 dark:text-red-300",
        icon: null,
        workingDuration: null,
      };
    case "ready":
      return null;
  }
}

function stopPropagation(event: unknown): void {
  if (typeof event === "object" && event !== null && "stopPropagation" in event) {
    const stop = (event as { readonly stopPropagation?: () => void }).stopPropagation;
    stop?.();
  }
}

function resolveThreadProvider(
  thread: ReturnType<typeof useThreadShells>[number],
  providerByInstanceId: ReadonlyMap<string, ProviderInstanceEntry>,
) {
  const instanceId = thread.session?.providerInstanceId ?? thread.modelSelection.instanceId;
  const provider = providerByInstanceId.get(instanceId) ?? null;
  const selectedModel = provider?.models.find(
    (model) => model.slug === thread.modelSelection.model,
  );
  return {
    instanceId,
    provider,
    modelLabel: selectedModel?.shortName ?? selectedModel?.name ?? thread.modelSelection.model,
  };
}

function LynxThreadDetails({
  relationId,
  thread,
  projectTitle,
  environmentLabel,
  provider,
  modelLabel,
}: {
  readonly relationId: string;
  readonly thread: ReturnType<typeof useThreadShells>[number];
  readonly projectTitle: string | null;
  readonly environmentLabel: string | null;
  readonly provider: ProviderInstanceEntry | null;
  readonly modelLabel: string;
}) {
  const detailRows = projectSidebarThreadDetailsRows({
    projectTitle,
    environmentLabel,
    branch: thread.branch,
    branchMismatch: false,
    modelLabel: provider ? modelLabel : null,
    terminalProcessCount: 0,
    hasError: Boolean(thread.session?.lastError),
  });
  return (
    <TooltipPopup
      relationId={relationId}
      side="right"
      align="start"
      sideOffset={4}
      variant="glass"
      className="sidebar-v2-details-popover"
      data-sidebar-thread-details={thread.id}
    >
      <view className="sidebar-v2-details-content">
        <text className="sidebar-v2-details-title" text-maxline="1">
          {thread.title}
        </text>
        <view className="sidebar-v2-details-rows">
          {detailRows.map((row) => (
            <view
              key={row.kind}
              className={
                row.kind === "error" || row.kind === "branch-mismatch"
                  ? "sidebar-v2-details-row sidebar-v2-details-row--error"
                  : "sidebar-v2-details-row"
              }
            >
              {row.kind === "project" ? (
                <Icon name="folder" size={12} color="#818181" />
              ) : row.kind === "environment" ? (
                <Icon name="globe" size={12} color="#818181" />
              ) : row.kind === "branch" ? (
                <Icon name="git-branch" size={12} color="#818181" />
              ) : row.kind === "model" ? (
                <ProviderBrandIcon driverKind={provider?.driverKind ?? null} size={12} />
              ) : row.kind === "terminal" ? (
                <Icon name="terminal" size={12} color="#818181" />
              ) : (
                <Icon name="triangle-alert" size={12} color="#f87171" />
              )}
              <text className="sidebar-v2-details-value">{row.label}</text>
            </view>
          ))}
        </view>
      </view>
    </TooltipPopup>
  );
}

function LynxThreadActionMenu({
  thread,
  projectPath,
  settled,
  settlementSupported,
  onMarkUnread,
  onClose,
  initialMode = "menu",
}: {
  readonly thread: ReturnType<typeof useThreadShells>[number];
  readonly projectPath: string | null;
  readonly settled: boolean;
  readonly settlementSupported: boolean;
  readonly onMarkUnread: () => void;
  readonly onClose: () => void;
  readonly initialMode?: "menu" | "rename" | "delete";
}) {
  const [renaming, setRenaming] = useState(initialMode === "rename");
  const [renameDraft, setRenameDraft] = useState(thread.title);
  const [confirmingDelete, setConfirmingDelete] = useState(initialMode === "delete");
  const workspacePath = thread.worktreePath ?? projectPath;
  const actionCount =
    (settlementSupported ? 1 : 0) + 2 + (workspacePath ? 1 : 0) + (thread.branch ? 1 : 0) + 2;
  const menuHeight = actionCount * 30 + 10;

  const run = (action: () => Promise<void>) => {
    void action()
      .catch(() => undefined)
      .finally(onClose);
  };
  const requestDelete = (event: unknown) => {
    stopPropagation(event);
    if (isDisposableEmptyThread(thread)) {
      run(() => t3ClientActions.deleteThread(thread.id));
      return;
    }
    setConfirmingDelete(true);
  };
  const confirmDelete = (event: unknown) => {
    stopPropagation(event);
    run(() => t3ClientActions.deleteThread(thread.id));
  };

  return (
    <>
      <view className="sidebar-v2-action-menu-dismiss" bindtap={onClose} />
      <view
        className="sidebar-v2-action-menu"
        data-sidebar-thread-menu={thread.id}
        style={{ height: `${menuHeight}px`, minHeight: `${menuHeight}px` }}
        bindtap={stopPropagation}
      >
        {renaming ? (
          <view className="sidebar-v2-action-menu__rename">
            <input
              className="sidebar-v2-action-menu__rename-input"
              {...({ value: renameDraft } as object)}
              bindinput={(event: { detail?: { value?: string } }) => {
                setRenameDraft(event.detail?.value ?? "");
              }}
              confirm-type="done"
              bindconfirm={() => {
                const title = renameDraft.trim();
                if (title) run(() => t3ClientActions.renameThread(thread.id, title));
              }}
            />
            <view
              className="sidebar-v2-action-menu__rename-save"
              bindtap={() => {
                const title = renameDraft.trim();
                if (title) run(() => t3ClientActions.renameThread(thread.id, title));
              }}
            >
              <text className="sidebar-v2-action-menu__rename-save-label">Save</text>
            </view>
          </view>
        ) : confirmingDelete ? (
          <view className="sidebar-v2-action-menu__confirm">
            <text className="sidebar-v2-action-menu__confirm-title">Delete this thread?</text>
            <text className="sidebar-v2-action-menu__confirm-copy">
              Conversation history will be removed.
            </text>
            <view className="sidebar-v2-action-menu__confirm-actions">
              <view
                className="sidebar-v2-action-menu__confirm-button"
                bindtap={() => setConfirmingDelete(false)}
              >
                <text className="sidebar-v2-action-menu__item-label">Cancel</text>
              </view>
              <view
                className="sidebar-v2-action-menu__confirm-button sidebar-v2-action-menu__confirm-button--danger"
                data-sidebar-thread-delete-confirm={thread.id}
                bindtap={confirmDelete}
              >
                <text
                  className="sidebar-v2-action-menu__item-label sidebar-v2-action-menu__item-label--danger"
                  bindtap={confirmDelete}
                >
                  Delete
                </text>
              </view>
            </view>
          </view>
        ) : (
          <>
            {settlementSupported ? (
              <view
                className="sidebar-v2-action-menu__item"
                bindtap={() =>
                  run(() =>
                    settled
                      ? t3ClientActions.unsettleThread(thread.id)
                      : t3ClientActions.settleThread(thread.id),
                  )
                }
              >
                <Icon name={settled ? "rotate-ccw" : "check"} size={14} color="#818181" />
                <text className="sidebar-v2-action-menu__item-label">
                  {settled ? "Un-settle thread" : "Settle thread"}
                </text>
              </view>
            ) : null}
            <view className="sidebar-v2-action-menu__item" bindtap={() => setRenaming(true)}>
              <Icon name="pencil-line" size={14} color="#818181" />
              <text className="sidebar-v2-action-menu__item-label">Rename thread</text>
            </view>
            {workspacePath ? (
              <view
                className="sidebar-v2-action-menu__item"
                bindtap={() => run(() => clientCapabilities.clipboard.writeText(workspacePath))}
              >
                <Icon name="folder" size={14} color="#818181" />
                <text className="sidebar-v2-action-menu__item-label">Copy path</text>
              </view>
            ) : null}
            {thread.branch ? (
              <view
                className="sidebar-v2-action-menu__item"
                bindtap={() =>
                  run(() => clientCapabilities.clipboard.writeText(thread.branch ?? ""))
                }
              >
                <Icon name="git-branch" size={14} color="#818181" />
                <text className="sidebar-v2-action-menu__item-label">Copy branch</text>
              </view>
            ) : null}
            <view
              className="sidebar-v2-action-menu__item"
              bindtap={() => {
                onMarkUnread();
                onClose();
              }}
            >
              <Icon name="message-square" size={14} color="#818181" />
              <text className="sidebar-v2-action-menu__item-label">Mark unread</text>
            </view>
            <view
              className="sidebar-v2-action-menu__item"
              bindtap={() => run(() => t3ClientActions.archiveThread(thread.id))}
            >
              <Icon name="archive" size={14} color="#818181" />
              <text className="sidebar-v2-action-menu__item-label">Archive</text>
            </view>
            <view
              className="sidebar-v2-action-menu__item sidebar-v2-action-menu__item--danger"
              data-sidebar-thread-delete={thread.id}
              bindtap={requestDelete}
            >
              <Icon name="trash-2" size={14} color="#f87171" />
              <text
                className="sidebar-v2-action-menu__item-label sidebar-v2-action-menu__item-label--danger"
                bindtap={requestDelete}
              >
                Delete
              </text>
            </view>
          </>
        )}
      </view>
    </>
  );
}

/**
 * Small Lynx state host for the shared Sidebar V2 row composition.
 *
 * The Web Sidebar keeps its richer project scopes, VCS subscriptions, snooze,
 * and selection behavior. This leaf supplies canonical shell data and native
 * tap actions without evaluating the Web Effect/DOM orchestration on Lynx's
 * main thread.
 */
export default function SidebarV2() {
  const { activeThreadId, providerEntries, serverConfig } = useT3ClientState();
  const { sidebarWidth } = useSidebar();
  const projects = useProjects();
  const threads = useThreadShells();
  const viewport = useViewportSnapshot();
  const shortcutModifiers = useLynxShortcutModifierState();
  const [threadSearchQuery, setThreadSearchQuery] = useState("");
  const [activeSearchResultIndex, setActiveSearchResultIndex] = useState(0);
  const projectScopeKey = useProjectScopeKey();
  const [projectScopeMenuOpen, setProjectScopeMenuOpen] = useState(false);
  const [projectSettingsProjectId, setProjectSettingsProjectId] = useState<string | null>(null);
  const [settledShelfExpanded, setSettledShelfExpanded] = useState(true);
  const [actionMenuThreadId, setActionMenuThreadId] = useState<string | null>(null);
  const [snoozeMenuThreadId, setSnoozeMenuThreadId] = useState<string | null>(null);
  const [nativeFollowup, setNativeFollowup] = useState<{
    readonly kind: "rename" | "delete";
    readonly threadId: string;
  } | null>(null);
  const [hoveredThreadId, setHoveredThreadId] = useState<string | null>(null);
  const [threadLastVisitedAtById, setThreadLastVisitedAtById] = useState(() =>
    sanitizeThreadVisitedTimestampRecord(getPref(THREAD_VISITED_TIMESTAMPS_PREF, {})),
  );
  const updateThreadVisitedTimestamps = useCallback(
    (update: (current: Record<string, string>) => Record<string, string>) => {
      setThreadLastVisitedAtById((current) => {
        const next = update(current);
        if (next !== current) setPref(THREAD_VISITED_TIMESTAMPS_PREF, next);
        return next;
      });
    },
    [],
  );
  const markThreadVisited = useCallback(
    (thread: (typeof threads)[number]) => {
      const threadKey = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
      updateThreadVisitedTimestamps((current) =>
        markThreadVisitedInTimestampRecord(current, threadKey, thread.updatedAt),
      );
    },
    [updateThreadVisitedTimestamps],
  );
  const markThreadUnread = useCallback(
    (thread: (typeof threads)[number]) => {
      const threadKey = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
      updateThreadVisitedTimestamps((current) =>
        markThreadUnreadInTimestampRecord(current, threadKey, thread.latestTurn?.completedAt),
      );
    },
    [updateThreadVisitedTimestamps],
  );
  const orderedProjects = useMemo(
    () => sortScopedProjectsForSidebar(projects, threads, "updated_at"),
    [projects, threads],
  );
  const { activeThreads, settledThreads } = useMemo(() => {
    const visible = threads.filter(
      (thread) =>
        thread.archivedAt === null &&
        (projectScopeKey === null || thread.projectId === projectScopeKey),
    );
    if (serverConfig?.environment.capabilities.threadSettlement !== true) {
      return {
        activeThreads: sortThreadsForSidebarV2(visible),
        settledThreads: [],
      };
    }
    const now = new Date().toISOString();
    const active = [];
    const settled = [];
    for (const thread of visible) {
      if (
        effectiveSettled(thread, {
          now,
          autoSettleAfterDays: DEFAULT_SIDEBAR_AUTO_SETTLE_AFTER_DAYS,
        })
      ) {
        settled.push(thread);
      } else {
        active.push(thread);
      }
    }
    return {
      activeThreads: sortThreadsForSidebarV2(active),
      settledThreads: sortSettledThreadsForSidebarV2(settled),
    };
  }, [projectScopeKey, serverConfig, threads]);
  const searchableThreads = useMemo(
    () => [...activeThreads, ...settledThreads],
    [activeThreads, settledThreads],
  );
  const threadSearchResults = useMemo(
    () => searchSidebarThreadsByTitle(searchableThreads, threadSearchQuery),
    [searchableThreads, threadSearchQuery],
  );
  const visibleActiveThreads = threadSearchQuery.trim() ? [] : activeThreads;
  const visibleSettledThreads = useMemo(() => {
    if (threadSearchQuery.trim()) return [];
    return settledShelfExpanded ? settledThreads : [];
  }, [settledShelfExpanded, settledThreads, threadSearchQuery]);
  const orderedVisibleThreads = useMemo(
    () => [...visibleActiveThreads, ...visibleSettledThreads],
    [visibleActiveThreads, visibleSettledThreads],
  );
  const showJumpHints =
    serverConfig !== null &&
    serverConfig !== undefined &&
    shouldShowThreadJumpHintsForModifiers(shortcutModifiers, serverConfig.keybindings, {
      platform: "MacIntel",
    });
  const jumpLabelByThreadId = useMemo(() => {
    const labels = new Map<string, string>();
    if (!serverConfig || !showJumpHints) return labels;
    const keybindings = serverConfig.keybindings;
    for (const [index, thread] of orderedVisibleThreads.entries()) {
      const command = threadJumpCommandForIndex(index);
      if (!command) break;
      const label = shortcutLabelForCommand(keybindings, command, "MacIntel");
      if (label) labels.set(thread.id, label);
    }
    return labels;
  }, [orderedVisibleThreads, serverConfig, showJumpHints]);
  useEffect(
    () =>
      onSidebarThreadJump((index) => {
        const thread = orderedVisibleThreads[index];
        if (!thread) return false;
        markThreadVisited(thread);
        t3ClientActions.selectThread(thread.id);
        return true;
      }),
    [markThreadVisited, orderedVisibleThreads],
  );
  useEffect(() => {
    setActiveSearchResultIndex(0);
  }, [threadSearchQuery]);
  useEffect(() => {
    const activeThread = threads.find((thread) => thread.id === activeThreadId);
    if (activeThread) markThreadVisited(activeThread);
  }, [activeThreadId, markThreadVisited, threads]);
  useEffect(() => {
    if (!viewport.testResize) return;
    (
      globalThis as {
        __T3_LYNXTRON_SIDEBAR_SEARCH_PROBE__?: (query: string) => void;
        __T3_LYNXTRON_SIDEBAR_HOVER_STATE__?: () => string | null;
      }
    ).__T3_LYNXTRON_SIDEBAR_SEARCH_PROBE__ = setThreadSearchQuery;
    (
      globalThis as {
        __T3_LYNXTRON_SIDEBAR_HOVER_STATE__?: () => string | null;
      }
    ).__T3_LYNXTRON_SIDEBAR_HOVER_STATE__ = () => hoveredThreadId;
    return () => {
      delete (
        globalThis as {
          __T3_LYNXTRON_SIDEBAR_HOVER_STATE__?: () => string | null;
        }
      ).__T3_LYNXTRON_SIDEBAR_HOVER_STATE__;
    };
  }, [hoveredThreadId, viewport.testResize]);
  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project] as const)),
    [projects],
  );
  const providerByInstanceId = useMemo(
    () => new Map(providerEntries.map((provider) => [provider.instanceId, provider] as const)),
    [providerEntries],
  );
  const scopedProject =
    projectScopeKey === null
      ? null
      : (orderedProjects.find((project) => project.id === projectScopeKey) ?? null);
  useEffect(() => {
    if (projectScopeKey !== null && scopedProject === null) {
      uiActions.setProjectScopeKey(null);
    }
  }, [projectScopeKey, scopedProject]);
  const newThreadProject = scopedProject ?? projects[0] ?? null;
  const settlementSupported = serverConfig?.environment.capabilities.threadSettlement === true;
  const showThreadContextMenu = useCallback(
    async (thread: (typeof threads)[number], projectPath: string | null, settled: boolean) => {
      const workspacePath = thread.worktreePath ?? projectPath;
      const supportsTitleRegeneration =
        serverConfig?.environment.capabilities.threadTitleRegeneration === true;
      const supportsSnooze = serverConfig?.environment.capabilities.threadSnooze === true;
      const isSnoozed = effectiveSnoozed(thread, { now: new Date().toISOString() });
      const snoozePresets = resolveSnoozePresets(new Date());
      const isRegeneratingTitle = thread.titleRegeneration != null;
      const selection = await showNativeContextMenu([
        ...(thread.branch
          ? [{ id: "new-thread-on-branch", label: `New thread on ${thread.branch}` }]
          : []),
        ...(settlementSupported
          ? [
              {
                id: settled ? "unsettle" : "settle",
                label: settled ? "Un-settle thread" : "Settle thread",
              },
            ]
          : []),
        ...(supportsSnooze
          ? [
              isSnoozed
                ? { id: "unsnooze", label: "Wake thread" }
                : {
                    id: "snooze",
                    label: "Snooze",
                    children: snoozePresets.map((preset) => ({
                      id: `snooze:${preset.id}`,
                      label: `${preset.label} (${preset.whenLabel})`,
                    })),
                  },
            ]
          : []),
        { id: "rename", label: "Rename thread" },
        ...(supportsTitleRegeneration
          ? [
              {
                id: "regenerate-title",
                label: isRegeneratingTitle ? "Regenerating…" : "Regenerate title",
                disabled: isRegeneratingTitle,
              },
            ]
          : []),
        ...(workspacePath ? [{ id: "copy-path", label: "Copy path" }] : []),
        ...(thread.branch ? [{ id: "copy-branch", label: "Copy branch" }] : []),
        { id: "mark-unread", label: "Mark unread" },
        { id: "archive", label: "Archive" },
        { id: "delete", label: "Delete", destructive: true },
      ]);
      if (selection?.startsWith("snooze:")) {
        const preset = snoozePresets.find((candidate) => `snooze:${candidate.id}` === selection);
        if (preset) await t3ClientActions.snoozeThread(thread.id, preset.snoozedUntil);
        return;
      }
      if (selection === "new-thread-on-branch" && thread.branch) {
        await t3ClientActions.createThread(thread.projectId, {
          branch: thread.branch,
          worktreePath: thread.worktreePath,
          envMode: thread.worktreePath ? "worktree" : "local",
          startFromOrigin: false,
        });
      } else if (selection === "settle") await t3ClientActions.settleThread(thread.id);
      else if (selection === "unsettle") await t3ClientActions.unsettleThread(thread.id);
      else if (selection === "unsnooze") await t3ClientActions.unsnoozeThread(thread.id);
      else if (selection === "copy-path" && workspacePath) {
        await clientCapabilities.clipboard.writeText(workspacePath);
      } else if (selection === "copy-branch" && thread.branch) {
        await clientCapabilities.clipboard.writeText(thread.branch);
      } else if (selection === "mark-unread") {
        markThreadUnread(thread);
      } else if (selection === "regenerate-title") {
        await t3ClientActions.regenerateThreadTitle(thread.id);
      } else if (selection === "archive") await t3ClientActions.archiveThread(thread.id);
      else if (selection === "rename" || selection === "delete") {
        setActionMenuThreadId(thread.id);
        setNativeFollowup({ kind: selection, threadId: thread.id });
      }
    },
    [markThreadUnread, serverConfig, settlementSupported, threads],
  );
  const newThreadShortcutLabel = serverConfig
    ? (shortcutLabelForCommand(serverConfig.keybindings, "chat.newLocal", "MacIntel") ??
      shortcutLabelForCommand(serverConfig.keybindings, "chat.new", "MacIntel"))
    : null;
  const projectScopeOptions = orderedProjects.map((project) => ({
    scopeKey: project.id,
    displayName: project.title,
    favicon: (
      <ProjectFavicon
        environmentId={project.environmentId}
        cwd={project.workspaceRoot}
        className="size-4 shrink-0"
        size={16}
      />
    ),
    onContextMenu: () => {
      void showNativeContextMenu([
        { id: "settings", label: "Project settings" },
        { id: "copy-path", label: "Copy Path" },
      ])
        .then(async (selection) => {
          if (selection === "settings") {
            setProjectScopeMenuOpen(false);
            setProjectSettingsProjectId(project.id);
          } else if (selection === "copy-path") {
            await clientCapabilities.clipboard.writeText(project.workspaceRoot);
          }
        })
        .catch(() => undefined);
    },
    actions: (
      <view
        className="sidebar-v2-project-action"
        data-sidebar-project-action={project.id}
        aria-label={`Project actions for ${project.title}`}
        bindtap={(event: { stopPropagation?: () => void }) => {
          stopPropagation(event);
          setProjectScopeMenuOpen(false);
          setProjectSettingsProjectId(project.id);
        }}
      >
        <Icon name="ellipsis" size={14} color="#a1a1aa" />
      </view>
    ),
  }));
  const projectSettingsProject =
    projectSettingsProjectId === null
      ? null
      : (orderedProjects.find((project) => project.id === projectSettingsProjectId) ?? null);
  return (
    <>
      <SidebarV2CompositionSurface
        isElectron
        controls={{
          commandPaletteShortcutLabel: null,
          searchControl: (
            <view className="sidebar-inline-search">
              <Icon
                name="search"
                size={16}
                color="#a1a1aa"
                className="sidebar-inline-search__icon"
              />
              <input
                className="sidebar-inline-search__input"
                aria-label="Search threads"
                placeholder="Search"
                {...({ value: threadSearchQuery } as object)}
                bindinput={(event: { detail?: { value?: unknown } }) => {
                  if (typeof event.detail?.value === "string") {
                    setThreadSearchQuery(event.detail.value);
                    setActiveSearchResultIndex(0);
                  }
                }}
              />
              {threadSearchQuery ? (
                <view
                  className="sidebar-inline-search__clear"
                  aria-label="Clear thread search"
                  bindtap={() => {
                    setThreadSearchQuery("");
                    setActiveSearchResultIndex(0);
                  }}
                >
                  <Icon name="x" size={12} color="#a1a1aa" />
                </view>
              ) : null}
            </view>
          ),
          newThreadShortcutLabel,
          newThreadDisabled: newThreadProject === null,
          onSearchClick: () => uiActions.openQuickSwitch("command"),
          onNewThreadClick: () => {
            if (shouldChooseProjectForNewThread(orderedProjects.length)) {
              uiActions.openNewThreadIn();
              return;
            }
            if (newThreadProject) void t3ClientActions.createThread(newThreadProject.id);
          },
          projectScopeOptions,
          projectScopeKey,
          onProjectScopeKeyChange: uiActions.setProjectScopeKey,
          projectScopeMenuOpen,
          onProjectScopeMenuOpenChange: setProjectScopeMenuOpen,
          projectScopePopupWidth: sidebarWidth - 53,
          scopedFavicon: scopedProject ? (
            <ProjectFavicon
              environmentId={scopedProject.environmentId}
              cwd={scopedProject.workspaceRoot}
              className="size-4 shrink-0"
              size={16}
            />
          ) : null,
          scopedDisplayName: scopedProject?.title ?? null,
          onNewProjectClick: uiActions.openAddProject,
        }}
        rows={[
          ...threadSearchResults.map((thread, index) => {
            const project = projectById.get(thread.projectId) ?? null;
            const timestamp = thread.latestUserMessageAt ?? thread.updatedAt;
            const highlighted = index === activeSearchResultIndex;
            return (
              <view
                key={`search:${thread.id}`}
                id={`sidebar-thread-search-result-${index}`}
                {...({
                  role: "option",
                  "aria-selected": highlighted ? "true" : "false",
                  "aria-current": thread.id === activeThreadId ? "page" : undefined,
                } as object)}
                className={
                  highlighted || thread.id === activeThreadId
                    ? "sidebar-v2-search-result sidebar-v2-search-result--highlighted"
                    : "sidebar-v2-search-result"
                }
                data-sidebar-search-result={thread.id}
                bindtap={() => {
                  setThreadSearchQuery("");
                  setActiveSearchResultIndex(0);
                  markThreadVisited(thread);
                  t3ClientActions.selectThread(thread.id);
                }}
              >
                <ProjectFavicon
                  environmentId={thread.environmentId}
                  cwd={project?.workspaceRoot ?? ""}
                  className="sidebar-v2-search-result__favicon size-4 shrink-0"
                  size={16}
                />
                <HostText className="sidebar-v2-search-result__title min-w-0 flex-1 truncate">
                  {thread.title}
                </HostText>
                <HostText className="sidebar-v2-search-result__time">
                  {compactSidebarTimeLabel(formatRelativeTimeLabel(timestamp))}
                </HostText>
              </view>
            );
          }),
          ...visibleActiveThreads.map((thread) => {
            const status = resolveSidebarV2Status(thread);
            const isActive = thread.id === activeThreadId;
            const disposableEmptyThread = isDisposableEmptyThread(thread);
            const project = projectById.get(thread.projectId) ?? null;
            const timestamp = thread.latestUserMessageAt ?? thread.updatedAt;
            const providerProjection = resolveThreadProvider(thread, providerByInstanceId);
            const actionMenuOpen = actionMenuThreadId === thread.id;
            const snoozeMenuOpen = snoozeMenuThreadId === thread.id;
            const snoozeSupported = serverConfig?.environment.capabilities.threadSnooze === true;
            const showSnoozeButton =
              snoozeSupported && canSnooze(thread, { now: new Date().toISOString() });
            const snoozePresets = snoozeMenuOpen ? resolveSnoozePresets(new Date()) : [];
            const detailsRelationId = `sidebar-thread-details:${thread.id}`;
            const threadKey = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
            const isUnread = hasUnseenThreadCompletion({
              latestTurn: thread.latestTurn,
              lastVisitedAt: threadLastVisitedAtById[threadKey],
            });
            return (
              <SidebarV2RowSurface
                key={thread.id}
                threadId={thread.id}
                variant="card"
                variantAction="settle"
                isActive={isActive}
                isSelected={false}
                shouldRecede={status === "ready" && !isActive}
                isInFlight={
                  status === "working" ||
                  status === "connecting" ||
                  status === "approval" ||
                  status === "input"
                }
                isUnread={isUnread}
                isWoke={false}
                settlementSupported={settlementSupported}
                snoozeSupported={snoozeSupported}
                cardActionsVisible={snoozeMenuOpen || hoveredThreadId === thread.id}
                snoozeMenuOpen={snoozeMenuOpen}
                snoozeWakeLabelText={null}
                projectTitle={project?.title ?? null}
                threadTitle={thread.title}
                branch={thread.branch ?? null}
                threadTimeLabel={compactSidebarTimeLabel(formatRelativeTimeLabel(timestamp))}
                settledTimeLabel=""
                topStatus={statusPresentation(status, thread)}
                jumpLabel={jumpLabelByThreadId.get(thread.id) ?? null}
                favicon={
                  <ProjectFavicon
                    environmentId={thread.environmentId}
                    cwd={project?.workspaceRoot ?? ""}
                    className="size-4 shrink-0"
                    size={16}
                  />
                }
                title={
                  <HostText
                    className={
                      isActive
                        ? "sidebar-v2-row-title min-w-0 flex-1 truncate text-sm font-medium text-foreground"
                        : "sidebar-v2-row-title min-w-0 flex-1 truncate text-sm font-normal text-foreground/90"
                    }
                  >
                    {thread.title}
                  </HostText>
                }
                prBadge={null}
                isRegeneratingTitle={thread.titleRegeneration != null}
                terminalStatusIcon={null}
                diff={null}
                remoteIndicator={null}
                providerIndicator={
                  <view className="sidebar-v2-provider-summary" aria-hidden="true">
                    <ProviderBrandIcon
                      driverKind={providerProjection.provider?.driverKind ?? null}
                      size={14}
                    />
                  </view>
                }
                detailsTooltip={
                  <LynxThreadDetails
                    relationId={detailsRelationId}
                    thread={thread}
                    projectTitle={project?.title ?? null}
                    environmentLabel={serverConfig?.environment.label ?? null}
                    provider={providerProjection.provider}
                    modelLabel={providerProjection.modelLabel}
                  />
                }
                detailsRelationId={detailsRelationId}
                detailsOverlay={
                  snoozeMenuOpen ? (
                    <>
                      <view
                        className="sidebar-v2-snooze-dismiss"
                        bindtap={() => setSnoozeMenuThreadId(null)}
                      />
                      <view className="sidebar-v2-snooze-menu" data-sidebar-snooze-menu={thread.id}>
                        {snoozePresets.map((preset) => (
                          <view
                            key={preset.id}
                            className="sidebar-v2-snooze-menu__item"
                            data-sidebar-snooze-preset={preset.id}
                            bindtap={(event: unknown) => {
                              stopPropagation(event);
                              setSnoozeMenuThreadId(null);
                              void t3ClientActions
                                .snoozeThread(thread.id, preset.snoozedUntil)
                                .catch(() => undefined);
                            }}
                          >
                            <text className="sidebar-v2-snooze-menu__label">{preset.label}</text>
                            <text className="sidebar-v2-snooze-menu__time">{preset.whenLabel}</text>
                          </view>
                        ))}
                      </view>
                    </>
                  ) : actionMenuOpen ? (
                    <LynxThreadActionMenu
                      thread={thread}
                      projectPath={project?.workspaceRoot ?? null}
                      settled={false}
                      settlementSupported={settlementSupported}
                      onMarkUnread={() => markThreadUnread(thread)}
                      initialMode={
                        nativeFollowup?.threadId === thread.id ? nativeFollowup.kind : "menu"
                      }
                      onClose={() => {
                        setActionMenuThreadId(null);
                        setNativeFollowup(null);
                      }}
                    />
                  ) : undefined
                }
                cardActionControl={
                  disposableEmptyThread ? (
                    <view
                      className="sidebar-v2-card-action-icon"
                      data-sidebar-empty-thread-delete={thread.id}
                      aria-label="Delete empty thread"
                      bindtap={(event: unknown) => {
                        stopPropagation(event);
                        void t3ClientActions.deleteThread(thread.id).catch(() => undefined);
                      }}
                    >
                      <Icon name="x" size={12} color="#a1a1aa" />
                    </view>
                  ) : showSnoozeButton ? (
                    <view
                      className="sidebar-v2-card-action-icon"
                      data-sidebar-snooze-trigger={thread.id}
                      aria-label="Snooze thread"
                      bindtap={(event: unknown) => {
                        stopPropagation(event);
                        setActionMenuThreadId(null);
                        setSnoozeMenuThreadId(snoozeMenuOpen ? null : thread.id);
                      }}
                    >
                      <Icon name="clock" size={12} color="#a1a1aa" />
                    </view>
                  ) : null
                }
                settleIcon={<Icon name="check" size={12} color="#a1a1aa" className="size-3" />}
                unsettleIcon={
                  <Icon name="rotate-ccw" size={12} color="#a1a1aa" className="size-3" />
                }
                unsnoozeIcon={
                  <Icon name="rotate-ccw" size={12} color="#a1a1aa" className="size-3" />
                }
                wokeIcon={<Icon name="refresh-cw" size={12} color="#a1a1aa" className="size-3" />}
                onClick={() => {
                  markThreadVisited(thread);
                  t3ClientActions.selectThread(thread.id);
                }}
                onDoubleClick={() => {}}
                onKeyDown={() => {}}
                onContextMenu={(event) => {
                  stopPropagation(event);
                  void showThreadContextMenu(thread, project?.workspaceRoot ?? null, false).catch(
                    () => undefined,
                  );
                }}
                onMouseEnter={() => {
                  setHoveredThreadId(thread.id);
                }}
                onMouseLeave={() => {
                  if (!actionMenuOpen && !snoozeMenuOpen) {
                    setHoveredThreadId((current) => (current === thread.id ? null : current));
                  }
                }}
                onSettleClick={(event) => {
                  stopPropagation(event);
                  void t3ClientActions.settleThread(thread.id).catch(() => undefined);
                }}
                onUnsettleClick={stopPropagation}
                onUnsnoozeClick={stopPropagation}
              />
            );
          }),
          ...(settledThreads.length > 0 && threadSearchQuery.trim().length === 0
            ? [
                <view
                  key="settled-shelf-header"
                  className="sidebar-v2-settled-shelf-toggle"
                  data-testid="sidebar-v2-settled-shelf-toggle"
                  aria-expanded={settledShelfExpanded ? "true" : "false"}
                  bindtap={() => setSettledShelfExpanded((expanded) => !expanded)}
                >
                  <text className="sidebar-v2-settled-shelf-label">
                    {settledShelfExpanded ? "Settled" : `Settled (${settledThreads.length})`}
                  </text>
                  <view className="sidebar-v2-settled-shelf-rule" />
                  <Icon
                    name="chevron-down"
                    size={12}
                    color="#818181"
                    className={
                      settledShelfExpanded
                        ? "sidebar-v2-settled-shelf-chevron sidebar-v2-settled-shelf-chevron--expanded"
                        : "sidebar-v2-settled-shelf-chevron"
                    }
                  />
                </view>,
              ]
            : []),
          ...visibleSettledThreads.map((thread) => {
            const project = projectById.get(thread.projectId) ?? null;
            const providerProjection = resolveThreadProvider(thread, providerByInstanceId);
            const actionMenuOpen = actionMenuThreadId === thread.id;
            const threadKey = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
            const isUnread = hasUnseenThreadCompletion({
              latestTurn: thread.latestTurn,
              lastVisitedAt: threadLastVisitedAtById[threadKey],
            });
            return (
              <SidebarV2RowSurface
                key={`${thread.id}:slim`}
                threadId={thread.id}
                variant="slim"
                variantAction="unsettle"
                isActive={thread.id === activeThreadId}
                isSelected={false}
                shouldRecede={false}
                isInFlight={false}
                isUnread={isUnread}
                isWoke={false}
                settlementSupported={settlementSupported}
                snoozeSupported={false}
                snoozeMenuOpen={false}
                snoozeWakeLabelText={null}
                projectTitle={project?.title ?? null}
                threadTitle={thread.title}
                branch={thread.branch ?? null}
                threadTimeLabel=""
                settledTimeLabel={settledTimeLabel(thread)}
                topStatus={null}
                jumpLabel={jumpLabelByThreadId.get(thread.id) ?? null}
                favicon={
                  <Icon name="message-square" size={16} color="#818181" className="size-4" />
                }
                title={
                  <HostText
                    onClick={() => {
                      markThreadVisited(thread);
                      t3ClientActions.selectThread(thread.id);
                    }}
                    onContextMenu={(event) => {
                      stopPropagation(event);
                      void showThreadContextMenu(
                        thread,
                        project?.workspaceRoot ?? null,
                        true,
                      ).catch(() => undefined);
                    }}
                    className="sidebar-v2-row-title min-w-0 flex-1 truncate text-sm font-medium text-foreground"
                  >
                    {thread.title}
                  </HostText>
                }
                prBadge={null}
                isRegeneratingTitle={thread.titleRegeneration != null}
                terminalStatusIcon={null}
                diff={null}
                remoteIndicator={null}
                providerIndicator={null}
                detailsTooltip={
                  <LynxThreadDetails
                    relationId={`sidebar-thread-details:${thread.id}`}
                    thread={thread}
                    projectTitle={project?.title ?? null}
                    environmentLabel={serverConfig?.environment.label ?? null}
                    provider={providerProjection.provider}
                    modelLabel={providerProjection.modelLabel}
                  />
                }
                detailsRelationId={`sidebar-thread-details:${thread.id}`}
                detailsOverlay={
                  actionMenuOpen ? (
                    <LynxThreadActionMenu
                      thread={thread}
                      projectPath={project?.workspaceRoot ?? null}
                      settled
                      settlementSupported={settlementSupported}
                      onMarkUnread={() => markThreadUnread(thread)}
                      initialMode={
                        nativeFollowup?.threadId === thread.id ? nativeFollowup.kind : "menu"
                      }
                      onClose={() => {
                        setActionMenuThreadId(null);
                        setNativeFollowup(null);
                      }}
                    />
                  ) : undefined
                }
                cardActionControl={null}
                settleIcon={<Icon name="check" size={12} color="#a1a1aa" className="size-3" />}
                unsettleIcon={
                  <Icon name="rotate-ccw" size={12} color="#a1a1aa" className="size-3" />
                }
                unsnoozeIcon={
                  <Icon name="rotate-ccw" size={12} color="#a1a1aa" className="size-3" />
                }
                wokeIcon={<Icon name="refresh-cw" size={12} color="#a1a1aa" className="size-3" />}
                onClick={() => {
                  markThreadVisited(thread);
                  t3ClientActions.selectThread(thread.id);
                }}
                onDoubleClick={() => {}}
                onKeyDown={() => {}}
                onContextMenu={(event) => {
                  stopPropagation(event);
                  void showThreadContextMenu(thread, project?.workspaceRoot ?? null, true).catch(
                    () => undefined,
                  );
                }}
                onMouseEnter={() => setHoveredThreadId(thread.id)}
                onMouseLeave={() => {
                  if (!actionMenuOpen) {
                    setHoveredThreadId((current) => (current === thread.id ? null : current));
                  }
                }}
                onSettleClick={stopPropagation}
                onUnsettleClick={(event) => {
                  stopPropagation(event);
                  void t3ClientActions.unsettleThread(thread.id).catch(() => undefined);
                }}
                onUnsnoozeClick={stopPropagation}
              />
            );
          }),
        ]}
        rowCount={
          threadSearchQuery.trim()
            ? threadSearchResults.length
            : visibleActiveThreads.length + visibleSettledThreads.length
        }
        listId={threadSearchQuery ? "sidebar-thread-search-results" : undefined}
        listRole={threadSearchQuery ? "listbox" : "list"}
        listAriaLabel={threadSearchQuery ? "Thread search results" : undefined}
        emptyState={
          threadSearchQuery ? (
            <HostText className="sidebar-inline-search__empty">No matching threads</HostText>
          ) : undefined
        }
        hasProjects={projects.length > 0}
        scopedDisplayName={scopedProject?.title ?? null}
        onAddProjectClick={uiActions.openAddProject}
      />
      {projectSettingsProject ? (
        <ProjectSettingsDialog
          members={[
            {
              id: projectSettingsProject.id,
              environmentId: projectSettingsProject.environmentId,
              title: projectSettingsProject.title,
              workspaceRoot: projectSettingsProject.workspaceRoot,
              environmentLabel: serverConfig?.environment.label ?? null,
            },
          ]}
          onClose={() => setProjectSettingsProjectId(null)}
        />
      ) : null}
    </>
  );
}
