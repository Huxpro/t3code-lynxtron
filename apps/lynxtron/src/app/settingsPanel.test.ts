import { readFileSync } from "node:fs";
import path from "node:path";

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

  it("stretches Settings content before percentage-width panels resolve", () => {
    const overrides = readFileSync(path.resolve(import.meta.dirname, "overrides.css"), "utf8");
    const layout = readFileSync(
      path.resolve(
        import.meta.dirname,
        "../../../web/src/components/settings/settingsLayout.lynx.tsx",
      ),
      "utf8",
    );
    for (const selector of [
      ".settings-content",
      ".settings-panel",
      ".settings-section",
      ".settings-section__rows",
      ".settings-row",
    ]) {
      const block = overrides.slice(
        overrides.indexOf(`${selector} {`),
        overrides.indexOf("}", overrides.indexOf(`${selector} {`)),
      );
      expect(block).toContain("--align-self-column: stretch;");
      expect(block).toContain("width: 100%;");
    }
    const settingsRowMarker = overrides.indexOf("/* SettingsRow:");
    const textStart = overrides.indexOf(".settings-row__text {", settingsRowMarker);
    const textBlock = overrides.slice(textStart, overrides.indexOf("}", textStart));
    expect(textBlock).toContain("--lynx-linear-weight: 1;");
    expect(layout).toContain('"settings-section flex w-full min-w-0 flex-col self-stretch"');
    expect(layout).toContain('"settings-section__rows flex w-full min-w-0 flex-col self-stretch"');
    expect(layout).toContain('"settings-row__text flex min-w-0 flex-1 flex-col"');
  });
});
