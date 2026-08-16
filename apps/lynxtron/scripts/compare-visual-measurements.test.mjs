import { assert, describe, it } from "vite-plus/test";

import {
  compareVisualMeasurements,
  inferLynxCoordinateScale,
  normalizeCssColor,
} from "./compare-visual-measurements.mjs";

function fixture(rect, fontSize, text, backgroundColor = "rgb(0, 0, 0)") {
  return {
    rect,
    text,
    style: {
      backgroundColor,
      color: "rgb(255, 255, 255)",
      fontFamily: "sans-serif",
      fontSize,
      fontWeight: "500",
      lineHeight: "20px",
    },
  };
}

describe("visual measurement comparison", () => {
  it("normalizes device-space Lynx boxes and applies documented thresholds", () => {
    const webEntry = fixture({ x: 0, y: 10, width: 256, height: 100 }, "14px", "Same");
    const lynxEntry = fixture({ x: 8, y: 32, width: 512, height: 200 }, "15px", "Same");
    const web = {
      anchors: { sidebar: webEntry },
      typography: { sidebar: webEntry },
      colors: { sidebar: webEntry },
    };
    const lynx = {
      anchors: { sidebar: lynxEntry },
      typography: { sidebar: lynxEntry },
      colors: { sidebar: lynxEntry },
    };

    assert.equal(inferLynxCoordinateScale(web, lynx, 2), 2);
    const result = compareVisualMeasurements({ web, lynx, deviceScaleFactor: 2 });
    assert.deepEqual(result.anchors.sidebar.lynx, {
      x: 4,
      y: 16,
      width: 256,
      height: 100,
    });
    assert.equal(result.anchors.sidebar.delta.maxAbs, 6);
    assert.equal(result.anchors.sidebar.pass, true);
    assert.equal(result.typography.sidebar.fontSizeDelta, 1);
    assert.equal(result.typography.sidebar.pass, true);
    assert.equal(result.anchors.sidebar.text.exact, true);
  });

  it("keeps geometry, typography, content, and colors as separate gates", () => {
    const webEntry = fixture({ x: 0, y: 0, width: 100, height: 20 }, "12px", "Web");
    const lynxEntry = fixture(
      { x: 20, y: 0, width: 100, height: 20 },
      "16px",
      "Lynx",
      "rgb(1, 1, 1)",
    );
    const result = compareVisualMeasurements({
      web: {
        anchors: { sidebar: webEntry },
        typography: { sidebar: webEntry },
        colors: { sidebar: webEntry },
      },
      lynx: {
        anchors: { sidebar: lynxEntry },
        typography: { sidebar: lynxEntry },
        colors: { sidebar: lynxEntry },
      },
      deviceScaleFactor: 2,
      lynxCoordinateScale: 1,
    });

    assert.equal(result.anchors.sidebar.pass, false);
    assert.equal(result.typography.sidebar.pass, false);
    assert.equal(result.anchors.sidebar.text.exact, false);
    assert.equal(result.colors.sidebar.exact, false);
  });

  it("compares trigger-to-popup relations independently of absolute viewport position", () => {
    const placement = { side: "right", align: "start", sideOffset: 4 };
    const result = compareVisualMeasurements({
      web: {
        anchors: {},
        typography: {},
        colors: {},
        relations: {
          sidebarDetails: {
            placement,
            anchor: fixture({ x: 8, y: 120, width: 240, height: 78 }, "14px", ""),
            popup: fixture({ x: 252, y: 120, width: 272, height: 91 }, "14px", ""),
          },
        },
      },
      lynx: {
        anchors: {},
        typography: {},
        colors: {},
        relations: {
          sidebarDetails: {
            placement,
            anchor: fixture({ x: 72, y: 280, width: 240, height: 78 }, "14px", ""),
            popup: fixture({ x: 316, y: 280, width: 272, height: 91 }, "14px", ""),
          },
        },
      },
      deviceScaleFactor: 2,
      lynxCoordinateScale: 1,
    });

    assert.equal(result.relations.sidebarDetails.lynx.residual, 0);
    assert.equal(result.relations.sidebarDetails.residualDelta, 0);
    assert.equal(result.relations.sidebarDetails.pass, true);
    assert.equal(result.summary.relationsPassing, 1);
  });

  it("rejects a fixed popup that stops following its trigger", () => {
    const placement = { side: "right", align: "start", sideOffset: 4 };
    const result = compareVisualMeasurements({
      web: {
        anchors: {},
        typography: {},
        colors: {},
        relations: {
          sidebarDetails: {
            placement,
            anchor: fixture({ x: 8, y: 120, width: 240, height: 78 }, "14px", ""),
            popup: fixture({ x: 252, y: 120, width: 272, height: 91 }, "14px", ""),
          },
        },
      },
      lynx: {
        anchors: {},
        typography: {},
        colors: {},
        relations: {
          sidebarDetails: {
            placement,
            anchor: fixture({ x: 72, y: 280, width: 240, height: 78 }, "14px", ""),
            popup: fixture({ x: 244, y: 132, width: 272, height: 91 }, "14px", ""),
          },
        },
      },
      deviceScaleFactor: 2,
      lynxCoordinateScale: 1,
    });

    assert.isAbove(result.relations.sidebarDetails.lynx.residual, 0.8);
    assert.equal(result.relations.sidebarDetails.pass, false);
  });

  it("normalizes equivalent Electron and Lynx color syntaxes by declared property", () => {
    assert.equal(normalizeCssColor("oklch(0.145 0 0)"), "rgba(10,10,10,1)");
    assert.equal(normalizeCssColor("oklch(0.97 0 0)"), "rgba(245,245,245,1)");
    assert.equal(normalizeCssColor("rgba(0, 0, 0, 0)"), "rgba(0,0,0,0)");

    const webEntry = fixture({ x: 0, y: 0, width: 10, height: 10 }, "14px", "", "oklch(0.145 0 0)");
    const lynxEntry = fixture({ x: 0, y: 0, width: 10, height: 10 }, "14px", "", "rgb(10,10,10)");
    lynxEntry.style.color = "rgb(0, 0, 0)";
    const result = compareVisualMeasurements({
      web: { anchors: {}, typography: {}, colors: { main: webEntry } },
      lynx: { anchors: {}, typography: {}, colors: { main: lynxEntry } },
      deviceScaleFactor: 2,
      colorProperties: { main: ["backgroundColor"] },
    });

    assert.equal(result.colors.main.exact, true);
  });
});
