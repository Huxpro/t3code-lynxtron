import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assert, describe, it } from "vite-plus/test";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

describe("Plan 11C residual atlas", () => {
  it("uses current reuse data and an explicit historical style-risk fallback", async () => {
    const source = await readFile(path.join(scriptDirectory, "generate-gap-atlas.mjs"), "utf8");
    assert.include(source, "reports/reuse/current.json");
    assert.include(source, "historicalStyleRiskByScreen");
    assert.notInclude(source, "reports/reuse/plan11c.json");
    assert.notInclude(source, "reports/style/plan11c.json");
  });

  it("contains ranked gaps with evidence and ownership", async () => {
    const report = JSON.parse(
      await readFile(path.join(scriptDirectory, "../reports/gap-atlas.json"), "utf8"),
    );
    assert.isAtLeast(report.gaps.length, 10);
    assert.isArray(report.incompleteRequiredCells);
    assert.isArray(report.blockedRequiredCells);
    assert.isTrue(
      report.gaps.every(
        (gap) =>
          gap.id &&
          gap.severity &&
          gap.category &&
          gap.sourceOwner &&
          gap.fixClass &&
          gap.evidence.length > 0 &&
          Number.isFinite(gap.priorityScore),
      ),
    );
    assert.isTrue(
      report.gaps.every(
        (gap, index) => index === 0 || report.gaps[index - 1].priorityScore >= gap.priorityScore,
      ),
    );
  });
});
