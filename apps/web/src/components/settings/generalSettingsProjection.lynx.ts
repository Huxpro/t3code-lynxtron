import {
  PORTABLE_CLIENT_SETTINGS_DEFAULTS,
  PORTABLE_SERVER_SETTINGS_DEFAULTS,
  type PortableClientSettings,
  type PortableServerSettings,
} from "@t3tools/lynx-logic/settings";

import type { GeneralSettingsValues } from "./GeneralSettingsContent";

export const GENERAL_SETTINGS_DEFAULT_VALUES: GeneralSettingsValues = {
  addProjectBaseDirectory: PORTABLE_SERVER_SETTINGS_DEFAULTS.addProjectBaseDirectory,
  confirmThreadArchive: PORTABLE_CLIENT_SETTINGS_DEFAULTS.confirmThreadArchive,
  confirmThreadDelete: PORTABLE_CLIENT_SETTINGS_DEFAULTS.confirmThreadDelete,
  defaultThreadEnvMode: PORTABLE_SERVER_SETTINGS_DEFAULTS.defaultThreadEnvMode,
  diffIgnoreWhitespace: PORTABLE_CLIENT_SETTINGS_DEFAULTS.diffIgnoreWhitespace,
  enableLegacyTokenStreaming: PORTABLE_SERVER_SETTINGS_DEFAULTS.enableLegacyTokenStreaming,
  enableProviderUpdateChecks: PORTABLE_SERVER_SETTINGS_DEFAULTS.enableProviderUpdateChecks,
  legacySidebarEnabled: PORTABLE_CLIENT_SETTINGS_DEFAULTS.legacySidebarEnabled,
  newWorktreesStartFromOrigin: PORTABLE_SERVER_SETTINGS_DEFAULTS.newWorktreesStartFromOrigin,
  planModeEnabled: PORTABLE_CLIENT_SETTINGS_DEFAULTS.planModeEnabled,
  sidebarAutoSettleAfterDays: PORTABLE_CLIENT_SETTINGS_DEFAULTS.sidebarAutoSettleAfterDays,
  sidebarProjectGroupingMode: PORTABLE_CLIENT_SETTINGS_DEFAULTS.sidebarProjectGroupingMode,
  timestampFormat: PORTABLE_CLIENT_SETTINGS_DEFAULTS.timestampFormat,
};

type GeneralClientSource = Pick<
  PortableClientSettings,
  | "confirmThreadArchive"
  | "confirmThreadDelete"
  | "diffIgnoreWhitespace"
  | "legacySidebarEnabled"
  | "planModeEnabled"
  | "sidebarAutoSettleAfterDays"
  | "sidebarProjectGroupingMode"
  | "timestampFormat"
>;

type GeneralServerSource = Pick<
  PortableServerSettings,
  | "addProjectBaseDirectory"
  | "defaultThreadEnvMode"
  | "enableLegacyTokenStreaming"
  | "enableProviderUpdateChecks"
  | "newWorktreesStartFromOrigin"
>;

/**
 * Canonical renderer-neutral projection for every value displayed by the
 * shared General Settings composition.
 */
export function projectGeneralSettingsValues(
  client: GeneralClientSource,
  server: GeneralServerSource,
): GeneralSettingsValues {
  return {
    addProjectBaseDirectory: server.addProjectBaseDirectory,
    confirmThreadArchive: client.confirmThreadArchive,
    confirmThreadDelete: client.confirmThreadDelete,
    defaultThreadEnvMode: server.defaultThreadEnvMode,
    diffIgnoreWhitespace: client.diffIgnoreWhitespace,
    enableLegacyTokenStreaming: server.enableLegacyTokenStreaming,
    enableProviderUpdateChecks: server.enableProviderUpdateChecks,
    legacySidebarEnabled: client.legacySidebarEnabled,
    newWorktreesStartFromOrigin: server.newWorktreesStartFromOrigin,
    planModeEnabled: client.planModeEnabled,
    sidebarAutoSettleAfterDays: client.sidebarAutoSettleAfterDays,
    sidebarProjectGroupingMode: client.sidebarProjectGroupingMode,
    timestampFormat: client.timestampFormat,
  };
}
