import { describe, expect, it } from "vite-plus/test";

import {
  describeDiffSelection,
  orderTurnDiffSummariesNewestFirst,
  resolveSelectedTurnDiff,
  buildChangedFilesTree,
  changedFileName,
  selectChangedFilePreview,
  shouldAutoExpandChangedFiles,
  summarizeChangedFileScopes,
  summarizeChangedFiles,
} from "./diff.ts";

describe("changed-files presentation", () => {
  it("sums checkpoint file stats", () => {
    expect(
      summarizeChangedFiles([
        { path: "README.md", kind: "modified", additions: 3, deletions: 1 },
        { path: "docs/notes.md", kind: "modified", additions: 0, deletions: 0 },
        { path: "src/index.ts", kind: "modified", additions: 5, deletions: 2 },
      ]),
    ).toEqual({ additions: 8, deletions: 3 });
  });

  it("builds nested directory nodes with aggregated stats", () => {
    expect(
      buildChangedFilesTree([
        { path: "src/index.ts", kind: "modified", additions: 2, deletions: 1 },
        { path: "src/components/Button.tsx", kind: "modified", additions: 4, deletions: 2 },
        { path: "README.md", kind: "modified", additions: 1, deletions: 0 },
      ]),
    ).toEqual([
      {
        kind: "directory",
        name: "src",
        path: "src",
        stat: { additions: 6, deletions: 3 },
        children: [
          {
            kind: "directory",
            name: "components",
            path: "src/components",
            stat: { additions: 4, deletions: 2 },
            children: [
              {
                kind: "file",
                name: "Button.tsx",
                path: "src/components/Button.tsx",
                stat: { additions: 4, deletions: 2 },
              },
            ],
          },
          {
            kind: "file",
            name: "index.ts",
            path: "src/index.ts",
            stat: { additions: 2, deletions: 1 },
          },
        ],
      },
      {
        kind: "file",
        name: "README.md",
        path: "README.md",
        stat: { additions: 1, deletions: 0 },
      },
    ]);
  });

  it("keeps zero-valued file stats", () => {
    expect(
      buildChangedFilesTree([
        { path: "docs/notes.md", kind: "modified", additions: 0, deletions: 0 },
        { path: "docs/todo.md", kind: "modified", additions: 1, deletions: 1 },
      ]),
    ).toEqual([
      {
        kind: "directory",
        name: "docs",
        path: "docs",
        stat: { additions: 1, deletions: 1 },
        children: [
          {
            kind: "file",
            name: "notes.md",
            path: "docs/notes.md",
            stat: { additions: 0, deletions: 0 },
          },
          {
            kind: "file",
            name: "todo.md",
            path: "docs/todo.md",
            stat: { additions: 1, deletions: 1 },
          },
        ],
      },
    ]);
  });

  it("normalizes windows separators and compacts single-directory chains", () => {
    expect(
      buildChangedFilesTree([
        { path: "apps\\web\\src\\index.ts", kind: "modified", additions: 2, deletions: 1 },
      ]),
    ).toEqual([
      {
        kind: "directory",
        name: "apps/web/src",
        path: "apps/web/src",
        stat: { additions: 2, deletions: 1 },
        children: [
          {
            kind: "file",
            name: "index.ts",
            path: "apps/web/src/index.ts",
            stat: { additions: 2, deletions: 1 },
          },
        ],
      },
    ]);
  });

  it("stops directory compaction at branch points", () => {
    const tree = buildChangedFilesTree([
      { path: "apps/server/src/index.ts", kind: "modified", additions: 2, deletions: 1 },
      { path: "apps/server/main.ts", kind: "modified", additions: 4, deletions: 0 },
    ]);

    expect(tree[0]).toMatchObject({
      kind: "directory",
      name: "apps/server",
      path: "apps/server",
      stat: { additions: 6, deletions: 1 },
      children: [
        { kind: "directory", name: "src", path: "apps/server/src" },
        { kind: "file", name: "main.ts", path: "apps/server/main.ts" },
      ],
    });
  });

  it("preserves leading and trailing whitespace in path segments", () => {
    const tree = buildChangedFilesTree([
      { path: "a/file.ts", kind: "modified", additions: 1, deletions: 0 },
      { path: " a/file.ts", kind: "modified", additions: 2, deletions: 0 },
    ]);

    expect(
      tree
        .filter((node) => node.kind === "directory")
        .map((node) => node.path)
        .toSorted(),
    ).toEqual([" a", "a"]);
  });

  it("auto-expands only small, low-churn latest changes", () => {
    const smallFiles = [
      { path: "src/a.ts", kind: "modified", additions: 80, deletions: 20 },
      { path: "src/b.ts", kind: "modified", additions: 60, deletions: 20 },
    ];

    expect(shouldAutoExpandChangedFiles(smallFiles, true)).toBe(true);
    expect(shouldAutoExpandChangedFiles(smallFiles, false)).toBe(false);
    expect(
      shouldAutoExpandChangedFiles(
        [{ path: "src/a.ts", kind: "modified", additions: 201, deletions: 0 }],
        true,
      ),
    ).toBe(false);
    expect(
      shouldAutoExpandChangedFiles(
        Array.from({ length: 6 }, (_, index) => ({
          path: `src/${index}.ts`,
          kind: "modified",
          additions: 1,
          deletions: 0,
        })),
        true,
      ),
    ).toBe(false);
  });

  it("summarizes prominent scopes and previews across them", () => {
    const files = [
      { path: "apps/web/src/App.tsx", kind: "modified", additions: 1, deletions: 0 },
      { path: "apps/web/src/App.test.tsx", kind: "modified", additions: 1, deletions: 0 },
      { path: "packages/shared/src/git.ts", kind: "modified", additions: 1, deletions: 0 },
      { path: "README.md", kind: "modified", additions: 1, deletions: 0 },
    ];

    expect(summarizeChangedFileScopes(files)).toEqual([
      { label: "apps", fileCount: 2 },
      { label: "packages", fileCount: 1 },
      { label: "root", fileCount: 1 },
    ]);
    expect(selectChangedFilePreview(files).map((file) => file.path)).toEqual([
      "apps/web/src/App.tsx",
      "packages/shared/src/git.ts",
      "README.md",
    ]);
    expect(changedFileName("apps\\web\\src\\App.tsx")).toBe("App.tsx");
  });
});

