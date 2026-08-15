import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

const appRoot = path.resolve(import.meta.dirname, "..");
const capture = readFileSync(path.join(appRoot, "scripts/capture-shared-workbench.mjs"), "utf8");
const workbench = readFileSync(path.join(appRoot, "scripts/shared-workbench/workbench.js"), "utf8");

describe("review diff capture contract", () => {
  it("admits real patches in both panes instead of requiring the historical R10 blocker", () => {
    expect(workbench).toContain(
      'diffSurface.querySelector("[data-review-code-diff], .diff-render-surface")',
    );
    expect(workbench).toContain(
      'loading: Boolean(diffSurface.querySelector("[data-review-patch-loading]"))',
    );
    expect(workbench).toContain(
      'error: Boolean(diffSurface.querySelector("[data-review-patch-error]"))',
    );
    expect(workbench).toContain("function readComposedText(element)");
    expect(workbench).toContain("if (node.nodeType === 3)");
    expect(workbench).toContain("if (node.nodeType !== 1) return");
    expect(workbench).toContain("text: readComposedText(diffSurface).slice(0, 480)");
    expect(capture).toContain("webMetrics.diff.selectedTurn === lynxMetrics.diff.selectedTurn");
    expect(capture).toContain("const EXPECTED_REVIEW_PATCH_LINES = [");
    expect(capture).toContain("function reviewDiffHasExpectedPatch(diff)");
    expect(capture).toContain("diff?.codeDiff === true");
    expect(capture).toContain("diff.loading === false");
    expect(capture).toContain("diff.error === false");
    expect(capture).toContain("reviewDiffHasExpectedPatch(webMetrics.diff)");
    expect(capture).toContain("reviewDiffHasExpectedPatch(lynxMetrics.diff)");
    expect(capture).toContain("!reviewDiffHasExpectedPatch(state?.web?.reviewMetrics?.diff)");
    expect(capture).toContain("!reviewDiffHasExpectedPatch(state?.lynx?.reviewMetrics?.diff)");
    expect(capture).not.toContain('lynxMetrics.diff?.runtimeBlocker === "R10"');
  });
});
