import { describe, expect, it } from "vite-plus/test";

import { responsiveMenuWheelDelta } from "./menuWheel.logic";

describe("responsiveMenuWheelDelta", () => {
  it("turns a small wheel gesture into an immediate menu step", () => {
    expect(responsiveMenuWheelDelta(1)).toBe(24);
    expect(responsiveMenuWheelDelta(-1)).toBe(-24);
  });

  it("amplifies ordinary gestures and caps large jumps", () => {
    expect(responsiveMenuWheelDelta(32)).toBe(56);
    expect(responsiveMenuWheelDelta(200)).toBe(96);
  });

  it("ignores invalid and stationary events", () => {
    expect(responsiveMenuWheelDelta(0)).toBe(0);
    expect(responsiveMenuWheelDelta(Number.NaN)).toBe(0);
  });
});
