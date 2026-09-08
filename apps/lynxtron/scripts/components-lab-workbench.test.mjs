import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { assert, describe, it } from "vite-plus/test";

const captureSource = readFileSync(
  resolve(import.meta.dirname, "capture-shared-workbench.mjs"),
  "utf8",
);
const readerSource = readFileSync(
  resolve(import.meta.dirname, "shared-workbench/workbench.js"),
  "utf8",
);

describe("Components Lab paired workbench", () => {
  it("reads the same shared story contract from both renderers", () => {
    assert.include(readerSource, "function readComponentLabMetrics(root)");
    assert.include(readerSource, '[data-component-lab="web-lynx-shared"]');
    assert.include(readerSource, "data-component-states");
    assert.include(readerSource, 'story.querySelectorAll("[data-slot]")');
    assert.include(captureSource, "const componentLabReady =");
    assert.include(captureSource, "const componentLabGeometryReady =");
    assert.include(captureSource, "const componentLabTooltipReady =");
    assert.include(captureSource, '"component-lab-tooltip", "hover"');
    assert.include(captureSource, "const componentLabMenuReady =");
    assert.include(captureSource, 'invokeLynxMenu?.("component-lab-menu")');
    assert.include(captureSource, "state.web.componentLabMetrics.menu.items.length === 2");
    assert.include(readerSource, '[data-floating-popup="component-lab-menu"]');
    assert.include(readerSource, "separatorCount");
    assert.include(readerSource, "shortcutCount");
    assert.include(captureSource, "componentLabMenuEvidence");
    assert.include(readerSource, 'story.querySelectorAll("[data-slot]")');
    assert.include(captureSource, "const componentLabSelectReady =");
    assert.include(captureSource, '"Density Comfortable Compact"');
    assert.include(captureSource, 'select?.value === "Compact"');
    assert.include(captureSource, '[data-component-lab-select-item="compact"]');
    assert.include(readerSource, '[data-floating-popup="component-lab-select"]');
    assert.include(readerSource, "groupCount");
    assert.include(readerSource, "labelCount");
    assert.include(captureSource, "const componentLabNumberReady =");
    assert.include(captureSource, '[data-component-lab-number-action="increment"]');
    assert.include(captureSource, '[data-component-lab-number-action="decrement"]');
    assert.include(readerSource, '[data-component-lab-number-input="value"]');
    assert.include(captureSource, "const componentLabScrollReady =");
    assert.include(captureSource, '".component-lab-scroll-area"');
    assert.include(captureSource, "dispatchMouseWheel");
    assert.include(readerSource, "scrollArea: (() =>");
    assert.include(readerSource, "scrollHeight");
    assert.include(captureSource, "const componentLabDialogReady =");
    assert.include(captureSource, '[data-component-lab-dialog-trigger=\"default\"]');
    assert.include(captureSource, '[data-component-lab-dialog-close=\"default\"]');
    assert.include(readerSource, '[data-component-lab-dialog-popup="default"]');
    assert.include(readerSource, "backdropCount");
    assert.include(readerSource, "viewportCount");
    assert.include(captureSource, "componentLabDialogEvidence");
    assert.include(captureSource, 'inputChannel: "dual-cdp-pointer"');
    assert.include(captureSource, "const componentLabPopoverReady =");
    assert.include(captureSource, '[data-component-lab-popover-trigger=\"default\"]');
    assert.include(captureSource, '[data-component-lab-popover-close=\"default\"]');
    assert.include(readerSource, '[data-component-lab-popover-popup="default"]');
    assert.include(captureSource, "const componentLabProjectFaviconReady =");
    assert.include(readerSource, "projectFavicon: (() =>");
    assert.include(readerSource, '".component-lab-project-favicon"');
    assert.include(captureSource, "const componentLabSettingResetReady =");
    assert.include(captureSource, '[aria-label=\"Reset appearance to default\"]');
    assert.include(readerSource, "settingReset: (() =>");
    assert.include(captureSource, "const componentLabSidebarReady =");
    assert.include(captureSource, '[data-component-lab-sidebar-menu-button=\"default\"]');
    assert.include(readerSource, "sidebarPrimitive: (() =>");
    assert.include(captureSource, "const componentLabDraftInputReady =");
    assert.include(captureSource, "Could not focus Web component lab DraftInput");
    assert.include(captureSource, "Could not focus Lynx component lab DraftInput");
    assert.include(readerSource, "draftInput: (() =>");
    assert.include(captureSource, "const componentLabLabelReady =");
    assert.include(readerSource, '[data-component-lab-label="project-name"]');
    assert.include(captureSource, "componentLabSidebarToggled");
    assert.include(captureSource, '"collapsed"');
    assert.include(captureSource, 'semanticRoute === "components-lab"');
    assert.include(captureSource, '? "/components-lab"');
    assert.include(captureSource, "componentLabCatalog.length");
    assert.include(readerSource, "expectedComponentStoryCount");
    assert.include(captureSource, "const pass = isComponentsLabState");
    assert.include(readerSource, 'expectedSemanticRoute === "components-lab"');
    assert.include(captureSource, "isComponentsLabState &&");
    assert.include(captureSource, "HTTP Authentication failed; no valid credentials available");
  });
});
