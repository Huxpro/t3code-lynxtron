import { describe, expect, it } from "vite-plus/test";

import { getPreviewPanelMaxWidth } from "./PreviewPanelShell";

describe("getPreviewPanelMaxWidth", () => {
  it("allows the panel to use 70% of an ultra-wide viewport after chat reserve", () => {
    expect(getPreviewPanelMaxWidth(6_000)).toBe(4_200);
  });

  it("reserves the sidebar and a usable chat column on normal desktop widths", () => {
    expect(getPreviewPanelMaxWidth(2_001)).toBe(1_337);
    expect(getPreviewPanelMaxWidth(1_024)).toBe(360);
  });
});
