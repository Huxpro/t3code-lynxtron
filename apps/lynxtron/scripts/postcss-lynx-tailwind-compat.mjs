import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = path.join(appRoot, "reports/tailwind-v3-compat.json");
let lastReportedFingerprint = "";

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
  "overflow-anchor",
  "scrollbar-gutter",
  "scrollbar-width",
  "touch-action",
]);

const UNSUPPORTED_VALUE = /--alpha\(|--spacing\(|color-mix\(/;

export function unsupportedDeclaration(property, value) {
  return UNSUPPORTED_PROPERTIES.has(property) || UNSUPPORTED_VALUE.test(value);
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
      if (!comesFromTailwindEntry(declaration)) return;

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
    OnceExit() {
      if (removedSelectors === 0 && removedDeclarations === 0) {
        return;
      }
      const report = {
        source: "apps/lynxtron/src/app/tailwind.css",
        pipeline: {
          tailwind: "v3",
          postcss: true,
          preset: "@lynx-js/tailwind-preset",
        },
        compatibilityItems: ["R6", "R7", "R9"],
        removedSelectorCount: removedSelectors,
        removedDeclarationCount: removedDeclarations,
        retainedSupportedSelectorCount: retainedSelectorDetails.size,
        retainedSupportedDeclarationCount: retainedDeclarationDetails.size,
        transformedSelectorCount: transformedSelectorDetails.size,
        transformedSelectors: [...transformedSelectorDetails.values()].sort((left, right) =>
          left.from.localeCompare(right.from),
        ),
        retainedSupportedSelectors: [...retainedSelectorDetails].sort(),
        retainedSupportedDeclarations: [...retainedDeclarationDetails.values()].sort(
          (left, right) =>
            `${left.property}\u0000${left.value}\u0000${left.selector ?? ""}`.localeCompare(
              `${right.property}\u0000${right.value}\u0000${right.selector ?? ""}`,
            ),
        ),
        removedSelectors: [...removedSelectorDetails].sort(),
        removedDeclarations: [...removedDeclarationDetails.values()].sort((left, right) =>
          `${left.property}\u0000${left.value}\u0000${left.selector ?? ""}`.localeCompare(
            `${right.property}\u0000${right.value}\u0000${right.selector ?? ""}`,
          ),
        ),
      };
      const serialized = `${JSON.stringify(report, null, 2)}\n`;
      if (serialized === lastReportedFingerprint) {
        return;
      }
      lastReportedFingerprint = serialized;
      mkdirSync(path.dirname(reportPath), { recursive: true });
      writeFileSync(reportPath, serialized);
      console.info(
        `[lynx-tailwind-compat] removed ${removedSelectors} unsupported selectors and ${removedDeclarations} unsupported declarations (R6/R7/R9)`,
      );
    },
  };
}
