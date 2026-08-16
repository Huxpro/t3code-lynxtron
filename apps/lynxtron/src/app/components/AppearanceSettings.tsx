import { AppearanceSettingsSurface } from "../../../../web/src/components/settings/SettingsSurfaces";
import {
  resolveEnvironmentIdentificationPillLabel,
  useEnvironmentStageLabel,
} from "../../../../web/src/components/SidebarStageBackdrop";
import { SelectBox } from "./SettingsControls";
import { useThemePreferenceState } from "../state/prefsStore";
import { LYNX_THEME_LABELS, NEXT_LYNX_THEME } from "../state/themePreference.logic";

const UNAVAILABLE_STATUS = "Not yet available in Lynxtron.";

/**
 * Lynx keeps the complete Appearance information architecture visible without
 * presenting storage-only toggles as working product behavior. PF7 owns the
 * theme/input capability work; this panel can receive real controls when that
 * boundary is certified.
 */
export function AppearanceSettings() {
  const [themePreference, setThemePreference] = useThemePreferenceState();
  const showEnvironmentIdentification =
    resolveEnvironmentIdentificationPillLabel(useEnvironmentStageLabel()) !== null;

  return (
    <view className="settings-panel">
      <AppearanceSettingsSurface
        themeControl={
          <SelectBox
            label={LYNX_THEME_LABELS[themePreference]}
            width={144}
            onTap={() => setThemePreference(NEXT_LYNX_THEME[themePreference])}
          />
        }
        themeStatus={
          themePreference === "system" ? "Follows the operating system appearance." : undefined
        }
        glassOpacityStatus={UNAVAILABLE_STATUS}
        glassOpacityUnavailable
        environmentIdentificationStatus={UNAVAILABLE_STATUS}
        environmentIdentificationUnavailable
        showEnvironmentIdentification={showEnvironmentIdentification}
        wordWrapStatus={UNAVAILABLE_STATUS}
        wordWrapUnavailable
      />
    </view>
  );
}
