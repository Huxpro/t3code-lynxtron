import type { ReactNode } from "react";
import type { ScopedProjectRef, ScopedThreadRef } from "@t3tools/contracts";

export interface SidebarProjectHostThread {
  readonly key: string;
  readonly ref: ScopedThreadRef;
  readonly title: string;
  readonly metadataLabel: string;
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
  readonly threads: readonly SidebarProjectHostThread[];
  readonly showEmptyThreadState: boolean;
}

export interface SidebarProjectListHostProps {
  readonly rows: readonly SidebarProjectHostRow[];
  readonly children: ReactNode;
  readonly onToggleProject: (row: SidebarProjectHostRow) => void;
  readonly onCreateThread: (projectRef: ScopedProjectRef) => void;
  readonly onSelectThread: (threadRef: ScopedThreadRef) => void;
  readonly onRenameThread: (threadRef: ScopedThreadRef, title: string) => void;
  readonly onArchiveThread: (threadRef: ScopedThreadRef) => void;
  readonly onDeleteThread: (threadRef: ScopedThreadRef) => void;
}
