import { describe, expect, it } from "vite-plus/test";

import { getProjectFilePickerMatches } from "./filePicker.ts";

const entries = [
  { kind: "directory", path: "apps/web/src" },
  { kind: "file", path: "apps/web/src/index.ts" },
  { kind: "file", path: "packages/shared/src/index.ts" },
  { kind: "file", path: "README.md" },
] as const;

describe("project file picker matches", () => {
  it("keeps file results in server order and honors the result limit", () => {
    expect(
      getProjectFilePickerMatches(entries, "src index", 1).map(({ name, path }) => ({
        name,
        path,
      })),
    ).toEqual([{ name: "index.ts", path: "apps/web/src/index.ts" }]);
  });

  it("normalizes path prefixes and records the first fuzzy subsequence", () => {
    expect(
      getProjectFilePickerMatches([{ kind: "file", path: "src/index.ts" }], "@/src")[0]
        ?.pathMatchIndices,
    ).toEqual([0, 1, 2]);
    expect(
      getProjectFilePickerMatches([{ kind: "file", path: "aabba" }], "aba")[0]
        ?.nameMatchIndices,
    ).toEqual([0, 2, 4]);
  });
});
