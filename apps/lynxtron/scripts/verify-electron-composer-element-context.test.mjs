import { readFileSync } from "node:fs";
import path from "node:path";

import { assert, describe, it } from "vite-plus/test";

const source = readFileSync(
  path.join(import.meta.dirname, "verify-electron-composer-element-context.mjs"),
  "utf8",
);

describe("Electron Composer element-context runner", () => {
  it("pins isolated state, a pre-bootstrap workbench marker, and renderer identity", () => {
    assert.include(source, "cpSync(fixtureDir, electronHome");
    assert.include(source, "window.__T3_WORKBENCH_DESKTOP_VISUAL__=true");
    assert.include(source, "T3CODE_STATIC_DIR: webStaticDir");
    assert.include(source, "entryAssetSha256: expectedEntrySha256");
  });

  it("calls the real Web action and proves dedupe, anatomy, sendability, and removal", () => {
    assert.include(source, "window.__T3_WORKBENCH_ADD_ELEMENT_CONTEXT__");
    assert.include(source, "return [add(value), add(value)]");
    assert.include(source, "state.chipCount !== 1");
    assert.include(source, "primaryAction: { disabled: action.disabled");
    assert.include(source, "?.click()");
    assert.include(source, "duplicateRejected: true, removed: true");
  });

  it("retains no pixels and cleans only its owned process and temp tree", () => {
    assert.include(source, 'evidenceKind: "semantic-geometry-only"');
    assert.include(source, "await stopOwnedChild(child)");
    assert.include(source, "rmSync(runRoot");
    assert.notInclude(source, "Page.captureScreenshot");
    assert.notInclude(source, "pkill");
  });
});
