export type SettingsRestoreStatus = "idle" | "confirming" | "restoring" | "restored" | "failed";

export interface SettingsRestoreState {
  readonly changedSettingCount: number;
  readonly status: SettingsRestoreStatus;
}

export interface SettingsRestoreConfirmationAction {
  readonly kind: "cancel" | "confirm";
  readonly label: string;
}

export interface SettingsRestoreConfirmationModel {
  readonly actions: readonly [SettingsRestoreConfirmationAction, SettingsRestoreConfirmationAction];
  readonly description: string;
  readonly title: string;
}

export interface SettingsRestorePresentation {
  readonly actionDisabled: boolean;
  readonly actionLabel: string;
  readonly confirmation: SettingsRestoreConfirmationModel | null;
  readonly visible: boolean;
}

export type SettingsRestoreEvent =
  | { readonly type: "settings-changed"; readonly count: number }
  | { readonly type: "restore-requested" }
  | { readonly type: "restore-cancelled" }
  | { readonly type: "restore-confirmed" }
  | { readonly type: "restore-succeeded" }
  | { readonly type: "restore-failed" };

const SETTINGS_RESTORE_CONFIRMATION_ACTIONS = [
  { kind: "cancel", label: "Cancel" },
  { kind: "confirm", label: "Restore" },
] as const;
const SETTINGS_RESTORE_CONFIRMATION_TITLE = "Restore default settings?";

function settingsRestoreConfirmationDescription(labels: ReadonlyArray<string>): string {
  return `This will reset: ${labels.join(", ")}.`;
}

export function initialSettingsRestoreState(changedSettingCount: number): SettingsRestoreState {
  return {
    changedSettingCount,
    status: "idle",
  };
}

export function reduceSettingsRestoreState(
  state: SettingsRestoreState,
  event: SettingsRestoreEvent,
): SettingsRestoreState {
  switch (event.type) {
    case "settings-changed":
      return {
        changedSettingCount: event.count,
        status: event.count === 0 && state.status === "restored" ? "restored" : "idle",
      };
    case "restore-requested":
      return state.changedSettingCount === 0 ? state : { ...state, status: "confirming" };
    case "restore-cancelled":
      return { ...state, status: "idle" };
    case "restore-confirmed":
      return { ...state, status: "restoring" };
    case "restore-succeeded":
      return { ...state, status: "restored" };
    case "restore-failed":
      return { ...state, status: "failed" };
  }
}

export function settingsRestoreDisabled(state: SettingsRestoreState): boolean {
  return (
    state.changedSettingCount === 0 || state.status === "confirming" || state.status === "restoring"
  );
}

export function settingsRestoreLabel(state: SettingsRestoreState): string {
  switch (state.status) {
    case "restoring":
      return "Restoring…";
    case "confirming":
      return "Restore defaults";
    case "restored":
      return "Restored";
    case "failed":
      return "Retry restore";
    case "idle":
      return "Restore defaults";
  }
}

export function isGeneralSettingsPath(pathname: string): boolean {
  return pathname === "/settings" || pathname === "/settings/general";
}

export function projectSettingsRestorePresentation({
  changedSettingLabels,
  pathname,
  state,
}: {
  readonly changedSettingLabels: ReadonlyArray<string>;
  readonly pathname: string;
  readonly state: SettingsRestoreState;
}): SettingsRestorePresentation {
  const confirmation =
    state.status === "confirming"
      ? {
          actions: SETTINGS_RESTORE_CONFIRMATION_ACTIONS,
          description: settingsRestoreConfirmationDescription(changedSettingLabels),
          title: SETTINGS_RESTORE_CONFIRMATION_TITLE,
        }
      : null;

  return {
    actionDisabled: settingsRestoreDisabled(state),
    actionLabel: settingsRestoreLabel(state),
    confirmation,
    visible: isGeneralSettingsPath(pathname),
  };
}
