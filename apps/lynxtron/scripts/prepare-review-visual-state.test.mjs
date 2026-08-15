import { readFileSync } from "node:fs";
import path from "node:path";

import { assert, describe, it } from "vite-plus/test";

const source = readFileSync(
  path.join(import.meta.dirname, "prepare-review-visual-state.mjs"),
  "utf8",
);

describe("review visual fixture preparation", () => {
  it("records the final projected thread title after provider renaming", () => {
    assert.include(source, "const finalThread = latestShell.threads.find");
    assert.include(source, "title: finalThread.title");
    assert.notInclude(source, "fixture = {\n      threadId,\n      title,");
  });

  it("waits on shell and checkpoint signals rather than a success sleep", () => {
    assert.include(source, "const checkpointPromise = onThread(");
    assert.include(source, '"settled checkpoint"');
    assert.include(source, "await checkpointPromise");
  });
});
