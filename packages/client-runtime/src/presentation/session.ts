import type {
  OrchestrationLatestTurn,
  OrchestrationSession,
  OrchestrationSessionStatus,
} from "@t3tools/contracts";

export type SessionPresentationPhase = "disconnected" | "connecting" | "ready" | "running";

type LatestTurnTiming = Pick<OrchestrationLatestTurn, "startedAt" | "completedAt">;
type SessionActivityState = Pick<OrchestrationSession, "status">;

export function deriveSessionPresentationPhase(
  status: OrchestrationSessionStatus | null | undefined,
): SessionPresentationPhase {
  if (
    status === undefined ||
    status === null ||
    status === "stopped" ||
    status === "interrupted" ||
    status === "error"
  ) {
    return "disconnected";
  }
  if (status === "starting") return "connecting";
  if (status === "running") return "running";
  return "ready";
}

export function isSessionBusy(status: OrchestrationSessionStatus | null | undefined): boolean {
  return status === "starting" || status === "running";
}

export function isLatestTurnSettled(
  latestTurn: LatestTurnTiming | null,
  session: SessionActivityState | null,
): boolean {
  if (!latestTurn?.startedAt || !latestTurn.completedAt) return false;
  return session?.status !== "running";
}
