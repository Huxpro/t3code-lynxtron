import { useMemo, useState } from "react";
import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { resolveThreadStatusPill } from "@t3tools/client-runtime/presentation/sidebar";
import { sortThreads } from "@t3tools/client-runtime/state/thread-sort";
import { ProjectId } from "@t3tools/contracts";

import { t3ClientActions, useT3ClientState } from "../../../lynxtron/src/app/state/t3Client";
import { uiActions } from "../../../lynxtron/src/app/state/uiState";
import { Icon } from "../../../lynxtron/src/app/components/Icon";
import { ProjectSettingsDialog } from "../../../lynxtron/src/app/components/ProjectSettingsDialog";
import { formatRelativeTimeLabel } from "../timestampFormat";
import { buildSidebarProjectSnapshots } from "../sidebarProjectGrouping";
import { useClientSettings } from "../hooks/useSettings";
import { usePrimaryEnvironmentId } from "../state/environments";
import { sortProjectsForSidebar } from "./Sidebar.logic";
import { useLocation, useNavigate } from "../lib/router";
import { useProjects, useThreadShells } from "../state/entities";
import { SettingsSidebarNav } from "./settings/SettingsSidebarNav";
import { SidebarChromeFooter, SidebarChromeHeader } from "./sidebar/SidebarChrome";
import { SidebarProjectsSurface } from "./sidebar/SidebarProjectsSurface";
import type { SidebarProjectSettingsMember } from "./sidebar/SidebarProjectListHost.types";
import { HostText, HostView } from "./ui/hostElements";
import { SidebarMenuButton } from "./ui/sidebar";

