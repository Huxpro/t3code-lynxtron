import { AppearanceSettingsSurface } from "../../../../web/src/components/settings/SettingsSurfaces";
import { SettingResetButton } from "../../../../web/src/components/settings/settingsLayout";
import {
  resolveEnvironmentIdentificationPillLabel,
  useEnvironmentStageLabel,
} from "../../../../web/src/components/SidebarStageBackdrop";
import { SelectBox } from "./SettingsControls";
import { Icon } from "./Icon";
import { useThemePreferenceState } from "../state/prefsStore";
import { LYNX_THEME_LABELS, NEXT_LYNX_THEME } from "../state/themePreference.logic";

const UNAVAILABLE_STATUS = "Not yet available in Lynxtron.";

function UnavailableControl({ width }: { readonly width: number }) {
  return (
    <text className="appearance-unavailable-control" style={{ width: `${width}px` }}>
      {UNAVAILABLE_STATUS}
    </text>
  );
}

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
        themeResetAction={
          themePreference !== "system" ? (
            <SettingResetButton
              label="theme"
              icon={<Icon name="rotate-ccw" size={12} color="#818181" />}
              onClick={() => setThemePreference("system")}
            />
          ) : null
        }
        themeControl={
          <SelectBox
            label={LYNX_THEME_LABELS[themePreference]}
            width={160}
            onTap={() => setThemePreference(NEXT_LYNX_THEME[themePreference])}
          />
        }
        themeStatus={
          themePreference === "system" ? "Follows the operating system appearance." : undefined
        }
        glassOpacityControl={<UnavailableControl width={208} />}
        glassOpacityUnavailable
        environmentIdentificationStatus={UNAVAILABLE_STATUS}
        environmentIdentificationUnavailable
        showEnvironmentIdentification={showEnvironmentIdentification}
        wordWrapControl={<UnavailableControl width={160} />}
        wordWrapUnavailable
      />
    </view>
  );
}
