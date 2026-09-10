import { describe, expect, it } from "vite-plus/test";

import {
  buildFileLinkParentSuffixByPath,
  extractMarkdownLinkHrefs,
  extractMarkdownFenceTitle,
  findMarkdownTaskListMarkerOffset,
  normalizeMarkdownLinkHrefKey,
  parseMarkdownFenceInfo,
  parseMarkdownInline,
  parseMarkdownListItem,
  parseMarkdownTable,
  resolveInlineCodeFileLinkMeta,
  resolveMarkdownFileLinkMeta,
  resolveMarkdownFileLinkTarget,
  resolveMarkdownCodeLanguage,
  rewriteMarkdownFileUriHref,
} from "./markdown.ts";

describe("resolveMarkdownCodeLanguage", () => {
  it("reads the language class and preserves unknown language ids", () => {
    expect(resolveMarkdownCodeLanguage("foo language-typescript bar")).toBe("typescript");
    expect(resolveMarkdownCodeLanguage("language-custom-lang")).toBe("custom-lang");
  });

  it("uses the Web highlighter fallback and gitignore alias", () => {
    expect(resolveMarkdownCodeLanguage(undefined)).toBe("text");
    expect(resolveMarkdownCodeLanguage("plain")).toBe("text");
    expect(resolveMarkdownCodeLanguage("language-gitignore")).toBe("ini");
  });
});

describe("extractMarkdownFenceTitle", () => {
  it("accepts quoted and unquoted title attributes", () => {
    expect(extractMarkdownFenceTitle('title="src/main.ts"')).toBe("src/main.ts");
    expect(extractMarkdownFenceTitle("file='src/main.ts'")).toBe("src/main.ts");
    expect(extractMarkdownFenceTitle("filename=src/main.ts")).toBe("src/main.ts");
  });

  it("falls back to a filename-like metadata token", () => {
    expect(extractMarkdownFenceTitle("linenums src/main.ts highlight=2")).toBe("src/main.ts");
  });

  it("rejects empty and descriptive metadata", () => {
    expect(extractMarkdownFenceTitle(undefined)).toBeNull();
    expect(extractMarkdownFenceTitle("linenums highlight=2")).toBeNull();
  });
});

describe("parseMarkdownFenceInfo", () => {
  it("projects language, metadata, and title from a fence info string", () => {
    expect(parseMarkdownFenceInfo('ts title="src/main.ts" linenums')).toEqual({
      rawLanguage: "ts",
      language: "ts",
      meta: 'title="src/main.ts" linenums',
      title: "src/main.ts",
    });
  });

  it("preserves whether the fence declared a language", () => {
    expect(parseMarkdownFenceInfo(undefined)).toEqual({
      rawLanguage: null,
      language: "text",
      meta: null,
      title: null,
    });
    expect(parseMarkdownFenceInfo("gitignore")).toEqual({
      rawLanguage: "gitignore",
      language: "ini",
      meta: null,
      title: null,
    });
  });
});

describe("parseMarkdownListItem", () => {
  it("projects unordered list content and its original marker", () => {
    expect(parseMarkdownListItem("  - ship the renderer")).toEqual({
      kind: "unordered",
      marker: "-",
      ordinal: null,
      depth: 1,
      content: "ship the renderer",
      taskChecked: null,
      taskMarkerOffset: null,
    });
  });

  it("preserves ordered-list ordinals for dot and parenthesis markers", () => {
    expect(parseMarkdownListItem("12. verify Web")).toMatchObject({
      kind: "ordered",
      marker: "12.",
      ordinal: 12,
      content: "verify Web",
    });
    expect(parseMarkdownListItem("3) verify Lynx")).toMatchObject({
      kind: "ordered",
      marker: "3)",
      ordinal: 3,
      content: "verify Lynx",
    });
  });

  it("projects checked and unchecked task markers without leaking them into content", () => {
    expect(parseMarkdownListItem("- [x] shared state")).toMatchObject({
      content: "shared state",
      taskChecked: true,
      taskMarkerOffset: 2,
    });
    expect(parseMarkdownListItem("  * [ ] host rendering")).toMatchObject({
      content: "host rendering",
      taskChecked: false,
      taskMarkerOffset: 4,
    });
  });

  it("rejects paragraph text and malformed list prefixes", () => {
    expect(parseMarkdownListItem("plain text")).toBeNull();
    expect(parseMarkdownListItem("-missing whitespace")).toBeNull();
  });
});

