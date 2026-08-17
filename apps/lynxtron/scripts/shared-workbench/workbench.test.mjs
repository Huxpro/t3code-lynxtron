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
    assert.include(source, "function readComposerToolbarAllocation");
    assert.include(source, "width: primaryActionsRect.x - firstControlRect.x");
    assert.include(source, "toolbarAllocation: readComposerToolbarAllocation");
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

  it("records Workspace menu relation, rows, and material in both renderers", () => {
    assert.include(source, '\"workspace-menu\"');
    assert.include(source, '[data-floating-popup=\"composer-workspace-menu\"]');
    assert.include(source, '[data-floating-anchor=\"composer-workspace-menu\"]');
    assert.include(source, 'root?.querySelector(\".composer-workspace-menu__item\")');
    assert.include(source, "overlayElement?.querySelector('[data-slot=\"select-item\"]')");
    assert.include(source, 'root?.querySelector(\".composer-workspace-menu__description\")');
    assert.include(source, "description: null");
  });

  it("reads dedicated Lynx Sidebar search rows before legacy cards", () => {
    assert.include(source, "[data-sidebar-search-result]");
    assert.include(source, ".sidebar-v2-search-result__title");
    assert.include(source, "dedicatedResults.length > 0 ? dedicatedResults : legacyResults");
    assert.include(source, "function readSidebarSearchRows");
    assert.include(source, 'ariaSelected: row.getAttribute("aria-selected")');
    assert.include(source, 'ariaCurrent: row.getAttribute("aria-current")');
    assert.include(source, "box: readElementBox(row)");
    assert.include(source, "titleBox: readElementBox(title)");
    assert.include(source, "rows,");
  });

  it("measures the Git Publish popup rather than the fullscreen Lynx overlay", () => {
    assert.include(
      source,
      "\"[data-slot='dialog-popup'][data-git-publish-dialog='true'], .git-publish-dialog\"",
    );
    assert.notInclude(
      source,
      "const dialog = root?.querySelector(\"[data-git-publish-dialog='true']\")",
    );
    assert.include(source, "firstStep?.parentElement");
    assert.include(source, "firstProvider?.parentElement");
    assert.include(source, "providerGrid: readElementBox(providerGrid)");
  });
});
