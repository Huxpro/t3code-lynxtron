import { createLynxPreset } from "@lynx-js/tailwind-preset";
import plugin from "tailwindcss/plugin.js";

const semanticColorNames = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "border",
  "input",
  "ring",
  "info",
  "info-foreground",
  "success",
  "success-foreground",
  "warning",
  "warning-foreground",
  "surface-raised",
  "sidebar",
  "sidebar-foreground",
  "sidebar-muted-foreground",
  "sidebar-control-surface",
  "sidebar-row-hover",
  "sidebar-row-active",
  "sidebar-row-selected",
  "sidebar-border",
];

const opacityCapableSemanticColors = new Set([
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary-foreground",
  "muted-foreground",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "ring",
  "info",
  "info-foreground",
  "success",
  "success-foreground",
  "warning",
  "warning-foreground",
  "sidebar",
  "sidebar-foreground",
  "sidebar-muted-foreground",
  "sidebar-control-surface",
]);

const alphaSemanticColors = new Map([
  ["secondary", 0.04],
  ["muted", 0.04],
  ["accent", 0.04],
  ["border", 0.06],
  ["input", 0.08],
  ["surface-raised", 0.2],
  ["sidebar-row-hover", 0.08],
  ["sidebar-row-active", 0.11],
  ["sidebar-row-selected", 0.07],
  ["sidebar-border", 0.08],
]);

function alphaSemanticColor(name, baseAlpha) {
  return ({ opacityValue }) => {
    if (opacityValue === undefined) {
      return `var(--${name})`;
    }
    const modifier = Number(opacityValue);
    if (!Number.isFinite(modifier)) {
      throw new Error(`Unsupported Tailwind opacity modifier for ${name}: ${opacityValue}`);
    }
    return `rgba(var(--${name}-rgb), ${(baseAlpha * modifier).toFixed(4)})`;
  };
}

// Upstream names for colors that are aliases in its stylesheet (index.css).
const aliasedSemanticColors = {
  "diff-addition": "var(--success)",
  "diff-deletion": "var(--destructive)",
};

const semanticColors = Object.fromEntries(
  semanticColorNames.map((name) => [
    name,
    alphaSemanticColors.has(name)
      ? alphaSemanticColor(name, alphaSemanticColors.get(name))
      : opacityCapableSemanticColors.has(name)
        ? ({ opacityValue }) =>
            opacityValue === undefined
              ? `var(--${name})`
              : `rgba(var(--${name}-rgb), ${opacityValue})`
        : `var(--${name})`,
  ]),
);

export default {
  // Everything the Lynx bundle compiles: the app, every Lynx-owned module under
  // apps/web, and the upstream Web modules it imports in place.
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx}",
    "../web/src/**/*.lynx.{ts,tsx}",
    "../web/src/branding.logic.ts",
    "../web/src/components/BranchToolbar.logic.ts",
    "../web/src/components/chat/DiffStatLabel.tsx",
    "../web/src/components/chat/externalLinkContextMenu.ts",
    "../web/src/components/chat/modelPickerModelHighlights.ts",
    "../web/src/components/settings/settingsSearch.ts",
    "../web/src/components/threadActionMenu.logic.ts",
    "../web/src/components/ui/kbd.tsx",
    "../web/src/lib/threadSort.ts",
    "../web/src/logicalProject.ts",
    "../web/src/providerSkillSearch.ts",
    "../web/src/session-logic.ts",
    "../web/src/sidebarProjectGrouping.ts",
    "../web/src/worktreeCleanup.ts",
  ],

  // Classes that Lynx-owned source carries but that had no generated rule
  // before content was widened to everything the bundle compiles (2026-10-09).
  // Blocking them keeps rendering unchanged. Removing an entry turns the class
  // on, which changes how that surface looks; check the surface first.
  blocklist: [
    // From upstream components compiled unmodified: rules for DOM-only
    // structure (`svg` descendants) that no Lynx element can match.
    "[&_svg:not([class*='size-'])]:size-3",
    "-my-1",
    "bg-background/45",
    "bg-muted/55",
    "bg-primary/15",
    "bg-secondary",
    "dark:bg-[color-mix(in_srgb,var(--foreground)_2.5%,var(--background))]",
    "gap-x-1.5",
    "gap-y-0.5",
    "h-10",
    "h-[52px]",
    "h-auto",
    "invisible",
    "max-[760px]:min-w-0",
    "max-[760px]:w-[min(88vw,24rem)]",
    "max-w-[28rem]",
    "max-w-[560px]",
    "max-w-[min(48rem,calc(100%-2rem))]",
    "min-h-10",
    "min-w-80",
    "min-w-[360px]",
    "mr-1",
    "mt-4",
    "origin-left",
    "pb-1.5",
    "pr-1.5",
    "pt-2",
    "px-4",
    "sm:px-2",
    "text-destructive-foreground/80",
    "text-foreground/75",
    "text-primary",
    "w-32",
    "w-[42vw]",
    "w-[min(42vw,28rem)]",
    "z-30",
    "z-[1]",
  ],
  darkMode: "class",
  presets: [
    createLynxPreset({
      lynxPlugins: {
        boxShadow: false,
      },
    }),
  ],
  plugins: [
    plugin(({ addUtilities }) => {
      addUtilities({
        ".inline-flex": {
          display: "flex",
        },
        ".block": {
          display: "block",
        },
        ".pointer-events-none": {
          "pointer-events": "none",
        },
        ".pointer-events-auto": {
          "pointer-events": "auto",
        },
        ".outline-none": {
          "outline-width": "0px",
        },
        ".tabular-nums": {
          "font-variant-numeric": "tabular-nums",
        },
        ".select-none": {
          "user-select": "none",
        },
        ".overflow-y-auto": {
          "overflow-y": "auto",
        },
        ".overflow-x-auto": {
          "overflow-x": "auto",
        },
        ".uppercase": {
          "text-transform": "uppercase",
        },
        ".ring-1": {
          "box-shadow": "0 0 0 1px var(--ring)",
        },
      });
    }),
  ],
  theme: {
    extend: {
      colors: { ...semanticColors, ...aliasedSemanticColors },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        sm: "6px",
        md: "8px",
        lg: "10px",
        xl: "14px",
        "2xl": "18px",
      },
    },
  },
};
