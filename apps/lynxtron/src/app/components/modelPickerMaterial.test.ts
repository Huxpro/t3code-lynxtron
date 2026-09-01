import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

const overrides = readFileSync(path.resolve(import.meta.dirname, "../overrides.css"), "utf8");
const pickerSource = readFileSync(path.resolve(import.meta.dirname, "ModelPicker.tsx"), "utf8");

function rule(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const blocks = overrides.match(new RegExp(`^${escaped} \\{[^}]+\\}`, "gm"));
  return blocks?.find((block) => block.includes("position: absolute;")) ?? blocks?.at(-1) ?? "";
}

describe("Model Picker material", () => {
  it("uses the Native-safe Web dropdown glass material", () => {
    const panel = rule(".model-picker-panel");
    const darkPanel = rule(".theme-dark .model-picker-panel");

    expect(panel).toContain("background-color: var(--popover);");
    expect(panel).toContain("border-color: rgba(var(--foreground-rgb), 0.1);");
    expect(panel).toContain("box-shadow: 0 16px 40px -18px rgba(0, 0, 0, 0.55);");
    expect(darkPanel).toContain("box-shadow: 0 18px 44px -18px rgba(0, 0, 0, 0.8);");
    expect(darkPanel).toContain("background-color: var(--popover);");
    expect(rule(".model-picker-dismiss-layer")).toContain("z-index: 50;");
  });

  it("maps the shared muted content and rail surfaces without changing geometry", () => {
    const panel = rule(".model-picker-panel");
    const content = rule(".model-picker-content");
    const lightContent = rule(".theme-light .model-picker-content");
    const rail = rule(".model-picker-rail-scroll");
    const lightRail = rule(".theme-light .model-picker-rail-scroll");

    expect(panel).toContain("width: 360px;");
    expect(panel).toContain("height: 346px;");
    expect(content).toContain("background-color: rgba(255, 255, 255, 0.016);");
    expect(lightContent).toContain("background-color: rgba(250, 250, 250, 0.4);");
    expect(rail).toContain("background-color: rgba(255, 255, 255, 0.012);");
    expect(lightRail).toContain("background-color: rgba(250, 250, 250, 0.3);");
  });

  it("routes wheel input directly to the model list for responsive scrolling", () => {
    expect(pickerSource).toContain("useMainThreadRef<MainThread.Element>");
    expect(pickerSource).toContain("responsiveMenuWheelDelta");
    expect(pickerSource).toContain("main-thread:global-bindwheel={handleListWheel}");
    expect(pickerSource).toContain(
      'target.invoke("scrollTo", { offset: nextOffset, smooth: false })',
    );
  });
});
