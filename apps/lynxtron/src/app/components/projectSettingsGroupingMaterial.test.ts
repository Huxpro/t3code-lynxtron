import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

const overrides = readFileSync(path.resolve(import.meta.dirname, "../overrides.css"), "utf8");

function rule(selector: string) {
  const start = overrides.indexOf(`${selector} {`);
  return overrides.slice(start, overrides.indexOf("}", start));
}

describe("Project Settings grouping menu material", () => {
  it("uses the Native-safe Web SelectPopup dropdown glass authority", () => {
    const menu = rule(".project-settings-grouping-menu");
    const darkMenu = rule(".theme-dark .project-settings-grouping-menu");

    expect(menu).toContain("border-color: rgba(var(--foreground-rgb), 0.1);");
    expect(menu).toContain("background-color: rgba(var(--popover-rgb), 0.836);");
    expect(menu).toContain("box-shadow: 0 16px 40px -18px rgba(0, 0, 0, 0.55);");
    expect(darkMenu).toContain("box-shadow: 0 18px 44px -18px rgba(0, 0, 0, 0.8);");
  });

  it("keeps the verified grouping menu placement and option anatomy", () => {
    const menu = rule(".project-settings-grouping-menu");
    const option = rule(".project-settings-grouping-option");

    expect(menu).toContain("top: 58px;");
    expect(menu).toContain("padding: 4px;");
    expect(menu).toContain("border-radius: 10px;");
    expect(option).toContain("min-height: 30px;");
  });
});
