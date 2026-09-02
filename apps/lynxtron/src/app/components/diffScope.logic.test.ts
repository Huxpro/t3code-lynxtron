import {
  CheckpointRef,
  TurnId,
  type OrchestrationCheckpointSummary,
  type ReviewDiffPreviewSource,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  diffScopeLabel,
  initialDiffScope,
  selectedDiffCheckpoint,
  selectedDiffPreviewSource,
} from "./diffScope.logic.ts";

const checkpoints = [
  {
    turnId: TurnId.make("turn-2"),
    checkpointTurnCount: 2,
    checkpointRef: CheckpointRef.make("refs/t3/turn-2"),
    status: "ready",
    files: [],
    assistantMessageId: null,
    completedAt: "2026-08-20T00:00:00.000Z",
  },
  {
    turnId: TurnId.make("turn-1"),
    checkpointTurnCount: 1,
    checkpointRef: CheckpointRef.make("refs/t3/turn-1"),
    status: "ready",
    files: [],
    assistantMessageId: null,
    completedAt: "2026-08-19T23:00:00.000Z",
  },
] satisfies ReadonlyArray<OrchestrationCheckpointSummary>;

describe("Lynx Diff scope projection", () => {
  it("defaults header entry to branch changes and preserves explicit turns", () => {
    expect(initialDiffScope(null)).toEqual({ kind: "branch" });
    expect(initialDiffScope(TurnId.make("turn-1"))).toEqual({
      kind: "turn",
      turnId: "turn-1",
    });
  });

  it("labels every authority root scope and historical turns", () => {
    expect(diffScopeLabel(checkpoints, { kind: "unstaged" })).toBe("Working tree");
    expect(diffScopeLabel(checkpoints, { kind: "branch" })).toBe("Branch changes");
    expect(diffScopeLabel(checkpoints, { kind: "turn", turnId: TurnId.make("turn-2") })).toBe(
      "Latest turn",
    );
    expect(diffScopeLabel(checkpoints, { kind: "turn", turnId: TurnId.make("turn-1") })).toBe(
      "Turn 1",
    );
  });

  it("falls back stale turn selections to the latest checkpoint", () => {
    expect(
      selectedDiffCheckpoint(checkpoints, {
        kind: "turn",
        turnId: TurnId.make("missing"),
      }),
    ).toBe(checkpoints[0]);
  });

  it("keeps ready turns without file changes addressable in the scope menu", () => {
    expect(checkpoints).toHaveLength(2);
    expect(checkpoints.every((checkpoint) => checkpoint.files.length === 0)).toBe(true);
    expect(diffScopeLabel(checkpoints, { kind: "turn", turnId: checkpoints[1]!.turnId })).toBe(
      "Turn 1",
    );
  });

  it("maps Git scopes to the canonical preview source kinds", () => {
    const sources = [
      {
        id: "working",
        kind: "working-tree",
        title: "Working tree",
        baseRef: null,
        headRef: "main",
        diff: "working",
        diffHash: "working-hash",
        truncated: false,
      },
      {
        id: "branch",
        kind: "branch-range",
        title: "Branch changes",
        baseRef: "origin/main",
        headRef: "main",
        diff: "branch",
        diffHash: "branch-hash",
        truncated: false,
      },
    ] as ReadonlyArray<ReviewDiffPreviewSource>;

    expect(selectedDiffPreviewSource(sources, { kind: "unstaged" })?.diff).toBe("working");
    expect(selectedDiffPreviewSource(sources, { kind: "branch" })?.diff).toBe("branch");
  });
});
