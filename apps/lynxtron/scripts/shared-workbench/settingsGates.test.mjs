import { describe, expect, it } from "vite-plus/test";

import { sourceControlErrorSettingsGeometryMatches } from "./settingsGates.mjs";

const webMetrics = {
  sectionTitles: ["Server environment", "Text generation"],
  sourceControlEmptyTitles: ["Could not scan the server environment"],
  geometry: {
    sourceControlEmpty: { rect: { x: 320, y: 132, width: 896, height: 352 } },
    sections: [
      { box: { rect: { x: 320, y: 88, width: 896, height: 396 } } },
      { box: { rect: { x: 320, y: 532, width: 896, height: 290.21875 } } },
    ],
  },
};

describe("Source Control error Settings gate", () => {
  it("rejects the compressed pre-fix error surface", () => {
    expect(
      sourceControlErrorSettingsGeometryMatches(webMetrics, {
        sectionTitles: ["Source Control", "Text generation"],
        sourceControlEmptyTitles: [],
        geometry: {
          sourceControlEmpty: { rect: { x: 320, y: 132, width: 896, height: 116 } },
          sections: [
            { box: { rect: { x: 320, y: 88, width: 896, height: 160 } } },
            { box: { rect: { x: 320, y: 296, width: 896, height: 286 } } },
          ],
        },
      }),
    ).toBe(false);
  });

  it("accepts the canonical error anatomy and section geometry", () => {
    expect(
      sourceControlErrorSettingsGeometryMatches(webMetrics, {
        sectionTitles: ["Server environment", "Text generation"],
        sourceControlEmptyTitles: ["Could not scan the server environment"],
        geometry: {
          sourceControlEmpty: { rect: { x: 320, y: 132, width: 896, height: 352 } },
          sections: [
            { box: { rect: { x: 320, y: 88, width: 896, height: 396 } } },
            { box: { rect: { x: 320, y: 532, width: 896, height: 286 } } },
          ],
        },
      }),
    ).toBe(true);
  });
});
