#!/usr/bin/env node
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(appRoot, "../..");
const upstreamCssPath = path.join(repoRoot, "apps/web/src/index.css");
const outputPath = path.join(appRoot, "src/app/generated/lynx.css");
const reportPath = path.join(appRoot, "reports/css-generation.json");
const webDmSansPath = path.join(
  repoRoot,
  "apps/web/node_modules/@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2",
);
const lynxDmSansPath = path.join(appRoot, "src/app/assets/dm-sans.woff2");
const webJetBrainsMonoPath = path.join(
  repoRoot,
  "apps/web/node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2",
);
const lynxJetBrainsMonoPath = path.join(appRoot, "src/app/assets/jetbrains-mono-400.woff2");

const source = await readFile(upstreamCssPath, "utf8");
const sourceHash = createHash("sha256").update(source).digest("hex");

function blockAfter(marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error(`Unable to find ${marker} in ${upstreamCssPath}`);
  }
  const open = source.indexOf("{", markerIndex);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(open + 1, index);
  }
  throw new Error(`Unclosed CSS block after ${marker}`);
}

function declarations(block) {
  return Object.fromEntries(
    [...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]),
  );
}

const sidebarSource = declarations(blockAfter('.dark [data-sidebar-version="v1"]'));
const themeSource = declarations(blockAfter("@theme inline"));
const settingsPrimitiveSource = declarations(blockAfter("LYNX_SETTINGS_PRIMITIVE_CONTRACT"));

// Tailwind's neutral palette and the small alpha/color-mix subset used by the
// effective dark theme are resolved at build time. Keeping the conversion here
// makes the generated CSS deterministic and leaves the Lynx runtime free of
// unsupported oklch(), color-mix(), @variant, and --alpha() syntax.
const resolved = {
  background: "#0a0a0a",
  foreground: "#f5f5f5",
  card: "#111111",
  popover: "#191919",
  primary: "#366ffb",
  mutedForeground: "#818181",
  sidebarBackground: sidebarSource["--background"] === "#000" ? "#000000" : "#0a0a0a",
  sidebarForeground: sidebarSource["--foreground"]?.startsWith("#")
    ? sidebarSource["--foreground"]
    : "#f1f3f7",
  sidebarMuted: sidebarSource["--muted-foreground"]?.startsWith("#")
    ? sidebarSource["--muted-foreground"]
    : "#a3a3a3",
};

const darkOpacitySemanticValues = {
  background: resolved.background,
  foreground: resolved.foreground,
  card: resolved.card,
  "card-foreground": resolved.foreground,
  popover: resolved.popover,
  "popover-foreground": resolved.foreground,
  primary: resolved.primary,
  "primary-foreground": "#ffffff",
  "secondary-foreground": resolved.foreground,
  "muted-foreground": resolved.mutedForeground,
  "accent-foreground": "#f7f9ff",
  destructive: "#ef4444",
  "destructive-foreground": "#f87171",
  ring: resolved.primary,
  info: "#3b82f6",
  "info-foreground": "#60a5fa",
  success: "#34d399",
  "success-foreground": "#6ee7b7",
  warning: "#f59e0b",
  "warning-foreground": "#fbbf24",
  sidebar: resolved.sidebarBackground,
  "sidebar-foreground": resolved.sidebarForeground,
  "sidebar-muted-foreground": resolved.sidebarMuted,
  "sidebar-control-surface": "#0a0a0a",
};

const darkAlphaSemanticValues = {
  secondary: { color: "#ffffff", alpha: 0.04 },
  muted: { color: "#ffffff", alpha: 0.04 },
  accent: { color: "#ffffff", alpha: 0.04 },
  border: { color: "#ffffff", alpha: 0.06 },
  input: { color: "#ffffff", alpha: 0.08 },
  "surface-raised": { color: resolved.card, alpha: 0.2 },
  "sidebar-row-hover": { color: resolved.sidebarForeground, alpha: 0.08 },
  "sidebar-row-active": { color: resolved.sidebarForeground, alpha: 0.11 },
  "sidebar-row-selected": { color: resolved.sidebarForeground, alpha: 0.07 },
  "sidebar-border": { color: "#ffffff", alpha: 0.08 },
};

