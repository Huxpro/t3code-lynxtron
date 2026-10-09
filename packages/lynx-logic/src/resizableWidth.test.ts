import { describe, expect, it } from "vite-plus/test";

import { beginResizableWidth, clampResizableWidth, moveResizableWidth } from "./resizableWidth.js";

const bounds = {
  defaultWidth: 540,
  minWidth: 360,
  maxWidth: 700,
};

describe("resizable width", () => {
  it("clamps invalid and out-of-range widths", () => {
    expect(clampResizableWidth(Number.NaN, bounds)).toBe(540);
    expect(clampResizableWidth(200, bounds)).toBe(360);
    expect(clampResizableWidth(900, bounds)).toBe(700);
  });

  it("grows a right-anchored panel while dragging its left edge leftward", () => {
    const initial = beginResizableWidth(740, 540);
    expect(moveResizableWidth(initial, 700, "left", bounds)).toEqual({
      moved: true,
      startX: 740,
      startWidth: 540,
      width: 580,
    });
  });

  it("grows a left-anchored panel while dragging its right edge rightward", () => {
    const initial = beginResizableWidth(256, 256);
    expect(
      moveResizableWidth(initial, 320, "right", {
        defaultWidth: 256,
        minWidth: 208,
        maxWidth: 640,
      }),
    ).toEqual({
      moved: true,
      startX: 256,
      startWidth: 256,
      width: 320,
    });
  });
});
