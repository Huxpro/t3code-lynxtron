import { describe, expect, it } from "vite-plus/test";

import { deriveVisibleUserMessage } from "./userMessage.ts";

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
    });
  });

  it("does not strip context-looking text that is not a trailing complete block", () => {
    const prompt = "Explain <terminal_context> literally";
    expect(deriveVisibleUserMessage(prompt)).toEqual({ visibleText: prompt, copyText: prompt });
  });
});