const lightOpacitySemanticValues = {
  background: "#fcfcfc",
  foreground: "#27272a",
  card: "#ffffff",
  "card-foreground": "#27272a",
  popover: "#ffffff",
  "popover-foreground": "#27272a",
  primary: "#366ffb",
  "primary-foreground": "#ffffff",
  "secondary-foreground": "#27272a",
  "muted-foreground": "#71717a",
  "accent-foreground": "#18181b",
  destructive: "#ef4444",
  "destructive-foreground": "#b91c1c",
  ring: "#366ffb",
  info: "#3b82f6",
  "info-foreground": "#1d4ed8",
  success: "#10b981",
  "success-foreground": "#047857",
  warning: "#f59e0b",
  "warning-foreground": "#b45309",
  sidebar: "#fafafa",
  "sidebar-foreground": "#27272a",
  "sidebar-muted-foreground": "#71717a",
  "sidebar-control-surface": "#f4f4f5",
};

const lightAlphaSemanticValues = {
  secondary: { color: "#fafafa", alpha: 1 },
  muted: { color: "#fafafa", alpha: 1 },
  accent: { color: "#f4f4f5", alpha: 1 },
  border: { color: "#e4e4e7", alpha: 1 },
  input: { color: "#d4d4d8", alpha: 1 },
  "surface-raised": { color: "#ffffff", alpha: 0.92 },
  "sidebar-row-hover": { color: "#fcfcfc", alpha: 1 },
  "sidebar-row-active": { color: "#ffffff", alpha: 1 },
  "sidebar-row-selected": { color: "#ffffff", alpha: 1 },
  "sidebar-border": { color: "#e4e4e7", alpha: 1 },
};

function rgbChannels(value) {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(value);
  if (!match) {
    throw new Error(`Expected an opaque six-digit hex color, received ${value}`);
  }
  return match
    .slice(1)
    .map((channel) => Number.parseInt(channel, 16))
    .join(", ");
}

function semanticVariables(opacityValues, alphaValues) {
  return [
    ...Object.entries(opacityValues).map(
      ([name, value]) => `  --${name}-rgb: ${rgbChannels(value)};`,
    ),
    ...Object.entries(alphaValues).map(
      ([name, value]) => `  --${name}-rgb: ${rgbChannels(value.color)};`,
    ),
  ].join("\n");
}

const darkSemanticVariables = semanticVariables(darkOpacitySemanticValues, darkAlphaSemanticValues);
const lightSemanticVariables = semanticVariables(
  lightOpacitySemanticValues,
  lightAlphaSemanticValues,
);

const opacitySemanticVariables = Object.entries(darkOpacitySemanticValues)
  .map(([name, value]) => `  --${name}-rgb: ${rgbChannels(value)};`)
  .join("\n");
const alphaSemanticVariables = Object.entries(darkAlphaSemanticValues)
  .map(([name, value]) => `  --${name}-rgb: ${rgbChannels(value.color)};`)
  .join("\n");

