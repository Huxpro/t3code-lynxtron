import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assert, describe, it } from "vite-plus/test";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

describe("Plan 11C residual atlas", () => {
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
        (gap, index) =>
          index === 0 || report.gaps[index - 1].priorityScore >= gap.priorityScore,
      ),
    );
  });
});
