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
    assert.include(source, 'contextLegacyBand.style.display === "none"');
    assert.include(source, 'readSelectorRects(client, ".composer-context-light-band")');
    assert.include(source, "contextLightBands.length === 16");
    assert.include(source, "contextBackdrop.rect.y + index * 2");
    assert.include(source, 'contextLightBandFirst.style.backgroundColor === "rgb(222,222,222)"');
    assert.include(source, 'contextLightBandLast.style.backgroundColor === "rgb(254,254,254)"');
    assert.include(source, "composerThemeScreenshot");
    assert.include(source, "native-composer-${expectedTheme}.png");
    assert.notInclude(outcomeChecksSource, "composerThemeScreenshot");
    assert.include(source, ".composer-toolbar-control .pill__chevron-img");
    assert.include(source, ".composer-toolbar-control--runtime .pill__icon-img");
    assert.include(source, ".composer-toolbar-control--interaction .pill__icon-img");
    assert.include(source, "readSelectorStyleValues");
    assert.include(
      source,
      '".composer-toolbar-control .pill__icon-img, .composer-toolbar-control .pill__chevron-img"',
    );
    assert.include(source, "footerIconOpacities.some(wrongFooterIconOpacity)");
    assert.include(source, '".model-picker-anchor"');
    assert.include(source, '".composer-runtime-control-wrap"');
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
    assert.include(source, "contextIcons.length < 3");
    assert.include(source, "contextIcons.length > 4");
    assert.include(source, "Math.abs(rect.width - 12) > 0.75");
    assert.include(source, 'expectedTheme === "light" ? [113, 113, 122] : [129, 129, 129]');
    assert.include(source, "Math.abs(Number(match[4]) - 0.7) > 1 / 255");
    assert.include(source, "chevrons.length < 2");
    assert.include(source, "chevrons.length > 3");
    assert.include(source, "contextIcons.length < 3");
    assert.include(source, "contextIcons.length > 4");
    assert.include(source, "Composer Footer icon geometry drifted");
  });

  it("verifies the Native working transcript layout and locked workspace copy", () => {
    assert.include(source, 'readSelectorRects(client, ".timeline-list")');
    assert.include(source, 'readSelectorRects(client, ".timeline-row-root--working")');
    assert.include(source, 'readSelectorRects(client, ".transcript-working-row")');
    assert.include(source, "Math.abs(firstRow.y - (timelineList.y + 16)) <= 1");
    assert.include(source, "Math.abs(workingRowRoot.height - 40) <= 0.5");
    assert.include(source, 'checkoutLabel !== "Local checkout"');
  });

  it("verifies the Native completed transcript layout and canonical response", () => {
    assert.include(source, "async function verifyCompletedTranscriptState");
    assert.include(source, "readSelectorRects(");
    assert.include(source, '".timeline-row-root--assistant"');
    assert.include(source, 'readSelectorRects(client, ".timeline-host")');
    assert.include(source, "Math.abs(rowRoots[0].y - (timelineHost.y + 48)) <= 1");
    assert.include(source, "Math.abs(assistantRowRoot.height - (assistantRow.height + 16)) <= 0.5");
    assert.include(source, 'assistantText !== "fidelity loop complete"');
    assert.include(source, '"--verify-completed-transcript-state"');
    assert.include(source, "allowMissingInteraction: true");
    assert.include(source, '".model-picker-anchor > .composer-toolbar-control--model"');
  });

  it("verifies the Native failed transcript banner, fallback model, and error row", () => {
    assert.include(source, "async function verifyFailedTranscriptState");
    assert.include(source, '".thread-error-banner"');
    assert.include(source, '".thread-error-description"');
    assert.include(source, 'modelText === "Big Pickle"');
    assert.include(
      source,
      'errorDescription?.text.includes("Model not found: opencode/not-a-real-model.")',
    );
    assert.include(source, '".transcript-work-status--failed"');
    assert.include(source, '"--verify-failed-transcript-state"');
  });
});
