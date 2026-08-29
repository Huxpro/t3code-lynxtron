import { describe, expect, it, vi } from "vite-plus/test";

import {
  firstEnabledQuickSwitchIndex,
  initialQuickSwitchActiveIndex,
  moveQuickSwitchActiveIndex,
  runActiveQuickSwitchItem,
} from "./quickSwitchNavigation";

describe("Quick Switch navigation", () => {
  const enabled = vi.fn();
  const items = [
    { id: "disabled", disabled: true, run: vi.fn() },
    { id: "first", run: enabled },
    { id: "second", run: vi.fn() },
  ];

  it("starts on the first enabled row and skips disabled rows while wrapping", () => {
    expect(firstEnabledQuickSwitchIndex(items)).toBe(1);
    expect(moveQuickSwitchActiveIndex(1, 1, items)).toBe(2);
    expect(moveQuickSwitchActiveIndex(2, 1, items)).toBe(1);
    expect(moveQuickSwitchActiveIndex(1, -1, items)).toBe(2);
  });

  it("runs only the active enabled row", () => {
    expect(runActiveQuickSwitchItem(-1, items)).toBe(false);
    expect(runActiveQuickSwitchItem(0, items)).toBe(false);
    expect(runActiveQuickSwitchItem(1, items)).toBe(true);
    expect(enabled).toHaveBeenCalledOnce();
  });

  it("enters navigation from an intentionally empty selection", () => {
    expect(moveQuickSwitchActiveIndex(-1, 1, items)).toBe(1);
    expect(moveQuickSwitchActiveIndex(-1, -1, items)).toBe(2);
  });

  it("keeps filtered and file results unselected until keyboard navigation", () => {
    expect(initialQuickSwitchActiveIndex(items, { fileMode: false, query: "" })).toBe(1);
    expect(initialQuickSwitchActiveIndex(items, { fileMode: false, query: "settings" })).toBe(-1);
    expect(initialQuickSwitchActiveIndex(items, { fileMode: true, query: "" })).toBe(-1);
  });
});
