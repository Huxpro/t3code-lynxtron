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
