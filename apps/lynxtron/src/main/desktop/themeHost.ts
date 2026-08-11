import {
  T3_THEME_EVENT,
  T3_THEME_READY_METHOD,
  type LynxtronThemeSnapshot,
} from "../../shared/themeProtocol.ts";

export interface ThemeHostSource {
  readonly shouldUseDarkColors: boolean;
  on(event: "updated", listener: () => void): unknown;
  removeListener?(event: "updated", listener: () => void): unknown;
  dispose?(): void;
}

export interface ThemeHostWindow {
  sendGlobalEvent(eventName: string, ...args: unknown[]): boolean;
  on(event: "closed", listener: () => void): unknown;
}

export interface ThemeHostBridge {
  handle(method: string, handler: () => unknown): void;
  removeHandler(method: string): void;
}

export interface LynxtronThemeHost {
  snapshot(): LynxtronThemeSnapshot;
  dispose(): void;
}

export function startLynxtronThemeHost(
  window: ThemeHostWindow,
  bridge: ThemeHostBridge,
  source: ThemeHostSource,
): LynxtronThemeHost {
  let sequence = 0;
  let disposed = false;
  let lastTheme: LynxtronThemeSnapshot["theme"] | null = null;

  const resolvedTheme = (): LynxtronThemeSnapshot["theme"] =>
    source.shouldUseDarkColors ? "dark" : "light";

  const snapshot = (): LynxtronThemeSnapshot => ({
    theme: resolvedTheme(),
    sequence,
  });

  const publish = () => {
    if (disposed) return;
    const theme = resolvedTheme();
    if (theme === lastTheme) return;
    lastTheme = theme;
    sequence += 1;
    window.sendGlobalEvent(T3_THEME_EVENT, { theme, sequence } satisfies LynxtronThemeSnapshot);
  };

  bridge.handle(T3_THEME_READY_METHOD, snapshot);
  source.on("updated", publish);

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    bridge.removeHandler(T3_THEME_READY_METHOD);
    source.removeListener?.("updated", publish);
    source.dispose?.();
  };

  window.on("closed", dispose);
  publish();
  return { snapshot, dispose };
}
