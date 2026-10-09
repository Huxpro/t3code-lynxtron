import { AppearanceSettingsSurface } from "../../../../web/src/components/settings/SettingsSurfaces";
import { SettingResetButton } from "../../../../web/src/components/settings/settingsLayout";
import {
  resolveEnvironmentIdentificationPillLabel,
  useEnvironmentStageLabel,
} from "../../../../web/src/components/SidebarStageBackdrop";
import { GlassSlider, SelectBox, Toggle } from "./SettingsControls";
import { Icon } from "./Icon";
import { useClientSettingsState, useThemePreferenceState } from "../state/prefsStore";
import { LYNX_THEME_LABELS, NEXT_LYNX_THEME } from "../state/themePreference.logic";
import {
  MAX_GLASS_OPACITY,
  MIN_GLASS_OPACITY,
  PORTABLE_CLIENT_SETTINGS_DEFAULTS,
} from "@t3tools/lynx-logic/settings";

const ENVIRONMENT_IDENTIFICATION_LABELS = {
  artwork: "Artwork",
  pill: "Version pill",
  none: "None",
} as const;
const NEXT_ENVIRONMENT_IDENTIFICATION_MODE = {
  artwork: "pill",
  pill: "none",
  none: "artwork",
} as const;

/** Lynx uses the shared Appearance anatomy with portable persisted controls. */
export function AppearanceSettings() {
  const [themePreference, setThemePreference] = useThemePreferenceState();
  const [clientSettings, updateClientSettings] = useClientSettingsState();
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
        glassOpacityResetAction={
          clientSettings.glassOpacity !== PORTABLE_CLIENT_SETTINGS_DEFAULTS.glassOpacity ? (
            <SettingResetButton
              label="glass opacity"
              icon={<Icon name="rotate-ccw" size={12} color="#818181" />}
              onClick={() =>
                updateClientSettings({
                  glassOpacity: PORTABLE_CLIENT_SETTINGS_DEFAULTS.glassOpacity,
                })
              }
            />
          ) : null
        }
        glassOpacityControl={
          <GlassSlider
            percent={clientSettings.glassOpacity}
            onTap={() =>
              updateClientSettings({
                glassOpacity:
                  clientSettings.glassOpacity >= MAX_GLASS_OPACITY
                    ? MIN_GLASS_OPACITY
                    : clientSettings.glassOpacity + 5,
              })
            }
          />
        }
        environmentIdentificationResetAction={
          clientSettings.environmentIdentificationMode !==
          PORTABLE_CLIENT_SETTINGS_DEFAULTS.environmentIdentificationMode ? (
            <SettingResetButton
              label="environment identification"
              icon={<Icon name="rotate-ccw" size={12} color="#818181" />}
              onClick={() =>
                updateClientSettings({
                  environmentIdentificationMode:
                    PORTABLE_CLIENT_SETTINGS_DEFAULTS.environmentIdentificationMode,
                })
              }
            />
          ) : null
        }
        environmentIdentificationControl={
          <SelectBox
            label={ENVIRONMENT_IDENTIFICATION_LABELS[clientSettings.environmentIdentificationMode]}
            width={160}
            onTap={() =>
              updateClientSettings({
                environmentIdentificationMode:
                  NEXT_ENVIRONMENT_IDENTIFICATION_MODE[
                    clientSettings.environmentIdentificationMode
                  ],
              })
            }
          />
        }
        showEnvironmentIdentification={showEnvironmentIdentification}
        wordWrapResetAction={
          clientSettings.wordWrap !== PORTABLE_CLIENT_SETTINGS_DEFAULTS.wordWrap ? (
            <SettingResetButton
              label="word wrapping"
              icon={<Icon name="rotate-ccw" size={12} color="#818181" />}
              onClick={() =>
                updateClientSettings({ wordWrap: PORTABLE_CLIENT_SETTINGS_DEFAULTS.wordWrap })
              }
            />
          ) : null
        }
        wordWrapControl={
          <Toggle
            ariaLabel="Wrap code, tables, diffs, and file previews by default"
            settingControl="word-wrap"
            value={clientSettings.wordWrap}
            onChange={(wordWrap) => updateClientSettings({ wordWrap })}
          />
        }
      />
    </view>
  );
}
