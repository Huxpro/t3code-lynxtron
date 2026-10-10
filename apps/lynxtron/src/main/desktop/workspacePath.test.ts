import * as path from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { resolveWorkspacePath } from "./workspacePath";

describe("resolveWorkspacePath", () => {
  const home = path.resolve("/Users/tester");

  it("expands the home directory", () => {
    expect(resolveWorkspacePath("~", home)).toBe(home);
    expect(resolveWorkspacePath(" ~/work/app ", home)).toBe(path.join(home, "work", "app"));
  });

  it("leaves a tilde that is part of a name alone", () => {
    expect(resolveWorkspacePath("/srv/~backup", home)).toBe(path.resolve("/srv/~backup"));
  });

  it("normalizes an absolute path and resolves a relative one", () => {
    expect(resolveWorkspacePath("/srv/app/../site/", home)).toBe(path.resolve("/srv/site"));
    expect(resolveWorkspacePath("projects/app", home)).toBe(path.resolve("projects/app"));
  });
});
