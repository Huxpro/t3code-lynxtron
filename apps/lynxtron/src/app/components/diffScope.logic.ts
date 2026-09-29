import type { ReviewDiffPreviewSource, TurnId } from "@t3tools/contracts";

export type LynxDiffScope =
  | { readonly kind: "unstaged" }
  | { readonly kind: "branch" }
  | { readonly kind: "turn"; readonly turnId: TurnId };

export function initialDiffScope(turnId: TurnId | null | undefined): LynxDiffScope {
  return turnId ? { kind: "turn", turnId } : { kind: "branch" };
}

export function selectedDiffPreviewSource(
  sources: ReadonlyArray<ReviewDiffPreviewSource>,
  scope: Extract<LynxDiffScope, { readonly kind: "unstaged" | "branch" }>,
): ReviewDiffPreviewSource | undefined {
  const kind = scope.kind === "unstaged" ? "working-tree" : "branch-range";
  return sources.find((source) => source.kind === kind);
}
