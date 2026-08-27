import type { OrchestrationThreadShell } from "@t3tools/contracts";

import { isLatestTurnSettled } from "./session.ts";

export type SidebarThreadStatusKind =
  | "approval"
  | "input"
  | "working"
  | "connecting"
  | "failed"
  | "plan-ready"
  | "completed"
  | "ready";

export interface SidebarThreadStatus {
  readonly kind: SidebarThreadStatusKind;
  readonly label:
    | "Pending Approval"
    | "Awaiting Input"
    | "Working"
    | "Connecting"
    | "Failed"
    | "Plan Ready"
    | "Completed"
    | "Ready";
  readonly priority: number;
  readonly pulse: boolean;
}

export interface ThreadStatusPill {
  readonly label:
    | "Working"
    | "Connecting"
    | "Completed"
    | "Pending Approval"
    | "Awaiting Input"
    | "Plan Ready";
  readonly colorClass: string;
  readonly dotClass: string;
  readonly pulse: boolean;
}

export type SidebarThreadDetailsRowKind =
  | "project"
  | "environment"
  | "branch"
  | "branch-mismatch"
  | "model"
  | "terminal"
  | "error";

export interface SidebarThreadDetailsRow {
  readonly kind: SidebarThreadDetailsRowKind;
  readonly label: string;
}

export function projectSidebarThreadDetailsRows(input: {
  readonly projectTitle: string | null;
  readonly environmentLabel: string | null;
  readonly branch: string | null;
  readonly branchMismatch: boolean;
  readonly modelLabel: string | null;
  readonly terminalProcessCount: number;
  readonly hasError: boolean;
}): ReadonlyArray<SidebarThreadDetailsRow> {
  const rows: SidebarThreadDetailsRow[] = [];
  if (input.projectTitle) rows.push({ kind: "project", label: input.projectTitle });
  if (input.environmentLabel) {
    rows.push({ kind: "environment", label: input.environmentLabel });
  }
  if (input.branch) rows.push({ kind: "branch", label: input.branch });
  if (input.branchMismatch) {
    rows.push({
      kind: "branch-mismatch",
      label: "You're currently checked out on another branch.",
    });
  }
  if (input.modelLabel) rows.push({ kind: "model", label: input.modelLabel });
  if (input.terminalProcessCount > 0) {
    rows.push({
      kind: "terminal",
      label: `${input.terminalProcessCount} terminal ${
        input.terminalProcessCount === 1 ? "process" : "processes"
      } running`,
    });
  }
  if (input.hasError) rows.push({ kind: "error", label: "Error occurred" });
  return rows;
}

type SidebarImmediateStatusInput = Pick<
  OrchestrationThreadShell,
  "hasPendingApprovals" | "hasPendingUserInput" | "session"
>;

export type SidebarThreadStatusInput = Pick<
  OrchestrationThreadShell,
  | "hasActionableProposedPlan"
  | "hasPendingApprovals"
  | "hasPendingUserInput"
  | "interactionMode"
  | "latestTurn"
  | "session"
> & {
  readonly lastVisitedAt?: string | undefined;
};

const STATUSES: Readonly<Record<SidebarThreadStatusKind, SidebarThreadStatus>> = {
  approval: {
    kind: "approval",
    label: "Pending Approval",
    priority: 7,
    pulse: false,
  },
  input: {
    kind: "input",
    label: "Awaiting Input",
    priority: 6,
    pulse: false,
  },
  failed: {
    kind: "failed",
    label: "Failed",
    priority: 5,
    pulse: false,
  },
  working: {
    kind: "working",
    label: "Working",
    priority: 4,
    pulse: true,
  },
  connecting: {
    kind: "connecting",
    label: "Connecting",
    priority: 4,
    pulse: true,
  },
  "plan-ready": {
    kind: "plan-ready",
    label: "Plan Ready",
    priority: 2,
    pulse: false,
  },
  completed: {
    kind: "completed",
    label: "Completed",
    priority: 1,
    pulse: false,
  },
  ready: {
    kind: "ready",
    label: "Ready",
    priority: 0,
    pulse: false,
  },
};

export function deriveSidebarImmediateStatus(
  thread: SidebarImmediateStatusInput,
): SidebarThreadStatus {
  if (thread.hasPendingApprovals) return STATUSES.approval;
  if (thread.hasPendingUserInput) return STATUSES.input;
  if (thread.session?.status === "running") return STATUSES.working;
  if (thread.session?.status === "starting") return STATUSES.connecting;
  if (thread.session?.status === "error") return STATUSES.failed;
  return STATUSES.ready;
}

