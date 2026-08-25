import { describe, expect, it } from "vite-plus/test";

import { resolveLynxtronPrefsPath } from "./prefsPath";

describe("resolveLynxtronPrefsPath", () => {
  it("supports isolated preferences without forcing an isolated server", () => {
    expect(
      resolveLynxtronPrefsPath({
        env: { T3_LYNXTRON_PREFS_PATH: " /tmp/t3-prefs/preferences.json " },
        homeDirectory: "/Users/tester",
      }),
    ).toBe("/tmp/t3-prefs/preferences.json");
  });

  it("keeps the established user preference directory by default", () => {
    expect(
      resolveLynxtronPrefsPath({
        env: {},
        homeDirectory: "/Users/tester",
      }),
    ).toBe("/Users/tester/.t3-lynxtron/lynxtron-prefs.json");
  });

  it("isolates preferences with the rest of a fixture state directory", () => {
    expect(
      resolveLynxtronPrefsPath({
        env: { T3_LYNXTRON_BASE_DIR: "/tmp/t3code-sidebar-fixture" },
        homeDirectory: "/Users/tester",
      }),
    ).toBe("/tmp/t3code-sidebar-fixture/lynxtron-prefs.json");
  });

  it("ignores a whitespace-only override", () => {
    expect(
      resolveLynxtronPrefsPath({
        env: { T3_LYNXTRON_BASE_DIR: "  " },
        homeDirectory: "/Users/tester",
      }),
    ).toBe("/Users/tester/.t3-lynxtron/lynxtron-prefs.json");
  });
});
