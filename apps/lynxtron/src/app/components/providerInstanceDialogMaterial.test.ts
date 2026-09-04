import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

const overrides = readFileSync(path.resolve(import.meta.dirname, "../overrides.css"), "utf8");

function rule(selector: string) {
  const start = overrides.indexOf(`${selector} {`);
  return overrides.slice(start, overrides.indexOf("}", start));
}

describe("Provider instance dialog material", () => {
  it("uses the Native-safe Web dialog glass authority in dark mode", () => {
    const overlay = rule(".provider-instance-dialog-overlay");
    const darkOverlay = rule(".theme-dark .provider-instance-dialog-overlay");
    const dialog = rule(".provider-instance-dialog");

    expect(overlay).toContain("background-color: rgba(var(--background-rgb), 0.6);");
    expect(darkOverlay).toContain("background-color: rgba(var(--background-rgb), 0.64);");
    expect(dialog).toContain("border-color: rgba(var(--foreground-rgb), 0.08);");
    expect(dialog).toContain("background-color: var(--background);");
    expect(dialog).toContain("0 1px 0 rgba(var(--foreground-rgb), 0.04) inset,");
    expect(dialog).toContain("0 24px 72px -20px rgba(0, 0, 0, 0.9);");
  });

  it("matches light dialog glass without changing the wizard width", () => {
    const dialog = rule(".provider-instance-dialog");
    const lightDialog = rule(".theme-light .provider-instance-dialog");
    const lightBody = rule(".theme-light .provider-instance-dialog__body");

    expect(dialog).toContain("width: 576px;");
    expect(dialog).toContain("border-radius: 18px;");
    expect(lightDialog).toContain("border-color: rgba(39, 39, 42, 0.1);");
    expect(lightDialog).toContain("background-color: rgba(252, 252, 252, 0.8);");
    expect(lightDialog).toContain("0 24px 64px -24px rgba(0, 0, 0, 0.65);");
    expect(lightBody).toContain("background-color: rgba(250, 250, 250, 0.8);");
  });

  it("reserves both description lines before the wizard steps", () => {
    const title = rule(".provider-instance-dialog__title-frame");
    const description = rule(".provider-instance-dialog__description-frame");
    const steps = rule(".provider-instance-dialog__steps");

    expect(title).toContain("height: 20px;");
    expect(title).toContain("flex-shrink: 0;");
    expect(description).toContain("height: 40px;");
    expect(description).toContain("flex-shrink: 0;");
    expect(steps).toContain("flex-shrink: 0;");
  });

  it("matches the dark wizard step and driver-card material", () => {
    const step = rule(".provider-instance-dialog__step");
    const driver = rule(".theme-dark .provider-instance-dialog__driver");
    const disabledDriver = rule(".theme-dark .provider-instance-dialog__driver--disabled");
    const selectedDriver = rule(".theme-dark .provider-instance-dialog__driver--selected");

    expect(step).toContain("border-radius: 10px;");
    expect(driver).toContain("border-color: rgba(var(--foreground-rgb), 0.06);");
    expect(driver).toContain("background-color: rgba(var(--foreground-rgb), 0.03);");
    expect(disabledDriver).toContain("background-color: rgba(var(--foreground-rgb), 0.02);");
    expect(selectedDriver).toContain("background-color: rgba(var(--primary-rgb), 0.15);");
  });

  it("matches the dark secondary footer action material", () => {
    const secondary = rule(".theme-dark .provider-instance-dialog__secondary.ui-button--outline");

    expect(secondary).toContain("border-color: rgba(var(--foreground-rgb), 0.08);");
    expect(secondary).toContain("background-color: rgba(var(--foreground-rgb), 0.0256);");
  });
});
