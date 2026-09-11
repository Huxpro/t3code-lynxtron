import { readFileSync } from "node:fs";
import path from "node:path";

import { assert, describe, it } from "vite-plus/test";

const source = readFileSync(
  path.join(import.meta.dirname, "compare-markdown-task-reports.mjs"),
  "utf8",
);

describe("paired Markdown task comparator", () => {
  it("requires exact identity, bytes, viewport, behavior, and cleanup parity", () => {
    for (const check of [
      "head:",
      "snapshot:",
      "project:",
      "file:",
      "before:",
      "after:",
      "viewport:",
      "theme:",
      "taskCount:",
      "checked:",
      "fileHash:",
      "cleanSaves:",
      "nativeTransport:",
      "nativeRendererClean:",
      "nativeCleanup:",
    ]) {
      assert.include(source, check);
    }
  });
  it("keeps behavior evidence distinct from pixels and keyboard activation", () => {
    assert.include(source, 'evidenceKind === "semantic-only"');
    assert.include(source, "no paired pixels or keyboard checkbox activation is claimed");
  });
});
