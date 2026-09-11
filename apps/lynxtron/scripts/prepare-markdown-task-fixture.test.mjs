import { readFileSync } from "node:fs";
import path from "node:path";

import { assert, describe, it } from "vite-plus/test";

const source = readFileSync(
  path.join(import.meta.dirname, "prepare-markdown-task-fixture.mjs"),
  "utf8",
);

describe("Markdown task fixture preparation", () => {
  it("requires a canonical empty snapshot and exact workspace bytes", () => {
    assert.include(source, 'manifest.threadCount !== 0 || manifest.route !== "new-thread"');
    assert.include(source, "MARKDOWN_TASK_BEFORE");
    assert.include(source, 'relativePath = "README.md"');
  });

  it("pins deterministic Native preferences and an honest backend boundary", () => {
    assert.include(source, 'kind: "canonical-markdown-task-fixture"');
    assert.include(source, "backendBehaviorClaimed: true");
    assert.include(source, '"lynxtron-prefs.json"');
  });
});
