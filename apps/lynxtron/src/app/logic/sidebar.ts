import type { SidebarThreadStatus } from "../../../../web/src/components/Sidebar.logic";
import { cn } from "../../../../web/src/lib/utils";
import { formatRelativeTimeLabel } from "../../../../web/src/timestampFormat";
import type { SidebarThreadSummary } from "../../../../web/src/types";

export function shouldChooseProjectForNewThread(projectCount: number): boolean {
  return projectCount > 1;
}

/** String twin of firstValidTimestampMs for callers that need the ISO string
    (display labels, tick anchors) rather than epoch ms. */
function firstValidTimestamp(
  ...candidates: ReadonlyArray<string | null | undefined>
): string | null {
  for (const candidate of candidates) {
    if (candidate == null) continue;
    if (!Number.isNaN(Date.parse(candidate))) return candidate;
  }
  return null;
}

/**
 * Search the already-ordered sidebar thread collection by title only.
 * Keeping the input order means lifecycle ordering (active, snoozed, settled)
 * remains stable while the user narrows the list.
 */
export function searchSidebarThreadsByTitle<T extends { readonly title: string }>(
  threads: readonly T[],
  query: string,
): T[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) return [];
  return threads.filter((thread) => thread.title.toLowerCase().includes(normalizedQuery));
}

type SettledTimestampInput = Pick<
  SidebarThreadSummary,
  "settledAt" | "latestUserMessageAt" | "latestTurn" | "updatedAt"
>;

/** The timestamp a settled row sorts and labels by: settledAt when stamped
    (explicit settles), otherwise last activity — the same candidates
    threadLastActivityAt feeds the auto-settle window (user message plus all
    latestTurn stamps), so a thread whose last activity was a turn completion
    doesn't sort by an older message time. updatedAt is the final net. */
function resolveSettledTimestamp(thread: SettledTimestampInput): string | null {
  const settledAt = firstValidTimestamp(thread.settledAt);
  if (settledAt !== null) return settledAt;
  let latest: string | null = null;
  let latestMs = Number.NEGATIVE_INFINITY;
  for (const candidate of [
    thread.latestUserMessageAt,
    thread.latestTurn?.requestedAt,
    thread.latestTurn?.startedAt,
    thread.latestTurn?.completedAt,
  ]) {
    if (candidate == null) continue;
    const parsed = Date.parse(candidate);
    if (!Number.isNaN(parsed) && parsed > latestMs) {
      latest = candidate;
      latestMs = parsed;
    }
  }
  return latest ?? firstValidTimestamp(thread.updatedAt);
}

function compactSidebarTimeLabel(label: string): string {
  if (label === "just now") return "now";
  return label.endsWith(" ago") ? label.slice(0, -4) : label;
}

/** Compact relative label ("5m", "now") for a thread's latest activity. */
export function sidebarV2ThreadTimeLabel(thread: {
  readonly latestUserMessageAt?: string | null | undefined;
  readonly updatedAt: string;
}): string {
  return compactSidebarTimeLabel(
    formatRelativeTimeLabel(thread.latestUserMessageAt ?? thread.updatedAt),
  );
}

/**
 * Settled rows read "how long ago did this wrap up", matching their sort key:
 * both go through resolveSettledTimestamp so label and order can't disagree.
 */
export function sidebarV2SettledTimeLabel(thread: SettledTimestampInput): string {
  const timestamp = resolveSettledTimestamp(thread);
  return timestamp === null ? "" : compactSidebarTimeLabel(formatRelativeTimeLabel(timestamp));
}

// Settled rows are history, so they order by when the work ENDED, not when
// the thread was created or last touched.
export function sortSettledThreadsForSidebar<
  T extends SettledTimestampInput & { readonly id: string },
>(threads: readonly T[]): T[] {
  const timestampMs = (thread: T) => {
    const timestamp = resolveSettledTimestamp(thread);
    return timestamp === null ? 0 : Date.parse(timestamp);
  };
  return [...threads].sort(
    (left, right) => timestampMs(right) - timestampMs(left) || left.id.localeCompare(right.id),
  );
}

/**
 * A woken thread reappears at its original position, so the Woke pill carries
 * the signal until the user visits it after the wake. A never-visited thread
 * still shows it, and an unparseable visit timestamp counts as never-visited.
 */
export function isSidebarV2ThreadWoke(
  wokeAt: string | null,
  lastVisitedAt: string | undefined,
): boolean {
  const wokeAtMs = wokeAt === null ? Number.NaN : Date.parse(wokeAt);
  if (Number.isNaN(wokeAtMs)) return false;
  const lastVisitedMs = lastVisitedAt === undefined ? Number.NaN : Date.parse(lastVisitedAt);
  return Number.isNaN(lastVisitedMs) || lastVisitedMs < wokeAtMs;
}

export interface SidebarV2TopStatus {
  readonly label: string;
  readonly icon: "working" | "done" | "woke" | null;
  readonly className: string;
}

/**
 * Row prominence and status pill for a sidebar thread.
 *
 * In-flight rows (working, monitoring, or waiting on approval/input) recede
 * with read ready rows: prominence is reserved for rows that need a human —
 * done (unread), failed, and freshly woken. Status hues follow the system-wide
 * convention (amber approval, indigo input, sky working).
 */
export function resolveSidebarV2RowPresentation(input: {
  readonly status: SidebarThreadStatus;
  readonly isUnread: boolean;
  readonly isWoke: boolean;
  readonly isActive: boolean;
  readonly isSelected: boolean;
}): {
  readonly isInFlight: boolean;
  readonly shouldRecede: boolean;
  readonly topStatus: SidebarV2TopStatus | null;
} {
  const { status } = input;
  const isInFlight =
    status === "working" || status === "monitoring" || status === "approval" || status === "input";
  const shouldRecede =
    (status === "ready" || isInFlight) &&
    !input.isUnread &&
    !input.isWoke &&
    !input.isActive &&
    !input.isSelected;
  const topStatus: SidebarV2TopStatus | null =
    status === "working"
      ? {
          label: "Working",
          icon: "working",
          // No shimmer: a label that animates forever repaints every vsync on
          // high-refresh displays. Working rests dim; only the open thread
          // gets the label at full strength.
          className: cn("text-sky-600 dark:text-sky-400", !input.isActive && "opacity-75"),
        }
      : status === "monitoring"
        ? // Monitoring is calm background presence, so it keeps full strength.
          { label: "Monitoring", icon: null, className: "text-sky-600 dark:text-sky-400" }
        : status === "approval"
          ? { label: "Approval", icon: null, className: "text-amber-700 dark:text-amber-300" }
          : status === "input"
            ? { label: "Input", icon: null, className: "text-indigo-600 dark:text-indigo-300" }
            : status === "failed"
              ? { label: "Failed", icon: null, className: "text-red-700 dark:text-red-300" }
              : input.isWoke
                ? { label: "Woke", icon: "woke", className: "text-amber-700 dark:text-amber-300" }
                : input.isUnread
                  ? {
                      label: "Done",
                      icon: "done",
                      className: "text-emerald-700 dark:text-emerald-300",
                    }
                  : null;
  return { isInFlight, shouldRecede, topStatus };
}
