import {
  CheckIcon,
  LoaderIcon,
  RotateCcwIcon,
  RotateCwIcon,
  SearchIcon,
  TriangleAlertIcon,
  Undo2Icon,
} from "lucide-react";
import { useMemo } from "react";

import { t3ClientActions, useT3ClientState } from "../../../lynxtron/src/app/state/t3Client";
import { uiActions } from "../../../lynxtron/src/app/state/uiState";
import { formatRelativeTimeLabel } from "../timestampFormat";
import { useProjects, useThreadShells } from "../state/entities";
import { ProjectFavicon } from "./ProjectFavicon";
import {
  resolveSidebarV2Status,
  sortThreadsForSidebarV2,
  type SidebarV2Status,
} from "./Sidebar.logic";
import { SidebarChromeFooter, SidebarChromeHeader } from "./sidebar/SidebarChrome";
import { SidebarV2RowSurface, type SidebarV2RowStatus } from "./sidebar/SidebarV2RowSurface";
import { HostButton, HostText, HostView } from "./ui/hostElements";
import { SidebarContent, SidebarGroup } from "./ui/sidebar";

function compactSidebarTimeLabel(label: string): string {
  if (label === "just now") return "now";
  return label.endsWith(" ago") ? label.slice(0, -4) : label;
}

function statusPresentation(status: SidebarV2Status): SidebarV2RowStatus | null {
  switch (status) {
    case "working":
      return {
        label: "Working",
        className:
          "animate-sidebar-working-text text-sky-600 motion-reduce:animate-none dark:text-sky-400",
        icon: <LoaderIcon aria-hidden className="size-4 shrink-0" />,
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
        icon: <TriangleAlertIcon aria-hidden className="size-4 shrink-0" />,
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

/**
 * Small Lynx state host for the shared Sidebar V2 row composition.
 *
 * The Web Sidebar keeps its richer project scopes, VCS subscriptions, snooze,
 * and selection behavior. This leaf supplies canonical shell data and native
 * tap actions without evaluating the Web Effect/DOM orchestration on Lynx's
 * main thread.
 */
export default function SidebarV2() {
  const { activeThreadId } = useT3ClientState();
  const projects = useProjects();
  const threads = useThreadShells();
  const orderedThreads = useMemo(
    () => sortThreadsForSidebarV2(threads.filter((thread) => thread.archivedAt === null)),
    [threads],
  );
  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project] as const)),
    [projects],
  );

  return (
    <>
      <SidebarChromeHeader isElectron />
      <SidebarContent className="sidebar-v2-content">
        <SidebarGroup className="px-2 pt-2 pb-1">
          <HostButton
            type="button"
            aria-label="Search threads and commands"
            className="sidebar-v2-search flex h-8 w-full items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/45 px-2 text-left text-xs text-sidebar-muted-foreground"
            onClick={uiActions.openQuickSwitch}
          >
            <SearchIcon className="size-3.5 shrink-0" />
            <HostText className="sidebar-v2-search-label min-w-0 flex-1 truncate">
              Search threads and commands
            </HostText>
          </HostButton>
        </SidebarGroup>

        <SidebarGroup className="min-h-0 flex-1 px-2 pb-2">
          <HostView className="mb-1 flex items-center justify-between px-1">
            <HostText className="sidebar-v2-section-title text-xs font-medium text-sidebar-muted-foreground/80">
              Threads
            </HostText>
            {projects[0] ? (
              <HostButton
                type="button"
                aria-label={`Create new thread in ${projects[0].title}`}
                className="rounded-md px-1.5 py-1 text-xs text-sidebar-muted-foreground"
                onClick={() => {
                  void t3ClientActions.createThread(projects[0]?.id);
                }}
              >
                New
              </HostButton>
            ) : null}
          </HostView>

          <HostView className="flex min-h-0 flex-col gap-0.5">
            {orderedThreads.map((thread) => {
              const status = resolveSidebarV2Status(thread);
              const isActive = thread.id === activeThreadId;
              const project = projectById.get(thread.projectId) ?? null;
              const timestamp = thread.latestUserMessageAt ?? thread.updatedAt;

              return (
                <SidebarV2RowSurface
                  key={thread.id}
                  variant="card"
                  variantAction="settle"
                  isActive={isActive}
                  isSelected={false}
                  shouldRecede={status === "ready" && !isActive}
                  isInFlight={status === "working" || status === "approval" || status === "input"}
                  isUnread={false}
                  isWoke={false}
                  settlementSupported={false}
                  snoozeSupported={false}
                  showSnoozeButton={false}
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
                  diff={null}
                  remoteIndicator={null}
                  providerIndicator={null}
                  detailsTooltip={null}
                  snoozeControl={null}
                  settleIcon={<CheckIcon className="size-3" />}
                  unsettleIcon={<Undo2Icon className="size-3" />}
                  unsnoozeIcon={<RotateCcwIcon className="size-3" />}
                  wokeIcon={<RotateCwIcon className="size-3" />}
                  onClick={() => {
                    t3ClientActions.selectThread(thread.id);
                  }}
                  onDoubleClick={() => {}}
                  onKeyDown={() => {}}
                  onContextMenu={() => {}}
                  onSettleClick={stopPropagation}
                  onUnsettleClick={stopPropagation}
                  onUnsnoozeClick={stopPropagation}
                />
              );
            })}
          </HostView>

          {orderedThreads.length === 0 ? (
            <HostView className="sidebar-v2-empty flex flex-col items-center gap-2 px-2 py-6 text-center">
              <HostText className="sidebar-v2-empty-label text-xs text-muted-foreground/60">
                {projects.length === 0 ? "No projects yet" : "No threads yet"}
              </HostText>
            </HostView>
          ) : null}
        </SidebarGroup>
      </SidebarContent>
      <SidebarChromeFooter />
    </>
  );
}
