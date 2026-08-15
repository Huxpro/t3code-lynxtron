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

  it("renders portable Sidebar v2 auto-settle controls in Lynx", () => {
    const settings = readFileSync(
      path.resolve(import.meta.dirname, "components/OtherSettings.tsx"),
      "utf8",
    );
    expect(settings).toContain('searchableSetting("auto-settle-inactive-threads").title');
    expect(settings).toContain("sidebarAutoSettleAfterDays: enabled");
    expect(settings).toContain('aria-label="Days of inactivity before auto-settle"');
    expect(settings).not.toContain("The Lynx Sidebar v2 renderer has not moved yet");
  });

  it("matches the canonical Source Control empty and error anatomy", () => {
    const settings = readFileSync(
      path.resolve(import.meta.dirname, "components/OtherSettings.tsx"),
      "utf8",
    );
    const overrides = readFileSync(path.resolve(import.meta.dirname, "overrides.css"), "utf8");
    expect(settings).toContain("deriveSourceControlEmptyPresentation(discovery.error)");
    expect(settings).toContain('className="source-control-empty__title"');
    expect(settings).toContain('className="source-control-empty__description"');
    expect(settings).toContain('name="git-pull-request"');
    expect(settings).toContain('name="refresh-cw"');
    expect(settings).toContain("data-source-control-retry");
    const emptyStart = overrides.indexOf(".source-control-empty {");
    const emptyBlock = overrides.slice(emptyStart, overrides.indexOf("}", emptyStart));
    expect(emptyBlock).toContain("min-height: 352px;");
    expect(emptyBlock).toContain("--align-self-column: stretch;");
    expect(emptyBlock).toContain("width: 100%;");
  });
});
