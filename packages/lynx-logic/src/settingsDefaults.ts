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
  confirmThreadArchive: false,
  confirmThreadDelete: true,
  diffIgnoreWhitespace: true,
  environmentIdentificationMode: "artwork",
  favorites: [],
  glassOpacity: 80,
  legacySidebarEnabled: false,
  planModeEnabled: false,
  sidebarProjectGroupingMode: "repository",
  timestampFormat: "locale",
  wordWrap: true,
} as const;

export const PORTABLE_SERVER_SETTINGS_DEFAULTS = {
  addProjectBaseDirectory: "",
  backgroundActivity: { schemaVersion: 1, profile: "balanced", overrides: {} },
  defaultThreadEnvMode: "local",
  enableProviderUpdateChecks: true,
  newWorktreesStartFromOrigin: true,
  responseStreamingMode: "paragraph",
  sidebarAutoSettleAfterDays: 3,
} as const;
