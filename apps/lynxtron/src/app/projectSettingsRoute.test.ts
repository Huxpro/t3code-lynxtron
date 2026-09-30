import { describe, expect, it } from "vite-plus/test";

import { parseProjectSettingsPath, projectSettingsPath } from "./projectSettingsRoute";

describe("project settings route", () => {
  it("round-trips logical project keys that contain path separators", () => {
    for (const projectKey of [
      "primary:/Users/me/code/t3code",
      "github.com/pingdotgg/t3code::apps/web",
      "C:\\repo",
    ]) {
      const pathname = projectSettingsPath(projectKey);
      expect(pathname.slice("/projects/".length)).not.toContain("/");
      expect(parseProjectSettingsPath(pathname)).toBe(projectKey);
    }
  });

  it("ignores every other route", () => {
    expect(parseProjectSettingsPath("/")).toBeNull();
    expect(parseProjectSettingsPath("/settings/general")).toBeNull();
    expect(parseProjectSettingsPath("/projects/")).toBeNull();
    expect(parseProjectSettingsPath("/projects/a/b")).toBeNull();
    expect(parseProjectSettingsPath("/projects/%E0%A4%A")).toBeNull();
  });
});
