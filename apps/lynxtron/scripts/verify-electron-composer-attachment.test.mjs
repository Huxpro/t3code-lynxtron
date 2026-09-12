import { readFileSync } from "node:fs";
import path from "node:path";

import { assert, describe, it } from "vite-plus/test";

const source = readFileSync(
  path.join(import.meta.dirname, "verify-electron-composer-attachment.mjs"),
  "utf8",
);

describe("Electron Composer attachment runner", () => {
  it("pins isolated state, fresh renderer identity, viewport, and dark theme", () => {
    assert.include(source, "cpSync(fixtureDir, electronHome");
    assert.include(source, "manifest.snapshotId");
    assert.include(source, "width: 1280, height: 820");
    assert.include(source, "T3CODE_STATIC_DIR: webStaticDir");
    assert.include(source, "delete electronEnv.VITE_DEV_SERVER_URL");
    assert.include(source, "entryAssetSha256: expectedEntrySha256");
  });

  it("uses the real Web paste and remove paths and measures authority anatomy", () => {
    assert.include(source, "new ClipboardEvent('paste'");
    assert.include(source, "new DataTransfer()");
    assert.include(source, "new File([bytes]");
    assert.include(source, "event.defaultPrevented");
    assert.include(source, "Draft attachment may not persist");
    assert.include(source, "getBoundingClientRect()");
    assert.include(source, "getComputedStyle(element)");
    assert.include(source, "?.click()");
    assert.include(source, "removed: true");
  });

  it("retains no pixels and cleans only its owned runtime", () => {
    assert.include(source, 'evidenceKind: "semantic-geometry-only"');
    assert.include(source, "await stopOwnedChild(child)");
    assert.include(source, "rmSync(runRoot");
    assert.notInclude(source, "Page.captureScreenshot");
    assert.notInclude(source, "pkill");
  });
});
