import { describe, expect, it } from "vite-plus/test";

import {
  buildProjectEntryTree,
  fileContentRevision,
  isMarkdownPreviewFile,
  projectFileDetailLayout,
  projectFileLineTokens,
  projectFileCacheKey,
  projectFileEditorCacheKey,
  setMarkdownTaskChecked,
  summarizeProjectEntries,
} from "./files.ts";

describe("project entries presentation", () => {
  it("projects Pierre tree paths and counts without changing Web path spelling", () => {
    expect(
      summarizeProjectEntries([
        { path: "apps", kind: "directory" },
        { path: "apps/web", kind: "directory" },
        { path: "apps/web/index.ts", kind: "file" },
        { path: "README.md", kind: "file" },
      ]),
    ).toEqual({
      fileCount: 2,
      directoryCount: 2,
      treePaths: ["apps/", "apps/web/", "apps/web/index.ts", "README.md"],
    });
  });

  it("builds a normalized directory-first tree from flat entries", () => {
    expect(
      buildProjectEntryTree([
        { path: "README.md", kind: "file" },
        { path: "apps\\web\\src", kind: "directory" },
        { path: "apps\\web\\src\\index.ts", kind: "file" },
        { path: "apps/server/main.ts", kind: "file" },
      ]),
    ).toEqual([
      {
        kind: "directory",
        name: "apps",
        path: "apps",
        children: [
          {
            kind: "directory",
            name: "server",
            path: "apps/server",
            children: [
              {
                kind: "file",
                name: "main.ts",
                path: "apps/server/main.ts",
              },
            ],
          },
          {
            kind: "directory",
            name: "web",
            path: "apps/web",
            children: [
              {
                kind: "directory",
                name: "src",
                path: "apps/web/src",
                children: [
                  {
                    kind: "file",
                    name: "index.ts",
                    path: "apps/web/src/index.ts",
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        kind: "file",
        name: "README.md",
        path: "README.md",
      },
    ]);
  });

  it("deduplicates inferred and explicit directories", () => {
    const tree = buildProjectEntryTree([
      { path: "src", kind: "directory" },
      { path: "src/index.ts", kind: "file" },
      { path: "src", kind: "directory" },
      { path: "src/index.ts", kind: "file" },
    ]);

    expect(tree).toEqual([
      {
        kind: "directory",
        name: "src",
        path: "src",
        children: [{ kind: "file", name: "index.ts", path: "src/index.ts" }],
      },
    ]);
  });
});

describe("file preview presentation", () => {
  it("switches narrow file details to an editor-first return flow", () => {
    expect(projectFileDetailLayout(null)).toEqual({
      showBackToFiles: false,
      showExplorer: true,
    });
    expect(projectFileDetailLayout(512)).toEqual({
      showBackToFiles: false,
      showExplorer: true,
    });
    expect(projectFileDetailLayout(511)).toEqual({
      showBackToFiles: true,
      showExplorer: false,
    });
  });

  it("recognizes Markdown files case-insensitively", () => {
    expect(isMarkdownPreviewFile("README.md")).toBe(true);
    expect(isMarkdownPreviewFile("docs/guide.MDX")).toBe(true);
    expect(isMarkdownPreviewFile("docs/markdown.ts")).toBe(false);
  });

  it("checks and unchecks Markdown tasks only at a valid marker offset", () => {
    const markdown = "- [ ] First\n- [x] Second\n";
    expect(setMarkdownTaskChecked(markdown, 2, true)).toBe("- [x] First\n- [x] Second\n");
    expect(setMarkdownTaskChecked(markdown, 14, false)).toBe("- [ ] First\n- [ ] Second\n");
    expect(setMarkdownTaskChecked(markdown, 200, true)).toBe(markdown);
  });

  it("projects Markdown source into editor-like inline tones", () => {
    expect(projectFileLineTokens("README.md", "- **Source**: `apps/server`")).toEqual([
      { text: "- ", tone: "muted" },
      { text: "**Source**", tone: "property" },
      { text: ": ", tone: "plain" },
      { text: "`apps/server`", tone: "string" },
    ]);
    expect(projectFileLineTokens("README.md", "## Port Contract")).toEqual([
      { text: "## Port Contract", tone: "heading" },
    ]);
  });

  it("projects TOML keys, strings, booleans, numbers, and comments", () => {
    expect(projectFileLineTokens("config.toml", "enabled = true # local")).toEqual([
      { text: "enabled", tone: "property" },
      { text: " = ", tone: "plain" },
      { text: "true", tone: "keyword" },
      { text: " ", tone: "plain" },
      { text: "# local", tone: "muted" },
    ]);
    expect(projectFileLineTokens("config.toml", 'command = "npx"')).toEqual([
      { text: "command", tone: "property" },
      { text: " = ", tone: "plain" },
      { text: '"npx"', tone: "string" },
    ]);
  });

  it("projects JSON properties separately from values", () => {
    expect(projectFileLineTokens("package.json", '  "private": true,')).toEqual([
      { text: "  ", tone: "plain" },
      { text: '"private"', tone: "property" },
      { text: ": ", tone: "plain" },
      { text: "true", tone: "keyword" },
      { text: ",", tone: "plain" },
    ]);
  });

  it("uses content, path, and workspace to produce stable editor revisions", () => {
    expect(fileContentRevision("nodeVersion")).not.toBe(fileContentRevision("nodeVeasdrs"));
    expect(projectFileCacheKey("/repo", "file.json", "contents")).toBe(
      projectFileCacheKey("/repo", "file.json", "contents"),
    );
  });

  it("keeps editor identity stable for locally edited contents", () => {
    const cacheKey = projectFileEditorCacheKey("local", "/repo", "file.json", "after", undefined);

    expect(
      projectFileEditorCacheKey("local", "/repo", "file.json", "after edit", {
        cacheKey,
        contents: "after edit",
      }),
    ).toBe(cacheKey);
  });

  it("rotates editor identity for external contents and environments", () => {
    const cacheKey = projectFileEditorCacheKey("local", "/repo", "file.json", "before", undefined);
    const editorFile = { cacheKey, contents: "before" };

    expect(
      projectFileEditorCacheKey("local", "/repo", "file.json", "external edit", editorFile),
    ).not.toBe(cacheKey);
    expect(projectFileEditorCacheKey("remote", "/repo", "file.json", "before", undefined)).not.toBe(
      cacheKey,
    );
  });
});
