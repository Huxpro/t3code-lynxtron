import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, assert, describe, it } from "vite-plus/test";

import { collectScreenshotFiles, summarizeScreenshotBudget } from "./check-screenshot-budget.mjs";

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe("screenshot budget", () => {
  it("counts only screenshot image extensions recursively", () => {
    const root = mkdtempSync(path.join(tmpdir(), "t3-screenshot-budget-"));
    temporaryRoots.push(root);
    mkdirSync(path.join(root, "nested"));
    writeFileSync(path.join(root, "one.png"), "a");
    writeFileSync(path.join(root, "nested", "two.JPG"), "bb");
    writeFileSync(path.join(root, "nested", "metrics.json"), "{}");
    assert.deepEqual(
      collectScreenshotFiles([root]).map((filePath) => path.basename(filePath)),
      ["two.JPG", "one.png"],
    );
  });

  it("fails closed when the configured limit is exceeded", () => {
    const root = mkdtempSync(path.join(tmpdir(), "t3-screenshot-budget-"));
    temporaryRoots.push(root);
    writeFileSync(path.join(root, "one.png"), "a");
    writeFileSync(path.join(root, "two.jpg"), "bb");
    const result = summarizeScreenshotBudget([root], 1);
    assert.isFalse(result.valid);
    assert.equal(result.count, 2);
    assert.equal(result.bytes, 3);
    assert.equal(result.remaining, -1);
  });
});
