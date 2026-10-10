// The thread payload the Lynx UI reduces for the thread it shows. The
// renderer builds it from upstream's thread atom.
import type { OrchestrationThread } from "@t3tools/contracts";
import { deriveActivePlanState, findLatestProposedPlan } from "@t3tools/lynx-logic/thread";

import type { ConnectorThreadPayload } from "./connectorProtocol.ts";

/**
 * The Lynx transcript knows three roles. A source that asks the server for
 * reasoning messages gets them here as system messages, which is what the
 * server sends a source that does not ask.
 */
function withoutReasoningRole(
  messages: OrchestrationThread["messages"],
): OrchestrationThread["messages"] {
  return messages.some((message) => message.role === "reasoning")
    ? messages.map((message) =>
        message.role === "reasoning" ? { ...message, role: "system" as const } : message,
      )
    : messages;
}

export function projectConnectorThread(thread: OrchestrationThread): ConnectorThreadPayload {
  return {
    threadId: thread.id,
    messages: withoutReasoningRole(thread.messages),
    checkpoints: thread.checkpoints,
    sessionStatus: thread.session?.status ?? "idle",
    sessionError: thread.session?.lastError ?? null,
    activities: thread.activities,
    activePlan: deriveActivePlanState(thread.activities, thread.latestTurn?.turnId ?? undefined),
    activeProposedPlan: findLatestProposedPlan(thread.proposedPlans, thread.latestTurn?.turnId),
    latestTurn: thread.latestTurn ?? null,
    proposedPlans: thread.proposedPlans,
    activeTurnId: thread.session?.activeTurnId ?? null,
  };
}
