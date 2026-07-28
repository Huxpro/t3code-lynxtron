import { type ReactNode, useCallback, useEffect, useReducer } from "react";

import type { SettingsSectionPath } from "./SettingsNavigationContent";
import {
  getGeneralSettingsSurfaceActions,
  useGeneralSettingsSurface,
} from "./generalSettingsStore";
import { SettingsRouteHost } from "./settingsRouteHost";
import {
  initialSettingsRestoreState,
  projectSettingsRestorePresentation,
  reduceSettingsRestoreState,
} from "./settingsRouteState";

export function SettingsRouteSurface({
  children,
  electron,
  onBack,
  onNavigate,
  pathname,
}: {
  readonly children: ReactNode;
  readonly electron: boolean;
  readonly onBack: () => void;
  readonly onNavigate: (to: SettingsSectionPath) => void;
  readonly pathname: string;
}) {
  const { changedSettingLabels } = useGeneralSettingsSurface();
  const [restoreState, dispatchRestore] = useReducer(
    reduceSettingsRestoreState,
    changedSettingLabels.length,
    initialSettingsRestoreState,
  );
  const restore = projectSettingsRestorePresentation({
    changedSettingLabels,
    pathname,
    state: restoreState,
  });
  useEffect(() => {
    dispatchRestore({ type: "settings-changed", count: changedSettingLabels.length });
  }, [changedSettingLabels.length]);
  const handleRestore = useCallback(() => {
    if (restore.actionDisabled) return;
    dispatchRestore({ type: "restore-requested" });
  }, [restore.actionDisabled]);
  const handleRestoreConfirmed = useCallback(() => {
    dispatchRestore({ type: "restore-confirmed" });
    void getGeneralSettingsSurfaceActions()
      .restoreDefaults()
      .then(() => dispatchRestore({ type: "restore-succeeded" }))
      .catch(() => dispatchRestore({ type: "restore-failed" }));
  }, []);

  return (
    <SettingsRouteHost
      electron={electron}
      confirmation={restore.confirmation}
      onBack={onBack}
      onCancelRestore={() => dispatchRestore({ type: "restore-cancelled" })}
      onConfirmRestore={handleRestoreConfirmed}
      onNavigate={onNavigate}
      onRestore={handleRestore}
      pathname={pathname}
      restoreDisabled={restore.actionDisabled}
      restoreLabel={restore.actionLabel}
      showRestore={restore.visible}
    >
      {children}
    </SettingsRouteHost>
  );
}
