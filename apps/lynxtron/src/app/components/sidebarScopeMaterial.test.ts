import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

const overrides = readFileSync(path.resolve(import.meta.dirname, "../overrides.css"), "utf8");

function rule(selector: string) {
  const start = overrides.indexOf(`${selector} {`);
  return overrides.slice(start, overrides.indexOf("}", start));
}

describe("Sidebar V2 project scope popup material", () => {
  it("uses the Native-safe Web dropdown glass authority", () => {
    const popup = rule(".sidebar-v2-scope-popup");
    const darkPopup = rule(".theme-dark .sidebar-v2-scope-popup");

    expect(popup).toContain("border: 1px solid rgba(var(--foreground-rgb), 0.1);");
    expect(popup).toContain("background-color: rgba(var(--popover-rgb), 0.836);");
    expect(popup).toContain("box-shadow: 0 16px 40px -18px rgba(0, 0, 0, 0.55);");
    expect(darkPopup).toContain("box-shadow: 0 18px 44px -18px rgba(0, 0, 0, 0.8);");
  });

  it("keeps the verified scope menu geometry and option rows", () => {
    const popup = rule(".sidebar-v2-scope-popup");
    const option = rule(".sidebar-v2-scope-popup .lynx-menu-radio-item");

    expect(popup).toContain("width: 100%;");
    expect(popup).toContain("max-height: 256px;");
    expect(popup).toContain("padding: 4px;");
    expect(option).toContain("height: 32px;");
    expect(option).toContain("min-height: 32px;");
  });
});
