import { useMemo } from "@lynx-js/react";
import { ICON_PNGS } from "./iconData";
import { useResolvedTheme } from "../state/resolvedThemeContext";

/**
 * Lucide icons rendered as rasterized PNGs via Lynx's <image> element.
 *
 * Inline <svg> content and svg-data-URI <image> mount but rasterize blank on
 * Lynxtron desktop. Lynxtron 0.0.8 does paint bundle-relative <svg src> assets
 * when width and height are explicit, but converting the full Lucide inventory
 * still requires one emitted asset per color instead of currentColor. Until
 * those leaves are measured and migrated, scripts/build-icons.mjs
 * pre-rasterizes the lucide path data (lucide-react@0.564.0, matching t3code's
 * web UI) into PNG data-URIs keyed by "<name>@<size>@<color>".
 *
 * Intentional divergence:
 *   Source: lucide-react SVG components (vector, currentColor).
 *   Target: external SVG for measured leaves; pre-rasterized PNG variants for
 *   the remaining fixed size/color combos.
 *   Reason: inline/currentColor SVG is not yet a drop-in path on Lynxtron.
 *   Reverify when: inline SVG paints or an external SVG can inherit color.
 */

// Must mirror the VARIANTS in scripts/build-icons.mjs.
const SIZES = [14, 16, 18, 20];
const COLORS = [
  "#f5f5f5",
  "#a1a1aa",
  "#818181",
  "#ffffff",
  "#71717a",
  "#27272a",
  "#3b82f6",
  "#60a5fa",
  "#f87171",
];

function nearest(list: number[], v: number): number {
  return list.reduce((best, x) => (Math.abs(x - v) < Math.abs(best - v) ? x : best), list[0]);
}

function pickColor(color: string): string {
  const c = color.toLowerCase();
  if (COLORS.includes(c)) return c;
  // Map common intents to the closest generated variant.
  if (c === "#fff" || c === "white") return "#ffffff";
  return "#f5f5f5";
}

function lightColor(color: string): string {
  switch (color.toLowerCase()) {
    case "#f5f5f5":
      return "#27272a";
    case "#a1a1aa":
    case "#818181":
      return "#71717a";
    default:
      return color.toLowerCase();
  }
}

export type IconName =
  | "plus"
  | "arrow-up"
  | "send-arrow"
  | "square"
  | "message-square-plus"
  | "send"
  | "panel-left"
  | "panel-left-close"
  | "panel-right"
  | "panel-bottom"
  | "maximize-2"
  | "minimize-2"
  | "search"
  | "arrow-up-down"
  | "pencil-line"
  | "pencil-ruler"
  | "chevron-down"
  | "git-branch"
  | "git-branch-plus"
  | "git-pull-request"
  | "git-commit-horizontal"
  | "folder"
  | "plug"
  | "cloud-upload"
  | "settings"
  | "wrench"
  | "lock"
  | "lock-open"
  | "square-pen"
  | "bot"
  | "openai"
  | "claude"
  | "cursor"
  | "grok"
  | "opencode"
  | "t3-wordmark"
  | "settings-2"
  | "palette"
  | "keyboard"
  | "link-2"
  | "flask-conical"
  | "archive"
  | "clock"
  | "arrow-left"
  | "rotate-ccw"
  | "refresh-cw"
  | "chevron-right"
  | "folder-plus"
  | "triangle-alert"
  | "file-json"
  | "file-diff"
  | "clipboard-list"
  | "files"
  | "terminal-square"
  | "chevrons-down-up"
  | "chevrons-up-down"
  | "chevrons-left-right-ellipsis"
  | "rows-3"
  | "columns-2"
  | "text-wrap"
  | "pilcrow"
  | "ellipsis"
  | "trash-2"
  | "message-square"
  | "check"
  | "copy"
  | "circle-alert"
  | "eye"
  | "globe"
  | "hammer"
  | "message-circle"
  | "terminal"
  | "x"
  | "zap";

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  className?: string;
  themeOverride?: "dark" | "light";
}

export function Icon({ name, size = 18, color = "#f5f5f5", className, themeOverride }: IconProps) {
  const resolvedTheme = useResolvedTheme();
  const theme = themeOverride ?? resolvedTheme;
  const sources = useMemo(() => {
    // Fill icons (brand marks) have a single pre-colored variant.
    if (
      name === "openai" ||
      name === "send-arrow" ||
      name === "claude" ||
      name === "cursor" ||
      name === "grok" ||
      name === "opencode" ||
      name === "t3-wordmark"
    ) {
      const source = ICON_PNGS[`${name}@fill`] ?? "";
      return { dark: source, light: ICON_PNGS[`${name}@fill-light`] ?? source };
    }
    const darkColor = pickColor(color);
    const resolvedLightColor = pickColor(lightColor(color));
    const fallback = ICON_PNGS[`${name}@18@#f5f5f5`] ?? "";
    const exactDark = ICON_PNGS[`${name}@${size}@${darkColor}`];
    const exactLight = ICON_PNGS[`${name}@${size}@${resolvedLightColor}`];
    const s = nearest(SIZES, size);
    return {
      dark: exactDark ?? ICON_PNGS[`${name}@${s}@${darkColor}`] ?? fallback,
      light: exactLight ?? ICON_PNGS[`${name}@${s}@${resolvedLightColor}`] ?? fallback,
    };
  }, [name, size, color]);

  if (name === "t3-wordmark") {
    // Wordmark is wide (94.3941 x 56.96 viewBox); height drives the size.
    const h = size;
    const w = Math.round((h * 94.3941) / 56.96);
    return (
      <image
        className={className}
        style={{ width: `${w}px`, height: `${h}px` }}
        src={sources[theme]}
      />
    );
  }

  return (
    <image
      className={className}
      style={{ width: `${size}px`, height: `${size}px` }}
      src={sources[theme]}
    />
  );
}
