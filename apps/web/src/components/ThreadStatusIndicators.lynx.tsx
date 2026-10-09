import type { ReactNode } from "@lynx-js/react";
import {
  prStatusIndicator,
  resolveThreadPr,
  settledPrHoverColorClass,
  terminalStatusFromRunningIds,
  type PrStatusIndicator,
  type TerminalStatusIndicator,
  type ThreadPr,
} from "@t3tools/lynx-logic/sourceControl";
import { resolveThreadStatusPill, type ThreadStatusPill } from "@t3tools/lynx-logic/sidebar";

import { Icon } from "../../../lynxtron/src/app/components/Icon";
import type { SidebarThreadSummary } from "../types";
import { formatWorktreePathForDisplay } from "../worktreeCleanup";

export {
  prStatusIndicator,
  resolveThreadPr,
  settledPrHoverColorClass,
  terminalStatusFromRunningIds,
};
export type { PrStatusIndicator, TerminalStatusIndicator, ThreadPr };

function StatusContainer({
  accessibilityLabel,
  children,
  className,
}: {
  readonly accessibilityLabel: string;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <view
      aria-label={accessibilityLabel}
      className={["inline-flex items-center justify-center", className].filter(Boolean).join(" ")}
    >
      {children}
    </view>
  );
}

export function ChangeRequestStatusIcon({ className }: { readonly className?: string }) {
  return <Icon name="git-branch" size={12} color="#a1a1aa" className={className} />;
}

export function PrStatusTooltipContent({ status }: { readonly status: PrStatusIndicator }) {
  return (
    <view className="flex max-w-[min(34rem,calc(100vw-2rem))] items-stretch overflow-hidden whitespace-nowrap">
      <text className="shrink-0 pr-2 font-medium">{status.tooltipLead}</text>
      <view className="min-h-4 shrink-0 border-border/70 border-l" />
      <text className="min-w-0 truncate pl-2">{status.tooltipTitle}</text>
    </view>
  );
}

export function ThreadWorktreeIndicator({
  thread,
}: {
  readonly thread: Pick<SidebarThreadSummary, "id" | "branch" | "worktreePath">;
}) {
  const worktreePath = thread.worktreePath?.trim();
  if (!worktreePath) return null;

  const displayPath = formatWorktreePathForDisplay(worktreePath);
  const label = thread.branch
    ? `Worktree: ${displayPath} (${thread.branch})`
    : `Worktree: ${displayPath}`;

  return (
    <StatusContainer accessibilityLabel={label} className="thread-worktree-indicator">
      <Icon name="folder" size={12} color="#71717a" className="size-3 text-muted-foreground/40" />
    </StatusContainer>
  );
}

export function ThreadStatusLabel({
  status,
  compact = false,
}: {
  readonly status: ThreadStatusPill;
  readonly compact?: boolean;
}) {
  if (!compact) {
    return (
      <StatusContainer
        accessibilityLabel={status.label}
        className={`thread-status-label thread-status-label--${status.label
          .toLowerCase()
          .replaceAll(" ", "-")}`}
      >
        <view
          className={[
            "thread-status-label__dot",
            status.dotClass,
            status.pulse ? "animate-status-pulse" : undefined,
          ]
            .filter(Boolean)
            .join(" ")}
        />
        <text className="thread-status-label__copy">{status.label}</text>
      </StatusContainer>
    );
  }

  return (
    <StatusContainer
      accessibilityLabel={status.label}
      className={`size-3.5 shrink-0 ${status.colorClass}`}
    >
      <view
        className={[
          "size-[9px]",
          "rounded-full",
          status.dotClass,
          status.pulse ? "animate-status-pulse" : undefined,
        ]
          .filter(Boolean)
          .join(" ")}
      />
    </StatusContainer>
  );
}

export function ThreadRowLeadingStatus({ thread }: { readonly thread: SidebarThreadSummary }) {
  const status = resolveThreadStatusPill({ thread });
  return status ? <ThreadStatusLabel status={status} /> : null;
}

export function ThreadRowTrailingStatus({
  thread: _thread,
}: {
  readonly thread: SidebarThreadSummary;
}) {
  return null;
}
