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
    const generalLayout = readFileSync(
      path.resolve(
        import.meta.dirname,
        "../../../web/src/components/settings/generalSettingsHost.lynx.tsx",
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
    const contentStart = overrides.indexOf(".settings-content {");
    const contentBlock = overrides.slice(contentStart, overrides.indexOf("}", contentStart));
    expect(contentBlock).toContain("padding: 36px 32px 40px 32px;");
    expect(overrides).not.toContain(".settings-content--source-control {");
    const settingsRowMarker = overrides.indexOf("/* SettingsRow:");
    const textStart = overrides.indexOf(".settings-row__text {", settingsRowMarker);
    const textBlock = overrides.slice(textStart, overrides.indexOf("}", textStart));
    expect(textBlock).toContain("--lynx-linear-weight: 1;");
    const descriptionStart = overrides.indexOf(".settings-row__desc {", settingsRowMarker);
    const descriptionBlock = overrides.slice(
      descriptionStart,
      overrides.indexOf("}", descriptionStart),
    );
    expect(descriptionBlock).toContain("max-width: 576px;");
    expect(layout).toContain('"settings-section flex w-full min-w-0 flex-col self-stretch"');
    expect(layout).toContain('"settings-section__rows flex w-full min-w-0 flex-col self-stretch"');
    expect(layout).toContain('"settings-row__text flex min-w-0 flex-1 flex-col"');
    expect(generalLayout).toContain('"settings-panel flex w-full min-w-0 flex-col self-stretch"');
    expect(generalLayout).toContain('"settings-section flex w-full min-w-0 flex-col self-stretch"');
    expect(generalLayout).toContain(
      '"settings-section__rows flex w-full min-w-0 flex-col self-stretch"',
    );
    expect(generalLayout).toContain('"settings-row flex w-full min-w-0 self-stretch"');
    expect(generalLayout).toContain('"settings-row__text flex min-w-0 flex-1 flex-col"');
    const routeHost = readFileSync(
      path.resolve(
        import.meta.dirname,
        "../../../web/src/components/settings/settingsRouteHost.lynx.tsx",
      ),
      "utf8",
    );
    expect(routeHost).toContain("key={pathname}");
  });

  it("marks unavailable Settings capabilities as disabled and visibly muted", () => {
    const appearance = readFileSync(
      path.resolve(import.meta.dirname, "components/AppearanceSettings.tsx"),
      "utf8",
    );
    const generalHost = readFileSync(
      path.resolve(
        import.meta.dirname,
        "../../../web/src/components/settings/generalSettingsPanelHost.lynx.tsx",
      ),
      "utf8",
    );
    const generalPanel = readFileSync(
      path.resolve(
        import.meta.dirname,
        "../../../web/src/components/settings/GeneralSettingsPanel.tsx",
      ),
      "utf8",
    );
    const layout = readFileSync(
      path.resolve(
        import.meta.dirname,
        "../../../web/src/components/settings/settingsLayout.lynx.tsx",
      ),
      "utf8",
    );
    const overrides = readFileSync(path.resolve(import.meta.dirname, "overrides.css"), "utf8");

    for (const unavailableProp of [
      "glassOpacityUnavailable",
      "environmentIdentificationUnavailable",
      "wordWrapUnavailable",
    ]) {
      expect(appearance).toContain(unavailableProp);
    }
    expect(generalHost).toContain("GENERAL_SETTINGS_TEXT_GENERATION_MODEL_UNAVAILABLE = true");
    expect(generalHost).toContain('id="background-activity"');
    expect(generalHost).toMatch(/title="Background activity"[\s\S]+?unavailable/);
    expect(generalPanel).toContain(
      "textGenerationModelUnavailable={GENERAL_SETTINGS_TEXT_GENERATION_MODEL_UNAVAILABLE}",
    );
    expect(layout).toContain('aria-disabled={unavailable ? "true" : undefined}');
    expect(layout).toContain('data-settings-unavailable={unavailable ? "true" : undefined}');
    expect(layout).toContain('unavailable ? "settings-row--unavailable" : undefined');

    const unavailableStart = overrides.indexOf(".settings-row--unavailable {");
    const unavailableBlock = overrides.slice(
      unavailableStart,
      overrides.indexOf("}", unavailableStart),
    );
    expect(unavailableBlock).toContain("opacity: 0.48;");
  });

  it("renders server keybindings as a read-only Lynx table", () => {
    const keybindings = readFileSync(
      path.resolve(import.meta.dirname, "components/KeybindingsSettings.tsx"),
      "utf8",
    );
    const overrides = readFileSync(path.resolve(import.meta.dirname, "overrides.css"), "utf8");

    expect(keybindings).toContain('buildKeybindingRows(keybindings, "")');
    expect(keybindings).toContain("serverConfig?.keybindings ?? []");
    expect(keybindings).toContain('id="keybindings"');
    expect(keybindings).toContain("rows.map((row, index) =>");
    expect(keybindings).toContain("formatKeybindingShortcutLabel(row.binding.shortcut, platform)");
    expect(keybindings).toContain("data-keybinding-conflicts={JSON.stringify(row.conflicts)}");
    expect(keybindings).toContain('name="triangle-alert"');
    expect(keybindings).toContain("Keybindings are read-only on Lynxtron");
    expect(keybindings).not.toContain("Keyboard support is limited on Lynxtron.");
    expect(overrides).toContain(".settings-panel--keybindings {");
    expect(overrides).toContain("max-width: 948px;");
    expect(overrides).toContain(".keybindings-table__row {");
    expect(keybindings).toContain("<SettingsSection");
    expect(overrides).toContain(".keybindings-table__command {\n  width: 319px;");
    expect(overrides).toContain(".keybindings-table__key {\n  width: 247px;");
    expect(overrides).toContain(".keybindings-table__when {\n  width: 290px;");
    expect(overrides).toContain(".keybindings-table__status {\n  width: 60px;");
    const tableStart = overrides.indexOf(".keybindings-table__header,");
    const tableContract = overrides.slice(
      tableStart,
      overrides.indexOf(".keybindings-table__command {", tableStart),
    );
    expect(tableContract).toContain("display: flex;");
    expect(tableContract).not.toContain("grid-template-columns");
  });

  it("renders portable Sidebar v2 auto-settle controls in Lynx", () => {
    const settings = readFileSync(
      path.resolve(import.meta.dirname, "components/OtherSettings.tsx"),
      "utf8",
    );
    expect(settings).toContain(
      '<SettingsPageContainer className="flex w-full min-w-0 flex-col self-stretch">',
    );
    expect(settings).toContain("</SettingsPageContainer>");
    expect(settings).toContain('searchableSetting("auto-settle-inactive-threads").title');
    expect(settings).toContain("sidebarAutoSettleAfterDays: enabled");
    expect(settings).toContain('aria-label="Days of inactivity before auto-settle"');
    expect(settings).not.toContain("The Lynx Sidebar v2 renderer has not moved yet");
  });

  it("uses the shared fixed network-access projection without a duplicate inventory row", () => {
    const settings = readFileSync(
      path.resolve(import.meta.dirname, "components/OtherSettings.tsx"),
      "utf8",
    );
    expect(settings).toContain("fixedNetworkAccessPresentation(serverConfig?.auth.policy)");
    expect(settings).toContain('className="settings-connections-network-access"');
    expect(settings).toContain('ariaLabel="Enable network access"');
    expect(settings).toContain("value={networkAccess.checked}");
    expect(settings).toMatch(/value=\{networkAccess\.checked\}[\s\S]+?disabled/);
    expect(settings).not.toContain('title="Access inventory"');
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

  it("matches the canonical Source Control initial loading anatomy", () => {
    const settings = readFileSync(
      path.resolve(import.meta.dirname, "components/OtherSettings.tsx"),
      "utf8",
    );
    const overrides = readFileSync(path.resolve(import.meta.dirname, "overrides.css"), "utf8");
    expect(settings).toContain("SOURCE_CONTROL_LOADING_SECTIONS.map");
    expect(settings).toContain("data-source-control-loading-row={row}");
    expect(settings).toContain('label="Rescan server environment"');
    expect(settings).not.toContain("Scanning server integrations…");
    const rowStart = overrides.indexOf(".source-control-loading-row {");
    const rowBlock = overrides.slice(rowStart, overrides.indexOf("}", rowStart));
    expect(rowBlock).toContain("height: 66px;");
    expect(rowBlock).toContain("--align-self-column: stretch;");
    expect(rowBlock).toContain("width: 100%;");
    expect(overrides).not.toContain(".source-control-loading-row { animation:");
  });
});
