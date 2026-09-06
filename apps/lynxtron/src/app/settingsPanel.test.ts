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
    ["/settings/archived", "archive"],
  ] as const)("maps %s to the %s content", (pathname, panel) => {
    expect(resolveLynxSettingsPanel(pathname)).toBe(panel);
  });

  it("keeps unknown Settings content on the existing general fallback", () => {
    expect(resolveLynxSettingsPanel("/settings/not-real")).toBe("general");
    expect(resolveLynxSettingsPanel("/settings/beta")).toBe("general");
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
    const settingsRouteHost = readFileSync(
      path.resolve(
        import.meta.dirname,
        "../../../web/src/components/settings/settingsRouteHost.lynx.tsx",
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
    expect(overrides).toContain(
      ".settings-content--connections > .settings-panel {\n  --align-self-row: start;\n  align-self: flex-start;",
    );
    expect(overrides).toContain(
      ".settings-remote-empty {\n  position: relative;\n  display: block;",
    );
    expect(overrides).toContain("height: 232px;");
    expect(overrides).toContain("left: calc(50% - 18px);");
    expect(overrides).toContain("left: calc(50% - 173px);");
    expect(overrides).toContain("width: 346px;");
    expect(overrides).toContain(
      ".settings-remote-empty__title {\n  position: absolute;\n  top: 0;\n  left: 0;",
    );
    expect(overrides).toContain(
      ".settings-remote-empty__description {\n  position: absolute;\n  top: 32px;\n  left: 0;",
    );
    const scrollStart = overrides.indexOf(".settings-scroll {");
    const scrollBlock = overrides.slice(scrollStart, overrides.indexOf("}", scrollStart));
    expect(scrollBlock).toContain("display: flex;");
    expect(scrollBlock).toContain("flex-direction: column;");
    expect(scrollBlock).toContain("flex-shrink: 1;");
    expect(scrollBlock).toContain("height: 0;");
    expect(scrollBlock).toContain("min-height: 0;");
    expect(scrollBlock).toContain("overflow: hidden;");
    expect(settingsRouteHost).toContain('<view className="settings-main">');
    expect(settingsRouteHost).toContain("scroll-y");
    expect(settingsRouteHost.match(/scroll-y/g)).toHaveLength(1);
    expect(settingsRouteHost).toContain("const contentHeight = Math.max(0, viewport.height - 52);");
    expect(settingsRouteHost).toContain("style={{ height: `${contentHeight}px` }}");
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
    expect(descriptionBlock).toContain("line-height: 20px;");
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
    const generalWebHost = readFileSync(
      path.resolve(
        import.meta.dirname,
        "../../../web/src/components/settings/generalSettingsPanelHost.web.tsx",
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
    const generalLayout = readFileSync(
      path.resolve(
        import.meta.dirname,
        "../../../web/src/components/settings/generalSettingsHost.lynx.tsx",
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
    expect(appearance).toContain("glassOpacityControl={<UnavailableControl width={208} />}");
    expect(appearance).toContain("wordWrapControl={<UnavailableControl width={160} />}");
    expect(appearance).toContain("width={160}");
    expect(overrides).toContain("#theme,\n#word-wrap {\n  height: 66.84375px;");
    expect(overrides).toContain("#setting-glass-opacity {\n  height: 85.6875px;");
    expect(generalHost).toContain("GENERAL_SETTINGS_TEXT_GENERATION_MODEL_UNAVAILABLE = false");
    expect(generalHost).toContain("<ModelPicker");
    expect(generalHost).toContain("setTextGenerationModelSelection");
    expect(generalHost).toContain('id="background-activity"');
    expect(generalHost).toContain('aria-label="Background policy details"');
    expect(generalHost).toContain('name="info"');
    expect(generalLayout).toContain("readonly titleAccessory?: ReactNode;");
    expect(generalLayout).toContain("{titleAccessory}");
    expect(generalHost).toContain('ariaLabel="Background activity profile"');
    expect(generalWebHost).toContain('id="background-activity"');
    expect(generalHost).toContain("onProfileChange(value)");
    expect(generalPanel).toContain("setBackgroundActivityProfile(profile)");
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

  it("renders searchable server keybindings with a writable add flow", () => {
    const keybindings = readFileSync(
      path.resolve(import.meta.dirname, "components/KeybindingsSettings.tsx"),
      "utf8",
    );
    const overrides = readFileSync(path.resolve(import.meta.dirname, "overrides.css"), "utf8");

    expect(keybindings).toContain("buildKeybindingRows(keybindings, query)");
    expect(keybindings).toContain("serverConfig?.keybindings ?? []");
    expect(keybindings).toContain('id="keybindings"');
    expect(keybindings).toContain("rows.map((row, index) =>");
    expect(keybindings).toContain("formatKeybindingShortcutLabel(row.binding.shortcut, platform)");
    expect(keybindings).toContain("data-keybinding-conflicts={JSON.stringify(row.conflicts)}");
    expect(keybindings).toContain("shortcutToKeybindingInput(shortcut)");
    expect(keybindings).toContain('if (part === "mod" || part === "meta") return "⌘";');
    expect(keybindings).toContain('name="triangle-alert"');
    expect(keybindings).toContain('aria-label="Search keybindings"');
    expect(keybindings).toContain('aria-label="Add keybinding"');
    expect(keybindings).toContain('data-keybinding-add-row="true"');
    expect(keybindings).toContain("t3ClientActions");
    expect(keybindings).toContain(".upsertKeybinding({");
    expect(keybindings).not.toContain("Read-only ·");
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

  it("renders the shared default and legacy sidebar settings in Lynx", () => {
    const settings = readFileSync(
      path.resolve(
        import.meta.dirname,
        "../../../web/src/components/settings/GeneralSettingsContent.tsx",
      ),
      "utf8",
    );
    const host = readFileSync(
      path.resolve(
        import.meta.dirname,
        "../../../web/src/components/settings/generalSettingsHost.lynx.tsx",
      ),
      "utf8",
    );
    const overrides = readFileSync(path.resolve(import.meta.dirname, "overrides.css"), "utf8");
    expect(settings).toContain('searchableSetting("auto-settle-inactive-threads")');
    expect(settings).toContain('settingControl="auto-settle"');
    expect(overrides).toContain(
      ".general-settings-row--nested {\n  background-color: transparent;\n  padding-left: 16px;",
    );
    expect(settings).toContain('searchableSetting("legacy-sidebar")');
    expect(settings).toContain('settingControl="legacy-sidebar"');
    expect(settings).toContain('aria-label="Sidebar (legacy)"');
    expect(host).toContain("export function GeneralSettingsLegacySection");
    expect(host).toContain(
      'className="settings-section settings-legacy-section flex w-full min-w-0 flex-col self-stretch"',
    );
    expect(host).toContain(
      "settings-section__rows settings-legacy-section__rows flex w-full min-w-0 flex-col self-stretch",
    );
    expect(host).toContain("data-setting-control={settingControl}");
    expect(host).toContain('role: "switch"');
    expect(host).toContain('aria-checked={checked ? "true" : "false"}');
    expect(host).toContain("settings-legacy-section__rows--closed");
    const legacyStart = overrides.indexOf(".settings-legacy-section {");
    const legacyBlock = overrides.slice(legacyStart, overrides.indexOf("}", legacyStart));
    expect(legacyBlock).toContain("flex-direction: column;");
    expect(legacyBlock).toContain("width: 100%;");
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
    expect(settings).toContain("EmptyRemoteEnvironments");
    expect(settings).toContain('className="settings-connections-add-environment"');
    expect(settings).toMatch(
      /className="settings-connections-add-environment"[\s\S]+?disabled[\s\S]+?label="Add environment"/,
    );
    expect(settings).toContain('name="chevrons-left-right-ellipsis"');
    expect(settings).toMatch(
      /title="Remote environments"[\s\S]+?<EmptyRemoteEnvironments[\s\S]+?cloudEnabled=\{false\}/,
    );
    expect(settings).not.toMatch(
      /title="Remote environments"[\s\S]+?<view className="settings-empty-card">/,
    );
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
    expect(emptyBlock).toContain("position: relative;");
    expect(emptyBlock).toContain("display: block;");
    expect(emptyBlock).toContain("width: 100%;");
    const emptyHeaderStart = overrides.indexOf(".source-control-empty__header {");
    const emptyHeaderBlock = overrides.slice(
      emptyHeaderStart,
      overrides.indexOf("}", emptyHeaderStart),
    );
    expect(emptyHeaderBlock).toContain("position: absolute;");
    expect(emptyHeaderBlock).toContain("top: 156px;");
    expect(emptyHeaderBlock).toContain("width: 384px;");
    expect(overrides).toContain("top: 32px;\n  left: 0;\n  width: 384px;");
    expect(overrides).toContain(".source-control-empty__content .ui-button__label {");
    expect(overrides).toMatch(
      /\.source-control-empty__content \.ui-button--xs \{[\s\S]*box-sizing: border-box;/,
    );
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
    expect(settings).toContain("const scanButton = (");
    expect(settings).toContain("<SmallIconButton");
    expect(settings).toContain('icon={<Icon name="refresh-cw"');
    expect(settings).not.toContain('label={discovery.pending ? "Scanning…" : "Rescan"}');
    expect(overrides).toMatch(
      /.source-control-item {[^]*padding-left: 16px;[^]*padding-right: 16px;/,
    );
    expect(overrides).toMatch(
      /.source-control-item__summary {[^}]*color: rgba\(var\(--muted-foreground-rgb\), 0\.8\);[^}]*font-size: 13px;[^}]*line-height: 19px;/,
    );
    expect(overrides).not.toContain(".source-control-item__summary {\n  margin-top: 4px;");
    expect(settings).not.toContain("Scanning server integrations…");
    expect(settings).not.toContain("status={usesDedicatedModel");
    expect(settings).not.toContain('"Uses global model"');
    const rowStart = overrides.indexOf(".source-control-loading-row {");
    const rowBlock = overrides.slice(rowStart, overrides.indexOf("}", rowStart));
    expect(rowBlock).toContain("height: 66px;");
    expect(rowBlock).toContain("--align-self-column: stretch;");
    expect(rowBlock).toContain("width: 100%;");
    expect(overrides).not.toContain(".source-control-loading-row { animation:");
  });
});
