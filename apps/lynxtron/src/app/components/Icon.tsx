import { useMemo } from "@lynx-js/react";
import { ICON_PNGS } from "./iconData";

/**
 * Lucide icons rendered as rasterized PNGs via Lynx's <image> element.
 *
 * Why PNG (not <svg>): on Lynxtron 0.0.5 desktop the built-in <svg> element and
 * svg-data-URI <image> both mount but rasterize BLANK (verified: DOM node
 * present, no console error, nothing painted). PNG-through-<image> renders
 * reliably (per port field notes), so scripts/build-icons.mjs pre-rasterizes
 * the lucide path data (lucide-react@0.564.0, matching t3code's web UI) with
 * rsvg-convert into PNG data-URIs keyed by "<name>@<size>@<color>".
 *
 * Intentional divergence:
 *   Source: lucide-react SVG components (vector, currentColor).
 *   Target: pre-rasterized PNG variants at fixed size/color combos.
 *   Reason: Lynxtron 0.0.5 desktop does not paint SVG.
 *   Reverify when: Lynxtron/Lynx SVG rasterization is fixed on desktop.
 */

// Must mirror the VARIANTS in scripts/build-icons.mjs.
const SIZES = [14, 16, 18, 20];
const COLORS = ["#f5f5f5", "#a1a1aa", "#ffffff", "#71717a"];

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

export type IconName =
  | "plus"
  | "arrow-up"
  | "square"
  | "message-square-plus"
  | "send"
  | "panel-left"
  | "panel-right"
  | "panel-bottom"
  | "search"
  | "arrow-up-down"
  | "pencil-line"
  | "chevron-down"
  | "git-branch"
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
  | "claude"
  | "t3-wordmark"
  | "settings-2"
  | "palette"
  | "keyboard"
  | "link-2"
  | "flask-conical"
  | "archive"
  | "arrow-left"
  | "rotate-ccw"
  | "refresh-cw"
  | "chevron-right"
  | "triangle-alert"
  | "file-json"
  | "ellipsis"
  | "trash-2"
  | "message-square";

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  className?: string;
}

export function Icon({ name, size = 18, color = "#f5f5f5", className }: IconProps) {
  const src = useMemo(() => {
    // Fill icons (brand marks) have a single pre-colored variant.
    if (name === "claude" || name === "t3-wordmark") {
      return ICON_PNGS[`${name}@fill`] ?? "";
    }
    const s = nearest(SIZES, size);
    const c = pickColor(color);
    return ICON_PNGS[`${name}@${s}@${c}`] ?? ICON_PNGS[`${name}@18@#f5f5f5`] ?? "";
  }, [name, size, color]);

  if (name === "t3-wordmark") {
    // Wordmark is wide (94.3941 x 56.96 viewBox); height drives the size.
    const h = size;
    const w = Math.round((h * 94.3941) / 56.96);
    return <image className={className} style={{ width: `${w}px`, height: `${h}px` }} src={src} />;
  }

  return (
    <image className={className} style={{ width: `${size}px`, height: `${size}px` }} src={src} />
  );
}
