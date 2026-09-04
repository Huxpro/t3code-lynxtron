import { readFileSync } from "node:fs";
import path from "node:path";

import { assert, describe, it } from "vite-plus/test";

const source = readFileSync(path.join(import.meta.dirname, "workbench.js"), "utf8");

describe("shared workbench Composer metrics", () => {
  it("forwards the snapshot-owned new-thread model selection to the Lynx pane", () => {
    assert.include(source, 'url.searchParams.get("modelSelection")');
    assert.include(
      source,
      'lynxQuery.set("modelSelection", JSON.stringify(requestedModelSelection))',
    );
  });

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
    assert.include(source, "faviconBox: readElementBox(favicon)");
    assert.include(source, "titleBox: readElementBox(title)");
    assert.include(source, "rows,");
  });

  it("records Project Settings field allocation for both renderers", () => {
    assert.include(
      source,
      'fields: readElementBox(dialog.querySelector(".project-settings-fields"))',
    );
    assert.include(source, 'dialog.querySelectorAll(".project-settings-field")');
    assert.include(source, "fieldColumns:");
  });

  it("records palette row icon and text allocation for both renderers", () => {
    assert.include(source, "function readPaletteRows(elements)");
    assert.include(source, "[data-file-icon-tone], svg, img, x-image");
    assert.include(source, '".palette-row__copy"');
    assert.include(source, '".palette-row__title"');
    assert.include(source, '".palette-row__description"');
  });

  it("records matching Sidebar status geometry for both renderers", () => {
    assert.include(source, "function readSidebarThreadMetrics(item)");
    assert.include(source, "statusSlot: readElementBox");
    assert.include(source, "statusBox: readElementBox");
    assert.include(source, "statusContent: readElementBox");
    assert.include(source, "workingDuration: readElementBox");
    assert.include(source, "map(readSidebarThreadMetrics)");
  });

  it("records Sidebar project controls relative to their row in both renderers", () => {
    assert.include(source, "width: readElementBox");
    assert.include(source, "resizeRail: readElementBox");
    assert.include(source, "projectScopeRow: readElementBox");
    assert.include(source, "projectScopeHost: readElementBox");
    assert.include(source, "newProject: readElementBox");
  });

  it("cold-starts both panes with the requested Sidebar width", () => {
    assert.include(source, 'url.searchParams.get("sidebarWidth")');
    assert.include(source, '"chat_thread_sidebar_width"');
    assert.include(source, 'lynxQuery.set("sidebarWidth"');
  });

  it("records Files browser anatomy and rows for both renderers", () => {
    assert.include(source, "function readFilesBrowserMetrics(root)");
    assert.include(source, '"[data-file-browser-panel], .files-panel"');
    assert.include(source, "const composedElements = []");
    assert.include(source, "if (child.shadowRoot) visit(child.shadowRoot)");
    assert.include(source, "\"button[data-type='item']\"");
    assert.include(source, "filesBrowserMetrics: readFilesBrowserMetrics");
    assert.include(source, "fileEditorMetrics: readFileEditorMetrics");
    assert.include(source, "[data-file-save-error]");
    assert.include(source, "[data-file-save-retry]");
    assert.include(source, "saveError: readElementBox(saveError)");
    assert.include(source, "saveRetry: readElementBox(saveRetry)");
    assert.include(source, "contentEditable?.innerText ??");
    assert.include(source, "readComposedText(editor)");
    assert.include(source, 'node.tagName === "STYLE" || node.tagName === "SCRIPT"');
    assert.include(source, 'querySelectorAll(".file-editor-line__content")');
    assert.include(source, 'projectedLines.map((line) => readComposedText(line)).join("\\n")');
    assert.include(source, "composedElements.find((element)");
    assert.include(source, 'editor?.getAttribute("data-file-editor-mode")');
    assert.include(source, "root?.querySelector('[data-active-tab=\"true\"]')");
    assert.include(source, 'getAttribute("data-pending-tab") === "true"');
    assert.include(source, "editorValueIncludesFidelitySentinel: editorValue.includes(");
    assert.include(source, "editorValueTail: editorValue.slice(-256)");
    assert.include(source, 'querySelector("[data-file-content-revision]")');
    assert.include(source, 'editor?.closest?.("[data-file-content-revision]")');
    assert.include(source, 'getAttribute("data-file-content-revision")');
    assert.include(source, "firstLineNumber: firstLineNumberBox");
    assert.include(source, "firstLineContent: firstLineContentBox ?? editorInnerBox");
    assert.include(source, "gutterWidth,");
    assert.include(source, "editorInnerBox.rect.x - editorBox.rect.x");
    assert.include(source, "statusbarText: readComposedText(statusbar)");
    assert.include(source, "querySelectorAll('[data-settings-row=\"true\"]')");
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

  it("measures every Appearance settings row anchor", () => {
    assert.include(source, '"settings-appearance"');
    assert.include(source, "function readSettingsRows(root, ids)");
    assert.include(source, "rows: readSettingsRows(root, settingsRowIds)");
    assert.include(source, "rows: readSettingsRows(doc, settingsRowIds)");
    assert.include(source, 'ariaDisabled: row.getAttribute("aria-disabled")');
    assert.include(source, 'unavailable: row.getAttribute("data-settings-unavailable")');
    for (const anchor of [
      "theme",
      "setting-glass-opacity",
      "environment-identification",
      "word-wrap",
    ]) {
      assert.include(source, `"${anchor}"`);
    }
  });

  it("measures the Keybindings section by its stable search anchor", () => {
    assert.include(source, '"settings-keybindings": ["keybindings"]');
    assert.include(source, "function readKeybindingsMetrics(root)");
    assert.include(source, 'root?.querySelector("[data-keybindings-table-header]")');
    assert.include(source, '"[data-keybinding-command][data-keybinding-shortcut]"');
    assert.include(
      source,
      'conflicts: JSON.parse(row.getAttribute("data-keybinding-conflicts") ?? "[]")',
    );
    assert.include(source, "keybindings:");
  });
});
