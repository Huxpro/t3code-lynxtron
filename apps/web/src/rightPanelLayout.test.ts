import { describe, expect, it } from "vite-plus/test";

import {
  RIGHT_PANEL_DEFAULT_WIDTH,
  RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY,
  RIGHT_PANEL_MIN_WIDTH,
  resolveRightPanelMaximumWidth,
} from "./rightPanelLayout";

describe("right panel layout", () => {
  it("shares the 540px default and 360px minimum across panel kinds", () => {
    expect(RIGHT_PANEL_DEFAULT_WIDTH).toBe(540);
    expect(RIGHT_PANEL_MIN_WIDTH).toBe(360);
    expect(RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY).toBe("(max-width: 1023px)");
  });

  it("preserves a usable chat column beside the desktop sidebar", () => {
    expect(resolveRightPanelMaximumWidth(1280)).toBe(616);
    expect(resolveRightPanelMaximumWidth(1024)).toBe(360);
    expect(resolveRightPanelMaximumWidth(1000)).toBe(360);
    expect(resolveRightPanelMaximumWidth(6_000)).toBe(4_200);
  });
});
