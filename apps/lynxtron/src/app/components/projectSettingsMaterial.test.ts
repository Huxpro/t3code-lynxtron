import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

const overrides = readFileSync(path.resolve(import.meta.dirname, "../overrides.css"), "utf8");

function rule(selector: string) {
  const start = overrides.indexOf(`${selector} {`);
  return overrides.slice(start, overrides.indexOf("}", start));
}

describe("Project Settings dialog material", () => {
  it("uses the Native-safe dialog glass authority in dark mode", () => {
    const overlay = rule(".project-settings-overlay");
    const darkOverlay = rule(".theme-dark .project-settings-overlay");
    const dialog = rule(".project-settings-dialog");

    expect(overlay).toContain("background-color: rgba(var(--background-rgb), 0.6);");
    expect(darkOverlay).toContain("background-color: rgba(var(--background-rgb), 0.64);");
    expect(dialog).toContain("border-color: rgba(var(--foreground-rgb), 0.08);");
    expect(dialog).toContain("background-color: var(--background);");
    expect(dialog).toContain("0 1px 0 rgba(var(--foreground-rgb), 0.04) inset,");
    expect(dialog).toContain("0 24px 72px -20px rgba(0, 0, 0, 0.9);");
  });

  it("matches the idle single-project destructive outline", () => {
    const button = rule(
      ".project-settings-dialog__footer--single .project-settings-dialog__button--danger",
    );
    expect(button).toContain("border-color: rgba(var(--foreground-rgb), 0.08);");
    expect(button).toContain("background-color: rgba(var(--foreground-rgb), 0.0256);");
    expect(button).toContain("box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);");
    expect(button).toContain("gap: 8px;");
  });

  it("matches the Web header and summary rhythm", () => {
    expect(rule(".project-settings-dialog__header")).toContain("padding: 24px 24px 4px;");
    expect(rule(".project-settings-dialog__title")).toContain("line-height: 20px;");
    const summary = rule(".project-settings-dialog__summary");
    expect(summary).toContain("height: 24px;");
    expect(summary).toContain("gap: 4px;");
    expect(rule(".project-settings-path")).toContain("font-size: 16px;");
    expect(rule(".project-settings-summary-action")).toContain("width: 24px;");
  });

  it("matches light dialog glass without changing the authority width", () => {
    const dialog = rule(".project-settings-dialog");
    const lightDialog = rule(".theme-light .project-settings-dialog");

    expect(dialog).toContain("width: 576px;");
    expect(dialog).toContain("border-radius: 18px;");
    expect(lightDialog).toContain("border-color: rgba(39, 39, 42, 0.1);");
    expect(lightDialog).toContain("background-color: rgba(252, 252, 252, 0.8);");
    expect(lightDialog).toContain("0 24px 64px -24px rgba(0, 0, 0, 0.65);");
  });
});
