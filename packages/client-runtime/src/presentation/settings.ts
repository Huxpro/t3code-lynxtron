import type {
  ClientSettings,
  ClientSettingsPatch,
  ServerSettings,
  SidebarProjectGroupingMode,
  UnifiedSettings,
} from "@t3tools/contracts/settings";
import {
  MAX_GLASS_OPACITY_VALUE,
  MIN_GLASS_OPACITY_VALUE,
  PORTABLE_CLIENT_SETTINGS_DEFAULTS,
  PORTABLE_SERVER_SETTINGS_DEFAULTS,
} from "@t3tools/contracts/settings-defaults";

export const MIN_GLASS_OPACITY = MIN_GLASS_OPACITY_VALUE;
export const MAX_GLASS_OPACITY = MAX_GLASS_OPACITY_VALUE;
export { PORTABLE_CLIENT_SETTINGS_DEFAULTS, PORTABLE_SERVER_SETTINGS_DEFAULTS };

export type PortableClientSettings = Pick<
  ClientSettings,
  | "autoOpenPlanSidebar"
  | "confirmThreadArchive"
  | "confirmThreadDelete"
  | "diffIgnoreWhitespace"
  | "environmentIdentificationMode"
  | "glassOpacity"
  | "sidebarProjectGroupingMode"
  | "sidebarV2Enabled"
  | "timestampFormat"
  | "wordWrap"
>;

export type PortableClientSettingsPatch = Partial<PortableClientSettings>;

export type PortableServerSettings = Pick<
  ServerSettings,
  | "addProjectBaseDirectory"
  | "defaultThreadEnvMode"
  | "enableAssistantStreaming"
  | "enableProviderUpdateChecks"
  | "newWorktreesStartFromOrigin"
>;

export type PortableServerSettingsPatch = Partial<PortableServerSettings>;

type GeneralClientSettingsPatch = Pick<
  PortableClientSettings,
  | "autoOpenPlanSidebar"
  | "confirmThreadArchive"
  | "confirmThreadDelete"
  | "diffIgnoreWhitespace"
  | "environmentIdentificationMode"
  | "glassOpacity"
  | "sidebarProjectGroupingMode"
  | "timestampFormat"
  | "wordWrap"
>;

export function isProjectGroupingEnabled(mode: SidebarProjectGroupingMode): boolean {
  return mode !== "separate";
}

export function projectGroupingModeFromToggle(
  enabled: boolean,
  lastEnabledMode: SidebarProjectGroupingMode = "repository",
): SidebarProjectGroupingMode {
  if (!enabled) return "separate";
  return lastEnabledMode === "repository_path" ? "repository_path" : "repository";
}

export interface GeneralSettingsRestoreProjection {
  readonly changedSettingLabels: ReadonlyArray<string>;
  readonly clientPatch: ClientSettingsPatch;
  readonly serverPatch: Pick<
    ServerSettings,
    | "enableAssistantStreaming"
    | "enableProviderUpdateChecks"
    | "backgroundActivity"
    | "backgroundActivityProfile"
    | "automaticGitFetchInterval"
    | "providerHealthRefreshInterval"
    | "defaultThreadEnvMode"
    | "newWorktreesStartFromOrigin"
    | "addProjectBaseDirectory"
    | "textGenerationModelSelection"
  >;
  readonly theme: "system";
}

/**
 * Project the complete Web General Settings reset without importing schema
 * defaults or Effect equality helpers into this cross-renderer module.
 *
 * The caller owns runtime-specific equality for Effect Duration and model
 * selections and supplies the canonical defaults it already has loaded.
 */
