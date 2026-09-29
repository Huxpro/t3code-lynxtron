import { describe, expect, it } from "vite-plus/test";

import { EventId, ThreadId, TurnId, type OrchestrationThreadActivity } from "@t3tools/contracts";

import {
  deriveActivePlanState,
  findLatestProposedPlan,
  hasActionableProposedPlan,
} from "./thread.ts";

function planActivity(input: {
  readonly id: string;
  readonly turnId: string;
  readonly createdAt: string;
  readonly payload: unknown;
}): OrchestrationThreadActivity {
  return {
    id: EventId.make(input.id),
    turnId: TurnId.make(input.turnId),
    createdAt: input.createdAt,
    kind: "turn.plan.updated",
    summary: "Plan updated",
    tone: "info",
    payload: input.payload,
  };
}

describe("shared thread presentation", () => {
  it("prefers the latest plan update for the active turn", () => {
    const activities = [
      planActivity({
        id: "old",
        turnId: "turn-1",
        createdAt: "2026-02-23T00:00:01.000Z",
        payload: { plan: [{ step: "Inspect", status: "pending" }] },
      }),
      planActivity({
        id: "latest",
        turnId: "turn-1",
        createdAt: "2026-02-23T00:00:02.000Z",
        payload: {
          explanation: "Refined plan",
          plan: [{ step: "Implement", status: "inProgress" }],
        },
      }),
    ];

    expect(deriveActivePlanState(activities, TurnId.make("turn-1"))).toEqual({
      createdAt: "2026-02-23T00:00:02.000Z",
      turnId: "turn-1",
      explanation: "Refined plan",
      steps: [{ step: "Implement", status: "inProgress" }],
    });
  });

  it("falls back to a previous turn plan", () => {
    const activities = [
      planActivity({
        id: "previous",
        turnId: "turn-1",
        createdAt: "2026-02-23T00:00:01.000Z",
        payload: { plan: [{ step: "Test", status: "completed" }] },
      }),
    ];

    expect(deriveActivePlanState(activities, TurnId.make("turn-2"))?.turnId).toBe("turn-1");
  });

  it("prefers a proposed plan from the active turn", () => {
    const proposedPlans = [
      {
        id: "plan-1",
        turnId: TurnId.make("turn-1"),
        planMarkdown: "# One",
        implementedAt: null,
        implementationThreadId: null,
        createdAt: "2026-02-23T00:00:01.000Z",
        updatedAt: "2026-02-23T00:00:01.000Z",
      },
      {
        id: "plan-2",
        turnId: TurnId.make("turn-2"),
        planMarkdown: "# Two",
        implementedAt: null,
        implementationThreadId: ThreadId.make("implementation"),
        createdAt: "2026-02-23T00:00:02.000Z",
        updatedAt: "2026-02-23T00:00:02.000Z",
      },
    ];

    expect(findLatestProposedPlan(proposedPlans, TurnId.make("turn-1"))?.id).toBe("plan-1");
    expect(findLatestProposedPlan(proposedPlans, null)?.id).toBe("plan-2");
    expect(hasActionableProposedPlan(findLatestProposedPlan(proposedPlans, null))).toBe(true);
    expect(
      hasActionableProposedPlan({
        ...proposedPlans[1]!,
        implementedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toBe(false);
  });
});
