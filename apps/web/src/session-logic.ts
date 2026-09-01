import {
  deriveActivePlanState,
  findLatestProposedPlan,
  type ActivePlanState,
  type LatestProposedPlanState,
} from "@t3tools/client-runtime/presentation/thread";
import {
  deriveSessionPresentationPhase,
  isLatestTurnSettled as isLatestTurnSettledShared,
} from "@t3tools/client-runtime/presentation/session";
import {
  compareActivitiesByOrder,
  deriveTimelineEntries as deriveTimelineEntriesShared,
  inferCheckpointTurnCountByTurnId,
  workRequestKindFromRequestType,
  type TimelineEntry as TranscriptTimelineEntry,
  type WorkLogEntry,
} from "@t3tools/client-runtime/presentation/transcript";
import {
  ProviderDriverKind,
  type OrchestrationLatestTurn,
  type ThreadId,
} from "@t3tools/contracts";
export {
  derivePendingApprovals,
  derivePendingUserInputs,
  type PendingApproval,
  type PendingUserInput,
} from "@t3tools/client-runtime/presentation/pending-requests";

import type { ChatMessage, ProposedPlan, SessionPhase, Thread, ThreadSession } from "./types";

export {
  deriveActivePlanState,
  findLatestProposedPlan,
  type ActivePlanState,
  type LatestProposedPlanState,
};

// The transcript projection (work-log derivation, timeline merging, tool
// status affordances, durations) is shared with the Lynx client from
// client-runtime; this module re-exports it with web-typed aliases.
export {
  deriveActiveWorkStartedAt,
  deriveWorkLogEntries,
  formatDuration,
  formatElapsed,
  workEntryIndicatesToolFailure,
  workEntryIndicatesToolNeutralStatus,
  workEntryIndicatesToolSuccess,
  workLogEntryIsToolLike,
  type WorkLogEntry,
  type WorkLogToolLifecycleStatus,
} from "@t3tools/client-runtime/presentation/transcript";

export type TimelineEntry = TranscriptTimelineEntry<ChatMessage, ProposedPlan>;

/** Web-typed wrapper: pins the shared generics so ReturnType-based consumers stay ChatMessage-typed. */
export function deriveTimelineEntries(
  messages: ReadonlyArray<ChatMessage>,
  proposedPlans: ReadonlyArray<ProposedPlan>,
  workEntries: ReadonlyArray<WorkLogEntry>,
): TimelineEntry[] {
  return deriveTimelineEntriesShared<ChatMessage, ProposedPlan>(
    messages,
    proposedPlans,
    workEntries,
  );
}

export type ProviderPickerKind = ProviderDriverKind;

export const PROVIDER_OPTIONS: Array<{
  value: ProviderPickerKind;
  label: string;
  available: boolean;
  /** Shown on the model picker sidebar when relevant */
  pickerSidebarBadge?: "new" | "soon";
}> = [
  { value: ProviderDriverKind.make("codex"), label: "Codex", available: true },
  { value: ProviderDriverKind.make("claudeAgent"), label: "Claude", available: true },
  {
    value: ProviderDriverKind.make("opencode"),
    label: "OpenCode",
    available: true,
    pickerSidebarBadge: "new",
  },
  {
    value: ProviderDriverKind.make("cursor"),
    label: "Cursor",
    available: true,
    pickerSidebarBadge: "new",
  },
  {
    value: ProviderDriverKind.make("grok"),
    label: "Grok",
    available: true,
    pickerSidebarBadge: "new",
  },
];

type LatestTurnTiming = Pick<OrchestrationLatestTurn, "turnId" | "startedAt" | "completedAt">;
type SessionActivityState = Pick<NonNullable<Thread["session"]>, "status" | "activeTurnId">;

export function isLatestTurnSettled(
  latestTurn: LatestTurnTiming | null,
  session: SessionActivityState | null,
): boolean {
  return isLatestTurnSettledShared(latestTurn, session);
}

export function findSidebarProposedPlan(input: {
  threads: ReadonlyArray<Pick<Thread, "id" | "proposedPlans">>;
  latestTurn: Pick<OrchestrationLatestTurn, "turnId" | "sourceProposedPlan"> | null;
  latestTurnSettled: boolean;
  threadId: ThreadId | string | null | undefined;
}): LatestProposedPlanState | null {
  const activeThreadPlans =
    input.threads.find((thread) => thread.id === input.threadId)?.proposedPlans ?? [];

  if (!input.latestTurnSettled) {
    const sourceProposedPlan = input.latestTurn?.sourceProposedPlan;
    if (sourceProposedPlan) {
      const sourcePlan = input.threads
        .find((thread) => thread.id === sourceProposedPlan.threadId)
        ?.proposedPlans.find((plan) => plan.id === sourceProposedPlan.planId);
      if (sourcePlan) {
        return toLatestProposedPlanState(sourcePlan);
      }
    }
  }

  return findLatestProposedPlan(activeThreadPlans, input.latestTurn?.turnId ?? null);
}

export function hasActionableProposedPlan(
  proposedPlan: LatestProposedPlanState | Pick<ProposedPlan, "implementedAt"> | null,
): boolean {
  return proposedPlan !== null && proposedPlan.implementedAt === null;
}

function toLatestProposedPlanState(proposedPlan: ProposedPlan): LatestProposedPlanState {
  return {
    id: proposedPlan.id,
    createdAt: proposedPlan.createdAt,
    updatedAt: proposedPlan.updatedAt,
    turnId: proposedPlan.turnId,
    planMarkdown: proposedPlan.planMarkdown,
    implementedAt: proposedPlan.implementedAt,
    implementationThreadId: proposedPlan.implementationThreadId,
  };
}

export function derivePhase(session: ThreadSession | null): SessionPhase {
  return deriveSessionPresentationPhase(session?.status);
}