export default function Sidebar() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const navigate = useNavigate();
  const { activeThreadId } = useT3ClientState();
  const projects = useProjects();
  const threads = useThreadShells();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const projectGroupingSettings = useClientSettings((settings) => ({
    sidebarProjectGroupingMode: settings.sidebarProjectGroupingMode,
    sidebarProjectGroupingOverrides: settings.sidebarProjectGroupingOverrides,
  }));
  const projectSortOrder = useClientSettings((settings) => settings.sidebarProjectSortOrder);
  const threadSortOrder = useClientSettings((settings) => settings.sidebarThreadSortOrder);
  const [collapsedProjectKeys, setCollapsedProjectKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [projectSettingsMembers, setProjectSettingsMembers] = useState<
    readonly SidebarProjectSettingsMember[] | null
  >(null);
  const groupedProjects = useMemo(
    () =>
      buildSidebarProjectSnapshots({
        projects: [...projects],
        settings: projectGroupingSettings,
        primaryEnvironmentId,
        resolveEnvironmentLabel: () => null,
      }),
    [primaryEnvironmentId, projectGroupingSettings, projects],
  );
  const orderedProjects = useMemo(
    () =>
      sortProjectsForSidebar(
        groupedProjects.map((project) => ({ ...project, id: project.projectKey })),
        threads.map((thread) => {
          const project = groupedProjects.find((candidate) =>
            candidate.memberProjectRefs.some(
              (projectRef) =>
                projectRef.environmentId === thread.environmentId &&
                projectRef.projectId === thread.projectId,
            ),
          );
          return {
            ...thread,
            projectId: project ? ProjectId.make(project.projectKey) : thread.projectId,
          };
        }),
        projectSortOrder,
      ),
    [groupedProjects, projectSortOrder, threads],
  );
  const projectRows = useMemo(
    () =>
      orderedProjects
        .map((project) => {
          const projectKey = project.projectKey;
          const memberProjectKeys = new Set(
            project.memberProjectRefs.map(
              (projectRef) => `${projectRef.environmentId}:${projectRef.projectId}`,
            ),
          );
          const projectThreads = sortThreads(
            threads.filter(
              (thread) =>
                thread.archivedAt === null &&
                memberProjectKeys.has(`${thread.environmentId}:${thread.projectId}`),
            ),
            threadSortOrder,
          );
          const projectRef = project.memberProjectRefs[0];
          if (!projectRef) return null;
          return {
            key: projectKey,
            title: project.displayName,
            groupedProjectCount: project.groupedProjectCount,
            expanded: !collapsedProjectKeys.has(projectKey),
            expansionPreferenceKeys: [projectKey],
            projectRef,
            projectMembers: project.memberProjects.map((member) => ({
              id: member.id,
              environmentId: member.environmentId,
              title: member.title,
              workspaceRoot: member.workspaceRoot,
              environmentLabel: member.environmentLabel,
            })),
            threads: projectThreads.map((thread) => {
              const status = resolveThreadStatusPill({ thread });
              return {
                key: `${thread.environmentId}:${thread.id}`,
                ref: scopeThreadRef(thread.environmentId, thread.id),
                title: thread.title,
                metadataLabel: formatRelativeTimeLabel(
                  thread.latestUserMessageAt ?? thread.updatedAt ?? thread.createdAt,
                ),
                status,
                statusLabel: status?.label ?? null,
                active: thread.id === activeThreadId,
              };
            }),
            showEmptyThreadState: projectThreads.length === 0,
          };
        })
        .filter((row) => row !== null),
    [activeThreadId, collapsedProjectKeys, orderedProjects, threadSortOrder, threads],
  );

  if (pathname === "/settings" || pathname.startsWith("/settings/")) {
    return (
      <>
        <SidebarChromeHeader isElectron />
        <SettingsSidebarNav
          pathname={pathname}
          onBack={() => void navigate({ to: "/" })}
          onNavigate={(to) => void navigate({ to, replace: true })}
        />
      </>
    );
  }

  return (
    <>
      <SidebarChromeHeader isElectron />
      <SidebarProjectsSurface
        children={null}
        searchControl={
          <HostView className="sidebar-search-anchor">
            <SidebarMenuButton
              size="sm"
              className="sidebar-v1-search h-8 gap-2 rounded-md px-2 py-1.5"
              onClick={() => uiActions.openQuickSwitch("command")}
            >
              <Icon name="search" size={16} color="#818181" className="sidebar-search-icon" />
              <HostText className="sidebar-search-label flex-1">Search</HostText>
              <HostText className="sidebar-v1-search-shortcut">⌘K</HostText>
            </SidebarMenuButton>
          </HostView>
        }
        projectControls={
          <>
            <HostView className="sidebar-v1-project-control">
              <Icon
                name="arrow-up-down"
                size={14}
                color="#71717a"
                className="sidebar-project-sort-icon"
              />
            </HostView>
            <HostView
              className="sidebar-v1-project-control"
              aria-label="Add project"
              bindtap={uiActions.openAddProject}
            >
              <Icon
                name="folder-plus"
                size={14}
                color="#71717a"
                className="sidebar-project-add-icon"
              />
            </HostView>
          </>
        }
        rows={projectRows}
        onToggleProject={(row) => {
          setCollapsedProjectKeys((current) => {
            const next = new Set(current);
            if (next.has(row.key)) next.delete(row.key);
            else next.add(row.key);
            return next;
          });
        }}
        onCreateThread={(projectRef) => {
          void t3ClientActions.createThread(projectRef.projectId);
        }}
        onOpenProjectSettings={setProjectSettingsMembers}
        onSelectThread={(threadRef) => {
          t3ClientActions.selectThread(threadRef.threadId);
        }}
        onRenameThread={(threadRef, title) => {
          void t3ClientActions.renameThread(threadRef.threadId, title);
        }}
        onArchiveThread={(threadRef) => {
          void t3ClientActions.archiveThread(threadRef.threadId);
        }}
        onDeleteThread={(threadRef) => {
          void t3ClientActions.deleteThread(threadRef.threadId);
        }}
      />
      {projectSettingsMembers ? (
        <ProjectSettingsDialog
          members={projectSettingsMembers}
          onClose={() => setProjectSettingsMembers(null)}
        />
      ) : null}
      <SidebarChromeFooter />
    </>
  );
}
