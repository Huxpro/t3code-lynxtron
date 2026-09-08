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

  it("rewrites supported state and theme selectors to Lynx-safe equivalents", () => {
    expect(normalizeSupportedSelector(".disabled\\:opacity-50:disabled")).toEqual({
      selector: ".disabled\\:opacity-50[disabled]",
      transformations: ["disabled-to-attribute"],
    });
    expect(normalizeSupportedSelector(".dark\\:text-red-400:is(.dark *)")).toEqual({
      selector: ".dark .dark\\:text-red-400",
      transformations: ["dark-is-to-descendant"],
    });
    expect(normalizeSupportedSelector(".group:hover .group-hover\\:opacity-100")).toEqual({
      selector: '.group[data-lynx-hover="true"] .group-hover\\:opacity-100',
      transformations: ["hover-to-state-attribute"],
    });
    expect(normalizeSupportedSelector(".focus\\:opacity-100:focus")).toEqual({
      selector: '.focus\\:opacity-100[data-lynx-focus="true"]',
      transformations: ["focus-to-state-attribute"],
    });
    expect(normalizeSupportedSelector(".focus-visible\\:ring-1:focus-visible")).toEqual({
      selector: '.focus-visible\\:ring-1[data-lynx-focus="true"]',
      transformations: ["focus-visible-to-state-attribute"],
    });
    expect(normalizeSupportedSelector(".focus-within\\:opacity-100:focus-within")).toEqual({
      selector: ".focus-within\\:opacity-100:focus-within",
      transformations: [],
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
    expect(declarationReplacement("user-select", "none")).toEqual([]);
    expect(declarationReplacement("font-variant-numeric", "tabular-nums")).toEqual([
      { prop: "font-feature-settings", value: '"tnum"' },
    ]);
    expect(
      declarationReplacement("--skeleton-highlight", "var(--alpha(var(--color-white)/64%))"),
    ).toEqual([{ prop: "--skeleton-highlight", value: "rgba(255, 255, 255, 0.64)" }]);
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
