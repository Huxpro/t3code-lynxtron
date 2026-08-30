import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

const source = readFileSync(
  path.resolve(import.meta.dirname, "../../../../web/src/components/sidebar/T3Wordmark.lynx.tsx"),
  "utf8",
);
const iconSource = readFileSync(path.resolve(import.meta.dirname, "Icon.tsx"), "utf8");
const iconBuildSource = readFileSync(
  path.resolve(import.meta.dirname, "../../../scripts/build-icons.mjs"),
  "utf8",
);

describe("sidebar brand contract", () => {
  it("uses the tested raster icon path instead of Lynx external SVG rendering", () => {
    expect(source).toContain('name="t3-wordmark"');
    expect(source).toContain('themeOverride={_onBackdrop ? "dark" : "light"}');
    expect(source).not.toContain("?external");
    expect(iconSource).toContain('if (name === "t3-wordmark")');
    expect(iconBuildSource).toContain('lightColor: "#27272a"');
  });
});
