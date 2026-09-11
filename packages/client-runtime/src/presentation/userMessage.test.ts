import { describe, expect, it } from "vite-plus/test";

import { deriveVisibleUserMessage, shouldCollapseUserMessage } from "./userMessage.ts";

describe("deriveVisibleUserMessage", () => {
  it("strips trailing terminal then element context from visible text", () => {
    const prompt = [
      "Inspect this",
      "",
      "<terminal_context>",
      "- Terminal line 1:",
      "  1 | ready",
      "</terminal_context>",
      "",
      "<element_context>",
      "- button #save",
      "</element_context>",
    ].join("\n");
    expect(deriveVisibleUserMessage(prompt)).toEqual({
      visibleText: "Inspect this",
      copyText: prompt,
      contextKinds: ["terminal", "element"],
    });
  });

  it("does not strip context-looking text that is not a trailing complete block", () => {
    const prompt = "Explain <terminal_context> literally";
    expect(deriveVisibleUserMessage(prompt)).toEqual({
      visibleText: prompt,
      copyText: prompt,
      contextKinds: [],
    });
  });
});

describe("shouldCollapseUserMessage", () => {
  it("matches the shared length and line thresholds", () => {
    expect(shouldCollapseUserMessage("short message")).toBe(false);
    expect(shouldCollapseUserMessage("x".repeat(600))).toBe(false);
    expect(shouldCollapseUserMessage("x".repeat(601))).toBe(true);
    expect(shouldCollapseUserMessage(Array.from({ length: 8 }, () => "line").join("\n"))).toBe(
      false,
    );
    expect(shouldCollapseUserMessage(Array.from({ length: 9 }, () => "line").join("\n"))).toBe(
      true,
    );
  });
});
