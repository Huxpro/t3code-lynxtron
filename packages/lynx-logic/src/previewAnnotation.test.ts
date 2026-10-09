import { describe, expect, it } from "vite-plus/test";

import {
  extractTrailingPreviewAnnotation,
  extractTrailingPreviewAnnotations,
} from "./previewAnnotation";

const annotationBlock = (id: string, title: string) =>
  [
    "<preview_annotation>",
    "Preview annotation:",
    `Id: ${id}`,
    `Page: ${title}`,
    "Comment: Make these cards feel related.",
    "Targets: 1 marked region, 1 drawing.",
    "Requested visual changes:",
    "- border-radius: 4px → 16px",
    "The attached screenshot is the annotated preview crop.",
    "<element_context>",
    "- <Card>:",
    "</element_context>",
    "</preview_annotation>",
  ].join("\n");

describe("preview annotation presentation", () => {
  it("extracts card metadata without exposing its nested element context", () => {
    expect(
      extractTrailingPreviewAnnotation(`Fix this\n\n${annotationBlock("one", "Example")}`),
    ).toEqual({
      promptText: "Fix this",
      annotation: {
        id: "one",
        title: "Example",
        comment: "Make these cards feel related.",
        targetSummary: "1 marked region, 1 drawing.",
        styleChanges: ["border-radius: 4px → 16px"],
        hasScreenshot: true,
      },
    });
  });

  it("extracts multiple trailing cards in authored order", () => {
    const result = extractTrailingPreviewAnnotations(
      `Fix this\n\n${annotationBlock("one", "Example")}\n\n${annotationBlock("two", "Details")}`,
    );
    expect(result.promptText).toBe("Fix this");
    expect(result.annotations.map((annotation) => annotation.id)).toEqual(["one", "two"]);
  });

  it("preserves malformed or non-trailing payloads as authored text", () => {
    const value = `${annotationBlock("one", "Example")}\nMore text`;
    expect(extractTrailingPreviewAnnotations(value)).toEqual({
      promptText: value,
      annotations: [],
    });
  });
});
