import { readFileSync } from "node:fs";
import path from "node:path";

import { assert, describe, it } from "vite-plus/test";

const source = readFileSync(
  path.join(import.meta.dirname, "prepare-review-projection-fixture.mjs"),
  "utf8",
);

describe("review projection fixture preparation", () => {
  it("refuses live or already populated state", () => {
    assert.include(source, "requires a directory created by visual:prepare");
    assert.include(source, 'manifest.threadCount !== 0 || manifest.route !== "new-thread"');
    assert.include(source, "refuses a non-empty visual state");
    assert.include(source, "requires one project and zero threads");
  });

  it("uses real hidden checkpoint refs and a clean disposable Git workspace", () => {
    assert.include(source, 'runGit(workspaceRoot, ["status", "--porcelain"])');
    assert.include(source, '"original review fixture\\n"');
    assert.include(source, 'runGit(workspaceRoot, ["update-ref", baselineRef, baselineCommit])');
    assert.include(source, 'runGit(workspaceRoot, ["update-ref", checkpointRefValue');
    assert.include(source, 'runGit(workspaceRoot, ["reset", "--hard", baselineCommit])');
  });

  it("labels direct projection evidence without claiming backend behavior", () => {
    assert.include(source, 'kind: "direct-projection-visual-fixture"');
    assert.include(source, "backendBehaviorClaimed: false");
    assert.include(source, "checkpoint_files_json");
    assert.notInclude(source, "orchestration_events");
  });
});
