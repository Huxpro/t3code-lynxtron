import { describe, expect, it } from "vite-plus/test";

import { DEFAULT_LYNXTRON_VIEWPORT, resolveLynxtronViewport } from "./windowViewport.ts";

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
