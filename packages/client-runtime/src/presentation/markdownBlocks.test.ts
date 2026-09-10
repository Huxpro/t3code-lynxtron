import { describe, expect, it } from "vite-plus/test";

import { parseMarkdownBlocks, shouldRenderBlockMarkdown } from "./markdownBlocks.ts";

describe("parseMarkdownBlocks", () => {
  it("preserves fenced-code language, title, and content", () => {
    expect(
      parseMarkdownBlocks(
        'Updated the helper:\n\n```ts title="src/helper.ts"\nexport const answer = 42;\n```\n\nDone.',
      ),
    ).toEqual([
      { type: "paragraph", text: "Updated the helper:" },
      { type: "empty" },
      {
        type: "code",
        language: "ts",
        title: "src/helper.ts",
        code: "export const answer = 42;",
      },
      { type: "empty" },
      { type: "paragraph", text: "Done." },
    ]);
  });

  it("keeps second-response prose, lists, and code in source order", () => {
    expect(
      parseMarkdownBlocks("Follow-up result:\n\n- first\n- second\n\n```bash\npnpm test\n```").map(
        (block) => block.type,
      ),
    ).toEqual(["paragraph", "empty", "list", "empty", "code"]);
  });

  it("covers the block formats rendered by the Original transcript", () => {
    const blocks = parseMarkdownBlocks(
      [
        "# Heading",
        "",
        "Paragraph with **bold**, _italic_, `inline code`, and [a link](https://example.com).",
        "",
        "> quoted",
        "> text",
        "",
        "- unordered",
        "1. ordered",
        "- [x] checked",
        "",
        "| Name | Value |",
        "| :--- | ---: |",
        "| one | 1 |",
        "",
        "---",
      ].join("\n"),
    );

    expect(blocks.map((block) => block.type)).toEqual([
      "heading",
      "empty",
      "paragraph",
      "empty",
      "blockquote",
      "empty",
      "list",
      "empty",
      "table",
      "empty",
      "hr",
    ]);
    expect(blocks[0]).toMatchObject({ level: 1, text: "Heading" });
    expect(blocks[2]).toMatchObject({
      text: "Paragraph with **bold**, _italic_, `inline code`, and [a link](https://example.com).",
    });
    expect(blocks[4]).toMatchObject({ quoteDepth: 1, text: "quoted\ntext" });
    expect(blocks[6]?.items).toEqual([
      expect.objectContaining({ kind: "unordered", content: "unordered" }),
      expect.objectContaining({ kind: "ordered", ordinal: 1, content: "ordered" }),
      expect.objectContaining({ taskChecked: true, content: "checked" }),
    ]);
    expect(blocks[8]?.table).toMatchObject({
      headers: ["Name", "Value"],
      alignments: ["left", "right"],
      rows: [["one", "1"]],
    });
  });

  it("preserves nested blockquote depth as separate blocks", () => {
    expect(parseMarkdownBlocks("> outer\n>> nested\n>> still nested\n> outer again")).toEqual([
      { type: "blockquote", text: "outer", quoteDepth: 1 },
      { type: "blockquote", text: "nested\nstill nested", quoteDepth: 2 },
      { type: "blockquote", text: "outer again", quoteDepth: 1 },
    ]);
  });

  it("supports tilde fenced code with metadata", () => {
    expect(
      parseMarkdownBlocks('~~~tsx title="src/App.tsx"\nexport function App() {}\n~~~'),
    ).toEqual([
      {
        type: "code",
        language: "tsx",
        title: "src/App.tsx",
        code: "export function App() {}",
      },
    ]);
  });

  it("uses the opening fence character and length when finding the closing fence", () => {
    expect(
      parseMarkdownBlocks(
        ["````md", "A literal shorter fence follows:", "```", "still code", "````"].join("\n"),
      ),
    ).toEqual([
      {
        type: "code",
        language: "md",
        title: undefined,
        code: "A literal shorter fence follows:\n```\nstill code",
      },
    ]);
  });

  it("projects images and HTML details into registered Lynx blocks", () => {
    expect(
      parseMarkdownBlocks(
        [
          '![Architecture](https://example.com/architecture.png "Diagram")',
          "",
          "<details open>",
          "<summary>More context</summary>",
          "",
          "- nested item",
          "",
          "</details>",
        ].join("\n"),
      ),
    ).toEqual([
      {
        type: "image",
        alt: "Architecture",
        href: "https://example.com/architecture.png",
        title: "Diagram",
      },
      { type: "empty" },
      {
        type: "details",
        open: true,
        summary: "More context",
        children: [
          { type: "empty" },
          {
            type: "list",
            items: [
              expect.objectContaining({
                kind: "unordered",
                content: "nested item",
              }),
            ],
          },
          { type: "empty" },
        ],
      },
    ]);
  });

  it("preserves setext headings with their CommonMark level", () => {
    expect(parseMarkdownBlocks("Primary heading\n===\n\nSecondary heading\n---")).toEqual([
      { type: "heading", level: 1, text: "Primary heading" },
      { type: "empty" },
      { type: "heading", level: 2, text: "Secondary heading" },
    ]);
  });

  it("parses single-line details without leaking raw HTML into prose", () => {
    expect(
      parseMarkdownBlocks(
        "<details open><summary>More context</summary>Nested **content**.</details>",
      ),
    ).toEqual([
      {
        type: "details",
        open: true,
        summary: "More context",
        children: [{ type: "paragraph", text: "Nested **content**." }],
      },
    ]);
  });
});

describe("shouldRenderBlockMarkdown", () => {
  it.each([
    "# Heading",
    "> Quote",
    "- list item",
    "1. ordered item",
    "---",
    "~~~ts",
    "![image](https://example.com/image.png)",
    "<details><summary>More</summary></details>",
  ])("routes single-line block syntax through the block renderer: %s", (text) => {
    expect(shouldRenderBlockMarkdown(text)).toBe(true);
  });

  it("keeps ordinary inline prose on the compact renderer", () => {
    expect(shouldRenderBlockMarkdown("Use **bold**, ~~old~~, and `code`.")).toBe(false);
  });
});
