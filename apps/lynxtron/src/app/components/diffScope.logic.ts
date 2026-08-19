import type {
  OrchestrationCheckpointSummary,
  ReviewDiffPreviewSource,
  TurnId,
} from "@t3tools/contracts";

export type LynxDiffScope =
  | { readonly kind: "unstaged" }
  | { readonly kind: "branch" }
  | { readonly kind: "turn"; readonly turnId: TurnId };

export function initialDiffScope(turnId: TurnId | null | undefined): LynxDiffScope {
  return turnId ? { kind: "turn", turnId } : { kind: "branch" };
}

export function selectedDiffCheckpoint(
  checkpoints: ReadonlyArray<OrchestrationCheckpointSummary>,
  scope: LynxDiffScope,
): OrchestrationCheckpointSummary | undefined {
  if (scope.kind !== "turn") return undefined;
  return checkpoints.find((checkpoint) => checkpoint.turnId === scope.turnId) ?? checkpoints[0];
}

export function diffScopeLabel(
  checkpoints: ReadonlyArray<OrchestrationCheckpointSummary>,
  scope: LynxDiffScope,
): string {
  if (scope.kind === "unstaged") return "Working tree";
  if (scope.kind === "branch") return "Branch changes";
  const selected = selectedDiffCheckpoint(checkpoints, scope);
  return selected === checkpoints[0]
    ? "Latest turn"
    : selected
      ? `Turn ${selected.checkpointTurnCount}`
      : "Latest turn";
}

export function selectedDiffPreviewSource(
  sources: ReadonlyArray<ReviewDiffPreviewSource>,
  scope: Extract<LynxDiffScope, { readonly kind: "unstaged" | "branch" }>,
): ReviewDiffPreviewSource | undefined {
  const kind = scope.kind === "unstaged" ? "working-tree" : "branch-range";
  return sources.find((source) => source.kind === kind);
}
