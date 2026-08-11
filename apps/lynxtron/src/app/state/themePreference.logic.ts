export type LynxThemePreference = "system" | "light" | "dark";

export const LYNX_THEME_LABELS: Record<LynxThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

export const NEXT_LYNX_THEME: Record<LynxThemePreference, LynxThemePreference> = {
  system: "light",
  light: "dark",
  dark: "system",
};

export function resolveLynxTheme(
  theme: LynxThemePreference,
  systemTheme: "light" | "dark",
): "light" | "dark" {
  return theme === "system" ? systemTheme : theme;
}
