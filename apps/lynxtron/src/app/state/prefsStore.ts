import { useAtomValue } from "@effect/atom-react";
import { useCallback } from "@lynx-js/react";
import {
  mergeClientSettings,
  PORTABLE_CLIENT_SETTINGS_DEFAULTS,
  type PortableClientSettings,
  type PortableClientSettingsPatch,
} from "@t3tools/client-runtime/presentation/settings";
import { Atom } from "effect/unstable/reactivity";

import { clientCapabilities } from "../platform/clientCapabilities";
import { appAtomRegistry } from "./atomRegistry";
export { resolveLynxTheme, type LynxThemePreference } from "./themePreference.logic";
import type { LynxThemePreference } from "./themePreference.logic";
import type { EditorId } from "@t3tools/contracts";

const cache = new Map<string, unknown>();
const preferencesRevisionAtom = Atom.make(0).pipe(Atom.withLabel("lynx-preferences-revision"));
const CLIENT_SETTINGS_KEY = "clientSettings";

export function getPref<T>(key: string, fallback: T): T {
  if (cache.has(key)) return cache.get(key) as T;
  try {
    const raw = clientCapabilities.storage.getItem(key);
    if (raw === null) return fallback;
    const value = JSON.parse(raw) as T;
    cache.set(key, value);
    return value;
  } catch {
    return fallback;
  }
}

export function hasPref(key: string): boolean {
  if (cache.has(key)) return true;
  try {
    return clientCapabilities.storage.getItem(key) !== null;
  } catch {
    return false;
  }
}

export function setPref(key: string, value: unknown): void {
  cache.set(key, value);
  try {
    clientCapabilities.storage.setItem(key, JSON.stringify(value));
  } catch {
    /* keep in-memory value */
  }
  appAtomRegistry.set(preferencesRevisionAtom, appAtomRegistry.get(preferencesRevisionAtom) + 1);
}

function readLegacyClientSettings(): PortableClientSettings {
  const projectGrouping = getPref("projectGrouping", true);
  return {
    ...PORTABLE_CLIENT_SETTINGS_DEFAULTS,
    sidebarProjectGroupingMode: projectGrouping ? "repository" : "separate",
    wordWrap: getPref("wordWrap", PORTABLE_CLIENT_SETTINGS_DEFAULTS.wordWrap),
    diffIgnoreWhitespace: getPref(
      "hideWhitespace",
      PORTABLE_CLIENT_SETTINGS_DEFAULTS.diffIgnoreWhitespace,
    ),
    autoOpenPlanSidebar: getPref(
      "autoOpenTaskPanel",
      PORTABLE_CLIENT_SETTINGS_DEFAULTS.autoOpenPlanSidebar,
    ),
    confirmThreadArchive: getPref(
      "archiveConfirmation",
      PORTABLE_CLIENT_SETTINGS_DEFAULTS.confirmThreadArchive,
    ),
    confirmThreadDelete: getPref(
      "deleteConfirmation",
      PORTABLE_CLIENT_SETTINGS_DEFAULTS.confirmThreadDelete,
    ),
  };
}

export function getClientSettingsState(): PortableClientSettings {
  const canonical = getPref<PortableClientSettingsPatch | null>(CLIENT_SETTINGS_KEY, null);
  return canonical
    ? {
        ...PORTABLE_CLIENT_SETTINGS_DEFAULTS,
        ...canonical,
      }
    : readLegacyClientSettings();
}

export function updateClientSettingsState(
  patch: PortableClientSettingsPatch,
): PortableClientSettings {
  const next = mergeClientSettings(getClientSettingsState(), patch);
  setPref(CLIENT_SETTINGS_KEY, next);
  return next;
}

export function useClientSettingsState(): [
  PortableClientSettings,
  (patch: PortableClientSettingsPatch) => void,
] {
  useAtomValue(preferencesRevisionAtom);
  const update = useCallback((patch: PortableClientSettingsPatch) => {
    updateClientSettingsState(patch);
  }, []);
  return [getClientSettingsState(), update];
}

export function usePreferredEditorState(): [EditorId | null, (editor: EditorId) => void] {
  useAtomValue(preferencesRevisionAtom);
  const update = useCallback((editor: EditorId) => setPref("t3code:last-editor", editor), []);
  return [getPref<EditorId | null>("t3code:last-editor", null), update];
}

export function useThemePreferenceState(): [
  LynxThemePreference,
  (theme: LynxThemePreference) => void,
] {
  useAtomValue(preferencesRevisionAtom);
  const update = useCallback((theme: LynxThemePreference) => {
    setPref("themePreference", theme);
  }, []);
  return [getPref<LynxThemePreference>("themePreference", "system"), update];
}

function installDevToolSettingsHarness(): void {
  "background only";
  (
    globalThis as typeof globalThis & {
      __T3_LYNXTRON_SETTINGS_TEST_STATE__?: (state: "changed" | "default") => string;
    }
  ).__T3_LYNXTRON_SETTINGS_TEST_STATE__ = (state) => {
    setPref("themePreference", "system");
    updateClientSettingsState({
      ...PORTABLE_CLIENT_SETTINGS_DEFAULTS,
      ...(state === "changed" ? { sidebarProjectGroupingMode: "separate" } : {}),
    });
    return state;
  };
}

installDevToolSettingsHarness();
