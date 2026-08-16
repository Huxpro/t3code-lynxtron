import { describe, expect, it } from "vite-plus/test";

import { getComposerModelOptionLetterSpacing } from "./composerModelOptionTracking.logic";

describe("Composer model-option tracking", () => {
  it("leaves single-trait labels unchanged", () => {
    expect(getComposerModelOptionLetterSpacing("High")).toBeUndefined();
  });

  it("distributes one separator correction across the complete label", () => {
    expect(getComposerModelOptionLetterSpacing("High · 1M")).toBe("-0.56px");
    expect(getComposerModelOptionLetterSpacing("High · Thinking On")).toBe("-0.28px");
  });

  it("scales the correction for multiple separators", () => {
    expect(getComposerModelOptionLetterSpacing("High · 1M · Thinking On")).toBe("-0.44px");
  });
});
