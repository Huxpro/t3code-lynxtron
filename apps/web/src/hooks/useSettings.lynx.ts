import { useMemo } from "react";

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
