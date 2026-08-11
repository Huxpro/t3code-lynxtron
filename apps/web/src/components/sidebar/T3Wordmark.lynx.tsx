import externalWordmarkUrl from "../../../../lynxtron/src/app/assets/t3-wordmark.svg?external";
import externalWordmarkLightUrl from "../../../../lynxtron/src/app/assets/t3-wordmark-light.svg?external";
import { useResolvedTheme } from "../../../../lynxtron/src/app/state/resolvedThemeContext";

export function T3Wordmark({ onBackdrop = false }: { readonly onBackdrop?: boolean }) {
  const theme = useResolvedTheme();
  return (
    <svg
      aria-label="T3"
      className="lynx-sidebar-wordmark"
      src={onBackdrop || theme === "dark" ? externalWordmarkUrl : externalWordmarkLightUrl}
      style={{ width: "17px", height: "10px" }}
    />
  );
}
