import { describe, expect, it } from "vite-plus/test";

import {
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

  it("preserves supported grid declarations", () => {
    expect(unsupportedDeclaration("display", "grid")).toBe(false);
    expect(unsupportedDeclaration("grid-template-columns", "4ch 4ch")).toBe(false);
  });

  it("continues to reject unsupported declarations and values", () => {
    expect(unsupportedDeclaration("backdrop-filter", "blur(8px)")).toBe(true);
    expect(unsupportedDeclaration("color", "color-mix(in oklab, red 50%, blue)")).toBe(true);
  });
});
