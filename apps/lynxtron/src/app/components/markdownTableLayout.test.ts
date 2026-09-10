import { describe, expect, it } from "vite-plus/test";

import { markdownTableContentWidth } from "./markdownTableLayout";

describe("markdownTableContentWidth", () => {
  it("keeps compact tables readable without forcing overflow", () => {
    expect(markdownTableContentWidth(1)).toBe(320);
    expect(markdownTableContentWidth(2)).toBe(320);
  });

  it("allocates a stable minimum width per wide-table column", () => {
    expect(markdownTableContentWidth(3)).toBe(396);
    expect(markdownTableContentWidth(6)).toBe(792);
  });
});
