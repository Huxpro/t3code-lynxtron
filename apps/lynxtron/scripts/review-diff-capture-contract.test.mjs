import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

const appRoot = path.resolve(import.meta.dirname, "..");
const capture = readFileSync(path.join(appRoot, "scripts/capture-shared-workbench.mjs"), "utf8");
const workbench = readFileSync(path.join(appRoot, "scripts/shared-workbench/workbench.js"), "utf8");

describe("review diff capture contract", () => {
  it("admits a real Lynx patch instead of requiring the historical R10 blocker", () => {
    expect(workbench).toContain(
      'codeDiff: Boolean(diffSurface.querySelector("[data-review-code-diff]"))',
    );
    expect(workbench).toContain(
      'loading: Boolean(diffSurface.querySelector("[data-review-patch-loading]"))',
    );
    expect(workbench).toContain(
      'error: Boolean(diffSurface.querySelector("[data-review-patch-error]"))',
    );
    expect(capture).toContain("webMetrics.diff.selectedTurn === lynxMetrics.diff.selectedTurn");
    expect(capture).toContain("lynxMetrics.diff.codeDiff === true");
    expect(capture).not.toContain('lynxMetrics.diff?.runtimeBlocker === "R10"');
  });
});
