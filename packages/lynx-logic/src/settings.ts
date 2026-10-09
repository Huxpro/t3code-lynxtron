import type {
  BackgroundActivityProfile,
  ClientSettings,
  ServerSettings,
  SidebarProjectGroupingMode,
} from "@t3tools/contracts/settings";
import {
  MAX_GLASS_OPACITY_VALUE,
  MIN_GLASS_OPACITY_VALUE,
  PORTABLE_CLIENT_SETTINGS_DEFAULTS,
  PORTABLE_SERVER_SETTINGS_DEFAULTS,
} from "./settingsDefaults.ts";

export const MIN_GLASS_OPACITY = MIN_GLASS_OPACITY_VALUE;
export const MAX_GLASS_OPACITY = MAX_GLASS_OPACITY_VALUE;
export { PORTABLE_CLIENT_SETTINGS_DEFAULTS, PORTABLE_SERVER_SETTINGS_DEFAULTS };

export type PortableClientSettings = Pick<
  ClientSettings,
  | "confirmThreadArchive"
  | "confirmThreadDelete"
  | "diffIgnoreWhitespace"
  | "environmentIdentificationMode"
  | "favorites"
  | "glassOpacity"
  | "legacySidebarEnabled"
  | "planModeEnabled"
  | "sidebarProjectGroupingMode"
  | "timestampFormat"
  | "wordWrap"
>;

export type PortableClientSettingsPatch = Partial<PortableClientSettings>;

export type PortableServerSettings = Pick<
  ServerSettings,
  | "addProjectBaseDirectory"
  | "backgroundActivity"
  | "defaultThreadEnvMode"
  | "enableProviderUpdateChecks"
  | "newWorktreesStartFromOrigin"
  | "responseStreamingMode"
  | "sidebarAutoSettleAfterDays"
>;

export type PortableServerSettingsPatch = Partial<PortableServerSettings>;

export function backgroundActivityProfileSettings(
  profile: BackgroundActivityProfile,
): Pick<ServerSettings, "backgroundActivity"> {
  return {
    backgroundActivity: { schemaVersion: 1, profile, overrides: {} },
  };
}

type GeneralClientSettingsPatch = Pick<
  PortableClientSettings,
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

export interface PortableGeneralSettingsRestoreProjection {
  readonly changedSettingLabels: ReadonlyArray<string>;
  readonly clientPatch: GeneralClientSettingsPatch;
  readonly serverPatch: PortableServerSettings;
}

/**
 * Reset the General controls rendered by portable clients such as Lynxtron.
 * Legacy sidebar is intentionally excluded because restoring General settings
 * must not silently replace the user's current navigation model.
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
      ...(server.responseStreamingMode !== serverDefaults.responseStreamingMode
        ? ["Stream token by token"]
        : []),
      ...(server.enableProviderUpdateChecks !== serverDefaults.enableProviderUpdateChecks
        ? ["Provider update checks"]
        : []),
      ...(JSON.stringify(server.backgroundActivity) !==
      JSON.stringify(serverDefaults.backgroundActivity)
        ? ["Background activity"]
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
      backgroundActivity: serverDefaults.backgroundActivity,
      defaultThreadEnvMode: serverDefaults.defaultThreadEnvMode,
      enableProviderUpdateChecks: serverDefaults.enableProviderUpdateChecks,
      newWorktreesStartFromOrigin: serverDefaults.newWorktreesStartFromOrigin,
      responseStreamingMode: serverDefaults.responseStreamingMode,
      sidebarAutoSettleAfterDays: server.sidebarAutoSettleAfterDays,
    },
  };
}

export function mergeClientSettings<T extends object>(current: T, patch: Partial<T>): T {
  return {
    ...current,
    ...patch,
  };
}
