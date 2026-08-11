import type { ReactNode } from "react";

import { isElectron } from "~/env";

import { Skeleton } from "./ui/skeleton";
import { DiffPanelSurface } from "./DiffPanelSurface";

export type DiffPanelMode = "inline" | "sheet" | "sidebar" | "embedded";

export function DiffPanelShell(props: {
  mode: DiffPanelMode;
  header: ReactNode;
  children: ReactNode;
  reviewCheckpointCount?: number;
  reviewSelectedTurn?: string;
  reviewFileCount?: number;
}) {
  const shouldUseDragRegion = isElectron && props.mode !== "sheet" && props.mode !== "embedded";

  return (
    <DiffPanelSurface
      mode={props.mode}
      useDragRegion={shouldUseDragRegion}
      {...(shouldUseDragRegion
        ? {
            headerClassName:
              "wco:h-[env(titlebar-area-height)] wco:pr-[calc(100vw-env(titlebar-area-width)-env(titlebar-area-x)+1em)]",
          }
        : {})}
      header={props.header}
      {...(props.reviewCheckpointCount !== undefined
        ? { reviewCheckpointCount: props.reviewCheckpointCount }
        : {})}
      {...(props.reviewSelectedTurn !== undefined
        ? { reviewSelectedTurn: props.reviewSelectedTurn }
        : {})}
      {...(props.reviewFileCount !== undefined
        ? { reviewFileCount: props.reviewFileCount }
        : {})}
    >
      {props.children}
    </DiffPanelSurface>
  );
}

export function DiffPanelHeaderSkeleton() {
  return (
    <>
      <div className="min-w-0 flex-1">
        <Skeleton className="h-8 w-32 rounded-lg" />
      </div>
      <div className="flex shrink-0 gap-1">
        <Skeleton className="size-7 rounded-md" />
        <Skeleton className="size-7 rounded-md" />
      </div>
    </>
  );
}

export function DiffPanelLoadingState(props: { label: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col p-2">
      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border/60 bg-card/25"
        role="status"
        aria-live="polite"
        aria-label={props.label}
      >
        <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
          <Skeleton className="h-4 w-32 rounded-full" />
          <Skeleton className="ml-auto h-4 w-20 rounded-full" />
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 px-3 py-4">
          <div className="space-y-2">
            <Skeleton className="h-3 w-full rounded-full" />
            <Skeleton className="h-3 w-full rounded-full" />
            <Skeleton className="h-3 w-10/12 rounded-full" />
            <Skeleton className="h-3 w-11/12 rounded-full" />
            <Skeleton className="h-3 w-9/12 rounded-full" />
          </div>
          <span className="sr-only">{props.label}</span>
        </div>
      </div>
    </div>
  );
}
