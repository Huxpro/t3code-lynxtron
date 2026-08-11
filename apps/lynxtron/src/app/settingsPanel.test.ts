import { describe, expect, it } from "vite-plus/test";

import { resolveLynxSettingsPanel } from "./settingsPanel";

describe("Lynx Settings route projection", () => {
  it.each([
    ["/settings/general", "general"],
    ["/settings/appearance", "appearance"],
    ["/settings/keybindings", "keybindings"],
    ["/settings/providers", "providers"],
    ["/settings/connections", "connections"],
    ["/settings/source-control", "source-control"],
    ["/settings/beta", "beta"],
    ["/settings/archived", "archive"],
  ] as const)("maps %s to the %s content", (pathname, panel) => {
    expect(resolveLynxSettingsPanel(pathname)).toBe(panel);
  });

  it("keeps unknown Settings content on the existing general fallback", () => {
    expect(resolveLynxSettingsPanel("/settings/not-real")).toBe("general");
  });
});
