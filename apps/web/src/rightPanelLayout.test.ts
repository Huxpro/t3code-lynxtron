import { describe, expect, it } from "vite-plus/test";

import {
  RIGHT_PANEL_DEFAULT_WIDTH,
  RIGHT_PANEL_MIN_WIDTH,
  resolveRightPanelMaximumWidth,
} from "./rightPanelLayout";

describe("right panel layout", () => {
  it("shares the 540px default and 360px minimum across panel kinds", () => {
    expect(RIGHT_PANEL_DEFAULT_WIDTH).toBe(540);
    expect(RIGHT_PANEL_MIN_WIDTH).toBe(360);
  });

  it("preserves thirty percent of the viewport for the chat column", () => {
    expect(resolveRightPanelMaximumWidth(1280)).toBe(896);
    expect(resolveRightPanelMaximumWidth(1000)).toBe(700);
  });
});
