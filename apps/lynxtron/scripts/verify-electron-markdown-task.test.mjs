import { readFileSync } from "node:fs";
import path from "node:path";

import { assert, describe, it } from "vite-plus/test";

const source = readFileSync(
  path.join(import.meta.dirname, "verify-electron-markdown-task.mjs"),
  "utf8",
);

describe("Electron Markdown task runner", () => {
  it("pins isolated snapshot, project, viewport, and dark theme", () => {
    assert.include(source, "cpSync(fixtureDir, electronHome");
    assert.include(source, "manifest.snapshotId");
    assert.include(source, "width: 1280, height: 820");
    assert.include(source, 'localStorage.setItem("t3code:theme", "dark")');
    assert.include(source, "manifest.project.title");
  });

  it("uses the real Web file picker, rendered Markdown toggle, checkbox, and disk write", () => {
    assert.include(source, 'new KeyboardEvent("keydown"');
    assert.include(source, 'data-search-overlay-mode=\"files\"');
    assert.include(source, 'data-palette-row=\"true\"');
    assert.include(source, 'aria-label=\"Show rendered markdown\"');
    assert.include(source, 'input[name=\"markdown-task\"]');
    assert.include(source, 'readFileSync(workspaceFile, "utf8") === fixture.after');
  });

  it("retains semantic-only evidence and cleans owned runtime state", () => {
    assert.include(source, 'evidenceKind: "semantic-only"');
    assert.include(source, "await stopOwnedChild(child)");
    assert.include(source, "rmSync(runRoot");
    assert.notInclude(source, "Page.captureScreenshot");
    assert.notInclude(source, "pkill");
  });
});
