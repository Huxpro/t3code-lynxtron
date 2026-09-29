import {
  CheckIcon,
  LoaderIcon,
  RotateCcwIcon,
  RotateCwIcon,
  TriangleAlertIcon,
  Undo2Icon,
} from "lucide-react";
import { useMemo, useState } from "react";

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
import { SidebarV2CompositionSurface } from "./sidebar/SidebarV2CompositionSurface";
import { SidebarV2RowSurface, type SidebarV2RowStatus } from "./sidebar/SidebarV2RowSurface";
import { HostText } from "./ui/hostElements";

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
  const [projectScopeKey, setProjectScopeKey] = useState<string | null>(null);
  const [projectScopeMenuOpen, setProjectScopeMenuOpen] = useState(false);
  const orderedThreads = useMemo(
    () =>
      sortThreadsForSidebarV2(
        threads.filter(
          (thread) =>
            thread.archivedAt === null &&
            (projectScopeKey === null || thread.projectId === projectScopeKey),
        ),
      ),
    [projectScopeKey, threads],
  );
  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project] as const)),
    [projects],
  );
  const scopedProject =
    projectScopeKey === null
      ? null
      : (projects.find((project) => project.id === projectScopeKey) ?? null);
  const newThreadProject = scopedProject ?? projects[0] ?? null;
  const projectScopeOptions = projects.map((project) => ({
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
        newThreadShortcutLabel: null,
        newThreadDisabled: newThreadProject === null,
        onSearchClick: uiActions.openQuickSwitch,
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
        onNewProjectClick: uiActions.openQuickSwitch,
      }}
      rows={orderedThreads.map((thread) => {
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
            isRegeneratingTitle={thread.titleRegeneration != null}
            terminalStatusIcon={null}
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
      afterContent={
        projectScopeMenuOpen ? (
          <view
            className="lynx-sidebar-scope-menu-backdrop"
            bindtap={() => setProjectScopeMenuOpen(false)}
          />
        ) : null
      }
      rowCount={orderedThreads.length}
      hasProjects={projects.length > 0}
      scopedDisplayName={scopedProject?.title ?? null}
      onAddProjectClick={uiActions.openQuickSwitch}
    />
  );
}
