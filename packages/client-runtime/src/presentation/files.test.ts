import { describe, expect, it } from "vite-plus/test";

import {
  buildProjectEntryTree,
  fileContentRevision,
  isMarkdownPreviewFile,
  projectFileCacheKey,
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

  it("uses content, path, and workspace to produce stable editor revisions", () => {
    expect(fileContentRevision("nodeVersion")).not.toBe(fileContentRevision("nodeVeasdrs"));
    expect(projectFileCacheKey("/repo", "file.json", "contents")).toBe(
      projectFileCacheKey("/repo", "file.json", "contents"),
    );
  });
});
