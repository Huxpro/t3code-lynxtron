import { describe, expect, it } from "vite-plus/test";

import {
  beginSidebarResize,
  clampThreadSidebarWidth,
  isThreadMobileSidebarViewport,
  moveSidebarResize,
  resolveInitialThreadSidebarWidth,
  resolveResponsiveThreadSidebarWidth,
  resolveResponsiveThreadSidebarMaximumWidth,
  resolveThreadMobileSidebarWidth,
} from "./sidebarWidth.js";

describe("thread Sidebar width", () => {
  it("preserves a 640px main column while clamping Sidebar width", () => {
    expect(clampThreadSidebarWidth(500, 900)).toBe(260);
    expect(clampThreadSidebarWidth(100, 1280)).toBe(208);
    expect(clampThreadSidebarWidth(320, 1280)).toBe(320);
  });

  it("restores the stored width within the current viewport", () => {
    expect(resolveInitialThreadSidebarWidth(340, 1280)).toBe(340);
    expect(resolveInitialThreadSidebarWidth(340, 900)).toBe(260);
    expect(resolveInitialThreadSidebarWidth(null, 1280)).toBe(256);
  });

  it("tracks drag movement and suppresses click after the 2px threshold", () => {
    const initial = beginSidebarResize(256, 256);
    const tiny = moveSidebarResize(initial, 258, 1280);
    expect(tiny).toEqual({ moved: false, startX: 256, startWidth: 256, width: 258 });

    const moved = moveSidebarResize(tiny, 300, 1280);
    expect(moved).toEqual({ moved: true, startX: 256, startWidth: 256, width: 300 });
  });

  it("gives narrow windows a usable overlay drawer without overwriting desktop width", () => {
    expect(isThreadMobileSidebarViewport(760)).toBe(true);
    expect(isThreadMobileSidebarViewport(768)).toBe(false);
    expect(resolveResponsiveThreadSidebarWidth(321, 760)).toBe(321);
    expect(resolveResponsiveThreadSidebarWidth(null, 760)).toBe(256);
    expect(resolveResponsiveThreadSidebarWidth(500, 900)).toBe(260);
    expect(resolveResponsiveThreadSidebarMaximumWidth(321, 760)).toBe(321);
    expect(resolveResponsiveThreadSidebarMaximumWidth(321, 1000)).toBe(360);
    expect(resolveThreadMobileSidebarWidth(760)).toBe(340);
    expect(resolveThreadMobileSidebarWidth(360)).toBe(336);
  });
});
