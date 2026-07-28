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
  "grid-template-columns",
  "grid-template-rows",
  "overflow-anchor",
  "scrollbar-gutter",
  "scrollbar-width",
  "touch-action",
]);

const UNSUPPORTED_VALUE = /--alpha\(|--spacing\(|color-mix\(/;

function comesFromTailwindEntry(node) {
  return node.source?.input.file?.endsWith("/src/app/tailwind.css") ?? false;
}

function hasUnsupportedPseudoSelector(selector) {
  // Escaped colons belong to the generated utility class name. Any remaining
  // colon introduces a pseudo selector, which the current Lynx CSS encoder
  // rejects (R6).
  return selector.replace(/\\./g, "").includes(":");
}

export function lynxTailwindCompatibility() {
  let removedDeclarations = 0;
  let removedSelectors = 0;
  const removedDeclarationDetails = new Map();
  const removedSelectorDetails = new Set();

  return {
    postcssPlugin: "t3code-lynx-tailwind-compatibility",
    Once() {
      removedDeclarations = 0;
      removedSelectors = 0;
      removedDeclarationDetails.clear();
      removedSelectorDetails.clear();
    },
    Rule(rule) {
      if (!comesFromTailwindEntry(rule)) return;

      const selectors = rule.selectors;
      if (!selectors) return;

      const supported = selectors.filter((selector) => {
        const remove = hasUnsupportedPseudoSelector(selector);
        if (remove) {
          removedSelectors += 1;
          removedSelectorDetails.add(selector);
        }
        return !remove;
      });

      if (supported.length === 0) {
        rule.remove();
      } else if (supported.length !== selectors.length) {
        rule.selectors = supported;
      }
    },
    Declaration(declaration) {
      if (!comesFromTailwindEntry(declaration)) return;

      const unsupportedDisplay =
        declaration.prop === "display" && declaration.value.trim().toLowerCase() === "grid";
      if (
        unsupportedDisplay ||
        UNSUPPORTED_PROPERTIES.has(declaration.prop) ||
        UNSUPPORTED_VALUE.test(declaration.value)
      ) {
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