export function hasUnseenThreadCompletion(
  thread: Pick<SidebarThreadStatusInput, "latestTurn" | "lastVisitedAt">,
): boolean {
  if (!thread.latestTurn?.completedAt) return false;
  const completedAt = Date.parse(thread.latestTurn.completedAt);
  if (Number.isNaN(completedAt) || !thread.lastVisitedAt) return false;

  const lastVisitedAt = Date.parse(thread.lastVisitedAt);
  if (Number.isNaN(lastVisitedAt)) return true;
  return completedAt > lastVisitedAt;
}

export function markThreadVisitedInTimestampRecord(
  timestamps: Record<string, string>,
  threadId: string,
  visitedAt: string,
): Record<string, string> {
  const visitedAtMs = Date.parse(visitedAt);
  if (!Number.isFinite(visitedAtMs)) return timestamps;

  const previousVisitedAt = timestamps[threadId];
  const previousVisitedAtMs = previousVisitedAt ? Date.parse(previousVisitedAt) : Number.NaN;
  if (Number.isFinite(previousVisitedAtMs) && previousVisitedAtMs >= visitedAtMs) {
    return timestamps;
  }

  return { ...timestamps, [threadId]: visitedAt };
}

export function markThreadUnreadInTimestampRecord(
  timestamps: Record<string, string>,
  threadId: string,
  latestTurnCompletedAt: string | null | undefined,
): Record<string, string> {
  if (!latestTurnCompletedAt) return timestamps;

  const completedAtMs = Date.parse(latestTurnCompletedAt);
  if (!Number.isFinite(completedAtMs)) return timestamps;

  const unreadVisitedAt = new Date(completedAtMs - 1).toISOString();
  if (timestamps[threadId] === unreadVisitedAt) return timestamps;
  return { ...timestamps, [threadId]: unreadVisitedAt };
}

export function sanitizeThreadVisitedTimestampRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] =>
        entry[0].length > 0 &&
        typeof entry[1] === "string" &&
        entry[1].length > 0 &&
        Number.isFinite(Date.parse(entry[1])),
    ),
  );
}

export function deriveSidebarThreadStatus(thread: SidebarThreadStatusInput): SidebarThreadStatus {
  const immediateStatus = deriveSidebarImmediateStatus(thread);
  if (immediateStatus.kind !== "ready") return immediateStatus;

  if (
    thread.interactionMode === "plan" &&
    isLatestTurnSettled(thread.latestTurn, thread.session) &&
    thread.hasActionableProposedPlan
  ) {
    return STATUSES["plan-ready"];
  }

  if (hasUnseenThreadCompletion(thread)) return STATUSES.completed;
  return STATUSES.ready;
}

export function resolveThreadStatusPill(input: {
  readonly thread: SidebarThreadStatusInput;
}): ThreadStatusPill | null {
  const status = deriveSidebarThreadStatus(input.thread);
  switch (status.kind) {
    case "approval":
      return {
        label: "Pending Approval",
        colorClass: "text-amber-600 dark:text-amber-300/90",
        dotClass: "bg-amber-500 dark:bg-amber-300/90",
        pulse: status.pulse,
      };
    case "input":
      return {
        label: "Awaiting Input",
        colorClass: "text-indigo-600 dark:text-indigo-300/90",
        dotClass: "bg-indigo-500 dark:bg-indigo-300/90",
        pulse: status.pulse,
      };
    case "working":
      return {
        label: "Working",
        colorClass: "text-sky-600 dark:text-sky-300/80",
        dotClass: "bg-sky-500 dark:bg-sky-300/80",
        pulse: status.pulse,
      };
    case "connecting":
      return {
        label: "Connecting",
        colorClass: "text-sky-600 dark:text-sky-300/80",
        dotClass: "bg-sky-500 dark:bg-sky-300/80",
        pulse: status.pulse,
      };
    case "plan-ready":
      return {
        label: "Plan Ready",
        colorClass: "text-violet-600 dark:text-violet-300/90",
        dotClass: "bg-violet-500 dark:bg-violet-300/90",
        pulse: status.pulse,
      };
    case "completed":
      return {
        label: "Completed",
        colorClass: "text-emerald-600 dark:text-emerald-300/90",
        dotClass: "bg-emerald-500 dark:bg-emerald-300/90",
        pulse: status.pulse,
      };
    case "failed":
    case "ready":
      return null;
  }
}
