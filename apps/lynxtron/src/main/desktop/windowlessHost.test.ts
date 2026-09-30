import { describe, expect, it } from "vite-plus/test";

import { resolveWindowlessWindowOptions, shouldEnableDevTool } from "./windowlessHost.ts";

describe("resolveWindowlessWindowOptions", () => {
  it("keeps native windows outside Linux", () => {
    expect(resolveWindowlessWindowOptions("darwin", {})).toEqual({});
    expect(resolveWindowlessWindowOptions("win32", {})).toEqual({});
  });

  it("renders windowless on Linux", () => {
    expect(resolveWindowlessWindowOptions("linux", {})).toEqual({ windowless: true });
  });

  it("accepts an explicit device scale factor", () => {
    expect(
      resolveWindowlessWindowOptions("linux", { T3_LYNXTRON_DEVICE_SCALE_FACTOR: "1" }),
    ).toEqual({ windowless: true, deviceScaleFactor: 1 });
  });

  it.each(["0", "5", "wide"])("ignores invalid scale factor %s", (value) => {
    expect(
      resolveWindowlessWindowOptions("linux", { T3_LYNXTRON_DEVICE_SCALE_FACTOR: value }),
    ).toEqual({ windowless: true });
  });
});

describe("shouldEnableDevTool", () => {
  it("is opt-in", () => {
    expect(shouldEnableDevTool({})).toBe(false);
    expect(shouldEnableDevTool({ T3_LYNXTRON_DEVTOOL: "1" })).toBe(true);
  });
});