export function projectGeneralSettingsRestore(input: {
  readonly theme: "system" | "light" | "dark";
  readonly settings: UnifiedSettings;
  readonly defaults: UnifiedSettings;
  readonly backgroundActivityChanged: boolean;
  readonly textGenerationModelSelectionChanged: boolean;
}): GeneralSettingsRestoreProjection {
  const { defaults, settings } = input;

  return {
    changedSettingLabels: [
      ...(input.theme !== "system" ? ["Theme"] : []),
      ...(settings.glassOpacity !== defaults.glassOpacity ? ["Glass opacity"] : []),
      ...(settings.environmentIdentificationMode !== defaults.environmentIdentificationMode
        ? ["Environment identification"]
        : []),
      ...(settings.timestampFormat !== defaults.timestampFormat ? ["Time format"] : []),
      ...(settings.sidebarThreadPreviewCount !== defaults.sidebarThreadPreviewCount
        ? ["Visible threads"]
        : []),
      ...(settings.sidebarProjectGroupingMode !== defaults.sidebarProjectGroupingMode
        ? ["Project Grouping"]
        : []),
      ...(settings.wordWrap !== defaults.wordWrap ? ["Word wrap"] : []),
      ...(settings.diffIgnoreWhitespace !== defaults.diffIgnoreWhitespace
        ? ["Diff whitespace changes"]
        : []),
      ...(settings.autoOpenPlanSidebar !== defaults.autoOpenPlanSidebar
        ? ["Auto-open task panel"]
        : []),
      ...(settings.enableAssistantStreaming !== defaults.enableAssistantStreaming
        ? ["Assistant output"]
        : []),
      ...(settings.enableProviderUpdateChecks !== defaults.enableProviderUpdateChecks
        ? ["Provider update checks"]
        : []),
      ...(input.backgroundActivityChanged ? ["Background activity"] : []),
      ...(settings.defaultThreadEnvMode !== defaults.defaultThreadEnvMode
        ? ["New thread mode"]
        : []),
      ...(settings.newWorktreesStartFromOrigin !== defaults.newWorktreesStartFromOrigin
        ? ["New worktrees start from origin"]
        : []),
      ...(settings.addProjectBaseDirectory !== defaults.addProjectBaseDirectory
        ? ["Add project base directory"]
        : []),
      ...(settings.confirmThreadArchive !== defaults.confirmThreadArchive
        ? ["Archive confirmation"]
        : []),
      ...(settings.confirmThreadDelete !== defaults.confirmThreadDelete
        ? ["Delete confirmation"]
        : []),
      ...(input.textGenerationModelSelectionChanged ? ["Text generation model"] : []),
    ],
    clientPatch: {
      timestampFormat: defaults.timestampFormat,
      wordWrap: defaults.wordWrap,
      diffIgnoreWhitespace: defaults.diffIgnoreWhitespace,
      environmentIdentificationMode: defaults.environmentIdentificationMode,
      glassOpacity: defaults.glassOpacity,
      sidebarThreadPreviewCount: defaults.sidebarThreadPreviewCount,
      sidebarProjectGroupingMode: defaults.sidebarProjectGroupingMode,
      autoOpenPlanSidebar: defaults.autoOpenPlanSidebar,
      confirmThreadArchive: defaults.confirmThreadArchive,
      confirmThreadDelete: defaults.confirmThreadDelete,
    },
    serverPatch: {
      enableAssistantStreaming: defaults.enableAssistantStreaming,
      enableProviderUpdateChecks: defaults.enableProviderUpdateChecks,
      backgroundActivity: defaults.backgroundActivity,
      backgroundActivityProfile: defaults.backgroundActivityProfile,
      automaticGitFetchInterval: defaults.automaticGitFetchInterval,
      providerHealthRefreshInterval: defaults.providerHealthRefreshInterval,
      defaultThreadEnvMode: defaults.defaultThreadEnvMode,
      newWorktreesStartFromOrigin: defaults.newWorktreesStartFromOrigin,
      addProjectBaseDirectory: defaults.addProjectBaseDirectory,
      textGenerationModelSelection: defaults.textGenerationModelSelection,
    },
    theme: "system",
  };
}

export interface PortableGeneralSettingsRestoreProjection {
  readonly changedSettingLabels: ReadonlyArray<string>;
  readonly clientPatch: GeneralClientSettingsPatch;
  readonly serverPatch: PortableServerSettings;
}

