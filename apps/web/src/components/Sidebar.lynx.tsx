import { useMemo } from "react";
import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { resolveThreadStatusPill } from "@t3tools/client-runtime/presentation/sidebar";

import { t3ClientActions, useT3ClientState } from "../../../lynxtron/src/app/state/t3Client";
import { uiActions } from "../../../lynxtron/src/app/state/uiState";
import { Icon } from "../../../lynxtron/src/app/components/Icon";
import { formatRelativeTimeLabel } from "../timestampFormat";
import { useLocation, useNavigate } from "../lib/router";
import { useProjects, useThreadShells } from "../state/entities";
import { SettingsSidebarNav } from "./settings/SettingsSidebarNav";
import { SidebarChromeFooter, SidebarChromeHeader } from "./sidebar/SidebarChrome";
import { SidebarProjectsSurface } from "./sidebar/SidebarProjectsSurface";
import { HostText, HostView } from "./ui/hostElements";
import { SidebarMenuButton } from "./ui/sidebar";

export default function Sidebar() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const navigate = useNavigate();
  const { activeThreadId } = useT3ClientState();
  const projects = useProjects();
  const threads = useThreadShells();
  const projectRows = useMemo(
    () =>
      projects.map((project) => {
        const projectThreads = threads
          .filter((thread) => thread.projectId === project.id && thread.archivedAt === null)
          .sort((left, right) =>
            (right.latestUserMessageAt ?? right.updatedAt ?? right.createdAt).localeCompare(
              left.latestUserMessageAt ?? left.updatedAt ?? left.createdAt,
            ),
          );
        return {
          key: `${project.environmentId}:${project.id}`,
          title: project.title,
          groupedProjectCount: 1,
          expanded: true,
          expansionPreferenceKeys: [`${project.environmentId}:${project.id}`],
          projectRef: scopeProjectRef(project.environmentId, project.id),
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
      }),
    [activeThreadId, projects, threads],
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
              bindtap={() => uiActions.openQuickSwitch("command")}
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
        onToggleProject={() => {}}
        onCreateThread={(projectRef) => {
          void t3ClientActions.createThread(projectRef.projectId);
        }}
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
      <SidebarChromeFooter />
    </>
  );
}