describe("parseMarkdownTable", () => {
  it("projects headers, alignment, escaped pipes, and short rows", () => {
    expect(
      parseMarkdownTable([
        "| Name | Result | Notes |",
        "| :--- | :---: | ---: |",
        "| Web | pass | shared \\| stable |",
        "| Lynx | pass |",
      ]),
    ).toEqual({
      headers: ["Name", "Result", "Notes"],
      alignments: ["left", "center", "right"],
      rows: [
        ["Web", "pass", "shared | stable"],
        ["Lynx", "pass", ""],
      ],
    });
  });

  it("keeps pipes inside code spans in one cell", () => {
    expect(
      parseMarkdownTable([
        "| Expression | Meaning |",
        "| --- | --- |",
        "| `left | right` | union |",
      ]),
    ).toEqual({
      headers: ["Expression", "Meaning"],
      alignments: [null, null],
      rows: [["`left | right`", "union"]],
    });
  });

  it("rejects prose and malformed delimiters", () => {
    expect(parseMarkdownTable(["one | two", "not a delimiter"])).toBeNull();
    expect(parseMarkdownTable(["one | two", "--- | --"])).toBeNull();
  });
});

describe("findMarkdownTaskListMarkerOffset", () => {
  it("converts the line-relative task marker into a source offset", () => {
    const markdown = "Intro\n\n  4. [X] keep parity\n";
    expect(findMarkdownTaskListMarkerOffset(markdown, 7)).toBe(12);
  });

  it("returns null for non-task items and invalid source offsets", () => {
    expect(findMarkdownTaskListMarkerOffset("- plain item", 0)).toBeNull();
    expect(findMarkdownTaskListMarkerOffset("- [ ] task", -1)).toBeNull();
    expect(findMarkdownTaskListMarkerOffset("- [ ] task", 99)).toBeNull();
  });
});

