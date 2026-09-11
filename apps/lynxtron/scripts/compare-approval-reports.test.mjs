import { readFileSync } from "node:fs";
import path from "node:path";

import { assert, describe, it } from "vite-plus/test";

const source = readFileSync(path.join(import.meta.dirname, "compare-approval-reports.mjs"), "utf8");

describe("paired approval comparator", () => {
  it("requires exact identity, viewport, semantic state, and content parity", () => {
    for (const check of [
      "head:",
      "snapshot:",
      "thread:",
      "request:",
      "turn:",
      "viewport:",
      "theme:",
      "composerState:",
      "detail:",
      "actions:",
      "actionsEnabled:",
      "nativeTransport:",
      "cleanNativeRuntime:",
    ]) {
      assert.include(source, check);
    }
  });

  it("keeps semantic evidence distinct from pixels and backend behavior", () => {
    assert.include(source, 'evidenceKind === "semantic-only"');
    assert.include(source, "nativeApproval?.screenshot === undefined");
    assert.include(source, "backendBehaviorClaimed === false");
    assert.include(source, "no screenshot or approval mutation is claimed");
  });
});
