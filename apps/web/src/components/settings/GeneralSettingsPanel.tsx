import { useCallback } from "react";

import { GeneralSettingsContent } from "./GeneralSettingsContent";
import { GeneralSettingsNotice, GeneralSettingsValueButton } from "./generalSettingsHost";
import {
  getGeneralSettingsSurfaceActions,
  useGeneralSettingsSurface,
} from "./generalSettingsStore";

export function useSettingsRestore(onRestored?: () => void) {
  const { changedSettingLabels } = useGeneralSettingsSurface();
  const restoreDefaults = useCallback(async () => {
    await getGeneralSettingsSurfaceActions().restoreDefaults();
    onRestored?.();
  }, [onRestored]);

  return {
    changedSettingLabels,
    restoreDefaults,
  };
}

export function GeneralSettingsPanel() {
  const surface = useGeneralSettingsSurface();

  return (
    <GeneralSettingsContent
      aboutVersionControl={
        <GeneralSettingsValueButton
          ariaLabel="Check for Updates"
          label="Check for Updates"
          onPress={() => getGeneralSettingsSurfaceActions().checkForUpdates()}
        />
      }
      defaults={surface.defaults}
      diagnosticsControl={
        <GeneralSettingsValueButton
          ariaLabel="View diagnostics"
          label="View diagnostics"
          onPress={() => getGeneralSettingsSurfaceActions().openDiagnostics()}
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
      onThemeChange={(theme) => getGeneralSettingsSurfaceActions().setTheme(theme)}
      onUpdate={(patch) => getGeneralSettingsSurfaceActions().update(patch)}
      serverControlsDisabled={surface.serverControlsDisabled}
      textGenerationModelControl={
        <GeneralSettingsValueButton ariaLabel="Text generation model" label={surface.modelLabel} />
      }
      textGenerationModelDirty={surface.textGenerationModelDirty}
      theme={surface.theme}
      values={surface.values}
      versionLabel={surface.versionLabel}
    />
  );
}
