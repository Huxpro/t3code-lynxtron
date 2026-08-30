import { useCallback, useEffect, useMemo, useRef } from "react";
import { useAtomValue } from "@effect/atom-react";
import * as Equal from "effect/Equal";

import { projectGeneralSettingsRestore } from "@t3tools/client-runtime/presentation/settings";
import type { BackgroundActivityProfile, SidebarProjectGroupingMode } from "@t3tools/contracts";
import { DEFAULT_UNIFIED_SETTINGS } from "@t3tools/contracts/settings";

import { APP_VERSION } from "../../branding";
import { useTheme } from "../../hooks/useTheme";
import { usePrimarySettings, useUpdatePrimarySettings } from "../../hooks/useSettings";
import { primaryServerObservabilityAtom } from "../../state/server";
import type { GeneralSettingsPatch } from "./GeneralSettingsContent";
import { projectGeneralSettingsValues } from "./generalSettingsProjection";
import {
  publishGeneralSettingsSurface,
  type GeneralSettingsSurfaceActions,
  type GeneralSettingsSurfaceSnapshot,
} from "./generalSettingsStore";
import {
  formatDiagnosticsDescription,
  resolveBackgroundActivityProfileOption,
  hasChangedBackgroundActivitySettings,
  isProjectGroupingEnabled,
  projectGroupingModeFromToggle,
  readLastEnabledProjectGroupingMode,
  rememberEnabledProjectGroupingMode,
} from "./SettingsPanels.logic";

const GENERAL_DEFAULTS = projectGeneralSettingsValues(
  DEFAULT_UNIFIED_SETTINGS,
  DEFAULT_UNIFIED_SETTINGS,
);

export function GeneralSettingsSync() {
  const { theme, setTheme } = useTheme();
  const settings = usePrimarySettings();
  const updateSettings = useUpdatePrimarySettings();
  const observability = useAtomValue(primaryServerObservabilityAtom);
  const lastEnabledProjectGroupingMode = useRef<SidebarProjectGroupingMode>(
    readLastEnabledProjectGroupingMode(),
  );
  const restoreProjection = useMemo(
    () =>
      projectGeneralSettingsRestore({
        theme,
        settings,
        defaults: DEFAULT_UNIFIED_SETTINGS,
        backgroundActivityChanged: hasChangedBackgroundActivitySettings(settings),
        textGenerationModelSelectionChanged: !Equal.equals(
          settings.textGenerationModelSelection ?? null,
          DEFAULT_UNIFIED_SETTINGS.textGenerationModelSelection ?? null,
        ),
      }),
    [settings, theme],
  );
  const update = useCallback(
    (patch: GeneralSettingsPatch) => updateSettings(patch),
    [updateSettings],
  );
  const setProjectGrouping = useCallback(
    (enabled: boolean) => {
      if (!enabled && isProjectGroupingEnabled(settings.sidebarProjectGroupingMode)) {
        lastEnabledProjectGroupingMode.current = settings.sidebarProjectGroupingMode;
        rememberEnabledProjectGroupingMode(settings.sidebarProjectGroupingMode);
      }
      updateSettings({
        sidebarProjectGroupingMode: projectGroupingModeFromToggle(
          enabled,
          lastEnabledProjectGroupingMode.current,
        ),
      });
    },
    [settings.sidebarProjectGroupingMode, updateSettings],
  );
  const restoreDefaults = useCallback(async () => {
    if (restoreProjection.changedSettingLabels.length === 0) return;
    setTheme(restoreProjection.theme);
    updateSettings({
      ...restoreProjection.clientPatch,
      ...restoreProjection.serverPatch,
    });
  }, [restoreProjection, setTheme, updateSettings]);
  const setBackgroundActivityProfile = useCallback(
    (profile: BackgroundActivityProfile) =>
      updateSettings({
        backgroundActivity: { schemaVersion: 1, profile, overrides: {} },
      }),
    [updateSettings],
  );

  useEffect(() => {
    const snapshot: GeneralSettingsSurfaceSnapshot = {
      backgroundActivityProfileOption: resolveBackgroundActivityProfileOption(settings),
      changedSettingLabels: restoreProjection.changedSettingLabels,
      defaults: GENERAL_DEFAULTS,
      diagnosticsDescription: formatDiagnosticsDescription({
        localTracingEnabled: observability?.localTracingEnabled ?? false,
        otlpTracesEnabled: observability?.otlpTracesEnabled ?? false,
        otlpTracesUrl: observability?.otlpTracesUrl,
        otlpMetricsEnabled: observability?.otlpMetricsEnabled ?? false,
        otlpMetricsUrl: observability?.otlpMetricsUrl,
      }),
      modelLabel: settings.textGenerationModelSelection?.model || "Default",
      serverControlsDisabled: false,
      settingsError: null,
      textGenerationModelDirty: !Equal.equals(
        settings.textGenerationModelSelection ?? null,
        DEFAULT_UNIFIED_SETTINGS.textGenerationModelSelection ?? null,
      ),
      values: projectGeneralSettingsValues(settings, settings),
      versionLabel: APP_VERSION,
    };
    const actions: GeneralSettingsSurfaceActions = {
      openDiagnostics: () => {
        window.location.assign("/settings/diagnostics");
      },
      resetTextGenerationModel: () =>
        updateSettings({
          textGenerationModelSelection: DEFAULT_UNIFIED_SETTINGS.textGenerationModelSelection,
        }),
      restoreDefaults,
      setBackgroundActivityProfile,
      setProjectGrouping,
      update,
    };
    publishGeneralSettingsSurface(snapshot, actions);
  }, [
    restoreDefaults,
    restoreProjection.changedSettingLabels,
    observability,
    setProjectGrouping,
    setBackgroundActivityProfile,
    setTheme,
    settings,
    theme,
    update,
    updateSettings,
  ]);

  return null;
}
