import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_LYNXTRON_VIEWPORT,
  resolveLynxtronViewport,
  resolveLynxtronWindowPosition,
} from "./windowViewport.ts";

describe("resolveLynxtronViewport", () => {
  it("uses the established content viewport by default", () => {
    expect(resolveLynxtronViewport({})).toEqual(DEFAULT_LYNXTRON_VIEWPORT);
  });

  it("accepts explicit integer content viewport dimensions", () => {
    expect(
      resolveLynxtronViewport({
        T3_LYNXTRON_VIEWPORT_WIDTH: "1280",
        T3_LYNXTRON_VIEWPORT_HEIGHT: "820",
      }),
    ).toEqual({
      width: 1280,
      height: 820,
    });
  });

  it.each([
    ["fractional", "1280.5"],
    ["too small", "319"],
    ["too large", "7681"],
    ["non-numeric", "wide"],
  ])("falls back for %s dimensions", (_label, invalidValue) => {
    expect(
      resolveLynxtronViewport({
        T3_LYNXTRON_VIEWPORT_WIDTH: invalidValue,
        T3_LYNXTRON_VIEWPORT_HEIGHT: invalidValue,
      }),
    ).toEqual(DEFAULT_LYNXTRON_VIEWPORT);
  });
});

describe("resolveLynxtronWindowPosition", () => {
  it("returns an explicit integer position for deterministic native evidence", () => {
    expect(
      resolveLynxtronWindowPosition({
        T3_LYNXTRON_WINDOW_X: "20",
        T3_LYNXTRON_WINDOW_Y: "60",
      }),
    ).toEqual({ x: 20, y: 60 });
  });

  it("leaves normal launches under window-manager control", () => {
    expect(resolveLynxtronWindowPosition({})).toBeUndefined();
    expect(resolveLynxtronWindowPosition({ T3_LYNXTRON_WINDOW_X: "20" })).toBeUndefined();
  });
});
