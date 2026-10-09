import { useEffect } from "@lynx-js/react";
import {
  backgroundActivityProfileSettings,
  PORTABLE_SERVER_SETTINGS_DEFAULTS,
  projectPortableGeneralSettingsRestore,
  type PortableClientSettingsPatch,
  type PortableServerSettingsPatch,
} from "@t3tools/lynx-logic/settings";

import type { GeneralSettingsPatch } from "../../../../web/src/components/settings/GeneralSettingsContent";
import {
  GENERAL_SETTINGS_DEFAULT_VALUES,
  projectGeneralSettingsValues,
} from "../../../../web/src/components/settings/generalSettingsProjection";
import {
  formatDiagnosticsDescription,
  backgroundActivityProfileDescription,
  resolveBackgroundActivityProfileOption,
} from "../../../../web/src/components/settings/SettingsPanels.logic";
import {
  publishGeneralSettingsSurface,
  type GeneralSettingsSurfaceActions,
  type GeneralSettingsSurfaceSnapshot,
} from "../../../../web/src/components/settings/generalSettingsStore";
import { showNativeConfirm } from "../platform/clientCapabilities.lynx";
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
        ...(patch.confirmThreadArchive === undefined
          ? {}
          : { confirmThreadArchive: patch.confirmThreadArchive }),
        ...(patch.confirmThreadDelete === undefined
          ? {}
          : { confirmThreadDelete: patch.confirmThreadDelete }),
        ...(patch.diffIgnoreWhitespace === undefined
          ? {}
          : { diffIgnoreWhitespace: patch.diffIgnoreWhitespace }),
        ...(patch.legacySidebarEnabled === undefined
          ? {}
          : { legacySidebarEnabled: patch.legacySidebarEnabled }),
        ...(patch.planModeEnabled === undefined ? {} : { planModeEnabled: patch.planModeEnabled }),
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
        ...(patch.enableProviderUpdateChecks === undefined
          ? {}
          : { enableProviderUpdateChecks: patch.enableProviderUpdateChecks }),
        ...(patch.newWorktreesStartFromOrigin === undefined
          ? {}
          : { newWorktreesStartFromOrigin: patch.newWorktreesStartFromOrigin }),
        // Threads settle on the server now, so the threshold is a server setting.
        ...(patch.sidebarAutoSettleAfterDays === undefined
          ? {}
          : { sidebarAutoSettleAfterDays: patch.sidebarAutoSettleAfterDays }),
      };
      if (Object.keys(clientPatch).length > 0) updateClientSettings(clientPatch);
      if (Object.keys(serverPatch).length > 0) updateServerSettings(serverPatch);
      if (patch.enableLegacyTokenStreaming === false) {
        updateServerSettings({ responseStreamingMode: "paragraph" });
      } else if (patch.enableLegacyTokenStreaming === true) {
        void showNativeConfirm({
          message: "Turn on token-by-token output?",
          detail:
            "It is significantly slower than the default buffered output and hurts the reading experience. This switch exists only for backwards compatibility.",
        })
          .then((confirmed) => {
            if (confirmed) updateServerSettings({ responseStreamingMode: "token" });
          })
          .catch(() => {});
      }
    };
    const snapshot: GeneralSettingsSurfaceSnapshot = {
      backgroundActivityDescription: settings
        ? backgroundActivityProfileDescription(settings)
        : "Pauses background probes when clients are idle, the host is locked, or low power mode is active.",
      backgroundActivityProfileOption: settings
        ? resolveBackgroundActivityProfileOption(settings)
        : "balanced",
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
      setBackgroundActivityProfile: (profile) =>
        updateServerSettings(backgroundActivityProfileSettings(profile)),
      setTextGenerationModelSelection: (selection) =>
        void t3ClientActions
          .updateServerSettings({ textGenerationModelSelection: selection })
          .catch(() => {}),
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
