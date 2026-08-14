import { useEffect, useMemo, useState } from "react";

import { t3ClientActions, useT3ClientState } from "../../../lynxtron/src/app/state/t3Client";
import { uiActions } from "../../../lynxtron/src/app/state/uiState";
import { Icon } from "../../../lynxtron/src/app/components/Icon";
import { effectiveSettled } from "@t3tools/client-runtime/state/thread-settled";
import { DEFAULT_SIDEBAR_AUTO_SETTLE_AFTER_DAYS } from "@t3tools/contracts/settings";
import { formatRelativeTimeLabel } from "../timestampFormat";
import { useProjects, useThreadShells } from "../state/entities";
import { useViewportSnapshot } from "../hooks/useViewportSnapshot";
import { ProjectFavicon } from "./ProjectFavicon";
import {
  resolveSidebarV2Status,
  resolveSettledTimestamp,
  sortScopedProjectsForSidebar,
  sortSettledThreadsForSidebarV2,
  sortThreadsForSidebarV2,
  type SidebarV2Status,
} from "./Sidebar.logic";
import { SidebarV2CompositionSurface } from "./sidebar/SidebarV2CompositionSurface";
import { SidebarV2RowSurface, type SidebarV2RowStatus } from "./sidebar/SidebarV2RowSurface";
import { HostText } from "./ui/hostElements";
import settingsRowUrl from "../../../lynxtron/src/app/assets/sidebar-settings-row@2x.png?external";
import type { ProviderInstanceEntry } from "@t3tools/client-runtime/presentation/provider";
import { clientCapabilities } from "../../../lynxtron/src/app/platform/clientCapabilities.lynx";
import { ProviderBrandIcon } from "../../../lynxtron/src/app/components/ProviderBrandIcon";

function compactSidebarTimeLabel(label: string): string {
  if (label === "just now") return "now";
  return label.endsWith(" ago") ? label.slice(0, -4) : label;
}

function settledTimeLabel(thread: ReturnType<typeof useThreadShells>[number]): string {
  const timestamp = resolveSettledTimestamp(thread);
  return timestamp === null ? "" : compactSidebarTimeLabel(formatRelativeTimeLabel(timestamp));
}

