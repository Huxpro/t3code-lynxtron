import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

const overrides = readFileSync(path.resolve(import.meta.dirname, "../overrides.css"), "utf8");

function rule(selector: string) {
  const start = overrides.indexOf(`${selector} {`);
  return overrides.slice(start, overrides.indexOf("}", start));
}

describe("Project Action dialog material", () => {
  it("uses the Native-safe dialog glass authority in dark mode", () => {
    const overlay = rule(".project-action-overlay");
    const darkOverlay = rule(".theme-dark .project-action-overlay");
    const dialog = rule(".project-action-dialog");

    expect(overlay).toContain("background-color: rgba(var(--background-rgb), 0.6);");
    expect(darkOverlay).toContain("background-color: rgba(var(--background-rgb), 0.64);");
    expect(dialog).toContain("border-color: rgba(var(--foreground-rgb), 0.08);");
    expect(dialog).toContain("background-color: var(--background);");
    expect(dialog).toContain("0 1px 0 rgba(var(--foreground-rgb), 0.04) inset,");
    expect(dialog).toContain("0 24px 72px -20px rgba(0, 0, 0, 0.9);");
  });

  it("matches light dialog glass without changing its verified geometry", () => {
    const dialog = rule(".project-action-dialog");
    const lightDialog = rule(".theme-light .project-action-dialog");

    expect(dialog).toContain("width: 502px;");
    expect(dialog).toContain("height: 662px;");
    expect(dialog).toContain("border-radius: 18px;");
    expect(lightDialog).toContain("border-color: rgba(39, 39, 42, 0.1);");
    expect(lightDialog).toContain("background-color: rgba(252, 252, 252, 0.8);");
    expect(lightDialog).toContain("0 24px 64px -24px rgba(0, 0, 0, 0.65);");
  });
});
