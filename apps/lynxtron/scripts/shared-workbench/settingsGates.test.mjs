import { describe, expect, it } from "vite-plus/test";

import {
  sourceControlErrorSettingsGeometryMatches,
  sourceControlLoadingSettingsGeometryMatches,
} from "./settingsGates.mjs";

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

  it("accepts platform-specific trailing section height only when its anchor matches", () => {
    const lynxMetrics = {
      sectionTitles: ["Server environment", "Text generation"],
      sourceControlEmptyTitles: ["Could not scan the server environment"],
      geometry: {
        sourceControlEmpty: { rect: { x: 320, y: 132, width: 896, height: 352 } },
        sections: [
          { box: { rect: { x: 320, y: 88, width: 896, height: 396 } } },
          { box: { rect: { x: 320, y: 532, width: 896, height: 268 } } },
        ],
      },
    };

    expect(sourceControlErrorSettingsGeometryMatches(webMetrics, lynxMetrics)).toBe(true);
    expect(
      sourceControlErrorSettingsGeometryMatches(webMetrics, {
        ...lynxMetrics,
        geometry: {
          ...lynxMetrics.geometry,
          sections: [
            lynxMetrics.geometry.sections[0],
            { box: { rect: { x: 321, y: 540, width: 896, height: 268 } } },
          ],
        },
      }),
    ).toBe(false);
  });
});

describe("Source Control loading Settings gate", () => {
  const web = {
    loading: true,
    sectionTitles: ["Version Control", "Source Control Providers", "Text generation"],
    geometry: {
      sections: [
        { box: { rect: { x: 320, y: 88, width: 896, height: 176 } } },
        { box: { rect: { x: 320, y: 312, width: 896, height: 176 } } },
        { box: { rect: { x: 320, y: 536, width: 896, height: 290.21875 } } },
      ],
      loadingRows: Array.from({ length: 18 }, () => ({
        box: { rect: { x: 320, y: 132, width: 20, height: 20 } },
      })),
    },
  };

  it("rejects the old single-card loading anatomy", () => {
    expect(
      sourceControlLoadingSettingsGeometryMatches(web, {
        loading: true,
        sectionTitles: ["Source Control", "Text generation"],
        geometry: {
          sections: [
            { box: { rect: { x: 320, y: 88, width: 896, height: 136 } } },
            { box: { rect: { x: 320, y: 272, width: 896, height: 286 } } },
          ],
          loadingRows: [],
        },
      }),
    ).toBe(false);
  });

  it("accepts three canonical sections and four full loading rows", () => {
    expect(
      sourceControlLoadingSettingsGeometryMatches(web, {
        loading: true,
        sectionTitles: ["Version Control", "Source Control Providers", "Text generation"],
        geometry: {
          sections: [
            { box: { rect: { x: 320, y: 88, width: 896, height: 176 } } },
            { box: { rect: { x: 320, y: 312, width: 896, height: 176 } } },
            { box: { rect: { x: 320, y: 536, width: 896, height: 286 } } },
          ],
          loadingRows: Array.from({ length: 4 }, () => ({
            box: { rect: { x: 320, y: 132, width: 896, height: 66 } },
          })),
        },
      }),
    ).toBe(true);
  });
});