/**
 * Reset the General controls rendered by portable clients such as Lynxtron.
 * Sidebar V2 is intentionally excluded because it lives in Beta settings.
 */
export function projectPortableGeneralSettingsRestore(input: {
  readonly clientSettings: PortableClientSettings;
  readonly serverSettings: PortableServerSettings;
}): PortableGeneralSettingsRestoreProjection {
  const client = input.clientSettings;
  const server = input.serverSettings;
  const clientDefaults = PORTABLE_CLIENT_SETTINGS_DEFAULTS;
  const serverDefaults = PORTABLE_SERVER_SETTINGS_DEFAULTS;

  return {
    changedSettingLabels: [
      ...(client.glassOpacity !== clientDefaults.glassOpacity ? ["Glass opacity"] : []),
      ...(client.environmentIdentificationMode !== clientDefaults.environmentIdentificationMode
        ? ["Environment identification"]
        : []),
      ...(client.timestampFormat !== clientDefaults.timestampFormat ? ["Time format"] : []),
      ...(client.sidebarProjectGroupingMode !== clientDefaults.sidebarProjectGroupingMode
        ? ["Project Grouping"]
        : []),
      ...(client.wordWrap !== clientDefaults.wordWrap ? ["Word wrap"] : []),
      ...(client.diffIgnoreWhitespace !== clientDefaults.diffIgnoreWhitespace
        ? ["Diff whitespace changes"]
        : []),
      ...(client.autoOpenPlanSidebar !== clientDefaults.autoOpenPlanSidebar
        ? ["Auto-open task panel"]
        : []),
      ...(server.enableAssistantStreaming !== serverDefaults.enableAssistantStreaming
        ? ["Assistant output"]
        : []),
      ...(server.enableProviderUpdateChecks !== serverDefaults.enableProviderUpdateChecks
        ? ["Provider update checks"]
        : []),
      ...(server.defaultThreadEnvMode !== serverDefaults.defaultThreadEnvMode
        ? ["New thread mode"]
        : []),
      ...(server.newWorktreesStartFromOrigin !== serverDefaults.newWorktreesStartFromOrigin
        ? ["New worktrees start from origin"]
        : []),
      ...(server.addProjectBaseDirectory !== serverDefaults.addProjectBaseDirectory
        ? ["Add project base directory"]
        : []),
      ...(client.confirmThreadArchive !== clientDefaults.confirmThreadArchive
        ? ["Archive confirmation"]
        : []),
      ...(client.confirmThreadDelete !== clientDefaults.confirmThreadDelete
        ? ["Delete confirmation"]
        : []),
    ],
    clientPatch: {
      autoOpenPlanSidebar: clientDefaults.autoOpenPlanSidebar,
      confirmThreadArchive: clientDefaults.confirmThreadArchive,
      confirmThreadDelete: clientDefaults.confirmThreadDelete,
      diffIgnoreWhitespace: clientDefaults.diffIgnoreWhitespace,
      environmentIdentificationMode: clientDefaults.environmentIdentificationMode,
      glassOpacity: clientDefaults.glassOpacity,
      sidebarProjectGroupingMode: clientDefaults.sidebarProjectGroupingMode,
      timestampFormat: clientDefaults.timestampFormat,
      wordWrap: clientDefaults.wordWrap,
    },
    serverPatch: {
      addProjectBaseDirectory: serverDefaults.addProjectBaseDirectory,
      defaultThreadEnvMode: serverDefaults.defaultThreadEnvMode,
      enableAssistantStreaming: serverDefaults.enableAssistantStreaming,
      enableProviderUpdateChecks: serverDefaults.enableProviderUpdateChecks,
      newWorktreesStartFromOrigin: serverDefaults.newWorktreesStartFromOrigin,
    },
  };
}

export function mergeClientSettings<T extends object>(current: T, patch: Partial<T>): T {
  return {
    ...current,
    ...patch,
  };
}
