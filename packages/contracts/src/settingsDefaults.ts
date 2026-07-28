/**
 * Schema-free defaults shared by client renderers.
 *
 * Keep this module limited to JSON-compatible values so a renderer can import
 * canonical defaults without pulling the Effect schemas from `settings.ts`
 * into its bundle.
 */
export const MIN_GLASS_OPACITY_VALUE = 40;
export const MAX_GLASS_OPACITY_VALUE = 100;

export const PORTABLE_CLIENT_SETTINGS_DEFAULTS = {
  autoOpenPlanSidebar: false,
  confirmThreadArchive: false,
  confirmThreadDelete: true,
  diffIgnoreWhitespace: true,
  glassOpacity: 80,
  sidebarProjectGroupingMode: "repository",
  sidebarV2Enabled: false,
  timestampFormat: "locale",
  wordWrap: true,
} as const;

export const PORTABLE_SERVER_SETTINGS_DEFAULTS = {
  addProjectBaseDirectory: "",
  defaultThreadEnvMode: "local",
  enableAssistantStreaming: false,
  enableProviderUpdateChecks: true,
  newWorktreesStartFromOrigin: true,
} as const;
