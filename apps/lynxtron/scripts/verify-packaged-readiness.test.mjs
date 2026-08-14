import { readFileSync } from "node:fs";
import path from "node:path";

import { assert, describe, it } from "vite-plus/test";

const source = readFileSync(
  path.join(import.meta.dirname, "verify-packaged-readiness.mjs"),
  "utf8",
);
const outcomeChecksSource = source.slice(
  source.indexOf("const outcomeChecks = ["),
  source.indexOf("].filter(Boolean);", source.indexOf("const outcomeChecks = [")),
);

describe("packaged readiness Sidebar geometry", () => {
  it("verifies every row and card with read-only DevTool box models", () => {
    assert.include(source, "--verify-sidebar-geometry");
    assert.include(source, "DOM.querySelectorAll");
    assert.include(source, "DOM.getBoxModel");
    assert.include(source, "read-only Lynx DevTool DOM box models");
    assert.include(source, "Sidebar rows escaped the rail");
  });

  it("verifies current Composer Footer icon geometry without driving menus", () => {
    assert.include(source, "--verify-composer-geometry");
    assert.include(source, "--expected-theme");
    assert.include(source, 'themeRoot.attributes["data-theme"] === expectedTheme');
    assert.include(source, 'contextBand.style.display === "none"');
    assert.include(source, "composerThemeScreenshot");
    assert.include(source, "native-composer-${expectedTheme}.png");
    assert.notInclude(outcomeChecksSource, "composerThemeScreenshot");
    assert.include(source, ".composer-toolbar-control .pill__chevron-img");
    assert.include(source, ".composer-toolbar-control--runtime .pill__icon-img");
    assert.include(source, ".composer-toolbar-control--interaction .pill__icon-img");
    assert.include(source, '".composer-context-control"');
    assert.include(source, ".composer-context-label--checkout");
    assert.include(source, ".composer-context-label--branch");
    assert.include(source, ".composer-context-icon");
    assert.include(source, "contextControls.length === 2");
    assert.include(source, "contextStrip.y + 20");
    assert.include(source, "<= 1.25");
    assert.include(source, "contextStrip.y + 24");
    assert.include(source, 'label.style.lineHeight === "16px"');
    assert.include(source, "contextLabelsAligned");
    assert.include(source, "contextIcons.length !== 4");
    assert.include(source, "Math.abs(rect.width - 12) > 0.75");
    assert.include(source, "Math.abs(Number(match[1]) - 0.7) > 1 / 255");
    assert.include(source, "chevrons.length < 2");
    assert.include(source, "chevrons.length > 3");
    assert.include(source, "Composer Footer icon geometry drifted");
  });
});
