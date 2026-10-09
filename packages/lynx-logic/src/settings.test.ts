import { DEFAULT_CLIENT_SETTINGS, DEFAULT_SERVER_SETTINGS } from "@t3tools/contracts/settings";
import { describe, expect, it } from "vite-plus/test";

import {
  backgroundActivityProfileSettings,
  isProjectGroupingEnabled,
  mergeClientSettings,
  PORTABLE_CLIENT_SETTINGS_DEFAULTS,
  PORTABLE_SERVER_SETTINGS_DEFAULTS,
  projectGroupingModeFromToggle,
  projectPortableGeneralSettingsRestore,
} from "./settings.ts";

describe("project grouping toggle", () => {
  it("preserves the last enabled grouping mode", () => {
    expect(isProjectGroupingEnabled("repository")).toBe(true);
    expect(isProjectGroupingEnabled("repository_path")).toBe(true);
    expect(isProjectGroupingEnabled("separate")).toBe(false);
    expect(projectGroupingModeFromToggle(false, "repository_path")).toBe("separate");
    expect(projectGroupingModeFromToggle(true, "repository_path")).toBe("repository_path");
  });
});

describe("background activity profile settings", () => {
  it("projects a preset into the canonical server patch", () => {
    expect(backgroundActivityProfileSettings("performance")).toEqual({
      backgroundActivity: { schemaVersion: 1, profile: "performance", overrides: {} },
    });
    expect(backgroundActivityProfileSettings("battery-saver")).toEqual({
      backgroundActivity: { schemaVersion: 1, profile: "battery-saver", overrides: {} },
    });
  });
});

describe("projectPortableGeneralSettingsRestore", () => {
  it("uses schema-free defaults that stay aligned with canonical settings", () => {
    expect(PORTABLE_CLIENT_SETTINGS_DEFAULTS).toMatchObject({
      confirmThreadArchive: DEFAULT_CLIENT_SETTINGS.confirmThreadArchive,
      confirmThreadDelete: DEFAULT_CLIENT_SETTINGS.confirmThreadDelete,
      diffIgnoreWhitespace: DEFAULT_CLIENT_SETTINGS.diffIgnoreWhitespace,
      environmentIdentificationMode: DEFAULT_CLIENT_SETTINGS.environmentIdentificationMode,
      favorites: DEFAULT_CLIENT_SETTINGS.favorites,
      glassOpacity: DEFAULT_CLIENT_SETTINGS.glassOpacity,
      legacySidebarEnabled: DEFAULT_CLIENT_SETTINGS.legacySidebarEnabled,
      sidebarAutoSettleAfterDays: DEFAULT_CLIENT_SETTINGS.sidebarAutoSettleAfterDays,
      sidebarProjectGroupingMode: DEFAULT_CLIENT_SETTINGS.sidebarProjectGroupingMode,
      timestampFormat: DEFAULT_CLIENT_SETTINGS.timestampFormat,
      wordWrap: DEFAULT_CLIENT_SETTINGS.wordWrap,
    });
    expect(PORTABLE_SERVER_SETTINGS_DEFAULTS).toMatchObject({
      addProjectBaseDirectory: DEFAULT_SERVER_SETTINGS.addProjectBaseDirectory,
      backgroundActivity: DEFAULT_SERVER_SETTINGS.backgroundActivity,
      defaultThreadEnvMode: DEFAULT_SERVER_SETTINGS.defaultThreadEnvMode,
      enableLegacyTokenStreaming: DEFAULT_SERVER_SETTINGS.enableLegacyTokenStreaming,
      enableProviderUpdateChecks: DEFAULT_SERVER_SETTINGS.enableProviderUpdateChecks,
      newWorktreesStartFromOrigin: DEFAULT_SERVER_SETTINGS.newWorktreesStartFromOrigin,
    });
  });

  it("resets rendered General settings without resetting the legacy sidebar choice", () => {
    const projection = projectPortableGeneralSettingsRestore({
      clientSettings: {
        ...PORTABLE_CLIENT_SETTINGS_DEFAULTS,
        environmentIdentificationMode: "pill",
        glassOpacity: 55,
        legacySidebarEnabled: true,
        wordWrap: false,
      },
      serverSettings: {
        ...PORTABLE_SERVER_SETTINGS_DEFAULTS,
        addProjectBaseDirectory: "~/Projects",
        backgroundActivity: {
          schemaVersion: 1,
          profile: "performance",
          overrides: {},
        },
        enableLegacyTokenStreaming: true,
        newWorktreesStartFromOrigin: false,
      },
    });

    expect(projection.changedSettingLabels).toEqual([
      "Glass opacity",
      "Environment identification",
      "Word wrap",
      "Stream token by token",
      "Background activity",
      "New worktrees start from origin",
      "Add project base directory",
    ]);
    expect(projection.clientPatch).not.toHaveProperty("legacySidebarEnabled");
    expect(projection.clientPatch.glassOpacity).toBe(DEFAULT_CLIENT_SETTINGS.glassOpacity);
    expect(projection.clientPatch.environmentIdentificationMode).toBe(
      DEFAULT_CLIENT_SETTINGS.environmentIdentificationMode,
    );
    expect(projection.serverPatch.enableLegacyTokenStreaming).toBe(
      DEFAULT_SERVER_SETTINGS.enableLegacyTokenStreaming,
    );
    expect(projection.serverPatch.newWorktreesStartFromOrigin).toBe(
      DEFAULT_SERVER_SETTINGS.newWorktreesStartFromOrigin,
    );
    expect(projection.serverPatch.addProjectBaseDirectory).toBe(
      DEFAULT_SERVER_SETTINGS.addProjectBaseDirectory,
    );
    expect(projection.serverPatch.backgroundActivity).toEqual(
      DEFAULT_SERVER_SETTINGS.backgroundActivity,
    );
  });
});

describe("mergeClientSettings", () => {
  it("preserves unrelated client settings while applying a patch", () => {
    expect(
      mergeClientSettings(
        {
          ...DEFAULT_CLIENT_SETTINGS,
          legacySidebarEnabled: true,
        },
        { wordWrap: false },
      ),
    ).toMatchObject({
      legacySidebarEnabled: true,
      wordWrap: false,
    });
  });
});
