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

  it("keeps indented continuation lines inside their list item", () => {
    const [list] = parseMarkdownBlocks(
      ["- first line", "  continuation with **meaning**", "  - nested line", "- second"].join("\n"),
    );

    expect(list).toMatchObject({
      type: "list",
      items: [
        { depth: 0, content: "first line\ncontinuation with **meaning**" },
        { depth: 1, content: "nested line" },
        { depth: 0, content: "second" },
      ],
    });
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
    expect(blocks[4]).toMatchObject({
      quoteDepth: 1,
      text: "quoted\ntext",
      children: [{ type: "paragraph", text: "quoted\ntext" }],
    });
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
      {
        type: "blockquote",
        text: "outer",
        quoteDepth: 1,
        children: [{ type: "paragraph", text: "outer" }],
      },
      {
        type: "blockquote",
        text: "nested\nstill nested",
        quoteDepth: 2,
        children: [{ type: "paragraph", text: "nested\nstill nested" }],
      },
      {
        type: "blockquote",
        text: "outer again",
        quoteDepth: 1,
        children: [{ type: "paragraph", text: "outer again" }],
      },
    ]);
  });

  it("preserves block structure inside a quote", () => {
    expect(
      parseMarkdownBlocks(
        "> Context\n>\n> - first\n> - second\n>\n> ```ts\n> const answer = 42;\n> ```",
      ),
    ).toEqual([
      {
        type: "blockquote",
        quoteDepth: 1,
        text: "Context\n\n- first\n- second\n\n```ts\nconst answer = 42;\n```",
        children: [
          { type: "paragraph", text: "Context" },
          { type: "empty" },
          {
            type: "list",
            items: [
              expect.objectContaining({ content: "first" }),
              expect.objectContaining({ content: "second" }),
            ],
          },
          { type: "empty" },
          { type: "code", language: "ts", title: undefined, code: "const answer = 42;" },
        ],
      },
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

  it("normalizes optional ATX closing hashes without consuming literal hashes", () => {
    expect(parseMarkdownBlocks("## Release notes ##\n\n##\n\n## C# updates")).toEqual([
      { type: "heading", level: 2, text: "Release notes" },
      { type: "empty" },
      { type: "heading", level: 2, text: "" },
      { type: "empty" },
      { type: "heading", level: 2, text: "C# updates" },
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

  it("accepts standard open attribute forms and preserves summary emphasis", () => {
    expect(
      parseMarkdownBlocks(
        '<details open="">\n<summary>More <strong>important</strong> `context`</summary>\nBody\n</details>',
      ),
    ).toEqual([
      {
        type: "details",
        open: true,
        summary: "More **important** `context`",
        children: [{ type: "paragraph", text: "Body" }],
      },
    ]);
    expect(
      parseMarkdownBlocks("<details open='open'><summary><em>More</em></summary>Body</details>"),
    ).toEqual([
      {
        type: "details",
        open: true,
        summary: "_More_",
        children: [{ type: "paragraph", text: "Body" }],
      },
    ]);
    expect(
      parseMarkdownBlocks('<details open=""><summary><code>More</code></summary>Body</details>'),
    ).toEqual([
      {
        type: "details",
        open: true,
        summary: "`More`",
        children: [{ type: "paragraph", text: "Body" }],
      },
    ]);
  });

  it("preserves images embedded between paragraph text", () => {
    expect(
      parseMarkdownBlocks(
        'Before ![Architecture](https://example.com/architecture.png "Diagram") after.',
      ),
    ).toEqual([
      { type: "paragraph", text: "Before " },
      {
        type: "image",
        alt: "Architecture",
        href: "https://example.com/architecture.png",
        title: "Diagram",
      },
      { type: "paragraph", text: " after." },
    ]);
  });

  it("preserves balanced image destinations and optional titles", () => {
    expect(
      parseMarkdownBlocks('Before ![diagram](https://example.com/a_(b).png "Nested") after.'),
    ).toEqual([
      { type: "paragraph", text: "Before " },
      {
        type: "image",
        alt: "diagram",
        href: "https://example.com/a_(b).png",
        title: "Nested",
      },
      { type: "paragraph", text: " after." },
    ]);
    expect(parseMarkdownBlocks("![diagram](./shots/a_(b).png)")).toEqual([
      { type: "image", alt: "diagram", href: "./shots/a_(b).png" },
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
    "Before ![image](https://example.com/image.png) after.",
    "<details><summary>More</summary></details>",
  ])("routes single-line block syntax through the block renderer: %s", (text) => {
    expect(shouldRenderBlockMarkdown(text)).toBe(true);
  });

  it("keeps ordinary inline prose on the compact renderer", () => {
    expect(shouldRenderBlockMarkdown("Use **bold**, ~~old~~, and `code`.")).toBe(false);
    expect(shouldRenderBlockMarkdown("Incomplete ![image]( path")).toBe(false);
  });
});
