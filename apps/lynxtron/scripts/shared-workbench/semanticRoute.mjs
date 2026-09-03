const existingThreadStateIds = new Set([
  "chat-thread-narrow",
  "chat-input-narrow-expanded",
  "chat-outline",
  "sidebar-resize",
  "sidebar-inline-search",
  "sidebar-thread-hover-preview",
  "sidebar-thread-shortcuts",
  "sidebar-v2-new-thread-hover",
  "sidebar-v2-new-project-hover",
  "file-picker-default",
  "files-browser",
  "settled-banner-inline-files-narrow",
  "file-editor-detail",
  "file-editor-detail-narrow-inline",
  "file-editor-open-in-menu",
  "file-editor-editing-save",
  "git-publish-dialog",
  "project-action-dialog",
  "sidebar-project-settings",
  "composer-docked",
  "composer-plan-mode",
  "composer-working",
  "composer-connecting",
  "composer-disabled",
  "composer-compact-controls-open",
  "composer-compact-controls-inline-files-narrow",
  "composer-compact-controls-inline-files-short",
  "right-panel-add-menu",
  "right-panel-terminal",
  "right-panel-terminal-multi-session",
  "right-panel-terminal-horizontal-split",
  "right-panel-terminal-vertical-split",
  "diff-scope-menu",
  "workspace-menu-open",
  "review-checkpoint",
  "review-tree",
  "review-diff",
  "review-empty",
  "quick-switch-default",
  "quick-switch-query",
  "quick-switch-query-light",
  "quick-switch-actions-only",
  "quick-switch-empty",
]);

const settingsRouteByStateId = new Map([
  ["settings-model-picker", "settings-general"],
  ["settings-model-picker-mutation", "settings-general"],
  ["settings-background-activity-mutation", "settings-general"],
  ["settings-providers-add-dialog", "settings-providers"],
  ["settings-providers-add-dialog-light", "settings-providers"],
  ["settings-connections-mutation", "settings-connections"],
  ["settings-connections-mutation-browser", "settings-connections"],
  ["settings-beta-mutation", "settings-beta"],
  ["settings-archive-mutation", "settings-archive"],
]);
const directSettingsRoutes = new Set([
  "settings-source-control",
  "settings-source-control-loading",
  "settings-source-control-error",
  "settings-keybindings",
  "settings-connections",
  "settings-appearance",
  "settings-providers",
  "settings-archive",
  "settings-general",
  "settings-beta",
]);

export function inferSemanticRoute(stateId) {
  const settingsRoute =
    settingsRouteByStateId.get(stateId) ??
    (stateId.endsWith("-light") ? stateId.slice(0, -"-light".length) : stateId);
  if (directSettingsRoutes.has(settingsRoute)) return settingsRoute;
  if (stateId.startsWith("settings-")) return null;
  if (stateId === "project-scope-open") return stateId;
  if (stateId.startsWith("existing-thread-") || existingThreadStateIds.has(stateId)) {
    return "existing-thread";
  }
  return "new-thread";
}
