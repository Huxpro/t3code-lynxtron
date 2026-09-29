import { TurnId, type ReviewDiffPreviewSource } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { initialDiffScope, selectedDiffPreviewSource } from "./diffScope.logic.ts";

describe("Lynx Diff scope projection", () => {
  it("defaults header entry to branch changes and preserves explicit turns", () => {
    expect(initialDiffScope(null)).toEqual({ kind: "branch" });
    expect(initialDiffScope(TurnId.make("turn-1"))).toEqual({
      kind: "turn",
      turnId: "turn-1",
    });
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
