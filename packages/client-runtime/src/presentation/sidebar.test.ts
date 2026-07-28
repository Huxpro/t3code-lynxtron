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
  resolveThreadStatusPill,
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
});
