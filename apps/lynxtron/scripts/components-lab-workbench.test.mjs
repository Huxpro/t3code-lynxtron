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
    assert.include(captureSource, "const componentLabSelectReady =");
    assert.include(captureSource, '"Comfortable Compact"');
    assert.include(captureSource, 'select?.value === "Compact"');
    assert.include(captureSource, '[data-component-lab-select-item="compact"]');
    assert.include(readerSource, '[data-floating-popup="component-lab-select"]');
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
    assert.include(captureSource, "componentLabDialogEvidence");
    assert.include(captureSource, 'inputChannel: "dual-cdp-pointer"');
    assert.include(captureSource, "const componentLabPopoverReady =");
    assert.include(captureSource, '[data-component-lab-popover-trigger=\"default\"]');
    assert.include(captureSource, '[data-component-lab-popover-close=\"default\"]');
    assert.include(readerSource, '[data-component-lab-popover-popup="default"]');
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
