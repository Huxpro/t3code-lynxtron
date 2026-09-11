import { readFileSync } from "node:fs";
import path from "node:path";

import { assert, describe, it } from "vite-plus/test";

const source = readFileSync(
  path.join(import.meta.dirname, "verify-long-transcript-recycling.mjs"),
  "utf8",
);

describe("long-transcript recycling runner", () => {
  it("requires explicit isolated fixture and report paths", () => {
    assert.include(source, "--fixture-dir and --output are required");
    assert.include(source, "longTranscriptFixture");
    assert.include(source, "expectedTimelineRowCount < 100");
  });

  it("pins process, bundle, thread, transport, and session identity", () => {
    assert.include(source, "readOwnedListeningTcpPorts(child.pid)");
    assert.include(source, "@lynx-js/lynxtron/native-paths");
    assert.include(source, 'value.transport?.kind === "main"');
    assert.include(source, "value.activeThreadId === fixture.threadId");
    assert.include(source, "client.identity.bundleUrl !== expectedBundleUrl");
    assert.include(source, "verifyTranscriptRecycling({");
    assert.include(source, "__T3_LYNXTRON_TRANSCRIPT_MINIMAP_COUNT__");
  });

  it("captures no screenshot and stops only its owned process", () => {
    assert.notInclude(source, "take-screenshot");
    assert.notInclude(source, "pkill");
    assert.include(source, "await stopOwnedChild(child)");
    assert.include(source, 'child.once("error"');
    assert.include(source, "rendererErrors({");
  });
});
