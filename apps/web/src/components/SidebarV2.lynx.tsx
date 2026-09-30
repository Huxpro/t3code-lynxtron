import { useCallback, useEffect, useMemo, useState } from "react";

import { t3ClientActions, useT3ClientState } from "../../../lynxtron/src/app/state/t3Client";
import { uiActions, useProjectScopeKey } from "../../../lynxtron/src/app/state/uiState";
import { Icon } from "../../../lynxtron/src/app/components/Icon";
import {
  canSnooze,
  effectiveSettled,
  resolveSnoozePresets,
  threadWokeAt,
} from "@t3tools/client-runtime/state/thread-settled";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  shortcutLabelForCommand,
  shouldShowThreadJumpHintsForModifiers,
  threadJumpCommandForIndex,
} from "../keybindings";
import { useProjects, useThreadShells } from "../state/entities";
import { useViewportSnapshot } from "../hooks/useViewportSnapshot";
import { ProjectFavicon } from "./ProjectFavicon";
import {
  resolveSidebarThreadStatus,
  resolveWorkingStartedAt,
  formatWorkingDurationLabel,
  searchSidebarThreadsByTitle,
  shouldChooseProjectForNewThread,
  sortScopedProjectsForSidebar,
  sortPinnedThreadsForSidebar,
  sortSettledThreadsForSidebar,
  sortThreadsForSidebar,
  isSidebarV2ThreadWoke,
  resolveSidebarV2RowPresentation,
  sidebarV2SettledTimeLabel,
  sidebarV2ThreadTimeLabel,
  type SidebarV2TopStatus,
} from "./Sidebar.logic";
import { openThreadActionMenu } from "../../../lynxtron/src/app/components/threadActionMenu";
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
import { useOpenProjectSettings } from "../../../lynxtron/src/app/components/ProjectSettingsPage";
import {
  isDisposableEmptyThread,
  projectThreadActionConfirmation,
} from "@t3tools/client-runtime/presentation/thread-actions";
import {
  hasUnseenThreadCompletion,
  markThreadVisitedInTimestampRecord,
  projectSidebarThreadDetailsRows,
} from "@t3tools/client-runtime/presentation/sidebar";
import {
  updateThreadVisitedTimestamps,
  useClientSettingsState,
  useThreadVisitedTimestamps,
} from "../../../lynxtron/src/app/state/prefsStore";
import { onSidebarThreadJump } from "../../../lynxtron/src/app/state/sidebarThreadNavigation";
import { useLynxShortcutModifierState } from "../../../lynxtron/src/app/state/shortcutModifierState";

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

const TOP_STATUS_ICON_NAMES = {
  working: "circle-dashed",
  done: "circle-check",
  woke: "alarm-clock",
} as const;

