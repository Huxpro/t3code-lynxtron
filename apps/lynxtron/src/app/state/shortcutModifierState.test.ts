import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

const storeSource = readFileSync(
  path.resolve(import.meta.dirname, "shortcutModifierState.ts"),
  "utf8",
);
const rootSource = readFileSync(path.resolve(import.meta.dirname, "../index.tsx"), "utf8");

describe("Lynx shortcut modifier state", () => {
  it("tracks the four physical modifiers and resets the shared snapshot", () => {
    for (const key of ["metaKey", "ctrlKey", "shiftKey", "altKey"]) {
      expect(storeSource).toContain(key);
    }
    expect(storeSource).toContain("updateLynxShortcutModifierState");
    expect(storeSource).toContain("resetLynxShortcutModifierState");
  });

  it("binds Clay keydown and keyup at the app root and clears on blur", () => {
    expect(rootSource).toContain("main-thread:bindkeydown");
    expect(rootSource).toContain("main-thread:bindkeyup");
    expect(rootSource).toContain("main-thread:bindblur");
  });
});
