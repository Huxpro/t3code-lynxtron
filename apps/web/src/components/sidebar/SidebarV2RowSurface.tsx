import type { ReactNode } from "react";

import { cn } from "../../lib/utils";
import { HostButton, HostListItem, HostText, HostView } from "../ui/hostElements";
import { Tooltip, TooltipTrigger } from "../ui/tooltip";

type HostViewProps = Parameters<typeof HostView>[0];
type HostButtonProps = Parameters<typeof HostButton>[0];

export interface SidebarV2RowStatus {
  readonly label: string;
  readonly className: string;
  readonly icon: ReactNode;
  readonly workingDuration: ReactNode;
}

export interface SidebarV2RowSurfaceProps {
  readonly threadId?: string;
  readonly variant: "card" | "slim";
  readonly variantAction: "settle" | "unsettle" | "unsnooze";
  readonly isActive: boolean;
  readonly isSelected: boolean;
  readonly shouldRecede: boolean;
  readonly isInFlight: boolean;
  readonly isUnread: boolean;
  readonly isWoke: boolean;
  readonly settlementSupported: boolean;
  readonly snoozeSupported: boolean;
  readonly cardActionsVisible?: boolean;
  readonly snoozeMenuOpen: boolean;
  readonly snoozeWakeLabelText: string | null;
  readonly projectTitle: string | null;
  readonly threadTitle: string;
  readonly branch: string | null;
  readonly threadTimeLabel: string;
  readonly settledTimeLabel: string;
  readonly topStatus: SidebarV2RowStatus | null;
  readonly jumpLabel: string | null;
  readonly favicon: ReactNode;
  readonly title: ReactNode;
  readonly isRegeneratingTitle: boolean;
  readonly terminalStatusIcon: ReactNode;
  readonly prBadge: ReactNode;
  readonly diff: { readonly insertions: number; readonly deletions: number } | null;
  readonly remoteIndicator: ReactNode;
  readonly providerIndicator: ReactNode;
  readonly detailsTooltip: ReactNode;
  readonly detailsOverlay?: ReactNode;
  readonly detailsRelationId?: string;
  readonly cardActionControl: ReactNode;
  readonly settleIcon: ReactNode;
  readonly unsettleIcon: ReactNode;
  readonly unsnoozeIcon: ReactNode;
  readonly wokeIcon: ReactNode;
  readonly onClick: HostViewProps["onClick"];
  readonly onDoubleClick: HostViewProps["onDoubleClick"];
  readonly onKeyDown: HostViewProps["onKeyDown"];
  readonly onContextMenu: HostViewProps["onContextMenu"];
  readonly onMouseEnter?: HostViewProps["onMouseEnter"];
  readonly onMouseLeave?: HostViewProps["onMouseLeave"];
  readonly onSettleClick: HostButtonProps["onClick"];
  readonly onUnsettleClick: HostButtonProps["onClick"];
  readonly onUnsnoozeClick: HostButtonProps["onClick"];
}

function JumpHintBadge({ label }: { readonly label: string }) {
  return (
    <HostText
      aria-hidden
      data-sidebar-thread-jump-hint={label}
      className="pointer-events-none absolute right-1.5 top-1/2 z-10 inline-flex h-5 -translate-y-1/2 items-center rounded-full border border-border/80 bg-background/95 px-1.5 font-mono text-[10px] font-medium tracking-tight text-foreground shadow-sm"
    >
      {label}
    </HostText>
  );
}

/**
 * Renderer-neutral Sidebar V2 row anatomy. The host wrapper owns state,
 * queries, navigation, and rich controls; this module owns the shared visual
 * hierarchy and action placement compiled by both Web and Lynx.
 */
