import type { ReactNode } from "react";

import { HostScrollView, HostText, HostView } from "../ui/hostElements";
import { SidebarProjectListHost, type SidebarProjectListHostProps } from "./SidebarProjectListHost";

type SidebarProjectsSurfaceProps = Pick<
  SidebarProjectListHostProps,
  | "rows"
  | "onToggleProject"
  | "onCreateThread"
  | "onSelectThread"
  | "onRenameThread"
  | "onArchiveThread"
  | "onDeleteThread"
> & {
  readonly searchControl: ReactNode;
  readonly beforeProjects?: ReactNode;
  readonly projectControls: ReactNode;
  readonly children: ReactNode;
};

/**
 * Shared Sidebar surface composition. Data projection and rich row behavior
 * remain host leaves, while the visible search/projects anatomy and row-host
 * placement stay identical across Web and Lynx.
 */
export function SidebarProjectsSurface({
  searchControl,
  beforeProjects,
  projectControls,
  children,
  rows,
  onToggleProject,
  onCreateThread,
  onSelectThread,
  onRenameThread,
  onArchiveThread,
  onDeleteThread,
}: SidebarProjectsSurfaceProps) {
  return (
    <>
      <HostView
        className="relative flex w-full min-w-0 shrink-0 flex-col px-2 pt-2 pb-1"
        data-sidebar="group"
        data-slot="sidebar-group"
      >
        {searchControl}
      </HostView>
      <HostScrollView className="sidebar-content-scroll h-auto min-h-0 flex-1 overflow-y-auto">
        <HostView
          className="flex w-full min-w-0 flex-col gap-0"
          data-sidebar="content"
          data-slot="sidebar-content"
        >
          {beforeProjects}
          <HostView
            className="lynx-sidebar-projects-group relative flex w-full min-w-0 flex-col px-2 py-2"
            data-sidebar="group"
            data-slot="sidebar-group"
          >
            <HostView className="mb-1 flex items-center justify-between pl-2 pr-1.5">
              <HostText className="sidebar-projects-label text-xs font-medium text-sidebar-muted-foreground/80">
                Projects
              </HostText>
              <HostView className="flex items-center gap-1">{projectControls}</HostView>
            </HostView>

            <SidebarProjectListHost
              rows={rows}
              onToggleProject={onToggleProject}
              onCreateThread={onCreateThread}
              onSelectThread={onSelectThread}
              onRenameThread={onRenameThread}
              onArchiveThread={onArchiveThread}
              onDeleteThread={onDeleteThread}
            >
              {children}
            </SidebarProjectListHost>
          </HostView>
        </HostView>
      </HostScrollView>
    </>
  );
}
