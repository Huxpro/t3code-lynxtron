import { useEffect } from "@lynx-js/react";
import {
  PORTABLE_SERVER_SETTINGS_DEFAULTS,
  projectPortableGeneralSettingsRestore,
  type PortableClientSettingsPatch,
  type PortableServerSettingsPatch,
} from "@t3tools/client-runtime/presentation/settings";

import type { GeneralSettingsPatch } from "../../../../web/src/components/settings/GeneralSettingsContent";
import {
  GENERAL_SETTINGS_DEFAULT_VALUES,
  projectGeneralSettingsValues,
} from "../../../../web/src/components/settings/generalSettingsProjection";
import { formatDiagnosticsDescription } from "../../../../web/src/components/settings/SettingsPanels.logic";
import {
  publishGeneralSettingsSurface,
  type GeneralSettingsSurfaceActions,
  type GeneralSettingsSurfaceSnapshot,
} from "../../../../web/src/components/settings/generalSettingsStore";
import { navigate } from "../router";
import { useClientSettingsState } from "../state/prefsStore";
import { t3ClientActions, useT3ClientState } from "../state/t3Client";

const DEFAULT_DIAGNOSTICS_DESCRIPTION = formatDiagnosticsDescription({
  localTracingEnabled: false,
  otlpTracesEnabled: false,
  otlpMetricsEnabled: false,
});

export function GeneralSettingsSync() {
  const { settings, settingsUpdatePending, settingsError } = useT3ClientState();
  const serverSettings = settings ?? PORTABLE_SERVER_SETTINGS_DEFAULTS;
  const [clientSettings, updateClientSettings] = useClientSettingsState();
  const values = projectGeneralSettingsValues(clientSettings, serverSettings);
  const restoreProjection = projectPortableGeneralSettingsRestore({
    clientSettings,
    serverSettings,
  });

  useEffect(() => {
    const updateServerSettings = (patch: PortableServerSettingsPatch) => {
      void t3ClientActions.updateServerSettings(patch).catch(() => {});
    };
    const update = (patch: GeneralSettingsPatch) => {
      const clientPatch: PortableClientSettingsPatch = {
        ...(patch.autoOpenPlanSidebar === undefined
          ? {}
          : { autoOpenPlanSidebar: patch.autoOpenPlanSidebar }),
        ...(patch.confirmThreadArchive === undefined
          ? {}
          : { confirmThreadArchive: patch.confirmThreadArchive }),
        ...(patch.confirmThreadDelete === undefined
          ? {}
          : { confirmThreadDelete: patch.confirmThreadDelete }),
        ...(patch.diffIgnoreWhitespace === undefined
          ? {}
          : { diffIgnoreWhitespace: patch.diffIgnoreWhitespace }),
        ...(patch.sidebarProjectGroupingMode === undefined
          ? {}
          : { sidebarProjectGroupingMode: patch.sidebarProjectGroupingMode }),
        ...(patch.timestampFormat === undefined ? {} : { timestampFormat: patch.timestampFormat }),
      };
      const serverPatch: PortableServerSettingsPatch = {
        ...(patch.addProjectBaseDirectory === undefined
          ? {}
          : { addProjectBaseDirectory: patch.addProjectBaseDirectory }),
        ...(patch.defaultThreadEnvMode === undefined
          ? {}
          : { defaultThreadEnvMode: patch.defaultThreadEnvMode }),
        ...(patch.enableAssistantStreaming === undefined
          ? {}
          : { enableAssistantStreaming: patch.enableAssistantStreaming }),
        ...(patch.enableProviderUpdateChecks === undefined
          ? {}
          : { enableProviderUpdateChecks: patch.enableProviderUpdateChecks }),
        ...(patch.newWorktreesStartFromOrigin === undefined
          ? {}
          : { newWorktreesStartFromOrigin: patch.newWorktreesStartFromOrigin }),
      };
      if (Object.keys(clientPatch).length > 0) updateClientSettings(clientPatch);
      if (Object.keys(serverPatch).length > 0) updateServerSettings(serverPatch);
    };
    const snapshot: GeneralSettingsSurfaceSnapshot = {
      changedSettingLabels: restoreProjection.changedSettingLabels,
      defaults: GENERAL_SETTINGS_DEFAULT_VALUES,
      diagnosticsDescription: DEFAULT_DIAGNOSTICS_DESCRIPTION,
      modelLabel: settings?.textGenerationModelSelection?.model || "Default",
      serverControlsDisabled: !settings || settingsUpdatePending,
      settingsError,
      textGenerationModelDirty: false,
      values,
      versionLabel: "0.0.28",
    };
    const actions: GeneralSettingsSurfaceActions = {
      openDiagnostics: () => navigate("/settings/diagnostics", { replace: true }),
      resetTextGenerationModel: () => {},
      restoreDefaults: async () => {
        await t3ClientActions.restoreGeneralSettingsDefaults();
      },
      setProjectGrouping: (enabled) =>
        update({
          sidebarProjectGroupingMode: enabled ? "repository" : "separate",
        }),
      update,
    };
    publishGeneralSettingsSurface(snapshot, actions);
  }, [
    clientSettings,
    restoreProjection.changedSettingLabels,
    settings,
    settingsError,
    settingsUpdatePending,
    updateClientSettings,
    values,
  ]);

  return null;
}
