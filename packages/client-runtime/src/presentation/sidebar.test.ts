import { describe, expect, it } from "vite-plus/test";

import {
  ProviderInstanceId,
  ThreadId,
  TurnId,
  type OrchestrationSession,
  type OrchestrationSessionStatus,
} from "@t3tools/contracts";

import {
  deriveSidebarImmediateStatus,
  deriveSidebarThreadStatus,
  hasUnseenThreadCompletion,
  markThreadUnreadInTimestampRecord,
  markThreadVisitedInTimestampRecord,
  projectSidebarThreadDetailsRows,
  resolveThreadStatusPill,
  sanitizeThreadVisitedTimestampRecord,
  type SidebarThreadStatusInput,
} from "./sidebar.ts";

function session(status: OrchestrationSessionStatus): OrchestrationSession {
  return {
    threadId: ThreadId.make("thread-1"),
    status,
    providerName: "Codex",
    providerInstanceId: ProviderInstanceId.make("codex"),
    runtimeMode: "full-access",
    activeTurnId: status === "running" ? TurnId.make("turn-1") : null,
    lastError: status === "error" ? "boom" : null,
    updatedAt: "2026-07-27T10:00:00.000Z",
  };
}

const settledTurn = {
  turnId: TurnId.make("turn-1"),
  state: "completed" as const,
  requestedAt: "2026-07-27T10:00:00.000Z",
  startedAt: "2026-07-27T10:00:01.000Z",
  completedAt: "2026-07-27T10:01:00.000Z",
  assistantMessageId: null,
};

const baseThread: SidebarThreadStatusInput = {
  hasActionableProposedPlan: false,
  hasPendingApprovals: false,
  hasPendingUserInput: false,
  interactionMode: "default",
  latestTurn: null,
  session: null,
};

describe("shared sidebar presentation", () => {
  it("prioritizes blockers before active session state", () => {
    expect(
      deriveSidebarImmediateStatus({
        hasPendingApprovals: true,
        hasPendingUserInput: true,
        session: session("running"),
      }).kind,
    ).toBe("approval");
    expect(
      deriveSidebarImmediateStatus({
        hasPendingApprovals: false,
        hasPendingUserInput: true,
        session: session("running"),
      }).kind,
    ).toBe("input");
  });

  it("distinguishes running, connecting, failed, and ready sessions", () => {
    const derive = (status: OrchestrationSessionStatus | null) =>
      deriveSidebarImmediateStatus({
        hasPendingApprovals: false,
        hasPendingUserInput: false,
        session: status === null ? null : session(status),
      }).kind;

    expect(derive("running")).toBe("working");
    expect(derive("starting")).toBe("connecting");
    expect(derive("error")).toBe("failed");
    expect(derive("stopped")).toBe("ready");
    expect(derive(null)).toBe("ready");
  });

  it("surfaces a settled actionable plan before completion", () => {
    expect(
      deriveSidebarThreadStatus({
        ...baseThread,
        hasActionableProposedPlan: true,
        interactionMode: "plan",
        latestTurn: settledTurn,
        lastVisitedAt: "2026-07-27T09:00:00.000Z",
        session: session("ready"),
      }).kind,
    ).toBe("plan-ready");
  });

  it("only marks a completion unseen when a valid completion follows the visit", () => {
    expect(
      hasUnseenThreadCompletion({
        latestTurn: settledTurn,
        lastVisitedAt: "2026-07-27T10:00:30.000Z",
      }),
    ).toBe(true);
    expect(hasUnseenThreadCompletion({ latestTurn: settledTurn })).toBe(false);
    expect(
      hasUnseenThreadCompletion({
        latestTurn: settledTurn,
        lastVisitedAt: "2026-07-27T10:02:00.000Z",
      }),
    ).toBe(false);
  });

  it("advances visited timestamps monotonically", () => {
    const initial = { "thread-1": "2026-07-27T10:00:30.000Z" };

    expect(
      markThreadVisitedInTimestampRecord(initial, "thread-1", "2026-07-27T10:00:20.000Z"),
    ).toBe(initial);
    expect(markThreadVisitedInTimestampRecord(initial, "thread-1", "not-a-date")).toBe(initial);
    expect(
      markThreadVisitedInTimestampRecord(initial, "thread-1", "2026-07-27T10:01:00.000Z"),
    ).toEqual({ "thread-1": "2026-07-27T10:01:00.000Z" });
  });

  it("marks a completed thread unread immediately before its completion", () => {
    const initial = { "thread-2": "2026-07-27T10:02:00.000Z" };
    const unread = markThreadUnreadInTimestampRecord(initial, "thread-1", settledTurn.completedAt);

    expect(unread).toEqual({
      ...initial,
      "thread-1": "2026-07-27T10:00:59.999Z",
    });
    expect(
      hasUnseenThreadCompletion({
        latestTurn: settledTurn,
        lastVisitedAt: unread["thread-1"],
      }),
    ).toBe(true);
    expect(markThreadUnreadInTimestampRecord(unread, "thread-1", settledTurn.completedAt)).toBe(
      unread,
    );
    expect(markThreadUnreadInTimestampRecord(initial, "thread-1", null)).toBe(initial);
  });

  it("sanitizes persisted thread visit timestamps", () => {
    expect(
      sanitizeThreadVisitedTimestampRecord({
        "thread-1": "2026-07-27T10:00:30.000Z",
        "thread-2": "not-a-date",
        "": "2026-07-27T10:00:30.000Z",
        "thread-3": 123,
      }),
    ).toEqual({ "thread-1": "2026-07-27T10:00:30.000Z" });
  });

  it("assigns blockers a higher priority than active and resting states", () => {
    const ready = deriveSidebarThreadStatus(baseThread);
    const working = deriveSidebarThreadStatus({
      ...baseThread,
      session: session("running"),
    });
    const approval = deriveSidebarThreadStatus({
      ...baseThread,
      hasPendingApprovals: true,
    });

    expect(approval.priority).toBeGreaterThan(working.priority);
    expect(working.priority).toBeGreaterThan(ready.priority);
  });

  it("projects the shared thread state into the Web-compatible status pill contract", () => {
    expect(
      resolveThreadStatusPill({
        thread: { ...baseThread, session: session("running") },
      }),
    ).toEqual({
      label: "Working",
      colorClass: "text-sky-600 dark:text-sky-300/80",
      dotClass: "bg-sky-500 dark:bg-sky-300/80",
      pulse: true,
    });
    expect(resolveThreadStatusPill({ thread: baseThread })).toBeNull();
  });

  it("projects thread details in one renderer-neutral order", () => {
    expect(
      projectSidebarThreadDetailsRows({
        projectTitle: "t3code",
        environmentLabel: "MacBook Pro",
        branch: "feature/sidebar",
        branchMismatch: true,
        modelLabel: "GPT-5.6",
        terminalProcessCount: 2,
        hasError: true,
      }),
    ).toEqual([
      { kind: "project", label: "t3code" },
      { kind: "environment", label: "MacBook Pro" },
      { kind: "branch", label: "feature/sidebar" },
      {
        kind: "branch-mismatch",
        label: "You're currently checked out on another branch.",
      },
      { kind: "model", label: "GPT-5.6" },
      { kind: "terminal", label: "2 terminal processes running" },
      { kind: "error", label: "Error occurred" },
    ]);
    expect(
      projectSidebarThreadDetailsRows({
        projectTitle: null,
        environmentLabel: null,
        branch: null,
        branchMismatch: false,
        modelLabel: null,
        terminalProcessCount: 0,
        hasError: false,
      }),
    ).toEqual([]);
  });
});
