import { readFileSync } from "node:fs";
import path from "node:path";

import { assert, describe, it } from "vite-plus/test";

const source = readFileSync(path.join(import.meta.dirname, "verify-electron-approval.mjs"), "utf8");

describe("Electron approval semantic runner", () => {
  it("pins the copied snapshot, viewport, route, and approval semantics", () => {
    assert.include(source, "copiedHash !== manifest.snapshotId");
    assert.include(source, "mainWindowBounds: { x: 0, y: 0, width, height }");
    assert.include(source, '"Electron environment identity"');
    assert.include(source, 'path.join(electronHome, "userdata/environment-id")');
    assert.include(source, "canonicalRoute");
    assert.include(source, 'data-composer-pending-kind=\"approval\"');
    assert.include(source, ".composer-pending-approval__summary");
    assert.include(source, 'data-approval-detail=\"complete\"');
    assert.include(source, "expectedActions");
  });

  it("is semantic-only and cleans only its owned process and state", () => {
    assert.include(source, 'evidenceKind: "semantic-only"');
    assert.include(source, "await stopOwnedChild(child)");
    assert.notInclude(source, "Page.captureScreenshot");
    assert.notInclude(source, "pkill");
  });
});
