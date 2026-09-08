import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = path.join(appRoot, "reports/tailwind-v3-compat.json");
let lastReportedFingerprint = "";
const reportsByInput = new Map();

const UNSUPPORTED_PROPERTIES = new Set([
  "-moz-appearance",
  "-ms-overflow-style",
  "-webkit-app-region",
  "-webkit-appearance",
  "-webkit-backdrop-filter",
  "appearance",
  "backdrop-filter",
  "contain-intrinsic-size",
  "content-visibility",
  "grid-column",
  "grid-column-end",
  "grid-column-start",
  "grid-row",
  "grid-row-end",
  "grid-row-start",
  "font-variant-numeric",
  "overflow-anchor",
  "overflow-wrap",
  "scrollbar-gutter",
  "scrollbar-width",
  "tab-size",
  "text-transform",
  "touch-action",
  "user-select",
]);

const UNSUPPORTED_VALUE = /--alpha\(|--spacing\(|color-mix\(/;

export function unsupportedDeclaration(property, value) {
  return UNSUPPORTED_PROPERTIES.has(property) || UNSUPPORTED_VALUE.test(value);
}

export function declarationReplacement(property, value) {
  if (property === "inset") {
    const values = value.trim().split(/\s+/u);
    if (values.length < 1 || values.length > 4) return null;
    const [top, second = top, third = top, fourth = second] = values;
    const right = second;
    const bottom = third;
    const left = values.length === 1 ? top : values.length === 2 ? second : fourth;
    return [
      { prop: "top", value: top },
      { prop: "right", value: right },
      { prop: "bottom", value: bottom },
      { prop: "left", value: left },
    ];
  }
  if (property === "overflow-wrap" && /^(?:anywhere|break-word)$/u.test(value.trim())) {
    return [{ prop: "word-break", value: "break-all" }];
  }
  return null;
}

function comesFromTailwindEntry(node) {
  return node.source?.input.file?.endsWith("/src/app/tailwind.css") ?? false;
}

const SUPPORTED_PSEUDO_SELECTORS = new Set([":active", ":not", ":root", "::selection"]);
const RETAINED_SUPPORTED_PROPERTIES = new Set([
  "display",
  "grid-template-columns",
  "grid-template-rows",
]);

function pseudoSelectors(selector) {
  const syntaxOnly = selector.replace(/\\./g, "");
  return [...syntaxOnly.matchAll(/::?[a-z-]+/giu)].map(([pseudo]) => pseudo.toLowerCase());
}

export function normalizeSupportedSelector(selector) {
  let normalized = selector;
  const transformations = [];

  if (normalized.includes(":disabled")) {
    normalized = normalized.replace(/(?<!\\):disabled\b/gu, "[disabled]");
    transformations.push("disabled-to-attribute");
  }

  if (normalized.includes(":hover") && !normalized.includes("::")) {
    normalized = normalized.replace(/(?<!\\):hover\b/gu, '[data-lynx-hover="true"]');
    transformations.push("hover-to-state-attribute");
  }

  if (/((?<!\\):focus)(?!-visible|-within)\b/u.test(normalized)) {
    normalized = normalized.replace(
      /(?<!\\):focus(?!-visible|-within)\b/gu,
      '[data-lynx-focus="true"]',
    );
    transformations.push("focus-to-state-attribute");
  }

  if (normalized.includes(":focus-visible")) {
    normalized = normalized.replace(/(?<!\\):focus-visible\b/gu, '[data-lynx-focus="true"]');
    transformations.push("focus-visible-to-state-attribute");
  }

  const darkVariant = /^(.*):is\(\.dark \*\)$/u.exec(normalized);
  if (darkVariant?.[1]) {
    normalized = `.dark ${darkVariant[1]}`;
    transformations.push("dark-is-to-descendant");
  }

  return { selector: normalized, transformations };
}

export function unsupportedPseudoSelectors(selector) {
  // Remove escaped class-name characters before inspecting selector syntax.
  // Lynx CSS Selector NG supports :active, :not(), :root and ::selection; the
  // old blanket colon check incorrectly discarded those standard selectors.
  return pseudoSelectors(selector).filter((pseudo) => !SUPPORTED_PSEUDO_SELECTORS.has(pseudo));
}

export function lynxTailwindCompatibility() {
  let removedDeclarations = 0;
  let removedSelectors = 0;
  const removedDeclarationDetails = new Map();
  const removedSelectorDetails = new Set();
  const retainedDeclarationDetails = new Map();
  const retainedSelectorDetails = new Set();
  const transformedSelectorDetails = new Map();
  const transformedDeclarationDetails = new Map();

  return {
    postcssPlugin: "t3code-lynx-tailwind-compatibility",
    Once() {
      removedDeclarations = 0;
      removedSelectors = 0;
      removedDeclarationDetails.clear();
      removedSelectorDetails.clear();
      retainedDeclarationDetails.clear();
      retainedSelectorDetails.clear();
      transformedSelectorDetails.clear();
      transformedDeclarationDetails.clear();
    },
    Rule(rule) {
      if (!comesFromTailwindEntry(rule)) return;

      const selectors = rule.selectors;
      if (!selectors) return;

      const supported = selectors.flatMap((originalSelector) => {
        const { selector, transformations } = normalizeSupportedSelector(originalSelector);
        const pseudos = pseudoSelectors(selector);
        const remove = pseudos.some((pseudo) => !SUPPORTED_PSEUDO_SELECTORS.has(pseudo));
        if (remove) {
          removedSelectors += 1;
          removedSelectorDetails.add(originalSelector);
        } else if (pseudos.length > 0) {
          retainedSelectorDetails.add(selector);
        }
        if (!remove && transformations.length > 0) {
          transformedSelectorDetails.set(originalSelector, {
            from: originalSelector,
            to: selector,
            transformations,
          });
        }
        return remove ? [] : [selector];
      });

      if (supported.length === 0) {
        rule.remove();
      } else if (
        supported.length !== selectors.length ||
        supported.some((selector, index) => selector !== selectors[index])
      ) {
        rule.selectors = supported;
      }
    },
    Declaration(declaration) {
      const replacement = declarationReplacement(declaration.prop, declaration.value);
      if (replacement) {
        const selector = declaration.parent?.selector ?? null;
        for (const next of replacement) {
          const siblingExists = declaration.parent?.nodes?.some(
            (node) => node !== declaration && node.type === "decl" && node.prop === next.prop,
          );
          if (!siblingExists) declaration.cloneBefore(next);
        }
        const key = JSON.stringify({
          property: declaration.prop,
          value: declaration.value,
          selector,
        });
        transformedDeclarationDetails.set(key, {
          property: declaration.prop,
          value: declaration.value,
          selector,
          replacements: replacement,
        });
        declaration.remove();
        return;
      }

      if (!comesFromTailwindEntry(declaration) && !UNSUPPORTED_PROPERTIES.has(declaration.prop)) {
        return;
      }

      if (unsupportedDeclaration(declaration.prop, declaration.value)) {
        removedDeclarations += 1;
        const selector = declaration.parent?.selector ?? null;
        const key = JSON.stringify({
          property: declaration.prop,
          value: declaration.value,
          selector,
        });
        removedDeclarationDetails.set(key, {
          property: declaration.prop,
          value: declaration.value,
          selector,
        });
        declaration.remove();
      } else if (
        RETAINED_SUPPORTED_PROPERTIES.has(declaration.prop) &&
        (declaration.prop !== "display" || declaration.value.trim().toLowerCase() === "grid")
      ) {
        const selector = declaration.parent?.selector ?? null;
        const key = JSON.stringify({
          property: declaration.prop,
          value: declaration.value,
          selector,
        });
        retainedDeclarationDetails.set(key, {
          property: declaration.prop,
          value: declaration.value,
          selector,
        });
      }
    },
    OnceExit(root) {
      const input = root.source?.input.file
        ? path.relative(appRoot, root.source.input.file)
        : "unknown";
      reportsByInput.set(input, {
        removedSelectors: [...removedSelectorDetails],
        removedDeclarations: [...removedDeclarationDetails.values()],
        retainedSupportedSelectors: [...retainedSelectorDetails],
        retainedSupportedDeclarations: [...retainedDeclarationDetails.values()],
        transformedSelectors: [...transformedSelectorDetails.values()],
        transformedDeclarations: [...transformedDeclarationDetails.values()],
      });
      const uniqueStrings = (key) =>
        [...new Set([...reportsByInput.values()].flatMap((entry) => entry[key]))].sort();
      const uniqueObjects = (key, identity) =>
        [
          ...new Map(
            [...reportsByInput.values()]
              .flatMap((entry) => entry[key])
              .map((entry) => [identity(entry), entry]),
          ).values(),
        ].sort((left, right) => identity(left).localeCompare(identity(right)));
      const allRemovedSelectors = uniqueStrings("removedSelectors");
      const allRetainedSelectors = uniqueStrings("retainedSupportedSelectors");
      const allRemovedDeclarations = uniqueObjects(
        "removedDeclarations",
        (entry) => `${entry.property}\u0000${entry.value}\u0000${entry.selector ?? ""}`,
      );
      const allRetainedDeclarations = uniqueObjects(
        "retainedSupportedDeclarations",
        (entry) => `${entry.property}\u0000${entry.value}\u0000${entry.selector ?? ""}`,
      );
      const allTransformedSelectors = uniqueObjects("transformedSelectors", (entry) => entry.from);
      const allTransformedDeclarations = uniqueObjects(
        "transformedDeclarations",
        (entry) => `${entry.property}\u0000${entry.value}\u0000${entry.selector ?? ""}`,
      );
      const report = {
        source: "apps/lynxtron/src/app/tailwind.css",
        pipeline: {
          tailwind: "v3",
          postcss: true,
          preset: "@lynx-js/tailwind-preset",
        },
        compatibilityItems: ["R6", "R7", "R9"],
        processedInputs: [...reportsByInput.keys()].sort(),
        removedSelectorCount: allRemovedSelectors.length,
        removedDeclarationCount: allRemovedDeclarations.length,
        retainedSupportedSelectorCount: allRetainedSelectors.length,
        retainedSupportedDeclarationCount: allRetainedDeclarations.length,
        transformedSelectorCount: allTransformedSelectors.length,
        transformedDeclarationCount: allTransformedDeclarations.length,
        transformedSelectors: allTransformedSelectors,
        transformedDeclarations: allTransformedDeclarations,
        retainedSupportedSelectors: allRetainedSelectors,
        retainedSupportedDeclarations: allRetainedDeclarations,
        removedSelectors: allRemovedSelectors,
        removedDeclarations: allRemovedDeclarations,
      };
      const serialized = `${JSON.stringify(report, null, 2)}\n`;
      if (serialized === lastReportedFingerprint) {
        return;
      }
      lastReportedFingerprint = serialized;
      mkdirSync(path.dirname(reportPath), { recursive: true });
      writeFileSync(reportPath, serialized);
      console.info(
        `[lynx-tailwind-compat] across ${reportsByInput.size} inputs removed ${allRemovedSelectors.length} unsupported selectors and ${allRemovedDeclarations.length} unsupported declarations (R6/R7/R9)`,
      );
    },
  };
}
