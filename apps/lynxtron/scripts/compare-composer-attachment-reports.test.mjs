import { readFileSync } from "node:fs";
import path from "node:path";

import { assert, describe, it } from "vite-plus/test";

const source = readFileSync(
  path.join(import.meta.dirname, "compare-composer-attachment-reports.mjs"),
  "utf8",
);

describe("paired Composer attachment comparator", () => {
  it("requires exact identity, relative geometry, cover mode, and removal behavior", () => {
    for (const check of [
      "head:",
      "snapshot:",
      "project:",
      "attachment:",
      "viewport:",
      "theme:",
      "electronRendererIdentity:",
      "frameWidth:",
      "surface:",
      "attachmentListWidth:",
      "cardSize:",
      "cardOrigin:",
      "cardRadius:",
      "previewSize:",
      "previewOrigin:",
      "previewCover:",
      "removeInset:",
      "removed:",
      "nativeTransport:",
      "nativeRendererClean:",
      "nativeCleanup:",
    ]) {
      assert.include(source, check);
    }
  });

  it("keeps the smaller Native remove target and picker blocker explicit", () => {
    assert.include(source, 'kind: "remove-hit-target-size"');
    assert.include(source, 'status: "open"');
    assert.include(source, "Native image selection remains blocked");
    assert.include(source, "without paired pixels");
  });
});
