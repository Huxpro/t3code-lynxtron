import type { ReactNode } from "react";

import { cn } from "../lib/cn";
import { HostView } from "./ui/hostElements";

export type DiffPanelSurfaceMode = "inline" | "sheet" | "sidebar" | "embedded";

function getHeaderClassName(mode: DiffPanelSurfaceMode, useDragRegion: boolean) {
  return cn(
    "diff-panel-subheader relative z-30 flex shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-background px-4",
    useDragRegion && mode !== "sheet" && mode !== "embedded"
      ? "drag-region h-[52px]"
      : "h-10 min-h-10 lynx-titlebar-drag-region",
  );
}

export function DiffPanelSurface({
  mode,
  useDragRegion = false,
  headerClassName,
  header,
  children,
  reviewCheckpointCount,
  reviewSelectedTurn,
  reviewFileCount,
}: {
  readonly mode: DiffPanelSurfaceMode;
  readonly useDragRegion?: boolean;
  readonly headerClassName?: string;
  readonly header: ReactNode;
  readonly children: ReactNode;
  readonly reviewCheckpointCount?: number;
  readonly reviewSelectedTurn?: string;
  readonly reviewFileCount?: number;
}) {
  return (
    <HostView
      data-review-surface="diff"
      data-review-checkpoint-count={reviewCheckpointCount}
      data-review-selected-turn={reviewSelectedTurn}
      data-review-file-count={reviewFileCount}
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-col bg-background",
        mode === "inline"
          ? "w-[42vw] min-w-[360px] max-w-[560px] shrink-0 border-l border-border"
          : "w-full",
      )}
    >
      <HostView
        className={cn(getHeaderClassName(mode, useDragRegion), headerClassName)}
        data-surface-subheader={useDragRegion ? undefined : true}
      >
        {header}
      </HostView>
      <HostView className="flex min-h-0 flex-1 flex-col">{children}</HostView>
    </HostView>
  );
}
