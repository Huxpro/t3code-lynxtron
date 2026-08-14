import { readFileSync } from "node:fs";
import path from "node:path";

import { assert, describe, it } from "vite-plus/test";

const source = readFileSync(path.join(import.meta.dirname, "workbench.js"), "utf8");

describe("shared workbench Composer metrics", () => {
  it("compares only a visible placeholder when the editor is empty", () => {
    assert.include(
      source,
      '(composerEditor?.value ?? composerEditor?.textContent ?? "").length === 0',
    );
    assert.include(source, 'composerEditor?.getAttribute("aria-placeholder") ?? null');
    assert.include(
      source,
      'root?.querySelector(".composer__placeholder")?.textContent?.trim() ?? null',
    );
  });

  it("records matching Footer control geometry for both renderers", () => {
    assert.include(source, 'toolbar: readElementBox(root?.querySelector(".composer-toolbar-row"))');
    assert.include(source, 'toolbar: readElementBox(doc.querySelector(".composer-toolbar-row"))');
    assert.include(source, "controlBoxes: composerControlElements.map");
    assert.include(source, "primaryAction: readElementBox");
  });
});
