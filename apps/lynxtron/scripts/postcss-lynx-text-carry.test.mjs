import { describe, expect, it } from "vite-plus/test";

import { carriedDeclaration } from "./postcss-lynx-text-carry.mjs";

describe("carriedDeclaration", () => {
  it("states font weight and white-space as custom properties", () => {
    expect(carriedDeclaration("font-weight", "500")).toEqual({
      prop: "--lynx-text-font-weight",
      value: "500",
    });
    expect(carriedDeclaration("white-space", "nowrap")).toEqual({
      prop: "--lynx-text-white-space",
      value: "nowrap",
    });
  });

  it("carries a value that is itself a variable", () => {
    expect(carriedDeclaration("font-weight", "var(--title-weight)")).toEqual({
      prop: "--lynx-text-font-weight",
      value: "var(--title-weight)",
    });
  });

  it("leaves other properties, inherit, and the rule that reads the value back", () => {
    expect(carriedDeclaration("color", "red")).toBeNull();
    expect(carriedDeclaration("font-size", "12px")).toBeNull();
    expect(carriedDeclaration("text-overflow", "ellipsis")).toBeNull();
    expect(carriedDeclaration("font-weight", "inherit")).toBeNull();
    expect(carriedDeclaration("font-weight", "var(--lynx-text-font-weight)")).toBeNull();
  });
});