describe("parseMarkdownInline", () => {
  it("projects nested emphasis, code, and links into flat renderer spans", () => {
    expect(
      parseMarkdownInline(
        "Read **the [shared `module`](./src/presentation/markdown.ts)** before _editing_.",
      ),
    ).toEqual([
      { text: "Read ", bold: false, italic: false, code: false, href: null },
      { text: "the ", bold: true, italic: false, code: false, href: null },
      {
        text: "shared ",
        bold: true,
        italic: false,
        code: false,
        href: "./src/presentation/markdown.ts",
      },
      {
        text: "module",
        bold: true,
        italic: false,
        code: true,
        href: "./src/presentation/markdown.ts",
      },
      { text: " before ", bold: false, italic: false, code: false, href: null },
      { text: "editing", bold: false, italic: true, code: false, href: null },
      { text: ".", bold: false, italic: false, code: false, href: null },
    ]);
  });

  it("projects autolinks, bare urls, and escaped markers", () => {
    expect(
      parseMarkdownInline("\\*literal\\* <https://example.com> https://t3.tools/docs"),
    ).toEqual([
      { text: "*literal* ", bold: false, italic: false, code: false, href: null },
      {
        text: "https://example.com",
        bold: false,
        italic: false,
        code: false,
        href: "https://example.com",
      },
      { text: " ", bold: false, italic: false, code: false, href: null },
      {
        text: "https://t3.tools/docs",
        bold: false,
        italic: false,
        code: false,
        href: "https://t3.tools/docs",
      },
    ]);
  });

  it("projects GFM www and email autolink literals without trailing punctuation", () => {
    expect(parseMarkdownInline("Visit www.example.com/docs, or email hello@example.com.")).toEqual([
      { text: "Visit ", bold: false, italic: false, code: false, href: null },
      {
        text: "www.example.com/docs",
        bold: false,
        italic: false,
        code: false,
        href: "https://www.example.com/docs",
      },
      { text: ", or email ", bold: false, italic: false, code: false, href: null },
      {
        text: "hello@example.com",
        bold: false,
        italic: false,
        code: false,
        href: "mailto:hello@example.com",
      },
      { text: ".", bold: false, italic: false, code: false, href: null },
    ]);
  });

  it("does not autolink www text inside words, code spans, or hostless email text", () => {
    expect(parseMarkdownInline("`www.example.com` prefixwww.example.com user@localhost")).toEqual([
      { text: "www.example.com", bold: false, italic: false, code: true, href: null },
      {
        text: " prefixwww.example.com user@localhost",
        bold: false,
        italic: false,
        code: false,
        href: null,
      },
    ]);
  });

  it("projects GFM strikethrough without losing nested inline styles", () => {
    expect(parseMarkdownInline("Keep ~~old **bold** text~~ now")).toEqual([
      { text: "Keep ", bold: false, italic: false, code: false, href: null },
      {
        text: "old ",
        bold: false,
        italic: false,
        code: false,
        href: null,
        strikethrough: true,
      },
      {
        text: "bold",
        bold: true,
        italic: false,
        code: false,
        href: null,
        strikethrough: true,
      },
      {
        text: " text",
        bold: false,
        italic: false,
        code: false,
        href: null,
        strikethrough: true,
      },
      { text: " now", bold: false, italic: false, code: false, href: null },
    ]);
  });
});

describe("Markdown link projection", () => {
  it("extracts and normalizes authored link destinations", () => {
    expect(extractMarkdownLinkHrefs("[one](./a.ts) and [two](file:///tmp/b.ts#L2)")).toEqual([
      "./a.ts",
      "file:///tmp/b.ts#L2",
    ]);
    expect(normalizeMarkdownLinkHrefKey("<file:///tmp/b.ts#L2>")).toBe("/tmp/b.ts#L2");
  });

  it("rewrites file uri hrefs without double-decoding", () => {
    expect(rewriteMarkdownFileUriHref("file:///Users/julius/project/src/main.ts#L42")).toBe(
      "/Users/julius/project/src/main.ts#L42",
    );
    expect(rewriteMarkdownFileUriHref("file:///Users/julius/project/file%2520name.md")).toBe(
      "/Users/julius/project/file%2520name.md",
    );
    expect(
      rewriteMarkdownFileUriHref(
        "file:///D:/Programme/t3code/apps/web/src/components/chat/OpenInPicker.tsx#L69",
      ),
    ).toBe("D:/Programme/t3code/apps/web/src/components/chat/OpenInPicker.tsx#L69");
    expect(rewriteMarkdownFileUriHref("file://localhost/Users/alice/repo/main.ts")).toBe(
      "/Users/alice/repo/main.ts",
    );
    expect(rewriteMarkdownFileUriHref("file://server/share/repo/main.ts")).toBe(
      "//server/share/repo/main.ts",
    );
  });

  it("resolves absolute and relative file targets with source positions", () => {
    expect(resolveMarkdownFileLinkTarget("/Users/julius/project/AGENTS.md")).toBe(
      "/Users/julius/project/AGENTS.md",
    );
    expect(resolveMarkdownFileLinkTarget("src/processRunner.ts:71", "/Users/julius/project")).toBe(
      "/Users/julius/project/src/processRunner.ts:71",
    );
    expect(resolveMarkdownFileLinkTarget("/Users/julius/project/src/main.ts#L42C7")).toBe(
      "/Users/julius/project/src/main.ts:42:7",
    );
    expect(resolveMarkdownFileLinkTarget("https://example.com/docs")).toBeNull();
  });

  it("projects display and workspace-relative file metadata", () => {
    expect(
      resolveMarkdownFileLinkMeta(
        "/Users/bytedance/github/background-only/README.md",
        "/Users/bytedance/github/background-only",
      ),
    ).toMatchObject({
      workspaceRelativePath: "README.md",
      basename: "README.md",
    });
    expect(
      resolveMarkdownFileLinkMeta(
        "file:///C:/Users/mike/dev-stuff/t3code/apps/web/src/session-logic.ts#L501",
        "C:/Users/mike/dev-stuff/t3code",
      ),
    ).toMatchObject({
      displayPath: "t3code/apps/web/src/session-logic.ts:501",
      workspaceRelativePath: "apps/web/src/session-logic.ts",
      line: 501,
    });
    expect(resolveMarkdownFileLinkMeta("/tmp/report.ts", "/repo/project")).toMatchObject({
      workspaceRelativePath: null,
    });
  });

  it("disambiguates duplicate basenames with the shortest useful parent suffix", () => {
    const suffixes = buildFileLinkParentSuffixByPath([
      "/repo/apps/web/src/index.ts",
      "/repo/apps/server/src/index.ts",
      "/repo/packages/contracts/src/schema.ts",
    ]);
    expect(suffixes.get("/repo/apps/web/src/index.ts")).toBe("web/src");
    expect(suffixes.get("/repo/apps/server/src/index.ts")).toBe("server/src");
    expect(suffixes.has("/repo/packages/contracts/src/schema.ts")).toBe(false);
  });
});

