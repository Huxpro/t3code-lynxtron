import { assert, describe, it } from "vite-plus/test";

import { createSystemThemeSource } from "./systemThemeSource.ts";

describe("Lynxtron system theme source", () => {
  it("publishes only actual system appearance changes", () => {
    let theme: "light" | "dark" = "light";
    let refresh: () => void = () => undefined;
    let stopped = false;
    let updates = 0;
    const source = createSystemThemeSource({
      env: {},
      platform: "darwin",
      readSystemTheme: () => theme,
      watchSystemTheme: (listener) => {
        refresh = listener;
        return () => {
          stopped = true;
        };
      },
    });
    source.on("updated", () => {
      updates += 1;
    });

    assert.isFalse(source.shouldUseDarkColors);
    refresh();
    assert.equal(updates, 0);
    theme = "dark";
    refresh();
    assert.isTrue(source.shouldUseDarkColors);
    assert.equal(updates, 1);

    source.dispose();
    assert.isTrue(stopped);
  });

  it("uses the explicit system theme override without installing a watcher", () => {
    let watched = false;
    const source = createSystemThemeSource({
      env: { T3_LYNXTRON_SYSTEM_THEME: "dark" },
      platform: "darwin",
      readSystemTheme: () => "light",
      watchSystemTheme: () => {
        watched = true;
        return () => undefined;
      },
    });

    assert.isTrue(source.shouldUseDarkColors);
    assert.isFalse(watched);
    source.dispose();
  });
});
