import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

const overrides = readFileSync(path.resolve(import.meta.dirname, "../overrides.css"), "utf8");

function rule(selector: string) {
  const start = overrides.indexOf(`${selector} {`);
  return overrides.slice(start, overrides.indexOf("}", start));
}

describe("Quick Switch material", () => {
  it("uses the Native-safe dark glass authority", () => {
    expect(rule(".theme-dark .palette-backdrop")).toContain(
      "background-color: rgba(var(--background-rgb), 0.64);",
    );
    expect(rule(".palette-panel")).toContain("background-color: var(--background);");
    expect(rule(".palette-panel")).toContain("border-color: rgba(var(--foreground-rgb), 0.08);");
  });

  it("matches the authority footer typography and lower edge", () => {
    const footer = rule(".palette-footer");

    expect(footer).toContain("padding-top: 10px;");
    expect(footer).toContain("padding-bottom: 10px;");
    expect(footer).toContain("border-top-width: 0;");
    expect(footer).toContain("border-bottom-left-radius: 17px;");
    expect(footer).toContain("border-bottom-right-radius: 17px;");
    expect(footer).toContain("font-family: var(--font-sans);");
    expect(footer).toContain("font-size: 14px;");
    expect(footer).toContain("font-weight: 500;");
    expect(footer).toContain("line-height: 20px;");
  });
});
