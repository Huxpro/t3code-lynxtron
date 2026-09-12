import { readFileSync } from "node:fs";
import path from "node:path";

import { assert, describe, it } from "vite-plus/test";

const source = readFileSync(
  path.join(import.meta.dirname, "verify-electron-long-transcript.mjs"),
  "utf8",
);

describe("Electron long-transcript semantic runner", () => {
  it("copies the source snapshot and verifies its hash", () => {
    assert.include(source, "cpSync(fixtureDir, electronHome");
    assert.include(source, "copiedHash !== manifest.snapshotId");
    assert.include(source, 'path.join(electronHome, "userdata/environment-id")');
  });

  it("pins window, thread, rows, minimap, and timeline geometry without screenshots", () => {
    assert.include(source, "mainWindowBounds: { x: 0, y: 0, width, height }");
    assert.include(source, "expectedMinimapCount = fixture.turnCount");
    assert.include(source, "canonicalRoute");
    assert.include(source, "data-timeline-minimap-item");
    assert.include(source, "timelineRect");
    assert.include(source, "diagnostic=${JSON.stringify(diagnostic)}");
    assert.include(source, "T3CODE_STATIC_DIR: webStaticDir");
    assert.include(source, "entryAssetSha256: expectedEntrySha256");
    assert.notInclude(source, "Page.captureScreenshot");
  });

  it("uses a real Web wheel event and requires position plus jump-state changes", () => {
    assert.include(source, 'type: "mouseWheel"');
    assert.include(source, "current.scrollTop >=");
    assert.include(source, "visibleRowIds");
    assert.include(source, "jumpVisible !== true");
  });

  it("uses explicit ports and cleans only owned state and process", () => {
    assert.include(source, "--remote-debugging-port=");
    assert.include(source, "T3CODE_HOME: electronHome");
    assert.include(source, "await stopOwnedChild(child)");
    assert.notInclude(source, "pkill");
  });
});
