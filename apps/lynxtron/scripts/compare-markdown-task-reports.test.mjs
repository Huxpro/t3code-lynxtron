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
      "electronRendererIdentity:",
      "details:",
      "nativeTransport:",
      "nativeRendererClean:",
      "nativeCleanup:",
    ]) {
      assert.include(source, check);
    }
    assert.include(source, "expectedTaskCount");
    assert.include(source, "checked.every((checked) => checked === true)");
    assert.include(source, "entryAssetUrl?.startsWith");
    assert.include(source, "electron.state.details.taskCount === 0");
    assert.include(
      source,
      "electron.state.details.text.trim() === native.state.details.text.trim()",
    );
  });
  it("keeps behavior evidence distinct from pixels and keyboard activation", () => {
    assert.include(source, 'evidenceKind === "semantic-only"');
    assert.include(source, "no paired pixels or keyboard checkbox activation is claimed");
  });
});
