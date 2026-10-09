import { useSyncExternalStore } from "react";

import type { GeneralSettingsPatch, GeneralSettingsValues } from "./GeneralSettingsContent";
import { GENERAL_SETTINGS_DEFAULT_VALUES } from "./generalSettingsProjection";
import type { BackgroundActivityProfile, ModelSelection } from "@t3tools/contracts";

export type BackgroundActivityProfileOption = BackgroundActivityProfile | "advanced";

export interface GeneralSettingsSurfaceSnapshot {
  readonly backgroundActivityProfileOption: BackgroundActivityProfileOption;
  readonly backgroundActivityDescription: string;
  readonly changedSettingLabels: ReadonlyArray<string>;
  readonly defaults: GeneralSettingsValues;
  readonly diagnosticsDescription: string;
  readonly modelLabel: string;
  readonly serverControlsDisabled: boolean;
  readonly settingsError: string | null;
  readonly textGenerationModelDirty: boolean;
  readonly values: GeneralSettingsValues;
  readonly versionLabel: string;
}

export interface GeneralSettingsSurfaceActions {
  readonly openDiagnostics: () => void;
  readonly resetTextGenerationModel: () => void;
  readonly restoreDefaults: () => Promise<void>;
  readonly setProjectGrouping: (enabled: boolean) => void;
  readonly setBackgroundActivityProfile: (profile: BackgroundActivityProfile) => void;
  readonly setTextGenerationModelSelection: (selection: ModelSelection) => void;
  readonly update: (patch: GeneralSettingsPatch) => void;
}

const NOOP = () => {};
const INITIAL_SNAPSHOT: GeneralSettingsSurfaceSnapshot = {
  backgroundActivityProfileOption: "balanced",
  backgroundActivityDescription:
    "Pauses background probes when clients are idle, the host is locked, or low power mode is active.",
  changedSettingLabels: [],
  defaults: GENERAL_SETTINGS_DEFAULT_VALUES,
  diagnosticsDescription: "Tracing is disabled.",
  modelLabel: "Default",
  serverControlsDisabled: true,
  settingsError: null,
  textGenerationModelDirty: false,
  values: GENERAL_SETTINGS_DEFAULT_VALUES,
  versionLabel: "0.0.28",
};
const INITIAL_ACTIONS: GeneralSettingsSurfaceActions = {
  openDiagnostics: NOOP,
  resetTextGenerationModel: NOOP,
  restoreDefaults: async () => {},
  setProjectGrouping: NOOP,
  setBackgroundActivityProfile: NOOP,
  setTextGenerationModelSelection: NOOP,
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
