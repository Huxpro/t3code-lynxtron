export type SettingsSectionPath =
  | "/settings/general"
  | "/settings/appearance"
  | "/settings/keybindings"
  | "/settings/providers"
  | "/settings/source-control"
  | "/settings/connections"
  | "/settings/beta"
  | "/settings/archived";

export interface SettingsNavigationItem {
  readonly icon:
    | "archive"
    | "bot"
    | "flask-conical"
    | "git-branch"
    | "keyboard"
    | "link-2"
    | "palette"
    | "settings-2";
  readonly label: string;
  readonly to: SettingsSectionPath;
}

export const SETTINGS_NAV_ITEMS: ReadonlyArray<SettingsNavigationItem> = [
  { label: "General", to: "/settings/general", icon: "settings-2" },
  { label: "Appearance", to: "/settings/appearance", icon: "palette" },
  { label: "Keybindings", to: "/settings/keybindings", icon: "keyboard" },
  { label: "Providers", to: "/settings/providers", icon: "bot" },
  { label: "Source Control", to: "/settings/source-control", icon: "git-branch" },
  { label: "Connections", to: "/settings/connections", icon: "link-2" },
  { label: "Beta", to: "/settings/beta", icon: "flask-conical" },
  { label: "Archive", to: "/settings/archived", icon: "archive" },
];
