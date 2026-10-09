import type {
  OrchestrationProposedPlan,
  OrchestrationProposedPlanId,
  OrchestrationThreadActivity,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";

export interface ActivePlanState {
  readonly createdAt: string;
  readonly turnId: TurnId | null;
  readonly explanation?: string | null;
  readonly steps: ReadonlyArray<{
    readonly step: string;
    readonly status: "pending" | "inProgress" | "completed";
  }>;
}

export interface LatestProposedPlanState {
  readonly id: OrchestrationProposedPlanId;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly turnId: TurnId | null;
  readonly planMarkdown: string;
  readonly implementedAt: string | null;
  readonly implementationThreadId: ThreadId | null;
}

function activityLifecycleRank(kind: string): number {
  if (kind.endsWith(".started") || kind === "tool.started") return 0;
  if (kind.endsWith(".completed") || kind.endsWith(".resolved")) return 2;
  return 1;
}

function compareActivities(
  left: OrchestrationThreadActivity,
  right: OrchestrationThreadActivity,
): number {
  if (left.sequence !== undefined && right.sequence !== undefined) {
    if (left.sequence !== right.sequence) return left.sequence - right.sequence;
  } else if (left.sequence !== undefined) {
    return 1;
  } else if (right.sequence !== undefined) {
    return -1;
  }

  return (
    left.createdAt.localeCompare(right.createdAt) ||
    activityLifecycleRank(left.kind) - activityLifecycleRank(right.kind) ||
    left.id.localeCompare(right.id)
  );
}

function findLastMatching<T>(
  values: ReadonlyArray<T>,
  predicate: (value: T) => boolean,
): T | undefined {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index]!;
    if (predicate(value)) return value;
  }
  return undefined;
}

export function deriveActivePlanState(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
  latestTurnId: TurnId | undefined,
): ActivePlanState | null {
  const planActivities = [...activities]
    .sort(compareActivities)
    .filter((activity) => activity.kind === "turn.plan.updated");
  const latest =
    (latestTurnId
      ? findLastMatching(planActivities, (activity) => activity.turnId === latestTurnId)
      : undefined) ?? planActivities[planActivities.length - 1];
  if (!latest) return null;

  const payload =
    latest.payload && typeof latest.payload === "object"
      ? (latest.payload as Record<string, unknown>)
      : null;
  const rawPlan = payload?.plan;
  if (!Array.isArray(rawPlan)) return null;

  const steps: Array<ActivePlanState["steps"][number]> = [];
  for (const entry of rawPlan) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.step !== "string") continue;
    const status =
      record.status === "completed" || record.status === "inProgress" ? record.status : "pending";
    steps.push({ step: record.step, status });
  }
  if (steps.length === 0) return null;

  const hasExplanation = payload !== null && "explanation" in payload;
  const rawExplanation = payload?.explanation;
  const explanation: string | null = typeof rawExplanation === "string" ? rawExplanation : null;
  return {
    createdAt: latest.createdAt,
    turnId: latest.turnId,
    ...(hasExplanation ? { explanation } : {}),
    steps,
  };
}

export function findLatestProposedPlan(
  proposedPlans: ReadonlyArray<OrchestrationProposedPlan>,
  latestTurnId: TurnId | string | null | undefined,
): LatestProposedPlanState | null {
  const ordered = [...proposedPlans].sort(
    (left, right) =>
      left.updatedAt.localeCompare(right.updatedAt) || left.id.localeCompare(right.id),
  );
  const latest =
    (latestTurnId
      ? findLastMatching(ordered, (proposedPlan) => proposedPlan.turnId === latestTurnId)
      : undefined) ?? ordered[ordered.length - 1];
  return latest ?? null;
}
