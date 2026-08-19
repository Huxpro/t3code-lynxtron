import { describe, expect, it } from "vite-plus/test";

import {
  compactControlsContentHeight,
  compactControlsPanelHeight,
} from "./compactControlsMenuHeight.logic";

describe("compact controls menu height", () => {
  const sections = [
    { items: Array.from({ length: 7 }, (_, index) => ({ id: `reasoning-${index}` })) },
    { items: Array.from({ length: 2 }, (_, index) => ({ id: `context-${index}` })) },
  ];

  it("matches the rendered row and divider anatomy", () => {
    expect(compactControlsContentHeight(sections, true)).toBe(502);
    expect(compactControlsPanelHeight({ contentHeight: 502, viewportHeight: 820 })).toBe(504);
  });

  it("caps the panel at the short viewport and preserves scroll overflow", () => {
    expect(compactControlsPanelHeight({ contentHeight: 502, viewportHeight: 600 })).toBe(460);
  });

  it("omits Mode rows when the provider does not expose the toggle", () => {
    expect(compactControlsContentHeight(sections, false)).toBe(434);
  });
});
