import {
  PORTABLE_CLIENT_SETTINGS_DEFAULTS,
  PORTABLE_SERVER_SETTINGS_DEFAULTS,
  type PortableClientSettings,
  type PortableServerSettings,
} from "@t3tools/client-runtime/presentation/settings";

import type { GeneralSettingsValues } from "./GeneralSettingsContent";

export const GENERAL_SETTINGS_DEFAULT_VALUES: GeneralSettingsValues = {
  addProjectBaseDirectory: PORTABLE_SERVER_SETTINGS_DEFAULTS.addProjectBaseDirectory,
  autoOpenPlanSidebar: PORTABLE_CLIENT_SETTINGS_DEFAULTS.autoOpenPlanSidebar,
  confirmThreadArchive: PORTABLE_CLIENT_SETTINGS_DEFAULTS.confirmThreadArchive,
  confirmThreadDelete: PORTABLE_CLIENT_SETTINGS_DEFAULTS.confirmThreadDelete,
  defaultThreadEnvMode: PORTABLE_SERVER_SETTINGS_DEFAULTS.defaultThreadEnvMode,
  diffIgnoreWhitespace: PORTABLE_CLIENT_SETTINGS_DEFAULTS.diffIgnoreWhitespace,
  enableAssistantStreaming: PORTABLE_SERVER_SETTINGS_DEFAULTS.enableAssistantStreaming,
  enableProviderUpdateChecks: PORTABLE_SERVER_SETTINGS_DEFAULTS.enableProviderUpdateChecks,
  glassOpacity: PORTABLE_CLIENT_SETTINGS_DEFAULTS.glassOpacity,
  newWorktreesStartFromOrigin: PORTABLE_SERVER_SETTINGS_DEFAULTS.newWorktreesStartFromOrigin,
  sidebarProjectGroupingMode: PORTABLE_CLIENT_SETTINGS_DEFAULTS.sidebarProjectGroupingMode,
  timestampFormat: PORTABLE_CLIENT_SETTINGS_DEFAULTS.timestampFormat,
  wordWrap: PORTABLE_CLIENT_SETTINGS_DEFAULTS.wordWrap,
};

type GeneralClientSource = Pick<
  PortableClientSettings,
  | "autoOpenPlanSidebar"
  | "confirmThreadArchive"
  | "confirmThreadDelete"
  | "diffIgnoreWhitespace"
  | "glassOpacity"
  | "sidebarProjectGroupingMode"
  | "timestampFormat"
  | "wordWrap"
>;

type GeneralServerSource = Pick<
  PortableServerSettings,
  | "addProjectBaseDirectory"
  | "defaultThreadEnvMode"
  | "enableAssistantStreaming"
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
    autoOpenPlanSidebar: client.autoOpenPlanSidebar,
    confirmThreadArchive: client.confirmThreadArchive,
    confirmThreadDelete: client.confirmThreadDelete,
    defaultThreadEnvMode: server.defaultThreadEnvMode,
    diffIgnoreWhitespace: client.diffIgnoreWhitespace,
    enableAssistantStreaming: server.enableAssistantStreaming,
    enableProviderUpdateChecks: server.enableProviderUpdateChecks,
    glassOpacity: client.glassOpacity,
    newWorktreesStartFromOrigin: server.newWorktreesStartFromOrigin,
    sidebarProjectGroupingMode: client.sidebarProjectGroupingMode,
    timestampFormat: client.timestampFormat,
    wordWrap: client.wordWrap,
  };
}
