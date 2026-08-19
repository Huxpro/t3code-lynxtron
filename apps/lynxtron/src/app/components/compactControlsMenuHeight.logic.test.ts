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
    expect(compactControlsContentHeight(sections, true)).toBe(563);
    expect(compactControlsPanelHeight({ contentHeight: 563, viewportHeight: 820 })).toBe(565);
  });

  it("caps the panel at the short viewport and preserves scroll overflow", () => {
    expect(compactControlsPanelHeight({ contentHeight: 563, viewportHeight: 600 })).toBe(497);
  });

  it("omits Mode rows when the provider does not expose the toggle", () => {
    expect(compactControlsContentHeight(sections, false)).toBe(470);
  });
});
