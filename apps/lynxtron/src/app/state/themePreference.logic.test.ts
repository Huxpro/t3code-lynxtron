import { assert, describe, it } from "vite-plus/test";

import { LYNX_THEME_LABELS, NEXT_LYNX_THEME, resolveLynxTheme } from "./themePreference.logic";

describe("Lynx theme preference", () => {
  it("resolves system to the host color scheme", () => {
    assert.equal(resolveLynxTheme("system", "light"), "light");
    assert.equal(resolveLynxTheme("system", "dark"), "dark");
    assert.equal(resolveLynxTheme("light", "dark"), "light");
    assert.equal(resolveLynxTheme("dark", "light"), "dark");
  });

  it("cycles through system, light, and dark without losing a state", () => {
    assert.equal(NEXT_LYNX_THEME.system, "light");
    assert.equal(NEXT_LYNX_THEME.light, "dark");
    assert.equal(NEXT_LYNX_THEME.dark, "system");
    assert.equal(LYNX_THEME_LABELS.system, "System");
  });
});
