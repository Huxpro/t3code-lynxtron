import { readFileSync } from "node:fs";
import path from "node:path";

import { assert, describe, it } from "vite-plus/test";

const source = readFileSync(
  path.join(import.meta.dirname, "compare-composer-element-context-reports.mjs"),
  "utf8",
);

describe("paired Composer element-context comparator", () => {
  it("requires shared identity, content, dedupe, sendability, and removal", () => {
    for (const check of [
      "head:",
      "snapshot:",
      "project:",
      "viewport:",
      "theme:",
      "label:",
      "source:",
      "duplicateRejected:",
      "contextOnlySendable:",
      "removed:",
      "nativePhysicalRemove:",
    ]) {
      assert.include(source, check);
    }
  });

  it("requires Native persistence, failure recovery, transport, and clean rendering", () => {
    assert.include(source, "nativeColdRestart:");
    assert.include(source, "nativeFailureRestoration:");
    assert.include(source, "nativeTransport:");
    assert.include(source, "nativeRendererClean:");
  });

  it("keeps the picker and pixel boundary explicit", () => {
    assert.include(source, "without paired pixels");
    assert.include(source, "Preview picker entry path was not exercised");
  });
});
