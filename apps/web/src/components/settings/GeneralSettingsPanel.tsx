import { GeneralSettingsContent } from "./GeneralSettingsContent";
import { GeneralSettingsNotice } from "./generalSettingsHost";
import {
  GeneralSettingsAboutContent,
  GeneralSettingsBackgroundActivityContent,
  GeneralSettingsDiagnosticsControl,
  GeneralSettingsTextGenerationModelControl,
  GENERAL_SETTINGS_TEXT_GENERATION_MODEL_STATUS,
  GENERAL_SETTINGS_TEXT_GENERATION_MODEL_UNAVAILABLE,
} from "./generalSettingsPanelHost";
import {
  getGeneralSettingsSurfaceActions,
  useGeneralSettingsSurface,
} from "./generalSettingsStore";

export function GeneralSettingsPanel() {
  const surface = useGeneralSettingsSurface();

  return (
    <GeneralSettingsContent
      aboutContent={<GeneralSettingsAboutContent versionLabel={surface.versionLabel} />}
      backgroundActivityContent={
        <GeneralSettingsBackgroundActivityContent
          profile={surface.backgroundActivityProfileOption}
          onProfileChange={(profile) =>
            getGeneralSettingsSurfaceActions().setBackgroundActivityProfile(profile)
          }
        />
      }
      defaults={surface.defaults}
      diagnosticsControl={
        <GeneralSettingsDiagnosticsControl
          onOpen={() => getGeneralSettingsSurfaceActions().openDiagnostics()}
        />
      }
      diagnosticsDescription={surface.diagnosticsDescription}
      errorContent={
        surface.settingsError ? <GeneralSettingsNotice message={surface.settingsError} /> : null
      }
      onProjectGroupingChange={(enabled) =>
        getGeneralSettingsSurfaceActions().setProjectGrouping(enabled)
      }
      onResetTextGenerationModel={() =>
        getGeneralSettingsSurfaceActions().resetTextGenerationModel()
      }
      onUpdate={(patch) => getGeneralSettingsSurfaceActions().update(patch)}
      serverControlsDisabled={surface.serverControlsDisabled}
      textGenerationModelControl={
        <GeneralSettingsTextGenerationModelControl label={surface.modelLabel} />
      }
      textGenerationModelDirty={surface.textGenerationModelDirty}
      textGenerationModelStatus={GENERAL_SETTINGS_TEXT_GENERATION_MODEL_STATUS}
      textGenerationModelUnavailable={GENERAL_SETTINGS_TEXT_GENERATION_MODEL_UNAVAILABLE}
      values={surface.values}
      versionLabel={surface.versionLabel}
    />
  );
}
