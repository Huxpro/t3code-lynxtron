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
    expect(rule(".palette-panel")).toContain("border-radius: 18px;");
  });

  it("matches the light glass authority without changing dark material", () => {
    const lightPanel = rule(".theme-light .palette-panel");
    const lightFooter = rule(".theme-light .palette-footer");
    const lightKbd = rule(".theme-light .quick-switch-footer-group .lynx-kbd");

    expect(lightPanel).toContain("border-color: rgba(39, 39, 42, 0.1);");
    expect(lightPanel).toContain("border-radius: 18px;");
    expect(lightPanel).toContain("background-color: rgba(252, 252, 252, 0.8);");
    expect(lightPanel).toContain("0 24px 64px -24px rgba(0, 0, 0, 0.65);");
    expect(lightFooter).toContain("background-color: rgba(39, 39, 42, 0.025);");
    expect(lightKbd).toContain("background-color: rgba(39, 39, 42, 0.08);");
    expect(rule(".quick-switch-footer-group .lynx-kbd")).toContain("box-sizing: border-box;");
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

  it("matches the authority muted icon alpha", () => {
    expect(rule(".qs-search__icon-img")).toContain("opacity: 0.8;");
    expect(rule(".quick-switch-action-row > .qs-row__icon-img")).toContain("opacity: 0.8;");
  });

  it("matches the Web File Picker height without changing command modes", () => {
    const source = readFileSync(path.resolve(import.meta.dirname, "QuickSwitch.tsx"), "utf8");
    const filesPanel = rule(".palette-panel--files");
    const browserFilesPanel = rule(".lynx-web-preview .palette-panel--files");
    const filesResults = rule(".qs-results--files");

    expect(filesPanel).toContain("max-height: 420px;");
    expect(filesPanel).toContain("border-radius: 18px;");
    expect(filesPanel).not.toContain("box-sizing: border-box;");
    expect(browserFilesPanel).toContain("max-height: 418px;");
    expect(filesResults).toContain("height: 330px;");
    expect(filesResults).toContain("max-height: 330px;");
    expect(rule(".palette-panel")).toContain("max-height: 418px;");
    expect(rule(".palette-search")).toContain("min-height: 48px;");
    expect(rule(".palette-search")).toContain("max-height: 48px;");
    expect(rule(".palette-search")).toContain("--flex-shrink: 0;");
    expect(rule(".qs-results")).toContain("max-height: 330px;");
    expect(source).toContain('"palette-panel palette-panel--files"');
    expect(source).toContain('"qs-results qs-results--files"');
    expect(overrides).not.toContain('.palette-panel[data-search-overlay-mode="files"]');
  });

  it("keeps command and file-mode footer actions truthful", () => {
    const source = readFileSync(path.resolve(import.meta.dirname, "QuickSwitch.tsx"), "utf8");

    expect(source).toContain("<Kbd>Enter</Kbd>");
    expect(source).toContain('"add-project-local"');
    expect(source).toContain('"add-project-destination"');
    expect(source).not.toContain('{fileMode ? "⌘K" : "⌘P"}');
    expect(source).not.toContain('{fileMode ? "Commands" : "Files"}');
  });

  it("visibly mutes unavailable Add Project sources", () => {
    expect(rule(".quick-switch-source-row")).toContain("height: 48px;");
    expect(rule(".quick-switch-source-row")).toContain("min-height: 48px;");
    expect(rule(".quick-switch-source-row.opacity-64")).toContain("opacity: 0.64;");
  });
});
