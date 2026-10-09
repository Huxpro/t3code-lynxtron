import { execFileSync } from "node:child_process";
import { watch } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { LynxtronResolvedTheme } from "../../shared/themeProtocol.ts";
import type { ThemeHostSource } from "./themeHost.ts";

type ThemeListener = () => void;

export interface SystemThemeSource extends ThemeHostSource {
  dispose(): void;
}

interface SystemThemeSourceOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
  readonly homeDirectory?: string;
  readonly readSystemTheme?: () => LynxtronResolvedTheme;
  readonly watchSystemTheme?: (listener: ThemeListener) => () => void;
}

function parseTheme(value: string | undefined): LynxtronResolvedTheme | null {
  return value === "light" || value === "dark" ? value : null;
}

function readMacOsSystemTheme(): LynxtronResolvedTheme {
  try {
    const appearance = execFileSync("/usr/bin/defaults", ["read", "-g", "AppleInterfaceStyle"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return appearance === "Dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function watchMacOsSystemTheme(homeDirectory: string, listener: ThemeListener): () => void {
  const preferencesDirectory = path.join(homeDirectory, "Library", "Preferences");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const watcher = watch(preferencesDirectory, { persistent: false }, (_event, filename) => {
      if (filename !== null && !String(filename).includes(".GlobalPreferences")) return;
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(listener, 100);
    });
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      watcher.close();
    };
  } catch {
    return () => undefined;
  }
}

export function createSystemThemeSource(options: SystemThemeSourceOptions = {}): SystemThemeSource {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const forcedTheme = parseTheme(env.T3_LYNXTRON_SYSTEM_THEME);
  const readSystemTheme =
    options.readSystemTheme ??
    (platform === "darwin" ? readMacOsSystemTheme : () => "light" as const);
  let theme = forcedTheme ?? readSystemTheme();
  const listeners = new Set<ThemeListener>();
  let disposed = false;

  const refresh = () => {
    if (disposed || forcedTheme !== null) return;
    const nextTheme = readSystemTheme();
    if (nextTheme === theme) return;
    theme = nextTheme;
    for (const listener of listeners) listener();
  };

  const stopWatching =
    forcedTheme !== null
      ? () => undefined
      : options.watchSystemTheme
        ? options.watchSystemTheme(refresh)
        : platform === "darwin"
          ? watchMacOsSystemTheme(options.homeDirectory ?? os.homedir(), refresh)
          : () => undefined;

  return {
    get shouldUseDarkColors() {
      return theme === "dark";
    },
    on: (_event, listener) => {
      listeners.add(listener);
    },
    removeListener: (_event, listener) => {
      listeners.delete(listener);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      listeners.clear();
      stopWatching();
    },
  };
}
