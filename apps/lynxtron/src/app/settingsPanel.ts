import type { SettingsSectionPath } from "../../../web/src/components/settings/SettingsNavigationContent.logic";

export type LynxSettingsPanelId =
  | "archive"
  | "appearance"
  | "connections"
  | "general"
  | "keybindings"
  | "providers"
  | "source-control";

const PANEL_BY_PATH: Partial<Record<SettingsSectionPath, LynxSettingsPanelId>> = {
  "/settings/archived": "archive",
  "/settings/appearance": "appearance",
  "/settings/connections": "connections",
  "/settings/general": "general",
  "/settings/keybindings": "keybindings",
  "/settings/providers": "providers",
  "/settings/source-control": "source-control",
};

export function resolveLynxSettingsPanel(pathname: string): LynxSettingsPanelId {
  return PANEL_BY_PATH[pathname as SettingsSectionPath] ?? "general";
}
