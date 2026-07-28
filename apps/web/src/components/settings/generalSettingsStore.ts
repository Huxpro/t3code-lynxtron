import { useSyncExternalStore } from "react";

import type {
  GeneralSettingsPatch,
  GeneralSettingsValues,
  GeneralThemePreference,
} from "./GeneralSettingsContent";
import { GENERAL_SETTINGS_DEFAULT_VALUES } from "./generalSettingsProjection";

export interface GeneralSettingsSurfaceSnapshot {
  readonly changedSettingLabels: ReadonlyArray<string>;
  readonly defaults: GeneralSettingsValues;
  readonly diagnosticsDescription: string;
  readonly modelLabel: string;
  readonly serverControlsDisabled: boolean;
  readonly settingsError: string | null;
  readonly textGenerationModelDirty: boolean;
  readonly theme: GeneralThemePreference;
  readonly values: GeneralSettingsValues;
  readonly versionLabel: string;
}

export interface GeneralSettingsSurfaceActions {
  readonly checkForUpdates: () => void;
  readonly openDiagnostics: () => void;
  readonly resetTextGenerationModel: () => void;
  readonly restoreDefaults: () => Promise<void>;
  readonly setProjectGrouping: (enabled: boolean) => void;
  readonly setTheme: (theme: GeneralThemePreference) => void;
  readonly update: (patch: GeneralSettingsPatch) => void;
}

const NOOP = () => {};
const INITIAL_SNAPSHOT: GeneralSettingsSurfaceSnapshot = {
  changedSettingLabels: [],
  defaults: GENERAL_SETTINGS_DEFAULT_VALUES,
  diagnosticsDescription: "Tracing is disabled.",
  modelLabel: "Default",
  serverControlsDisabled: true,
  settingsError: null,
  textGenerationModelDirty: false,
  theme: "system",
  values: GENERAL_SETTINGS_DEFAULT_VALUES,
  versionLabel: "0.0.28",
};
const INITIAL_ACTIONS: GeneralSettingsSurfaceActions = {
  checkForUpdates: NOOP,
  openDiagnostics: NOOP,
  resetTextGenerationModel: NOOP,
  restoreDefaults: async () => {},
  setProjectGrouping: NOOP,
  setTheme: NOOP,
  update: NOOP,
};

let snapshot = INITIAL_SNAPSHOT;
let actions = INITIAL_ACTIONS;
const listeners = new Set<() => void>();

export function publishGeneralSettingsSurface(
  nextSnapshot: GeneralSettingsSurfaceSnapshot,
  nextActions: GeneralSettingsSurfaceActions,
): void {
  snapshot = nextSnapshot;
  actions = nextActions;
  for (const listener of listeners) listener();
}

export function getGeneralSettingsSurfaceActions(): GeneralSettingsSurfaceActions {
  return actions;
}

export function getGeneralSettingsSurfaceSnapshot(): GeneralSettingsSurfaceSnapshot {
  return snapshot;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useGeneralSettingsSurface(): GeneralSettingsSurfaceSnapshot {
  return useSyncExternalStore(subscribe, getGeneralSettingsSurfaceSnapshot, () => INITIAL_SNAPSHOT);
}
