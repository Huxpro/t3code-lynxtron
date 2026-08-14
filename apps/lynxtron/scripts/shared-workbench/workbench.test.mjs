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
    assert.include(source, "composerControlBoxElement(item)");
    assert.include(source, "button, [role='button'], [data-slot='button']");
    assert.include(source, 'querySelectorAll("x-text, text, span")');
    assert.include(source, 'querySelectorAll("x-image, image, img, svg")');
    assert.include(source, "primaryAction: readElementBox");
  });

  it("records matching Context strip semantic leaves", () => {
    assert.include(source, 'querySelectorAll(".composer-context-control")');
    assert.include(source, 'contextStrip?.querySelectorAll("button")');
    assert.include(source, "contextControls:");
    assert.include(source, "...composerControlDetails(item)");
    assert.include(source, 'querySelectorAll(".composer-context-item")');
    assert.include(source, 'querySelectorAll(".composer-context-label")');
    assert.include(source, 'querySelectorAll(".composer-context-icon")');
    assert.include(source, "contextBackdrop: null");
    assert.include(source, "contextBands: []");
  });
});