export function SidebarV2RowSurface(props: SidebarV2RowSurfaceProps) {
  const rowSurfaceClassName = cn(
    "group/v2-row relative w-full cursor-pointer overflow-hidden rounded-md text-left outline-none select-none",
    props.isActive
      ? "bg-sidebar-row-active text-sidebar-foreground"
      : props.isSelected
        ? "bg-sidebar-row-selected text-sidebar-foreground"
        : props.shouldRecede
          ? "text-sidebar-muted-foreground/75 hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
          : "bg-transparent text-sidebar-foreground hover:bg-sidebar-row-hover",
    props.isInFlight &&
      !props.isActive &&
      !props.isSelected &&
      "opacity-70 transition-opacity hover:opacity-100",
  );

  if (props.variant === "slim") {
    return (
      <HostListItem
        data-thread-item
        data-thread-id={props.threadId}
        data-thread-active={props.isActive ? "true" : "false"}
        className="list-none [content-visibility:auto] [contain-intrinsic-size:auto_34px]"
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <HostView
                role="button"
                tabIndex={0}
                data-floating-anchor={props.detailsRelationId}
                data-testid="sidebar-v2-row-slim"
                aria-busy={props.isRegeneratingTitle || undefined}
                className={cn(
                  rowSurfaceClassName,
                  "sidebar-v2-row-slim flex h-9 items-center gap-2.5 px-2.5",
                )}
                onClick={props.onClick}
                onDoubleClick={props.onDoubleClick}
                onKeyDown={props.onKeyDown}
                onMouseEnter={props.onMouseEnter}
                onMouseLeave={props.onMouseLeave}
              />
            }
          >
            <HostText
              onClick={() => props.onClick?.({})}
              onContextMenu={props.onContextMenu}
              className={cn(
                "shrink-0 transition-opacity",
                !props.isActive &&
                  "opacity-40 grayscale group-hover/v2-row:opacity-100 group-hover/v2-row:grayscale-0",
              )}
            >
              {props.favicon}
            </HostText>
            {props.title}
            {props.terminalStatusIcon}
            {props.isRegeneratingTitle ? (
              <HostText role="status" className="sr-only">
                Regenerating title
              </HostText>
            ) : null}
            {props.prBadge}
            <HostText
              eventThrough
              className="relative ml-auto flex h-6 min-w-8 shrink-0 items-center justify-end"
            >
              <HostText
                eventThrough
                className="inline-flex justify-end tabular-nums text-muted-foreground/55 transition-opacity group-hover/v2-row:opacity-0"
              >
                {props.variantAction === "unsnooze" && props.snoozeWakeLabelText !== null ? (
                  <HostText
                    onClick={() => props.onClick?.({})}
                    onContextMenu={props.onContextMenu}
                    className="text-xs text-blue-600 tabular-nums dark:text-blue-400"
                  >
                    {props.snoozeWakeLabelText}
                  </HostText>
                ) : props.isWoke ? (
                  <HostText
                    onClick={() => props.onClick?.({})}
                    onContextMenu={props.onContextMenu}
                    role="status"
                    aria-label="Woke from snooze"
                    className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300"
                  >
                    {props.wokeIcon}
                    Woke
                  </HostText>
                ) : (
                  <HostText
                    onClick={() => props.onClick?.({})}
                    onContextMenu={props.onContextMenu}
                    className="text-xs"
                  >
                    {props.variantAction === "unsettle"
                      ? props.settledTimeLabel
                      : props.threadTimeLabel}
                  </HostText>
                )}
              </HostText>
              {props.variantAction === "unsnooze" ? (
                !props.snoozeSupported ? null : (
                  <HostButton
                    type="button"
                    aria-label="Wake thread now"
                    onClick={props.onUnsnoozeClick}
                    className="absolute inset-y-0 right-0 inline-flex cursor-pointer items-center gap-1 rounded-md bg-transparent px-2 text-xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/v2-row:opacity-100"
                  >
                    {props.unsnoozeIcon}
                  </HostButton>
                )
              ) : !props.settlementSupported ? null : props.variantAction === "unsettle" ? (
                <HostButton
                  type="button"
                  aria-label="Un-settle thread"
                  onClick={props.onUnsettleClick}
                  className="absolute inset-y-0 right-0 inline-flex cursor-pointer items-center gap-1 rounded-md bg-transparent px-2 text-xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/v2-row:opacity-100"
                >
                  {props.unsettleIcon}
                </HostButton>
              ) : (
                <HostButton
                  type="button"
                  aria-label="Settle thread"
                  onClick={props.onSettleClick}
                  className="absolute inset-y-0 right-0 inline-flex cursor-pointer items-center gap-1 rounded-md bg-transparent px-2 text-xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/v2-row:opacity-100"
                >
                  {props.settleIcon}
                </HostButton>
              )}
            </HostText>
            {props.jumpLabel ? <JumpHintBadge label={props.jumpLabel} /> : null}
          </TooltipTrigger>
          {props.detailsTooltip}
        </Tooltip>
      </HostListItem>
    );
  }

  return (
    <HostListItem
      data-thread-item
      data-thread-id={props.threadId}
      data-thread-active={props.isActive ? "true" : "false"}
      className={cn(
        "sidebar-v2-row-item relative list-none py-0.5 [content-visibility:auto] [contain-intrinsic-size:auto_96px]",
        props.isActive && "sidebar-v2-row-item--active",
      )}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <HostView
              role="button"
              tabIndex={0}
              data-floating-anchor={props.detailsRelationId}
              data-testid="sidebar-v2-row-card"
              aria-busy={props.isRegeneratingTitle || undefined}
              className={cn(
                rowSurfaceClassName,
                "sidebar-v2-row-card",
                props.isActive && "sidebar-v2-row-card--active",
                props.isSelected && "sidebar-v2-row-card--selected",
              )}
              onClick={props.onClick}
              onDoubleClick={props.onDoubleClick}
              onKeyDown={props.onKeyDown}
              onContextMenu={props.onContextMenu}
              onMouseEnter={props.onMouseEnter}
              onMouseLeave={props.onMouseLeave}
            />
          }
        >
          <HostView
            className="sidebar-v2-row-card__content relative z-10 h-[4.875rem] px-2.5 py-2"
            data-sidebar-card-content
          >
            <HostView className="sidebar-v2-row-project-line flex h-5 min-w-0 items-center gap-1.5">
              {props.favicon}
              {props.projectTitle ? (
                <HostText
                  className={cn(
                    "sidebar-v2-row-project-title min-w-0 flex-1 truncate text-xs text-muted-foreground/85",
                    props.shouldRecede ? "font-normal" : "font-medium",
                  )}
                >
                  {props.projectTitle}
                </HostText>
              ) : (
                <HostText className="sidebar-v2-row-project-title flex-1" />
              )}
              <HostView className="sidebar-v2-row-status-slot relative ml-auto flex h-5 min-w-8 shrink-0 items-center justify-end pl-1 text-xs">
                <HostView
                  className={cn(
                    "sidebar-v2-row-status pointer-events-none flex items-center justify-end tabular-nums text-muted-foreground/65 transition-opacity group-hover/v2-row:opacity-0",
                    props.snoozeMenuOpen && "opacity-0",
                    props.cardActionsVisible && "sidebar-v2-row-status--actions-visible opacity-0",
                  )}
                >
                  {props.topStatus ? (
                    <HostView
                      className={cn(
                        "sidebar-v2-row-status-content flex items-center justify-end gap-1 whitespace-nowrap font-medium",
                        props.topStatus.className,
                      )}
                    >
                      {props.topStatus.icon}
                      <HostText role="status">{props.topStatus.label}</HostText>
                      {props.topStatus.workingDuration}
                    </HostView>
                  ) : (
                    <HostText>{props.threadTimeLabel}</HostText>
                  )}
                </HostView>
                {props.settlementSupported || props.cardActionControl !== null ? (
                  <HostView
                    stopTapPropagation
                    className={cn(
                      "sidebar-v2-row-actions absolute inset-y-0 right-0 flex items-stretch gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/v2-row:opacity-100",
                      props.snoozeMenuOpen && "opacity-100",
                      props.cardActionsVisible && "opacity-100",
                    )}
                  >
                    {props.cardActionControl}
                    {props.settlementSupported ? (
                      <HostButton
                        type="button"
                        aria-label="Settle thread"
                        onClick={props.onSettleClick}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-transparent px-2 text-xs text-muted-foreground hover:text-foreground"
                      >
                        {props.settleIcon}
                        Settle
                      </HostButton>
                    ) : null}
                  </HostView>
                ) : null}
              </HostView>
            </HostView>
            <HostView className="sidebar-v2-row-title-line mt-1 flex min-w-0">
              {props.title}
              {props.isRegeneratingTitle ? (
                <HostText role="status" className="sr-only">
                  Regenerating title
                </HostText>
              ) : null}
            </HostView>
            <HostView className="sidebar-v2-row-metadata-line mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground/75">
              {props.branch ? (
                <HostText className="min-w-0 flex-1 truncate whitespace-nowrap">
                  {props.branch}
                </HostText>
              ) : (
                <HostText className="flex-1" />
              )}
              {props.terminalStatusIcon}
              {props.prBadge}
              {props.diff ? (
                <HostText
                  className="shrink-0 font-mono"
                  data-sidebar-diff="true"
                  data-sidebar-diff-insertions={String(props.diff.insertions)}
                  data-sidebar-diff-deletions={String(props.diff.deletions)}
                >
                  <HostText className="text-emerald-600 dark:text-emerald-400">
                    +{props.diff.insertions}
                  </HostText>{" "}
                  <HostText className="text-red-600 dark:text-red-400">
                    −{props.diff.deletions}
                  </HostText>
                </HostText>
              ) : null}
              <HostView className="ml-auto inline-flex shrink-0 items-center gap-1">
                {props.remoteIndicator}
                {props.providerIndicator}
              </HostView>
            </HostView>
          </HostView>
          {props.jumpLabel ? <JumpHintBadge label={props.jumpLabel} /> : null}
        </TooltipTrigger>
        {props.detailsTooltip}
      </Tooltip>
      {props.detailsOverlay}
    </HostListItem>
  );
}
