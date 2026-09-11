import { readFileSync } from "node:fs";
import path from "node:path";

import { assert, describe, it } from "vite-plus/test";

const source = readFileSync(
  path.join(import.meta.dirname, "compare-long-transcript-reports.mjs"),
  "utf8",
);

describe("long-transcript paired report comparison", () => {
  it("requires exact head, snapshot, thread, and viewport identity", () => {
    assert.include(source, "electron.head === native.head");
    assert.include(source, "electron.snapshotId === native.fixture?.snapshotId");
    assert.include(source, "native.readiness?.activeThreadId === electron.threadId");
    assert.include(source, "electron.state?.viewport?.width === native.viewport?.width");
  });

  it("correlates canonical turns and end positions without claiming physical input", () => {
    assert.include(source, "electron.state?.minimapItemCount * 2");
    assert.include(source, "fidelity-long-turn-001-user");
    assert.include(source, "fidelity-long-turn-120-user");
    assert.include(source, "physical wheel, keyboard, focus, drag, and selection remain pending");
  });
});
