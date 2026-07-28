import { SettingsNavigationContent, type SettingsSectionPath } from "./SettingsNavigationContent";

export { SETTINGS_NAV_ITEMS, type SettingsSectionPath } from "./SettingsNavigationContent";

export function SettingsSidebarNav({
  onBack,
  onNavigate,
  pathname,
}: {
  readonly onBack: () => void;
  readonly onNavigate: (to: SettingsSectionPath) => void;
  readonly pathname: string;
}) {
  return <SettingsNavigationContent pathname={pathname} onBack={onBack} onNavigate={onNavigate} />;
}
