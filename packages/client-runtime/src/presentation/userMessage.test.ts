import { describe, expect, it } from "vite-plus/test";

import {
  deriveUserMessageSemanticText,
  deriveUserMessagePresentation,
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
    expect(deriveUserMessagePresentation(prompt)).toEqual(
      expect.objectContaining({
        visibleText: expect.stringContaining("<review_comment"),
        semanticText: visible,
        copyText: prompt,
        contextKinds: ["terminal"],
        terminalContexts: [{ header: "Terminal line 1", body: "1 | secret output" }],
        elementContexts: [],
        previewAnnotations: [expect.objectContaining({ id: "one", title: "Example" })],
      }),
    );
  });

  it("parses terminal and element entries around preview annotations", () => {
    const presentation = deriveUserMessagePresentation(
      [
        "Fix this",
        "",
        "<terminal_context>",
        "- Terminal 1 lines 2-3:",
        "  2 | npm test",
        "  3 | passed",
        "</terminal_context>",
        "",
        "<element_context>",
        "- <SaveButton> (Button.tsx:12):",
        "  selector: button.save",
        "</element_context>",
      ].join("\n"),
    );
    expect(presentation.visibleText).toBe("Fix this");
    expect(presentation.contextKinds).toEqual(["terminal", "element"]);
    expect(presentation.terminalContexts).toEqual([
      { header: "Terminal 1 lines 2-3", body: "2 | npm test\n3 | passed" },
    ]);
    expect(presentation.elementContexts).toEqual([
      { header: "<SaveButton> (Button.tsx:12)", body: "selector: button.save" },
    ]);
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
