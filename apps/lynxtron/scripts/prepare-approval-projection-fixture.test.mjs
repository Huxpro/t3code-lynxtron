import { readFileSync } from "node:fs";
import path from "node:path";

import { assert, describe, it } from "vite-plus/test";

const source = readFileSync(
  path.join(import.meta.dirname, "prepare-approval-projection-fixture.mjs"),
  "utf8",
);

describe("approval projection fixture preparation", () => {
  it("refuses live or already populated state", () => {
    assert.include(source, "requires a directory created by visual:prepare");
    assert.include(source, 'manifest.threadCount !== 0 || manifest.route !== "new-thread"');
    assert.include(source, "refuses a non-empty visual state");
    assert.include(source, "requires one project and zero threads");
  });

  it("creates the complete canonical pending approval projection", () => {
    assert.include(source, "projection_thread_messages");
    assert.include(source, "projection_turns");
    assert.include(source, "'running'");
    assert.include(source, "projection_thread_sessions");
    assert.include(source, "'approval.requested'");
    assert.include(source, "projection_pending_approvals");
    assert.include(source, "'pending'");
    assert.include(source, "pending_approval_count");
  });

  it("labels direct projection evidence without claiming provider behavior", () => {
    assert.include(source, 'kind: "direct-projection-visual-fixture"');
    assert.include(source, "backendBehaviorClaimed: false");
    assert.include(source, "interactionClaimed: false");
    assert.notInclude(source, "orchestration_events");
  });

  it("pins the Native fixture theme and model selection", () => {
    assert.include(source, '"lynxtron-prefs.json"');
    assert.include(source, 'themePreference: "dark"');
    assert.include(source, "clientSettings: {}");
    assert.include(source, "modelSelection");
  });
});
