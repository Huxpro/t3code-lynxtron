import { readFileSync } from "node:fs";
import path from "node:path";

import { assert, describe, it } from "vite-plus/test";

const source = readFileSync(
  path.join(import.meta.dirname, "compare-message-card-reports.mjs"),
  "utf8",
);

describe("paired message-card comparator", () => {
  it("requires identity, renderer-visible content, and clean Native execution", () => {
    for (const check of [
      "head:",
      "snapshot:",
      "thread:",
      "turn:",
      "message:",
      "viewport:",
      "theme:",
      "reviewIdentity:",
      "previewIdentity:",
      "elementIdentity:",
      "visibleSemantics:",
      "nativeTransport:",
      "cleanNativeRuntime:",
      "cleanedNativeState:",
    ]) {
      assert.include(source, check);
    }
  });

  it("does not overclaim screenshots or physical input", () => {
    assert.include(source, 'evidenceKind === "semantic-only"');
    assert.include(source, 'navigation === "programmatic-list-probe"');
    assert.include(source, "no paired pixels or interaction are claimed");
  });
});
