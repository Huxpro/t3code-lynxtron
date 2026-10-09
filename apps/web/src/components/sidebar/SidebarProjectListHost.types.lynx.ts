import type { ReactNode } from "react";
import type { ThreadStatusPill } from "@t3tools/lynx-logic/sidebar";
import type {
  EnvironmentId,
  ProjectId,
  ScopedProjectRef,
  ScopedThreadRef,
} from "@t3tools/contracts";

export interface SidebarProjectSettingsMember {
  readonly id: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly title: string;
  readonly workspaceRoot: string;
  readonly environmentLabel: string | null;
}

export interface SidebarProjectHostThread {
  readonly key: string;
  readonly ref: ScopedThreadRef;
  readonly title: string;
  readonly metadataLabel: string;
  readonly status: ThreadStatusPill | null;
  readonly statusLabel: string | null;
  readonly active: boolean;
}

export interface SidebarProjectHostRow {
  readonly key: string;
  readonly title: string;
  readonly groupedProjectCount: number;
  readonly expanded: boolean;
  readonly expansionPreferenceKeys: readonly string[];
  readonly projectRef: ScopedProjectRef;
  readonly projectMembers: readonly SidebarProjectSettingsMember[];
  readonly threads: readonly SidebarProjectHostThread[];
  readonly showEmptyThreadState: boolean;
}

export interface SidebarProjectListHostProps {
  readonly rows: readonly SidebarProjectHostRow[];
  readonly children: ReactNode;
  readonly onToggleProject: (row: SidebarProjectHostRow) => void;
  readonly onCreateThread: (projectRef: ScopedProjectRef) => void;
  readonly onOpenProjectSettings?: (members: readonly SidebarProjectSettingsMember[]) => void;
  readonly onSelectThread: (threadRef: ScopedThreadRef) => void;
  readonly onRenameThread: (threadRef: ScopedThreadRef, title: string) => void;
  readonly onArchiveThread: (threadRef: ScopedThreadRef) => void;
  readonly onDeleteThread: (threadRef: ScopedThreadRef) => void;
}
