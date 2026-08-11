export const T3_THEME_EVENT = "t3:theme";
export const T3_THEME_READY_METHOD = "t3:theme.ready";

export type LynxtronResolvedTheme = "light" | "dark";

export interface LynxtronThemeSnapshot {
  readonly theme: LynxtronResolvedTheme;
  readonly sequence: number;
}

export function isLynxtronThemeSnapshot(input: unknown): input is LynxtronThemeSnapshot {
  if (typeof input !== "object" || input === null) return false;
  const value = input as Record<string, unknown>;
  return (
    (value.theme === "light" || value.theme === "dark") &&
    typeof value.sequence === "number" &&
    Number.isInteger(value.sequence) &&
    value.sequence >= 0
  );
}
