import {
  GeneralSettingsSelect,
  GeneralSettingsValueButton,
  SettingsRow,
} from "./generalSettingsHost";
import type { BackgroundActivityProfile } from "@t3tools/contracts";
import type { BackgroundActivityProfileOption } from "./generalSettingsStore";

export const GENERAL_SETTINGS_TEXT_GENERATION_MODEL_STATUS =
  "Text generation model selection is not yet available in Lynxtron.";
export const GENERAL_SETTINGS_TEXT_GENERATION_MODEL_UNAVAILABLE = true;

export function GeneralSettingsAboutContent({ versionLabel }: { readonly versionLabel: string }) {
  return (
    <SettingsRow
      title={`Version ${versionLabel}`}
      description="Current version of the application."
      status="Automatic updates and update-track selection are not yet available in Lynxtron."
    />
  );
}

const BACKGROUND_ACTIVITY_OPTIONS = [
  { value: "balanced", label: "Balanced" },
  { value: "performance", label: "Performance" },
  { value: "battery-saver", label: "Battery saver" },
] as const;

export function GeneralSettingsBackgroundActivityContent({
  onProfileChange,
  profile,
}: {
  readonly onProfileChange: (profile: BackgroundActivityProfile) => void;
  readonly profile: BackgroundActivityProfileOption;
}) {
  const options =
    profile === "advanced"
      ? ([{ value: "advanced", label: "Advanced" }, ...BACKGROUND_ACTIVITY_OPTIONS] as const)
      : BACKGROUND_ACTIVITY_OPTIONS;
  return (
    <SettingsRow
      id="background-activity"
      title="Background activity"
      description="Control the shared policy for background Git refreshes and provider health checks."
      status={
        profile === "advanced"
          ? "Advanced interval controls remain available in Electron."
          : undefined
      }
      control={
        <GeneralSettingsSelect
          ariaLabel="Background activity profile"
          options={options}
          value={profile}
          onValueChange={(value) => {
            if (value !== "advanced") onProfileChange(value);
          }}
        />
      }
    />
  );
}

export function GeneralSettingsDiagnosticsControl({ onOpen }: { onOpen: () => void }) {
  return (
    <GeneralSettingsValueButton
      ariaLabel="View diagnostics"
      label="View diagnostics"
      onPress={onOpen}
    />
  );
}

export function GeneralSettingsTextGenerationModelControl({ label }: { label: string }) {
  return (
    <GeneralSettingsValueButton
      ariaLabel="Text generation model selection unavailable"
      disabled
      label={label}
    />
  );
}