describe("resolveInlineCodeFileLinkMeta", () => {
  it("links file-shaped relative, absolute, and Windows paths", () => {
    expect(
      resolveInlineCodeFileLinkMeta(".plans/worktree-management-v1.md", "/Users/julius/project"),
    ).toMatchObject({
      targetPath: "/Users/julius/project/.plans/worktree-management-v1.md",
      basename: "worktree-management-v1.md",
    });
    expect(resolveInlineCodeFileLinkMeta("/usr/local/bin/tool")).toMatchObject({
      targetPath: "/usr/local/bin/tool",
    });
    expect(resolveInlineCodeFileLinkMeta("src\\main.ts", "/Users/julius/project")).toMatchObject({
      targetPath: "/Users/julius/project/src/main.ts",
    });
  });

  it("preserves source positions for file references", () => {
    expect(resolveInlineCodeFileLinkMeta("script.ts:10", "/Users/julius/project")).toMatchObject({
      targetPath: "/Users/julius/project/script.ts:10",
      line: 10,
    });
    expect(resolveInlineCodeFileLinkMeta("Dockerfile:8:2", "/Users/julius/project")).toMatchObject({
      basename: "Dockerfile",
      line: 8,
      column: 2,
    });
  });

  it("rejects routes, hosts, commands, globs, and unresolved relative paths", () => {
    expect(resolveInlineCodeFileLinkMeta("/chat/settings")).toBeNull();
    expect(resolveInlineCodeFileLinkMeta("localhost:3000", "/Users/julius/project")).toBeNull();
    expect(
      resolveInlineCodeFileLinkMeta("example.com/index.html", "/Users/julius/project"),
    ).toBeNull();
    expect(resolveInlineCodeFileLinkMeta("git worktree list --porcelain")).toBeNull();
    expect(resolveInlineCodeFileLinkMeta("src/**/*.ts", "/Users/julius/project")).toBeNull();
    expect(resolveInlineCodeFileLinkMeta("origin/main", "/Users/julius/project")).toBeNull();
    expect(resolveInlineCodeFileLinkMeta(".plans/worktree-management-v1.md")).toBeNull();
  });
});
