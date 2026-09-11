import { describe, expect, it } from "vite-plus/test";

import {
  deriveUserMessageSemanticText,
  deriveVisibleUserMessage,
  shouldCollapseUserMessage,
} from "./userMessage.ts";

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

  it("projects preview and review payloads into navigation-safe visible text", () => {
    const prompt = [
      "Inspect this",
      "",
      '<review_comment sectionId="turn:2" sectionTitle="Turn 2" filePath="src/app.ts" startIndex="0" endIndex="0" rangeLabel="+1">',
      "Keep this compatible.",
      "```diff",
      "+new",
      "```",
      "</review_comment>",
      "",
      "<preview_annotation>",
      "Preview annotation:",
      "Id: one",
      "Page: Example",
      "Comment: Tighten the spacing.",
      "Targets: 1 selected element.",
      "<element_context>",
      "- <Card>:",
      "</element_context>",
      "</preview_annotation>",
      "",
      "<terminal_context>",
      "- Terminal line 1:",
      "  1 | secret output",
      "</terminal_context>",
    ].join("\n");

    const visible = deriveUserMessageSemanticText(prompt);
    expect(visible).toContain("Inspect this");
    expect(visible).toContain("src/app.ts · Turn 2 · +1");
    expect(visible).toContain("Keep this compatible.");
    expect(visible).not.toContain("preview_annotation");
    expect(visible).not.toContain("element_context");
    expect(visible).not.toContain("terminal_context");
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