function lynxTopStatus(
  topStatus: SidebarV2TopStatus | null,
  thread: ReturnType<typeof useThreadShells>[number],
): SidebarV2RowStatus | null {
  if (topStatus === null) return null;
  return {
    label: topStatus.label,
    className: topStatus.className,
    icon:
      topStatus.icon === null ? null : (
        <Icon
          name={TOP_STATUS_ICON_NAMES[topStatus.icon]}
          size={16}
          color="#a1a1aa"
          className="size-4 shrink-0"
        />
      ),
    workingDuration: topStatus.icon === "working" ? <LynxWorkingDuration thread={thread} /> : null,
  };
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

/** Lynx leaf for the rename field and delete confirmation chosen from the native menu. */
function LynxThreadActionMenu({
  thread,
  onClose,
  mode,
}: {
  readonly thread: ReturnType<typeof useThreadShells>[number];
  readonly onClose: () => void;
  readonly mode: "rename" | "delete";
}) {
  const [renameDraft, setRenameDraft] = useState(thread.title);
  const confirmation = projectThreadActionConfirmation({
    action: "delete",
    threadTitle: thread.title,
  });

  const run = (action: () => Promise<void>) => {
    void action()
      .catch(() => undefined)
      .finally(onClose);
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
        bindtap={stopPropagation}
      >
        {mode === "rename" ? (
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
        ) : (
          <view className="sidebar-v2-action-menu__confirm">
            <text className="sidebar-v2-action-menu__confirm-title">{confirmation.title}</text>
            {confirmation.description ? (
              <text className="sidebar-v2-action-menu__confirm-copy">
                {confirmation.description}
              </text>
            ) : null}
            <view className="sidebar-v2-action-menu__confirm-actions">
              <view className="sidebar-v2-action-menu__confirm-button" bindtap={onClose}>
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
                  {confirmation.confirmLabel}
                </text>
              </view>
            </view>
          </view>
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
  const {
    activeThreadId,
    composerDraftAttachmentsByScopeKey,
    composerDraftTextByScopeKey,
    draftThreadsByProjectId,
    providerEntries,
    serverConfig,
  } = useT3ClientState();
  const { sidebarWidth } = useSidebar();
  const projects = useProjects();
  const threads = useThreadShells();
  const viewport = useViewportSnapshot();
  const shortcutModifiers = useLynxShortcutModifierState();
  const [threadSearchQuery, setThreadSearchQuery] = useState("");
  const [activeSearchResultIndex, setActiveSearchResultIndex] = useState(0);
  const projectScopeKey = useProjectScopeKey();
  const [projectScopeMenuOpen, setProjectScopeMenuOpen] = useState(false);
  const openProjectSettings = useOpenProjectSettings();
  const [settledShelfExpanded, setSettledShelfExpanded] = useState(true);
  const [actionMenuThreadId, setActionMenuThreadId] = useState<string | null>(null);
  const [snoozeMenuThreadId, setSnoozeMenuThreadId] = useState<string | null>(null);
  const [nativeFollowup, setNativeFollowup] = useState<{
    readonly kind: "rename" | "delete";
    readonly threadId: string;
  } | null>(null);
  const [hoveredThreadId, setHoveredThreadId] = useState<string | null>(null);
  const threadLastVisitedAtById = useThreadVisitedTimestamps();
  const markThreadVisited = useCallback((thread: (typeof threads)[number]) => {
    const threadKey = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
    updateThreadVisitedTimestamps((current) =>
      markThreadVisitedInTimestampRecord(current, threadKey, thread.updatedAt),
    );
  }, []);
  const orderedProjects = useMemo(
    () => sortScopedProjectsForSidebar(projects, threads, "updated_at"),
    [projects, threads],
  );
  const [clientSettings] = useClientSettingsState();
  const { activeThreads, settledThreads } = useMemo(() => {
    const visible = threads.filter(
      (thread) =>
        thread.archivedAt === null &&
        (projectScopeKey === null || thread.projectId === projectScopeKey),
    );
    const pinningSupported = serverConfig?.environment.capabilities.threadPinning === true;
    if (serverConfig?.environment.capabilities.threadSettlement !== true) {
      const isPinned = (thread: (typeof visible)[number]) =>
        pinningSupported && thread.pinnedAt != null;
      return {
        activeThreads: [
          ...sortPinnedThreadsForSidebar(visible.filter(isPinned)),
          ...sortThreadsForSidebar(visible.filter((thread) => !isPinned(thread))),
        ],
        settledThreads: [],
      };
    }
    const now = new Date().toISOString();
    const pinned = [];
    const active = [];
    const settled = [];
    for (const thread of visible) {
      // A pin overrides settlement, as on Web: pinned threads lead the list.
      if (pinningSupported && thread.pinnedAt != null) {
        pinned.push(thread);
      } else if (
        effectiveSettled(thread, {
          now,
          autoSettleAfterDays: clientSettings.sidebarAutoSettleAfterDays,
        })
      ) {
        settled.push(thread);
      } else {
        active.push(thread);
      }
    }
    return {
      activeThreads: [...sortPinnedThreadsForSidebar(pinned), ...sortThreadsForSidebar(active)],
      settledThreads: sortSettledThreadsForSidebar(settled),
    };
  }, [clientSettings.sidebarAutoSettleAfterDays, projectScopeKey, serverConfig, threads]);
  // Upstream #5777: unsent drafts with content stay one click away above the
  // thread list. The open draft is left out so typing never repaints rows.
  const unsentDrafts = useMemo(
    () =>
      Object.values(draftThreadsByProjectId)
        .filter(
          (draft) =>
            draft.id !== activeThreadId &&
            (projectScopeKey === null || draft.projectId === projectScopeKey),
        )
        .flatMap((draft) => {
          const scopeKey = `project:${draft.projectId}`;
          const firstLine = (composerDraftTextByScopeKey[scopeKey] ?? "").trim().split("\n", 1)[0];
          const attachmentCount = composerDraftAttachmentsByScopeKey[scopeKey]?.length ?? 0;
          if (!firstLine && attachmentCount === 0) return [];
          return [
            {
              draft,
              preview:
                firstLine || `${attachmentCount} attachment${attachmentCount === 1 ? "" : "s"}`,
            },
          ];
        })
        .sort((left, right) => right.draft.createdAt.localeCompare(left.draft.createdAt)),
    [
      activeThreadId,
      composerDraftAttachmentsByScopeKey,
      composerDraftTextByScopeKey,
      draftThreadsByProjectId,
      projectScopeKey,
    ],
  );
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
    (thread: (typeof threads)[number], projectPath: string | null, settled: boolean) =>
      openThreadActionMenu({
        thread,
        projectPath,
        settled,
        serverConfig,
        onRename: () => {
          setActionMenuThreadId(thread.id);
          setNativeFollowup({ kind: "rename", threadId: thread.id });
        },
        onDelete: () => {
          setActionMenuThreadId(thread.id);
          setNativeFollowup({ kind: "delete", threadId: thread.id });
        },
      }),
    [serverConfig],
  );
  useEffect(() => {
    const diagnosticsGlobal = globalThis as typeof globalThis & {
      __T3_LYNXTRON_SIDEBAR_THREAD_MENU_PROBE__?: (threadId: string) => boolean;
      __T3_LYNXTRON_VIEWPORT_PROBE__?: unknown;
    };
    if (typeof diagnosticsGlobal.__T3_LYNXTRON_VIEWPORT_PROBE__ !== "function") return;
    // DevTool touches carry no mouse button, so the probe invokes the same
    // secondary-click handler a sidebar row registers.
    diagnosticsGlobal.__T3_LYNXTRON_SIDEBAR_THREAD_MENU_PROBE__ = (threadId) => {
      const thread = threads.find((candidate) => candidate.id === threadId);
      if (!thread) return false;
      const settled = settledThreads.some((candidate) => candidate.id === threadId);
      void showThreadContextMenu(
        thread,
        projectById.get(thread.projectId)?.workspaceRoot ?? null,
        settled,
      ).catch(() => undefined);
      return true;
    };
    return () => {
      delete diagnosticsGlobal.__T3_LYNXTRON_SIDEBAR_THREAD_MENU_PROBE__;
    };
  }, [projectById, settledThreads, showThreadContextMenu, threads]);
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
            openProjectSettings(project);
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
          openProjectSettings(project);
        }}
      >
        <Icon name="ellipsis" size={14} color="#a1a1aa" />
      </view>
    ),
  }));
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
                  {sidebarV2ThreadTimeLabel(thread)}
                </HostText>
              </view>
            );
          }),
          ...(threadSearchQuery.trim() ? [] : unsentDrafts).map(({ draft, preview }) => {
            const project = projectById.get(draft.projectId) ?? null;
            return (
              <view
                key={`draft:${draft.id}`}
                className="sidebar-v2-draft-row"
                data-sidebar-draft={draft.projectId}
                aria-label={`Open draft in ${project?.title ?? "project"}`}
                bindtap={() => {
                  void t3ClientActions.createThread(draft.projectId).catch(() => undefined);
                }}
              >
                <view className="sidebar-v2-draft-row__head">
                  <Icon name="square-pen" size={12} color="#d97706" />
                  {project ? (
                    <ProjectFavicon
                      environmentId={project.environmentId}
                      cwd={project.workspaceRoot}
                      className="size-4 shrink-0"
                      size={16}
                    />
                  ) : null}
                  <HostText className="sidebar-v2-draft-row__project min-w-0 flex-1 truncate">
                    {project?.title ?? ""}
                  </HostText>
                  <view
                    className="sidebar-v2-draft-row__discard"
                    data-sidebar-draft-discard={draft.projectId}
                    aria-label="Discard draft"
                    catchtap={() => t3ClientActions.discardProjectDraft(draft.projectId)}
                  >
                    <Icon name="x" size={12} color="#a1a1aa" />
                  </view>
                </view>
                <HostText className="sidebar-v2-draft-row__preview truncate">{preview}</HostText>
              </view>
            );
          }),
          ...visibleActiveThreads.map((thread) => {
            const status = resolveSidebarThreadStatus(thread);
            const isActive = thread.id === activeThreadId;
            const disposableEmptyThread = isDisposableEmptyThread(thread);
            const project = projectById.get(thread.projectId) ?? null;
            const providerProjection = resolveThreadProvider(thread, providerByInstanceId);
            const actionMenuOpen = actionMenuThreadId === thread.id;
            const snoozeMenuOpen = snoozeMenuThreadId === thread.id;
            const snoozeSupported = serverConfig?.environment.capabilities.threadSnooze === true;
            const showSnoozeButton =
              snoozeSupported && canSnooze(thread, { now: new Date().toISOString() });
            const snoozePresets = snoozeMenuOpen ? resolveSnoozePresets(new Date()) : [];
            const detailsRelationId = `sidebar-thread-details:${thread.id}`;
            const threadKey = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
            const lastVisitedAt = threadLastVisitedAtById[threadKey];
            const isUnread = hasUnseenThreadCompletion({
              latestTurn: thread.latestTurn,
              lastVisitedAt,
            });
            const isWoke = isSidebarV2ThreadWoke(
              threadWokeAt(thread, { now: new Date().toISOString() }),
              lastVisitedAt,
            );
            const presentation = resolveSidebarV2RowPresentation({
              status,
              isUnread,
              isWoke,
              isActive,
              isSelected: false,
            });
            return (
              <SidebarV2RowSurface
                key={thread.id}
                threadId={thread.id}
                variant="card"
                variantAction="settle"
                isActive={isActive}
                isSelected={false}
                shouldRecede={presentation.shouldRecede}
                isInFlight={presentation.isInFlight}
                isUnread={isUnread}
                isWoke={isWoke}
                settlementSupported={settlementSupported}
                snoozeSupported={snoozeSupported}
                cardActionsVisible={snoozeMenuOpen || hoveredThreadId === thread.id}
                snoozeMenuOpen={snoozeMenuOpen}
                snoozeWakeLabelText={null}
                projectTitle={project?.title ?? null}
                threadTitle={thread.title}
                branch={thread.branch ?? null}
                threadTimeLabel={sidebarV2ThreadTimeLabel(thread)}
                settledTimeLabel=""
                topStatus={lynxTopStatus(presentation.topStatus, thread)}
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
                  ) : actionMenuOpen && nativeFollowup?.threadId === thread.id ? (
                    <LynxThreadActionMenu
                      thread={thread}
                      mode={nativeFollowup.kind}
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
                pinControl={
                  thread.pinnedAt != null &&
                  serverConfig?.environment.capabilities.threadPinning === true ? (
                    <view
                      className="sidebar-v2-row-pin"
                      data-sidebar-unpin={thread.id}
                      aria-label="Unpin thread"
                      bindtap={(event: unknown) => {
                        stopPropagation(event);
                        void t3ClientActions.unpinThread(thread.id).catch(() => undefined);
                      }}
                    >
                      <Icon name="pin" size={12} color="#a1a1aa" />
                    </view>
                  ) : null
                }
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
            const lastVisitedAt = threadLastVisitedAtById[threadKey];
            const isUnread = hasUnseenThreadCompletion({
              latestTurn: thread.latestTurn,
              lastVisitedAt,
            });
            const isWoke = isSidebarV2ThreadWoke(
              threadWokeAt(thread, { now: new Date().toISOString() }),
              lastVisitedAt,
            );
            const presentation = resolveSidebarV2RowPresentation({
              status: resolveSidebarThreadStatus(thread),
              isUnread,
              isWoke,
              isActive: thread.id === activeThreadId,
              isSelected: false,
            });
            return (
              <SidebarV2RowSurface
                key={`${thread.id}:slim`}
                threadId={thread.id}
                variant="slim"
                variantAction="unsettle"
                isActive={thread.id === activeThreadId}
                isSelected={false}
                shouldRecede={presentation.shouldRecede}
                isInFlight={presentation.isInFlight}
                isUnread={isUnread}
                isWoke={isWoke}
                settlementSupported={settlementSupported}
                snoozeSupported={false}
                snoozeMenuOpen={false}
                snoozeWakeLabelText={null}
                projectTitle={project?.title ?? null}
                threadTitle={thread.title}
                branch={thread.branch ?? null}
                threadTimeLabel=""
                settledTimeLabel={sidebarV2SettledTimeLabel(thread)}
                topStatus={lynxTopStatus(presentation.topStatus, thread)}
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
                  actionMenuOpen && nativeFollowup?.threadId === thread.id ? (
                    <LynxThreadActionMenu
                      thread={thread}
                      mode={nativeFollowup.kind}
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
            <HostText className="sidebar-inline-search__empty">No threads found</HostText>
          ) : undefined
        }
        hasProjects={projects.length > 0}
        scopedDisplayName={scopedProject?.title ?? null}
        onAddProjectClick={uiActions.openAddProject}
      />
    </>
  );
}