describe("diff selection", () => {
  const turn = (id: string, checkpointTurnCount: number | undefined, completedAt: string) => ({
    turnId: id as never,
    checkpointTurnCount,
    completedAt,
  });
  const turns = [
    turn("turn-1", 1, "2026-08-19T23:00:00.000Z"),
    turn("turn-3", undefined, "2026-08-21T00:00:00.000Z"),
    turn("turn-2", 2, "2026-08-20T00:00:00.000Z"),
  ];

  it("orders newest first using inferred counts when a checkpoint has none", () => {
    expect(
      orderTurnDiffSummariesNewestFirst(turns, { "turn-3": 3 }).map((entry) => entry.turnId),
    ).toEqual(["turn-3", "turn-2", "turn-1"]);
  });

  it("falls back a stale turn selection to the latest turn", () => {
    const ordered = orderTurnDiffSummariesNewestFirst(turns, { "turn-3": 3 });
    expect(resolveSelectedTurnDiff(ordered, "missing" as never)?.turnId).toBe("turn-3");
    expect(resolveSelectedTurnDiff(ordered, null)).toBeUndefined();
  });

  it("labels Git scopes, the latest turn, and historical turns", () => {
    const latest = turns[1];
    expect(
      describeDiffSelection({
        gitScope: "unstaged",
        selectedTurn: undefined,
        latestTurn: latest,
        selectedTurnCount: undefined,
        turnSelected: false,
      }),
    ).toEqual({ scopeLabel: "Working tree", sectionTitle: "Working tree" });
    expect(
      describeDiffSelection({
        gitScope: "branch",
        selectedTurn: latest,
        latestTurn: latest,
        selectedTurnCount: 3,
        turnSelected: true,
      }),
    ).toEqual({ scopeLabel: "Latest turn", sectionTitle: "Turn 3" });
    expect(
      describeDiffSelection({
        gitScope: "branch",
        selectedTurn: turns[0],
        latestTurn: latest,
        selectedTurnCount: 1,
        turnSelected: true,
      }),
    ).toEqual({ scopeLabel: "Turn 1", sectionTitle: "Turn 1" });
  });
});