const generated = `/* AUTO-GENERATED by scripts/generate-lynx-css.mjs.
 * Source: apps/web/src/index.css
 * SHA-256: ${sourceHash}
 * Runtime gaps: R9 (oklch/color-mix/@variant).
 * Do not edit this file by hand. */
@font-face {
  font-family: "DM Sans";
  font-style: normal;
  font-weight: 100 1000;
  src: url(../assets/dm-sans.woff2);
}
:root,
.theme-dark {
  --background: ${resolved.background};
  --foreground: ${resolved.foreground};
  --card: ${resolved.card};
  --card-foreground: ${resolved.foreground};
  --popover: ${resolved.popover};
  --popover-foreground: ${resolved.foreground};
  --primary-foreground: #ffffff;
  --secondary: rgba(255, 255, 255, 0.04);
  --secondary-foreground: ${resolved.foreground};
  --muted: rgba(255, 255, 255, 0.04);
  --muted-foreground: ${resolved.mutedForeground};
  --muted-foreground-80: rgba(129, 129, 129, 0.8);
  --muted-foreground-70: rgba(129, 129, 129, 0.7);
  --muted-foreground-40: rgba(129, 129, 129, 0.4);
  --accent: rgba(255, 255, 255, 0.04);
  --accent-foreground: #f7f9ff;
  --primary: ${resolved.primary};
  --ring: ${resolved.primary};
  --border: rgba(255, 255, 255, 0.06);
  --input: rgba(255, 255, 255, 0.08);
  --destructive: #ef4444;
  --destructive-foreground: #f87171;
  --info: #3b82f6;
  --info-foreground: #60a5fa;
  --success: #34d399;
  --success-foreground: #6ee7b7;
  --warning: #f59e0b;
  --warning-foreground: #fbbf24;
  --btn-surface: rgba(255, 255, 255, 0.0256);
  --sidebar: ${resolved.sidebarBackground};
  --sidebar-foreground: ${resolved.sidebarForeground};
  --sidebar-foreground-90: rgba(241, 243, 247, 0.9);
  --sidebar-muted-foreground: ${resolved.sidebarMuted};
  --sidebar-muted-80: rgba(163, 163, 163, 0.8);
  --sidebar-muted-70: rgba(163, 163, 163, 0.7);
  --sidebar-muted-60: rgba(163, 163, 163, 0.6);
  --sidebar-control-surface: #0a0a0a;
  --sidebar-row-hover: rgba(241, 243, 247, 0.08);
  --sidebar-row-active: rgba(241, 243, 247, 0.11);
  --sidebar-row-selected: rgba(241, 243, 247, 0.07);
  --sidebar-border: rgba(255, 255, 255, 0.08);
  --surface-raised: rgba(17, 17, 17, 0.2);
  --composer-surface: #121212;
  --strip-surface: #101010;
  --composer-frame: #1e1e1e;
  --composer-strip: #171717;
  --composer-strip-seam: #121212;
  --composer-strip-band-1: #131313;
  --composer-strip-band-2: #141414;
  --composer-strip-band-3: #151515;
  --composer-strip-band-4: #161616;
  --info-banner-surface: rgb(12, 15, 20);
  --info-banner-border: rgba(41, 118, 248, 0.4);
  --header-action-surface: #111111;
  --header-action-border: #242424;
  --header-action-border-top: #313131;
  --header-project-foreground: rgb(115, 115, 115);
  --header-thread-foreground: rgb(223, 223, 223);
  --header-action-foreground: rgb(220, 220, 220);
  --header-commit-foreground: rgb(210, 210, 210);
  --sidebar-active-surface: rgba(241, 243, 247, 0.11);
  --overlay-backdrop: rgba(0, 0, 0, 0.42);
  --overlay-shadow: rgba(0, 0, 0, 0.35);
${opacitySemanticVariables}
${alphaSemanticVariables}
  --font-sans: "DM Sans", -apple-system, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", "SF Mono", Menlo, monospace;
${Object.entries(settingsPrimitiveSource)
  .map(([name, value]) => `  ${name}: ${value};`)
  .join("\n")}
}
.theme-light {
  --background: #fcfcfc;
  --foreground: #27272a;
  --card: #ffffff;
  --card-foreground: #27272a;
  --popover: #ffffff;
  --popover-foreground: #27272a;
  --primary: #366ffb;
  --primary-foreground: #ffffff;
  --secondary: #fafafa;
  --secondary-foreground: #27272a;
  --muted: #fafafa;
  --muted-foreground: #71717a;
  --muted-foreground-80: rgba(113, 113, 122, 0.8);
  --muted-foreground-70: rgba(113, 113, 122, 0.7);
  --muted-foreground-40: rgba(113, 113, 122, 0.4);
  --accent: #f4f4f5;
  --accent-foreground: #18181b;
  --destructive: #ef4444;
  --destructive-foreground: #b91c1c;
  --border: #e4e4e7;
  --input: #d4d4d8;
  --ring: #366ffb;
  --info: #3b82f6;
  --info-foreground: #1d4ed8;
  --success: #10b981;
  --success-foreground: #047857;
  --warning: #f59e0b;
  --warning-foreground: #b45309;
  --btn-surface: rgba(24, 24, 27, 0.0256);
  --sidebar: #fafafa;
  --sidebar-foreground: #27272a;
  --sidebar-foreground-90: rgba(39, 39, 42, 0.9);
  --sidebar-muted-foreground: #71717a;
  --sidebar-muted-80: rgba(113, 113, 122, 0.8);
  --sidebar-muted-70: rgba(113, 113, 122, 0.7);
  --sidebar-muted-60: rgba(113, 113, 122, 0.6);
  --sidebar-control-surface: #f4f4f5;
  --sidebar-row-hover: #fcfcfc;
  --sidebar-row-active: #ffffff;
  --sidebar-row-selected: #ffffff;
  --sidebar-border: #e4e4e7;
  --surface-raised: rgba(255, 255, 255, 0.92);
  --composer-surface: #ffffff;
  --strip-surface: #fafafa;
  --composer-frame: #e4e4e7;
  --composer-strip: #fafafa;
  --composer-strip-seam: #ffffff;
  --composer-strip-band-1: #fdfdfd;
  --composer-strip-band-2: #fbfbfb;
  --composer-strip-band-3: #fafafa;
  --composer-strip-band-4: #f9f9f9;
  --info-banner-surface: #ffffff;
  --info-banner-border: rgba(59, 130, 246, 0.32);
  --header-action-surface: #ffffff;
  --header-action-border: #e4e4e7;
  --header-action-border-top: #ededf0;
  --header-project-foreground: #71717a;
  --header-thread-foreground: #27272a;
  --header-action-foreground: #3f3f46;
  --header-commit-foreground: #3f3f46;
  --sidebar-active-surface: #ffffff;
  --overlay-backdrop: rgba(24, 24, 27, 0.16);
  --overlay-shadow: rgba(24, 24, 27, 0.14);
${lightSemanticVariables}
}
`;

