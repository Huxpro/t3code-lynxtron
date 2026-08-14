import { readFileSync } from "node:fs";
import path from "node:path";

import { assert, describe, it } from "vite-plus/test";

const scriptSource = readFileSync(path.join(import.meta.dirname, "build-icons.mjs"), "utf8");
const iconSource = readFileSync(
  path.join(import.meta.dirname, "../src/app/components/Icon.tsx"),
  "utf8",
);
const generatedSource = readFileSync(
  path.join(import.meta.dirname, "../src/app/components/iconData.ts"),
  "utf8",
);

describe("Lynx icon raster contracts", () => {
  it("tracks the current Lucide GitBranch path", () => {
    assert.include(scriptSource, '<path d="M15 6a9 9 0 0 0-9 9V3"/>');
    assert.notInclude(scriptSource, '<line x1="6" x2="6" y1="3" y2="15"/>');
  });

  it("generates and prefers exact 12px Context icon variants", () => {
    assert.include(scriptSource, 'for (const name of ["folder", "git-branch", "chevron-down"])');
    assert.include(scriptSource, 'for (const color of ["#818181", "#71717a"])');
    assert.include(iconSource, "const exactDark = ICON_PNGS");
    assert.include(iconSource, "dark: exactDark ??");
    for (const name of ["folder", "git-branch", "chevron-down"]) {
      for (const color of ["#818181", "#71717a"]) {
        assert.include(generatedSource, `"${name}@12@${color}"`);
      }
    }
  });

  it("generates exact dark Composer mode icons", () => {
    for (const [name, size] of [
      ["lock", 16],
      ["lock-open", 16],
      ["pencil-line", 16],
      ["bot", 16],
      ["bot", 18],
    ]) {
      assert.include(generatedSource, `"${name}@${size}@#818181"`);
    }
  });
});
