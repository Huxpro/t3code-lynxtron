import { describe, expect, it } from "vite-plus/test";

import { checkRuntimeBudget } from "./check-runtime-budget.mjs";

const budgets = {
  semanticReadyMs: 3000,
  processTreeRssKiBAtSemanticReady: 819200,
  bundleBytes: 7340032,
};

describe("checkRuntimeBudget", () => {
  it("passes runs inside every budget", () => {
    expect(
      checkRuntimeBudget(
        {
          bundle: { bytes: 6956815 },
          results: [
            {
              index: 1,
              timing: { semanticReadyMs: 2055 },
              memory: { processTreeRssKiBAtSemanticReady: 688496 },
            },
          ],
        },
        budgets,
      ),
    ).toEqual([]);
  });

  it("names each exceeded or missing measurement", () => {
    expect(
      checkRuntimeBudget(
        {
          bundle: { bytes: 8000000 },
          results: [{ index: 2, timing: { semanticReadyMs: 3100 }, memory: {} }],
        },
        budgets,
      ),
    ).toEqual([
      "run 2: semantic ready 3100ms > 3000ms",
      "run 2: no process-tree RSS",
      "bundle 8000000 bytes > 7340032 bytes",
    ]);
  });
});
