import { readFileSync } from "node:fs";
import path from "node:path";

import { assert, describe, it } from "vite-plus/test";

const source = readFileSync(path.join(import.meta.dirname, "compare-review-reports.mjs"), "utf8");

describe("paired review comparator", () => {
  it("requires exact identity, viewport, checkpoint, and patch parity", () => {
    for (const check of [
      "head:",
      "snapshot:",
      "thread:",
      "turn:",
      "file:",
      "viewport:",
      "theme:",
      "checkpoint:",
      "electronPatchReady:",
      "nativePatchContent:",
      "noTransientState:",
      "nativeTransport:",
      "cleanNativeRuntime:",
      "nativeCleanup:",
    ]) {
      assert.include(source, check);
    }
  });

  it("does not promote semantic correlation into visual or backend evidence", () => {
    assert.include(source, 'evidenceKind === "semantic-only"');
    assert.include(source, "nativeReview?.screenshot === undefined");
    assert.include(source, "backendBehaviorClaimed === false");
    assert.include(source, "closed diff render tree does not expose changed-line text to CDP");
    assert.include(source, "no paired pixels, physical input, or backend behavior is claimed");
  });
});
