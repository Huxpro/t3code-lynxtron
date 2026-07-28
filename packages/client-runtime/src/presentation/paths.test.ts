import { describe, expect, it } from "vite-plus/test";

import {
  formatWorkspaceRelativePath,
  resolvePathLinkTarget,
  splitPathAndPosition,
} from "./paths.ts";

describe("shared path presentation", () => {
  it("splits source positions without treating a Windows drive as a line", () => {
    expect(splitPathAndPosition("C:\\repo\\src\\main.ts:12:4")).toEqual({
      path: "C:\\repo\\src\\main.ts",
      line: "12",
      column: "4",
    });
  });

  it("resolves relative and home paths against the active workspace", () => {
    expect(resolvePathLinkTarget("./src/main.ts:7", "/Users/alice/repo")).toBe(
      "/Users/alice/repo/./src/main.ts:7",
    );
    expect(resolvePathLinkTarget("~/notes.md", "/Users/alice/repo")).toBe("/Users/alice/notes.md");
  });

  it("formats paths relative to the workspace while retaining positions", () => {
    expect(
      formatWorkspaceRelativePath("/Users/alice/repo/src/main.ts:7:3", "/Users/alice/repo"),
    ).toBe("repo/src/main.ts:7:3");
  });
});
