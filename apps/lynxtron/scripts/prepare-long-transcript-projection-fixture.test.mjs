import { readFileSync } from "node:fs";
import path from "node:path";

import { assert, describe, it } from "vite-plus/test";

const source = readFileSync(
  path.join(import.meta.dirname, "prepare-long-transcript-projection-fixture.mjs"),
  "utf8",
);

describe("long-transcript projection fixture preparation", () => {
  it("refuses live or populated state and bounds fixture size", () => {
    assert.include(source, "requires a directory created by visual:prepare");
    assert.include(source, 'manifest.threadCount !== 0 || manifest.route !== "new-thread"');
    assert.include(source, "turnCount < 50 || turnCount > 500");
  });

  it("creates complete thread, message, turn, and session projections transactionally", () => {
    assert.include(source, 'database.exec("BEGIN IMMEDIATE")');
    assert.include(source, "projection_thread_messages");
    assert.include(source, "projection_turns");
    assert.include(source, "projection_threads");
    assert.include(source, "projection_thread_sessions");
    assert.include(source, 'database.exec("COMMIT")');
  });

  it("labels its evidence boundary and expected canonical row count", () => {
    assert.include(source, "expectedTimelineRowCount: messageCount");
    assert.include(source, 'kind: "direct-projection-long-transcript-fixture"');
    assert.include(source, "backendBehaviorClaimed: false");
  });
});
