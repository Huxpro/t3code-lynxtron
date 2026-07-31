import { createLynxPreset } from "@lynx-js/tailwind-preset";

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
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx}",
    "../web/src/components/chat/TranscriptRowSurface.tsx",
    "../web/src/components/chat/transcriptRowPresentation.ts",
    "../web/src/components/chat/ComposerSurface.tsx",
    "../web/src/components/chat/ModelPickerSurface.tsx",
    "../web/src/components/CommandPaletteSurface.tsx",
    "../web/src/components/AppSidebarLayout.lynx.tsx",
    "../web/src/components/Sidebar.tsx",
    "../web/src/components/Sidebar.logic.ts",
    "../web/src/components/ProjectFavicon.lynx.tsx",
    "../web/src/components/SidebarStageBackdrop.lynx.tsx",
    "../web/src/components/ThreadStatusIndicators.lynx.tsx",
    "../web/src/components/sidebar/SidebarChrome.tsx",
    "../web/src/components/sidebar/SidebarProjectListHost.lynx.tsx",
    "../web/src/components/sidebar/SidebarProjectListHost.types.ts",
    "../web/src/components/sidebar/T3Wordmark.lynx.tsx",
    "../web/src/components/sidebar/SidebarProviderUpdatePill.lynx.tsx",
    "../web/src/components/sidebar/SidebarUpdatePill.tsx",
    "../web/src/components/ui/alert.tsx",
    "../web/src/components/ui/button.lynx.tsx",
    "../web/src/components/ui/command.lynx.tsx",
    "../web/src/components/ui/dialog.lynx.tsx",
    "../web/src/components/ui/hostElements.lynx.tsx",
    "../web/src/components/ui/input.lynx.tsx",
    "../web/src/components/ui/kbd.tsx",
    "../web/src/components/ui/menu.lynx.tsx",
    "../web/src/components/ui/number-field.lynx.tsx",
    "../web/src/components/ui/scroll-area.lynx.tsx",
    "../web/src/components/ui/select.lynx.tsx",
    "../web/src/components/ui/separator.lynx.tsx",
    "../web/src/components/ui/sheet.lynx.tsx",
    "../web/src/components/ui/sidebar.tsx",
    "../web/src/components/ui/skeleton.tsx",
    "../web/src/components/ui/toast.lynx.tsx",
    "../web/src/components/ui/tooltip.lynx.tsx",
  ],
  darkMode: "class",
  presets: [
    createLynxPreset({
      lynxPlugins: {
        boxShadow: false,
      },
    }),
  ],
  theme: {
    extend: {
      colors: semanticColors,
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
