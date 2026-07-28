import {
  DEFAULT_CLIENT_SETTINGS,
  DEFAULT_SERVER_SETTINGS,
  DEFAULT_UNIFIED_SETTINGS,
} from "@t3tools/contracts/settings";
import * as Duration from "effect/Duration";
import { describe, expect, it } from "vite-plus/test";

import {
  isProjectGroupingEnabled,
  mergeClientSettings,
  PORTABLE_CLIENT_SETTINGS_DEFAULTS,
  PORTABLE_SERVER_SETTINGS_DEFAULTS,
  projectGeneralSettingsRestore,
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

describe("projectGeneralSettingsRestore", () => {
  it("projects client and server defaults from one unified settings snapshot", () => {
    const projection = projectGeneralSettingsRestore({
      theme: "dark",
      settings: {
        ...DEFAULT_UNIFIED_SETTINGS,
        glassOpacity: 55,
        wordWrap: false,
        enableAssistantStreaming: !DEFAULT_SERVER_SETTINGS.enableAssistantStreaming,
        automaticGitFetchInterval: Duration.seconds(45),
      },
      defaults: DEFAULT_UNIFIED_SETTINGS,
      automaticGitFetchIntervalChanged: true,
      textGenerationModelSelectionChanged: false,
    });

    expect(projection.changedSettingLabels).toEqual([
      "Theme",
      "Glass opacity",
      "Word wrap",
      "Assistant output",
      "Automatic Git fetch interval",
    ]);
    expect(projection.clientPatch.glassOpacity).toBe(DEFAULT_CLIENT_SETTINGS.glassOpacity);
    expect(projection.clientPatch.wordWrap).toBe(DEFAULT_CLIENT_SETTINGS.wordWrap);
    expect(projection.serverPatch.enableAssistantStreaming).toBe(
      DEFAULT_SERVER_SETTINGS.enableAssistantStreaming,
    );
    expect(Duration.toMillis(projection.serverPatch.automaticGitFetchInterval!)).toBe(
      Duration.toMillis(DEFAULT_SERVER_SETTINGS.automaticGitFetchInterval),
    );
    expect(projection.theme).toBe("system");
  });

  it("returns no changed labels for defaults", () => {
    expect(
      projectGeneralSettingsRestore({
        theme: "system",
        settings: DEFAULT_UNIFIED_SETTINGS,
        defaults: DEFAULT_UNIFIED_SETTINGS,
        automaticGitFetchIntervalChanged: false,
        textGenerationModelSelectionChanged: false,
      }).changedSettingLabels,
    ).toEqual([]);
  });
});

describe("projectPortableGeneralSettingsRestore", () => {
  it("uses schema-free defaults that stay aligned with canonical settings", () => {
    expect(PORTABLE_CLIENT_SETTINGS_DEFAULTS).toMatchObject({
      autoOpenPlanSidebar: DEFAULT_CLIENT_SETTINGS.autoOpenPlanSidebar,
      confirmThreadArchive: DEFAULT_CLIENT_SETTINGS.confirmThreadArchive,
      confirmThreadDelete: DEFAULT_CLIENT_SETTINGS.confirmThreadDelete,
      diffIgnoreWhitespace: DEFAULT_CLIENT_SETTINGS.diffIgnoreWhitespace,
      glassOpacity: DEFAULT_CLIENT_SETTINGS.glassOpacity,
      sidebarProjectGroupingMode: DEFAULT_CLIENT_SETTINGS.sidebarProjectGroupingMode,
      sidebarV2Enabled: DEFAULT_CLIENT_SETTINGS.sidebarV2Enabled,
      timestampFormat: DEFAULT_CLIENT_SETTINGS.timestampFormat,
      wordWrap: DEFAULT_CLIENT_SETTINGS.wordWrap,
    });
    expect(PORTABLE_SERVER_SETTINGS_DEFAULTS).toMatchObject({
      addProjectBaseDirectory: DEFAULT_SERVER_SETTINGS.addProjectBaseDirectory,
      defaultThreadEnvMode: DEFAULT_SERVER_SETTINGS.defaultThreadEnvMode,
      enableAssistantStreaming: DEFAULT_SERVER_SETTINGS.enableAssistantStreaming,
      enableProviderUpdateChecks: DEFAULT_SERVER_SETTINGS.enableProviderUpdateChecks,
      newWorktreesStartFromOrigin: DEFAULT_SERVER_SETTINGS.newWorktreesStartFromOrigin,
    });
  });

  it("resets rendered General settings without resetting Sidebar V2", () => {
    const projection = projectPortableGeneralSettingsRestore({
      clientSettings: {
        ...PORTABLE_CLIENT_SETTINGS_DEFAULTS,
        glassOpacity: 55,
        sidebarV2Enabled: true,
        wordWrap: false,
      },
      serverSettings: {
        ...PORTABLE_SERVER_SETTINGS_DEFAULTS,
        addProjectBaseDirectory: "~/Projects",
        enableAssistantStreaming: true,
        newWorktreesStartFromOrigin: false,
      },
    });

    expect(projection.changedSettingLabels).toEqual([
      "Glass opacity",
      "Word wrap",
      "Assistant output",
      "New worktrees start from origin",
      "Add project base directory",
    ]);
    expect(projection.clientPatch).not.toHaveProperty("sidebarV2Enabled");
    expect(projection.clientPatch.glassOpacity).toBe(DEFAULT_CLIENT_SETTINGS.glassOpacity);
    expect(projection.serverPatch.enableAssistantStreaming).toBe(
      DEFAULT_SERVER_SETTINGS.enableAssistantStreaming,
    );
    expect(projection.serverPatch.newWorktreesStartFromOrigin).toBe(
      DEFAULT_SERVER_SETTINGS.newWorktreesStartFromOrigin,
    );
    expect(projection.serverPatch.addProjectBaseDirectory).toBe(
      DEFAULT_SERVER_SETTINGS.addProjectBaseDirectory,
    );
  });
});

describe("mergeClientSettings", () => {
  it("preserves unrelated client settings while applying a patch", () => {
    expect(
      mergeClientSettings(
        {
          ...DEFAULT_CLIENT_SETTINGS,
          sidebarV2Enabled: true,
        },
        { wordWrap: false },
      ),
    ).toMatchObject({
      sidebarV2Enabled: true,
      wordWrap: false,
    });
  });
});
