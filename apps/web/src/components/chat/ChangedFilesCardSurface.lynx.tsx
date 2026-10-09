import type { ReactNode } from "react";

import { cn } from "../../lib/cn";
import { HostButton, HostText, HostView } from "../ui/hostElements";

export interface ChangedFilesPreviewScopeItem {
  readonly key: string;
  readonly label: string;
  readonly fileCount: number;
}

export interface ChangedFilesPreviewFileItem {
  readonly key: string;
  readonly name: string;
  readonly title?: string;
  readonly icon: ReactNode;
  readonly onSelect: () => void;
}

export function ChangedFilesCardSurface({
  turnId,
  fileCount,
  checkpointStatus = "ready",
  statusLabel,
  expanded,
  compactPreviewVisible,
  compact = false,
  stat,
  toggleIcon,
  hintClassName,
  foldersControl,
  openDiffControl,
  previewScopes,
  previewFiles,
  expandedBody,
  onExpandedChange,
  onShowAll,
}: {
  readonly turnId: string;
  readonly fileCount: number;
  readonly checkpointStatus?: string;
  readonly statusLabel?: string;
  readonly expanded: boolean;
  readonly compactPreviewVisible: boolean;
  readonly compact?: boolean;
  readonly stat?: ReactNode;
  readonly toggleIcon: ReactNode;
  readonly hintClassName?: string;
  readonly foldersControl?: ReactNode;
  readonly openDiffControl: ReactNode;
  readonly previewScopes: ReadonlyArray<ChangedFilesPreviewScopeItem>;
  readonly previewFiles: ReadonlyArray<ChangedFilesPreviewFileItem>;
  readonly expandedBody?: ReactNode;
  readonly onExpandedChange: (expanded: boolean) => void;
  readonly onShowAll: () => void;
}) {
  // Defensive shared boundary: callers may briefly observe a checkpoint row
  // before its file projection is populated. No renderer should turn that
  // transient/empty state into a visible "0 changed files" card.
  if (fileCount <= 0) return null;

  const label = compact
    ? `${fileCount} file${fileCount === 1 ? "" : "s"}`
    : (statusLabel ?? `${fileCount} changed file${fileCount === 1 ? "" : "s"}`);

  return (
    <HostView
      className={cn(
        "turn-diff-card mt-4 rounded-2xl border border-border/70 bg-secondary p-2 dark:border-transparent dark:bg-input/32",
        expanded
          ? "turn-diff-card--expanded"
          : compactPreviewVisible
            ? "turn-diff-card--preview"
            : "turn-diff-card--collapsed",
        compact && "turn-diff-card--compact",
      )}
      data-review-checkpoint-card
      data-review-checkpoint-status={checkpointStatus}
      data-review-file-count={String(fileCount)}
      data-review-turn-id={turnId}
      data-changed-files-state={
        expanded ? "expanded" : compactPreviewVisible ? "preview" : "collapsed"
      }
      data-changed-files-compact={compact ? "true" : "false"}
    >
      <HostView
        className={cn(
          "turn-diff-card__header flex items-center justify-between gap-2 rounded-xl px-1",
          expanded &&
            "mb-2 bg-secondary dark:bg-[color-mix(in_srgb,var(--foreground)_2.5%,var(--background))]",
        )}
      >
        <HostButton
          type="button"
          aria-expanded={expanded}
          data-scroll-anchor-ignore
          className="turn-diff-card__toggle group flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onExpandedChange(!expanded)}
        >
          <HostView
            aria-hidden="true"
            className={cn(
              "inline-flex size-3.5 shrink-0 items-center text-muted-foreground transition-transform",
              expanded && "rotate-90",
            )}
          >
            {toggleIcon}
          </HostView>
          <HostView className="turn-diff-card__summary flex min-w-0 items-center gap-1 whitespace-nowrap font-medium text-foreground text-xs leading-4">
            <HostText className="turn-diff-card__status text-xs leading-4">{label}</HostText>
            {stat}
          </HostView>
          {!compact ? (
            <HostText
              className={cn(
                "turn-diff-card__hint ml-1 truncate text-[11px] leading-4 text-muted-foreground",
                hintClassName,
              )}
            >
              {expanded ? "Hide files" : "Show files"}
            </HostText>
          ) : null}
        </HostButton>
        <HostView className="flex items-center gap-1.5">
          {expanded ? foldersControl : null}
          {openDiffControl}
        </HostView>
      </HostView>
      {expanded ? (
        expandedBody
      ) : compactPreviewVisible ? (
        <HostView className="turn-diff-card__preview px-2 pb-1.5 pt-1">
          <HostView className="turn-diff-card__preview-scopes flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
            {previewScopes.map((scope, index) => (
              <HostView
                key={scope.key}
                className="turn-diff-card__preview-scope inline-flex items-center gap-1"
              >
                {index > 0 ? (
                  <HostText className="turn-diff-card__preview-separator" aria-hidden="true">
                    ·
                  </HostText>
                ) : null}
                <HostText className="turn-diff-card__preview-scope-label font-mono text-foreground/75">
                  {scope.label}
                </HostText>
                <HostText className="turn-diff-card__preview-scope-count">
                  {scope.fileCount} file{scope.fileCount === 1 ? "" : "s"}
                </HostText>
              </HostView>
            ))}
          </HostView>
          <HostView className="turn-diff-card__preview-files mt-2 flex flex-wrap items-center gap-1.5">
            {previewFiles.map((file) => (
              <HostButton
                key={file.key}
                type="button"
                title={file.title}
                className="turn-diff-card__preview-file inline-flex max-w-48 items-center gap-1 rounded-md border border-border/70 bg-background/45 px-1.5 py-1 font-mono text-[10px] text-muted-foreground"
                onClick={file.onSelect}
              >
                {file.icon}
                <HostText className="turn-diff-card__preview-file-name truncate">
                  {file.name}
                </HostText>
              </HostButton>
            ))}
            <HostButton
              type="button"
              className="turn-diff-card__preview-show-all rounded-md px-1.5 py-1 text-[11px] font-medium text-muted-foreground"
              onClick={onShowAll}
            >
              <HostText className="turn-diff-card__preview-show-all-label">
                Show all {fileCount} files
              </HostText>
            </HostButton>
          </HostView>
        </HostView>
      ) : null}
    </HostView>
  );
}