function statusPresentation(status: SidebarV2Status): SidebarV2RowStatus | null {
  switch (status) {
    case "working":
      return {
        label: "Working",
        className:
          "animate-sidebar-working-text text-sky-600 motion-reduce:animate-none dark:text-sky-400",
        icon: <Icon name="refresh-cw" size={16} color="#a1a1aa" className="size-4 shrink-0" />,
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
        icon: <Icon name="triangle-alert" size={16} color="#a1a1aa" className="size-4 shrink-0" />,
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
  thread,
  projectTitle,
  provider,
  instanceId,
  modelLabel,
  onClose,
}: {
  readonly thread: ReturnType<typeof useThreadShells>[number];
  readonly projectTitle: string | null;
  readonly provider: ProviderInstanceEntry | null;
  readonly instanceId: string;
  readonly modelLabel: string;
  readonly onClose: () => void;
}) {
  return (
    <>
      <view className="sidebar-v2-details-dismiss" bindtap={onClose} />
      <view
        className="sidebar-v2-details-popover"
        data-sidebar-thread-details={thread.id}
        bindtap={stopPropagation}
      >
        <text className="sidebar-v2-details-title" text-maxline="2">
          {thread.title}
        </text>
        {projectTitle ? (
          <view className="sidebar-v2-details-row">
            <Icon name="folder" size={12} color="#818181" />
            <text className="sidebar-v2-details-value">{projectTitle}</text>
          </view>
        ) : null}
        {thread.branch ? (
          <view className="sidebar-v2-details-row">
            <Icon name="git-branch" size={12} color="#818181" />
            <text className="sidebar-v2-details-value">{thread.branch}</text>
          </view>
        ) : null}
        <view className="sidebar-v2-details-row">
          <ProviderBrandIcon driverKind={provider?.driverKind ?? null} size={12} />
          <text className="sidebar-v2-details-value">
            {provider?.displayName ?? instanceId} · {modelLabel}
          </text>
        </view>
        {thread.session?.lastError ? (
          <view className="sidebar-v2-details-row sidebar-v2-details-row--error">
            <Icon name="triangle-alert" size={12} color="#f87171" />
            <text className="sidebar-v2-details-value">Error occurred</text>
          </view>
        ) : null}
      </view>
    </>
  );
}

function LynxThreadActionMenu({
  thread,
  projectPath,
  settled,
  settlementSupported,
  onClose,
}: {
  readonly thread: ReturnType<typeof useThreadShells>[number];
  readonly projectPath: string | null;
  readonly settled: boolean;
  readonly settlementSupported: boolean;
  readonly onClose: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState(thread.title);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const workspacePath = thread.worktreePath ?? projectPath;
  const actionCount =
    (settlementSupported ? 1 : 0) + 1 + (workspacePath ? 1 : 0) + (thread.branch ? 1 : 0) + 2;
  const menuHeight = actionCount * 30 + 10;

  const run = (action: () => Promise<void>) => {
    void action()
      .catch(() => undefined)
      .finally(onClose);
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
                bindtap={() => run(() => t3ClientActions.deleteThread(thread.id))}
              >
                <text className="sidebar-v2-action-menu__item-label sidebar-v2-action-menu__item-label--danger">
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
              bindtap={() => run(() => t3ClientActions.archiveThread(thread.id))}
            >
              <Icon name="archive" size={14} color="#818181" />
              <text className="sidebar-v2-action-menu__item-label">Archive</text>
            </view>
            <view
              className="sidebar-v2-action-menu__item sidebar-v2-action-menu__item--danger"
              bindtap={() => setConfirmingDelete(true)}
            >
              <Icon name="trash-2" size={14} color="#f87171" />
              <text className="sidebar-v2-action-menu__item-label sidebar-v2-action-menu__item-label--danger">
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
  const projects = useProjects();
  const threads = useThreadShells();
  const viewport = useViewportSnapshot();
  const [threadSearchQuery, setThreadSearchQuery] = useState("");
  const [projectScopeKey, setProjectScopeKey] = useState<string | null>(null);
  const [projectScopeMenuOpen, setProjectScopeMenuOpen] = useState(false);
  const [settledShelfExpanded, setSettledShelfExpanded] = useState(true);
  const [detailsThreadId, setDetailsThreadId] = useState<string | null>(null);
  const [actionMenuThreadId, setActionMenuThreadId] = useState<string | null>(null);
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
  const visibleActiveThreads = useMemo(() => {
    const query = threadSearchQuery.trim().toLowerCase();
    return query.length === 0
      ? activeThreads
      : activeThreads.filter((thread) => thread.title.toLowerCase().includes(query));
  }, [activeThreads, threadSearchQuery]);
  const visibleSettledThreads = useMemo(() => {
    const query = threadSearchQuery.trim().toLowerCase();
    if (query.length > 0) {
      return settledThreads.filter((thread) => thread.title.toLowerCase().includes(query));
    }
    return settledShelfExpanded ? settledThreads : [];
  }, [settledShelfExpanded, settledThreads, threadSearchQuery]);
  useEffect(() => {
    if (!viewport.testResize) return;
    (
      globalThis as {
        __T3_LYNXTRON_SIDEBAR_SEARCH_PROBE__?: (query: string) => void;
      }
    ).__T3_LYNXTRON_SIDEBAR_SEARCH_PROBE__ = setThreadSearchQuery;
  }, [viewport.testResize]);
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
  const newThreadProject = scopedProject ?? orderedProjects[0] ?? null;
  const settlementSupported = serverConfig?.environment.capabilities.threadSettlement === true;
  const projectScopeOptions = orderedProjects.map((project) => ({
    scopeKey: project.id,
    displayName: project.title,
    favicon: (
      <ProjectFavicon
        environmentId={project.environmentId}
        cwd={project.workspaceRoot}
        className="size-4 shrink-0"
      />
    ),
  }));
  return (
    <SidebarV2CompositionSurface
      isElectron
      controls={{
        commandPaletteShortcutLabel: null,
        searchControl: (
          <view className="sidebar-inline-search">
            <Icon name="search" size={16} color="#a1a1aa" className="sidebar-inline-search__icon" />
            <input
              className="sidebar-inline-search__input"
              aria-label="Search threads"
              placeholder="Search"
              {...({ value: threadSearchQuery } as object)}
              bindinput={(event: { detail?: { value?: unknown } }) => {
                if (typeof event.detail?.value === "string") {
                  setThreadSearchQuery(event.detail.value);
                }
              }}
            />
            {threadSearchQuery ? (
              <view
                className="sidebar-inline-search__clear"
                aria-label="Clear thread search"
                bindtap={() => setThreadSearchQuery("")}
              >
                <Icon name="x" size={12} color="#a1a1aa" />
              </view>
            ) : null}
          </view>
        ),
        newThreadShortcutLabel: null,
        newThreadDisabled: newThreadProject === null,
        onSearchClick: () => uiActions.openQuickSwitch("command"),
        onNewThreadClick: () => {
          if (newThreadProject) void t3ClientActions.createThread(newThreadProject.id);
        },
        projectScopeOptions,
        projectScopeKey,
        onProjectScopeKeyChange: setProjectScopeKey,
        projectScopeMenuOpen,
        onProjectScopeMenuOpenChange: setProjectScopeMenuOpen,
        scopedFavicon: scopedProject ? (
          <ProjectFavicon
            environmentId={scopedProject.environmentId}
            cwd={scopedProject.workspaceRoot}
            className="size-4 shrink-0"
          />
        ) : null,
        scopedDisplayName: scopedProject?.title ?? null,
        onNewProjectClick: () => uiActions.openQuickSwitch("command"),
      }}
      rows={[
        ...visibleActiveThreads.map((thread) => {
          const status = resolveSidebarV2Status(thread);
          const isActive = thread.id === activeThreadId;
          const project = projectById.get(thread.projectId) ?? null;
          const timestamp = thread.latestUserMessageAt ?? thread.updatedAt;
          const providerProjection = resolveThreadProvider(thread, providerByInstanceId);
          const detailsOpen = detailsThreadId === thread.id;
          const actionMenuOpen = actionMenuThreadId === thread.id;
          return (
            <SidebarV2RowSurface
              key={thread.id}
              threadId={thread.id}
              variant="card"
              variantAction="settle"
              isActive={isActive}
              isSelected={false}
              shouldRecede={status === "ready" && !isActive}
              isInFlight={status === "working" || status === "approval" || status === "input"}
              isUnread={false}
              isWoke={false}
              settlementSupported={settlementSupported}
              snoozeSupported={false}
              showSnoozeButton={false}
              cardActionsPersistent
              snoozeMenuOpen={false}
              snoozeWakeLabelText={null}
              projectTitle={project?.title ?? null}
              threadTitle={thread.title}
              branch={thread.branch ?? null}
              threadTimeLabel={compactSidebarTimeLabel(formatRelativeTimeLabel(timestamp))}
              settledTimeLabel=""
              topStatus={statusPresentation(status)}
              jumpLabel={null}
              favicon={
                <ProjectFavicon
                  environmentId={thread.environmentId}
                  cwd={project?.workspaceRoot ?? ""}
                  className="size-4 shrink-0"
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
                <view
                  className="sidebar-v2-provider-summary"
                  aria-label={`Show details for ${thread.title}`}
                  bindtap={(event: unknown) => {
                    stopPropagation(event);
                    setDetailsThreadId(detailsOpen ? null : thread.id);
                  }}
                >
                  <ProviderBrandIcon
                    driverKind={providerProjection.provider?.driverKind ?? null}
                    size={12}
                  />
                  <text className="sidebar-v2-provider-model" text-maxline="1">
                    {providerProjection.modelLabel}
                  </text>
                </view>
              }
              detailsTooltip={null}
              detailsOverlay={
                actionMenuOpen ? (
                  <LynxThreadActionMenu
                    thread={thread}
                    projectPath={project?.workspaceRoot ?? null}
                    settled={false}
                    settlementSupported={settlementSupported}
                    onClose={() => setActionMenuThreadId(null)}
                  />
                ) : detailsOpen ? (
                  <LynxThreadDetails
                    thread={thread}
                    projectTitle={project?.title ?? null}
                    provider={providerProjection.provider}
                    instanceId={providerProjection.instanceId}
                    modelLabel={providerProjection.modelLabel}
                    onClose={() => setDetailsThreadId(null)}
                  />
                ) : undefined
              }
              snoozeControl={
                <view
                  className="sidebar-v2-card-action-icon"
                  data-sidebar-thread-action-trigger={thread.id}
                  aria-label={`Thread actions for ${thread.title}`}
                  bindtap={(event: unknown) => {
                    stopPropagation(event);
                    setDetailsThreadId(null);
                    setActionMenuThreadId(actionMenuOpen ? null : thread.id);
                  }}
                >
                  <Icon name="ellipsis" size={12} color="#a1a1aa" />
                </view>
              }
              settleIcon={<Icon name="check" size={12} color="#a1a1aa" className="size-3" />}
              unsettleIcon={<Icon name="rotate-ccw" size={12} color="#a1a1aa" className="size-3" />}
              unsnoozeIcon={<Icon name="rotate-ccw" size={12} color="#a1a1aa" className="size-3" />}
              wokeIcon={<Icon name="refresh-cw" size={12} color="#a1a1aa" className="size-3" />}
              onClick={() => {
                t3ClientActions.selectThread(thread.id);
              }}
              onDoubleClick={() => {}}
              onKeyDown={() => {}}
              onContextMenu={(event) => {
                stopPropagation(event);
                setDetailsThreadId(null);
                setActionMenuThreadId(thread.id);
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
          const actionMenuOpen = actionMenuThreadId === thread.id;
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
              isUnread={false}
              isWoke={false}
              settlementSupported={settlementSupported}
              snoozeSupported={false}
              showSnoozeButton={false}
              snoozeMenuOpen={false}
              snoozeWakeLabelText={null}
              projectTitle={project?.title ?? null}
              threadTitle={thread.title}
              branch={thread.branch ?? null}
              threadTimeLabel=""
              settledTimeLabel={settledTimeLabel(thread)}
              topStatus={null}
              jumpLabel={null}
              favicon={<Icon name="message-square" size={16} color="#818181" className="size-4" />}
              title={
                <HostText className="sidebar-v2-row-title min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {thread.title}
                </HostText>
              }
              prBadge={null}
              isRegeneratingTitle={thread.titleRegeneration != null}
              terminalStatusIcon={null}
              diff={null}
              remoteIndicator={null}
              providerIndicator={null}
              detailsTooltip={null}
              detailsOverlay={
                actionMenuOpen ? (
                  <LynxThreadActionMenu
                    thread={thread}
                    projectPath={project?.workspaceRoot ?? null}
                    settled
                    settlementSupported={settlementSupported}
                    onClose={() => setActionMenuThreadId(null)}
                  />
                ) : undefined
              }
              snoozeControl={null}
              settleIcon={<Icon name="check" size={12} color="#a1a1aa" className="size-3" />}
              unsettleIcon={<Icon name="rotate-ccw" size={12} color="#a1a1aa" className="size-3" />}
              unsnoozeIcon={<Icon name="rotate-ccw" size={12} color="#a1a1aa" className="size-3" />}
              wokeIcon={<Icon name="refresh-cw" size={12} color="#a1a1aa" className="size-3" />}
              onClick={() => t3ClientActions.selectThread(thread.id)}
              onDoubleClick={() => {}}
              onKeyDown={() => {}}
              onContextMenu={(event) => {
                stopPropagation(event);
                setDetailsThreadId(null);
                setActionMenuThreadId(thread.id);
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
      rowCount={visibleActiveThreads.length + visibleSettledThreads.length}
      listRole={threadSearchQuery ? "listbox" : "list"}
      listAriaLabel={threadSearchQuery ? "Thread search results" : undefined}
      emptyState={
        threadSearchQuery ? (
          <HostText className="sidebar-inline-search__empty">No matching threads</HostText>
        ) : undefined
      }
      hasProjects={projects.length > 0}
      scopedDisplayName={scopedProject?.title ?? null}
      onAddProjectClick={() => uiActions.openQuickSwitch("command")}
      footerAuthorityVisual={<image className="sidebar-settings-authority" src={settingsRowUrl} />}
    />
  );
}
