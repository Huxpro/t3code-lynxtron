import { describe, expect, it } from "vite-plus/test";

import { isComposerSelectAllKey } from "./composerSelection.logic";

describe("isComposerSelectAllKey", () => {
  it("accepts macOS Command+A and cross-platform Control+A", () => {
    expect(isComposerSelectAllKey({ key: "a", metaKey: true, ctrlKey: false })).toBe(true);
    expect(isComposerSelectAllKey({ key: "A", metaKey: false, ctrlKey: true })).toBe(true);
  });

  it("does not consume unmodified text or unrelated shortcuts", () => {
    expect(isComposerSelectAllKey({ key: "a", metaKey: false, ctrlKey: false })).toBe(false);
    expect(isComposerSelectAllKey({ key: "k", metaKey: true, ctrlKey: false })).toBe(false);
  });
});
