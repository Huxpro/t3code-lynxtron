import { describe, expect, it } from "vite-plus/test";

import {
  formatReviewCommentFence,
  hasReviewCommentMessageSegments,
  parseReviewCommentMessageSegments,
  reviewCommentMessageVisibleText,
} from "./reviewComment";

describe("review comment message presentation", () => {
  it("parses a structured comment between visible text segments", () => {
    const segments = parseReviewCommentMessageSegments(
      [
        "Before",
        '<review_comment sectionId="turn:2" sectionTitle="Turn 2" filePath="src/app.ts" startIndex="3" endIndex="5" rangeLabel="+4 to +6">',
        "Please keep this compatible.",
        "```diff",
        "@@ -4,1 +4,1 @@",
        "-old",
        "+new",
        "```",
        "</review_comment>",
        "After",
      ].join("\n"),
    );

    expect(segments).toHaveLength(3);
    expect(segments[0]).toEqual(expect.objectContaining({ kind: "text", text: "Before\n" }));
    expect(segments[1]).toEqual({
      kind: "review-comment",
      comment: expect.objectContaining({
        sectionId: "turn:2",
        sectionTitle: "Turn 2",
        filePath: "src/app.ts",
        startIndex: 3,
        endIndex: 5,
        rangeLabel: "+4 to +6",
        text: "Please keep this compatible.",
        diff: "@@ -4,1 +4,1 @@\n-old\n+new",
        fenceLanguage: "diff",
      }),
    });
    expect(segments[2]).toEqual(expect.objectContaining({ kind: "text", text: "\nAfter" }));
    expect(
      reviewCommentMessageVisibleText(
        [
          "Before",
          '<review_comment sectionId="s" sectionTitle="Turn 2" filePath="src/app.ts" startIndex="0" endIndex="0" rangeLabel="+1">',
          "Check it.",
          "```diff",
          "+new",
          "```",
          "</review_comment>",
          "After",
        ].join("\n"),
      ),
    ).toBe("Before\nsrc/app.ts · Turn 2 · +1\nCheck it.\n+new\nAfter");
  });

  it("keeps malformed blocks as visible text", () => {
    const value = [
      '<review_comment sectionId="turn:2" filePath="src/app.ts" startIndex="nope" endIndex="1">',
      "Still visible",
      "</review_comment>",
    ].join("\n");

    expect(parseReviewCommentMessageSegments(value)).toEqual([
      expect.objectContaining({ kind: "text", text: value }),
    ]);
    expect(hasReviewCommentMessageSegments(value)).toBe(false);
  });

  it("unescapes serialized attribute values and normalizes reversed indexes", () => {
    const [segment] = parseReviewCommentMessageSegments(
      [
        '<review_comment sectionId="file:src/a&amp;b.ts" sectionTitle="Changes &quot;now&quot; &gt; later" filePath="src/a&amp;b.ts" startIndex="9" endIndex="4" rangeLabel="L5 &lt; L10">',
        "Review this.",
        "</review_comment>",
      ].join("\n"),
    );

    expect(segment).toEqual({
      kind: "review-comment",
      comment: expect.objectContaining({
        sectionId: "file:src/a&b.ts",
        sectionTitle: 'Changes "now" > later',
        filePath: "src/a&b.ts",
        startIndex: 4,
        endIndex: 9,
        rangeLabel: "L5 < L10",
        text: "Review this.",
        diff: "",
        fenceLanguage: "diff",
      }),
    });
  });

  it("uses the final fenced block as context and preserves earlier fences in the comment", () => {
    const [segment] = parseReviewCommentMessageSegments(
      [
        '<review_comment sectionId="turn:3" filePath="docs/example.md" startIndex="0" endIndex="0">',
        "Try this:",
        "```ts",
        "const value = 1;",
        "```",
        "Then compare:",
        "````md",
        "# Example",
        "```ts",
        "const nested = true;",
        "```",
        "````",
        "</review_comment>",
      ].join("\n"),
    );

    expect(segment).toEqual({
      kind: "review-comment",
      comment: expect.objectContaining({
        text: "Try this:\n```ts\nconst value = 1;\n```\nThen compare:",
        diff: "# Example\n```ts\nconst nested = true;\n```",
        fenceLanguage: "md",
      }),
    });
    expect(formatReviewCommentFence("md", "# Example\n```ts\nvalue\n```")).toBe(
      "````md\n# Example\n```ts\nvalue\n```\n````",
    );
  });
});
