import { assert, describe, it } from "vite-plus/test";

import { applySystemThemeSnapshot, getSystemThemeSnapshot } from "./themeStore.ts";

describe("Lynxtron system theme store", () => {
  it("accepts monotonic native theme snapshots", () => {
    const before = getSystemThemeSnapshot();
    const sequence = before.sequence + 1;
    assert.equal(applySystemThemeSnapshot({ theme: "light", sequence }), true);
    assert.deepEqual(getSystemThemeSnapshot(), { theme: "light", sequence });
    assert.equal(applySystemThemeSnapshot({ theme: "dark", sequence: sequence - 1 }), false);
  });
});
