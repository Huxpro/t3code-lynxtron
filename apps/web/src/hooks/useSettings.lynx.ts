import { useMemo } from "react";

import { APP_STAGE_LABEL } from "../branding";
import { resolveSidebarV2Enabled } from "../branding.logic";
import {
  getClientSettingsState,
  updateClientSettingsState,
  useClientSettingsState,
} from "../../../lynxtron/src/app/state/prefsStore";

const SIDEBAR_CLIENT_DEFAULTS = {
  sidebarProjectGroupingOverrides: {},
  sidebarProjectSortOrder: "updated_at" as const,
  sidebarThreadSortOrder: "updated_at" as const,
  sidebarThreadPreviewCount: 6,
};

function withSidebarDefaults(settings: ReturnType<typeof getClientSettingsState>) {
  return {
    ...SIDEBAR_CLIENT_DEFAULTS,
    ...settings,
  };
}

export function getClientSettings() {
  return withSidebarDefaults(getClientSettingsState());
}

export function useClientSettings<T = ReturnType<typeof getClientSettings>>(
  selector?: (settings: ReturnType<typeof getClientSettings>) => T,
): T {
  const [portableSettings] = useClientSettingsState();
  const settings = useMemo(() => withSidebarDefaults(portableSettings), [portableSettings]);
  return useMemo(() => (selector ? selector(settings) : (settings as T)), [selector, settings]);
}

export function useUpdateClientSettings() {
  const [, update] = useClientSettingsState();
  return update as (patch: Record<string, unknown>) => void;
}

export function useEnvironmentIdentificationMode() {
  return useClientSettings(
    (settings) => settings.environmentIdentificationMode ?? ("artwork" as const),
  );
}

export function useSidebarV2Enabled(): boolean {
  return useClientSettings((settings) =>
    resolveSidebarV2Enabled({
      enabled: settings.sidebarV2Enabled,
      configuredByUser: settings.sidebarV2ConfiguredByUser,
      settingsHydrated: true,
      stageLabel: APP_STAGE_LABEL,
    }),
  );
}

export function useClientSettingsHydrated(): boolean {
  return true;
}

export function usePrimarySettings<T = ReturnType<typeof getClientSettings>>(
  selector?: (settings: ReturnType<typeof getClientSettings>) => T,
): T {
  return useClientSettings(selector);
}

export function useUpdatePrimarySettings() {
  return useUpdateClientSettings();
}

export function __resetClientSettingsPersistenceForTests(): void {}

export function __setClientSettingsForTests(settings: Record<string, unknown>): void {
  updateClientSettingsState(settings);
}
