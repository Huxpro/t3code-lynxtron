import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function numberFromCss(value) {
  if (typeof value !== "string") return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function cssNumber(value, percentageScale = 1) {
  if (typeof value !== "string") return null;
  const token = value.trim();
  const parsed = Number.parseFloat(token);
  if (!Number.isFinite(parsed)) return null;
  return token.endsWith("%") ? (parsed / 100) * percentageScale : parsed;
}

function functionalColorParts(value, functionName) {
  const match = value
    .trim()
    .toLowerCase()
    .match(new RegExp(`^${functionName}\\((.*)\\)$`, "u"));
  if (!match) return null;
  const [components, slashAlpha] = match[1].split("/").map((part) => part.trim());
  const values = components.split(/[,\s]+/u).filter(Boolean);
  const alpha = slashAlpha ?? (values.length === 4 ? values.pop() : "1");
  return { values, alpha };
}

function linearToSrgb(value) {
  return value <= 0.0031308 ? 12.92 * value : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
}

function oklabToRgba(lightness, a, b, alpha) {
  const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;
  const red = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const green = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const blue = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return [
    Math.round(clamp(linearToSrgb(red), 0, 1) * 255),
    Math.round(clamp(linearToSrgb(green), 0, 1) * 255),
    Math.round(clamp(linearToSrgb(blue), 0, 1) * 255),
    clamp(alpha, 0, 1),
  ];
}

function formatRgba([red, green, blue, alpha]) {
  return `rgba(${red},${green},${blue},${Number(alpha.toFixed(4))})`;
}

export function normalizeCssColor(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "transparent") return "rgba(0,0,0,0)";

  const hex = normalized.match(/^#([\da-f]{3,8})$/u)?.[1];
  if (hex) {
    const expanded =
      hex.length === 3 || hex.length === 4
        ? [...hex].map((digit) => `${digit}${digit}`).join("")
        : hex;
    if (expanded.length === 6 || expanded.length === 8) {
      return formatRgba([
        Number.parseInt(expanded.slice(0, 2), 16),
        Number.parseInt(expanded.slice(2, 4), 16),
        Number.parseInt(expanded.slice(4, 6), 16),
        expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1,
      ]);
    }
  }

  const rgb = functionalColorParts(normalized, "rgba?");
  if (rgb && rgb.values.length === 3) {
    const channels = rgb.values.map((channel) => cssNumber(channel, 255));
    const alpha = cssNumber(rgb.alpha);
    if (channels.every((channel) => channel !== null) && alpha !== null) {
      return formatRgba([...channels.map((channel) => Math.round(clamp(channel, 0, 255))), alpha]);
    }
  }

  const srgbMatch = normalized.match(/^color\(srgb\s+(.+)\)$/u);
  if (srgbMatch) {
    const [components, slashAlpha = "1"] = srgbMatch[1].split("/").map((part) => part.trim());
    const values = components.split(/\s+/u).filter(Boolean);
    const channels = values.map((channel) => cssNumber(channel, 1));
    const alpha = cssNumber(slashAlpha);
    if (channels.every((channel) => channel !== null) && alpha !== null) {
      return formatRgba([
        ...channels.map((channel) => Math.round(clamp(channel, 0, 1) * 255)),
        alpha,
      ]);
    }
  }

  const oklch = functionalColorParts(normalized, "oklch");
  if (oklch && oklch.values.length === 3) {
    const lightness = cssNumber(oklch.values[0]);
    const chroma = cssNumber(oklch.values[1]);
    const hue = cssNumber(oklch.values[2]);
    const alpha = cssNumber(oklch.alpha);
    if (lightness !== null && chroma !== null && hue !== null && alpha !== null) {
      const radians = (hue * Math.PI) / 180;
      return formatRgba(
        oklabToRgba(lightness, chroma * Math.cos(radians), chroma * Math.sin(radians), alpha),
      );
    }
  }

  const oklab = functionalColorParts(normalized, "oklab");
  if (oklab && oklab.values.length === 3) {
    const lightness = cssNumber(oklab.values[0]);
    const a = cssNumber(oklab.values[1]);
    const b = cssNumber(oklab.values[2]);
    const alpha = cssNumber(oklab.alpha);
    if (lightness !== null && a !== null && b !== null && alpha !== null) {
      return formatRgba(oklabToRgba(lightness, a, b, alpha));
    }
  }

  return normalized.replace(/\s+/gu, "");
}

function normalizedText(value) {
  return String(value ?? "")
    .replace(/\s+/gu, " ")
    .trim();
}

function scaleRect(rect, scale) {
  if (!rect) return null;
  return Object.fromEntries(Object.entries(rect).map(([key, value]) => [key, value / scale]));
}

function rectDelta(web, lynx) {
  if (!web || !lynx) return null;
  const delta = Object.fromEntries(
    ["x", "y", "width", "height"].map((key) => [key, Number((lynx[key] - web[key]).toFixed(2))]),
  );
  return {
    ...delta,
    maxAbs: Math.max(...Object.values(delta).map(Math.abs)),
  };
}

export function inferLynxCoordinateScale(web, lynx, deviceScaleFactor) {
  const webSidebar = web.anchors.sidebar?.rect?.width;
  const lynxSidebar = lynx.anchors.sidebar?.rect?.width;
  if (!webSidebar || !lynxSidebar) return 1;
  const candidates = [1, deviceScaleFactor].filter(
    (value, index, values) => value > 0 && values.indexOf(value) === index,
  );
  return candidates.sort(
    (left, right) =>
      Math.abs(lynxSidebar / left - webSidebar) - Math.abs(lynxSidebar / right - webSidebar),
  )[0];
}

export function compareVisualMeasurements({
  web,
  lynx,
  deviceScaleFactor,
  lynxCoordinateScale = inferLynxCoordinateScale(web, lynx, deviceScaleFactor),
  colorProperties = {},
}) {
  const anchors = Object.fromEntries(
    Object.keys(web.anchors).map((id) => {
      const webMeasurement = web.anchors[id];
      const lynxMeasurement = lynx.anchors[id];
      const normalizedLynxRect = scaleRect(lynxMeasurement?.rect, lynxCoordinateScale);
      const delta = rectDelta(webMeasurement?.rect, normalizedLynxRect);
      return [
        id,
        {
          web: webMeasurement?.rect ?? null,
          lynxRaw: lynxMeasurement?.rect ?? null,
          lynx: normalizedLynxRect,
          delta,
          pass: delta !== null && delta.maxAbs <= 8,
          text: {
            web: normalizedText(webMeasurement?.text),
            lynx: normalizedText(lynxMeasurement?.text),
            exact: normalizedText(webMeasurement?.text) === normalizedText(lynxMeasurement?.text),
          },
        },
      ];
    }),
  );

  const typography = Object.fromEntries(
    Object.keys(web.typography).map((id) => {
      const webMeasurement = web.typography[id];
      const lynxMeasurement = lynx.typography[id];
      const webSize = numberFromCss(webMeasurement?.style?.fontSize);
      const lynxSize = numberFromCss(lynxMeasurement?.style?.fontSize);
      const fontSizeDelta =
        webSize === null || lynxSize === null ? null : Number((lynxSize - webSize).toFixed(2));
      return [
        id,
        {
          web: webMeasurement?.style ?? null,
          lynx: lynxMeasurement?.style ?? null,
          fontSizeDelta,
          pass: fontSizeDelta !== null && Math.abs(fontSizeDelta) <= 2,
          text: {
            web: normalizedText(webMeasurement?.text),
            lynx: normalizedText(lynxMeasurement?.text),
            exact: normalizedText(webMeasurement?.text) === normalizedText(lynxMeasurement?.text),
          },
        },
      ];
    }),
  );

  const colors = Object.fromEntries(
    Object.keys(web.colors).map((id) => {
      const webStyle = web.colors[id]?.style;
      const lynxStyle = lynx.colors[id]?.style;
      const properties = colorProperties[id] ?? ["backgroundColor", "color"];
      const normalizedWeb = Object.fromEntries(
        properties.map((property) => [property, normalizeCssColor(webStyle?.[property])]),
      );
      const normalizedLynx = Object.fromEntries(
        properties.map((property) => [property, normalizeCssColor(lynxStyle?.[property])]),
      );
      return [
        id,
        {
          properties,
          web: Object.fromEntries(
            properties.map((property) => [property, webStyle?.[property] ?? null]),
          ),
          lynx: Object.fromEntries(
            properties.map((property) => [property, lynxStyle?.[property] ?? null]),
          ),
          normalized: {
            web: normalizedWeb,
            lynx: normalizedLynx,
          },
          exact: properties.every(
            (property) =>
              normalizedWeb[property] !== null &&
              normalizedWeb[property] === normalizedLynx[property],
          ),
        },
      ];
    }),
  );

  return {
    schemaVersion: 1,
    thresholds: {
      anchorMaxAbsPx: 8,
      correspondingFontSizeMaxAbsPx: 2,
    },
    coordinateSystem: {
      web: "logical CSS pixels",
      lynxRaw: "Lynx DevTool box-model units",
      lynxCoordinateScale,
      deviceScaleFactor,
    },
    anchors,
    typography,
    colors,
    summary: {
      anchorsPassing: Object.values(anchors).filter((entry) => entry.pass).length,
      anchorsTotal: Object.keys(anchors).length,
      typographyPassing: Object.values(typography).filter((entry) => entry.pass).length,
      typographyTotal: Object.keys(typography).length,
      exactAnchorText: Object.values(anchors).filter((entry) => entry.text.exact).length,
      exactAnchorTextTotal: Object.keys(anchors).length,
      exactColors: Object.values(colors).filter((entry) => entry.exact).length,
      exactColorsTotal: Object.keys(colors).length,
    },
    masks: [],
  };
}

const IS_MAIN_MODULE =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (IS_MAIN_MODULE) {
  const webPath = resolve(
    argumentValue("--web") ??
      (() => {
        throw new Error("--web is required");
      })(),
  );
  const lynxPath = resolve(
    argumentValue("--lynx") ??
      (() => {
        throw new Error("--lynx is required");
      })(),
  );
  const webCapturePath = resolve(
    argumentValue("--web-capture") ??
      (() => {
        throw new Error("--web-capture is required");
      })(),
  );
  const lynxCapturePath = resolve(
    argumentValue("--lynx-capture") ??
      (() => {
        throw new Error("--lynx-capture is required");
      })(),
  );
  const output = resolve(argumentValue("--output") ?? "metrics.json");
  const appRoot = resolve(argumentValue("--app-root") ?? process.cwd());
  const web = readJson(webPath);
  const lynx = readJson(lynxPath);
  const webCapture = readJson(webCapturePath);
  const lynxCapture = readJson(lynxCapturePath);
  const measurementSpecPath = argumentValue("--measurement-spec");
  const measurementSpec = measurementSpecPath ? readJson(resolve(measurementSpecPath)) : null;
  const colorProperties = Object.fromEntries(
    (measurementSpec?.colors ?? []).map((entry) => [
      entry.id,
      entry.properties ?? ["backgroundColor", "color"],
    ]),
  );
  const deviceScaleFactor =
    webCapture.viewport?.deviceScaleFactor ??
    webCapture.dimensions.width /
      (Number(argumentValue("--logical-width")) || webCapture.dimensions.width);
  const comparison = compareVisualMeasurements({
    web,
    lynx,
    deviceScaleFactor,
    colorProperties,
  });
  const metrics = {
    status: "measured",
    route: web.route,
    viewport: {
      logicalWidth:
        webCapture.viewport?.logicalWidth ?? webCapture.dimensions.width / deviceScaleFactor,
      logicalHeight:
        webCapture.viewport?.logicalHeight ?? webCapture.dimensions.height / deviceScaleFactor,
      deviceScaleFactor,
      imageWidth: webCapture.dimensions.width,
      imageHeight: webCapture.dimensions.height,
    },
    captures: {
      web: {
        file: webCapture.screenshot,
        sha256: sha256File(webCapture.screenshot),
        rendererErrors: webCapture.rendererErrors,
      },
      lynx: {
        file: lynxCapture.screenshot,
        sha256: sha256File(resolve(appRoot, lynxCapture.screenshot)),
        devToolConsoleErrors: lynxCapture.devToolConsoleErrors,
      },
    },
    ...comparison,
  };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(metrics, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ output, summary: metrics.summary }, null, 2)}\n`);
}
