import { GeneralSettingsValueButton, SettingsRow } from "./generalSettingsHost";

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

export function GeneralSettingsBackgroundActivityContent() {
  return (
    <SettingsRow
      title="Background activity"
      description="Control the shared policy for background Git refreshes and provider health checks."
      status="Advanced background activity controls are not yet available in Lynxtron."
      unavailable
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
