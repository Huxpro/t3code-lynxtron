import { describe, expect, it } from "vite-plus/test";

import {
  declarationReplacement,
  normalizeSupportedSelector,
  unsupportedDeclaration,
  unsupportedPseudoSelectors,
} from "./postcss-lynx-tailwind-compat.mjs";

describe("Lynx Tailwind compatibility", () => {
  it("preserves CSS Selector NG pseudo selectors", () => {
    expect(unsupportedPseudoSelectors(".active\\:bg:active")).toEqual([]);
    expect(unsupportedPseudoSelectors(".item:not(.disabled)")).toEqual([]);
    expect(unsupportedPseudoSelectors(":root")).toEqual([]);
    expect(unsupportedPseudoSelectors(".label::selection")).toEqual([]);
  });

  it("continues to classify pseudo selectors that need state adapters", () => {
    expect(unsupportedPseudoSelectors(".button:hover")).toEqual([":hover"]);
    expect(unsupportedPseudoSelectors(".button:focus-visible")).toEqual([":focus-visible"]);
  });

  it("rewrites supported state and theme selectors to Lynx-safe equivalents", () => {
    expect(normalizeSupportedSelector(".disabled\\:opacity-50:disabled")).toEqual({
      selector: ".disabled\\:opacity-50[disabled]",
      transformations: ["disabled-to-attribute"],
    });
    expect(normalizeSupportedSelector(".dark\\:text-red-400:is(.dark *)")).toEqual({
      selector: ".dark .dark\\:text-red-400",
      transformations: ["dark-is-to-descendant"],
    });
  });

  it("keeps selector rewrites observable when selector counts do not change", () => {
    const original = [".dark\\:text-red-400:is(.dark *)"];
    const normalized = original.map((selector) => normalizeSupportedSelector(selector).selector);
    expect(normalized).toHaveLength(original.length);
    expect(normalized).not.toEqual(original);
  });

  it("preserves supported grid declarations", () => {
    expect(unsupportedDeclaration("display", "grid")).toBe(false);
    expect(unsupportedDeclaration("grid-template-columns", "4ch 4ch")).toBe(false);
  });

  it("continues to reject unsupported declarations and values", () => {
    expect(unsupportedDeclaration("backdrop-filter", "blur(8px)")).toBe(true);
    expect(unsupportedDeclaration("color", "color-mix(in oklab, red 50%, blue)")).toBe(true);
  });

  it("provides Lynx-safe replacements for equivalent declarations", () => {
    expect(declarationReplacement("inset", "4px 8px")).toEqual([
      { prop: "top", value: "4px" },
      { prop: "right", value: "8px" },
      { prop: "bottom", value: "4px" },
      { prop: "left", value: "8px" },
    ]);
    expect(declarationReplacement("overflow-wrap", "anywhere")).toEqual([
      { prop: "word-break", value: "break-all" },
    ]);
  });
});