await mkdir(path.dirname(outputPath), { recursive: true });
await mkdir(path.dirname(reportPath), { recursive: true });
await copyFile(webDmSansPath, lynxDmSansPath);
await copyFile(webJetBrainsMonoPath, lynxJetBrainsMonoPath);
await writeFile(outputPath, generated);
await writeFile(
  reportPath,
  `${JSON.stringify(
    {
      source: path.relative(repoRoot, upstreamCssPath),
      sourceHash,
      generated: path.relative(repoRoot, outputPath),
      upstreamThemeTokenCount: Object.keys(themeSource).length,
      effectiveSidebarTokenCount: Object.keys(sidebarSource).length,
      settingsPrimitiveTokenCount: Object.keys(settingsPrimitiveSource).length,
      transformedSyntax: ["oklch", "color-mix", "@variant", "--alpha"],
      opacitySemanticTokenCount:
        Object.keys(darkOpacitySemanticValues).length +
        Object.keys(darkAlphaSemanticValues).length +
        Object.keys(lightOpacitySemanticValues).length +
        Object.keys(lightAlphaSemanticValues).length,
      retainedRuntimeWorkarounds: ["R9"],
      emittedThemes: ["dark", "light"],
    },
    null,
    2,
  )}\n`,
);

console.log(`[generate-lynx-css] wrote ${path.relative(repoRoot, outputPath)}`);
