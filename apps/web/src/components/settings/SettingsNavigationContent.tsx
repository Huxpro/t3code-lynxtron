import { SettingsNavigationHost } from "./settingsNavigationHost";
import { SETTINGS_NAV_ITEMS, type SettingsSectionPath } from "./SettingsNavigationContent.logic";

export {
  SETTINGS_NAV_ITEMS,
  type SettingsNavigationItem,
  type SettingsSectionPath,
} from "./SettingsNavigationContent.logic";

export function SettingsNavigationContent({
  onBack,
  onNavigate,
  pathname,
}: {
  readonly onBack: () => void;
  readonly onNavigate: (to: SettingsSectionPath) => void;
  readonly pathname: string;
}) {
  return (
    <SettingsNavigationHost
      items={SETTINGS_NAV_ITEMS}
      onBack={onBack}
      onNavigate={onNavigate}
      pathname={pathname}
    />
  );
}
