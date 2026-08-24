import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

const composerSource = readFileSync(path.resolve(import.meta.dirname, "Composer.tsx"), "utf8");
const overridesSource = readFileSync(path.resolve(import.meta.dirname, "../overrides.css"), "utf8");

describe("approval Composer layout", () => {
  it("lets the shared column surface stack approval editor and footer directly", () => {
    expect(composerSource).not.toContain('className="composer-approval-body"');
    expect(composerSource).toContain(
      '<view className="composer-editor-area composer-editor-area--approval">',
    );
    expect(composerSource).toContain('className="composer-footer composer-footer--approval"');
  });

  it("fully hides dark authority sprites when real light-theme content is restored", () => {
    const lightFallback = overridesSource.match(
      /\.theme-light \.sidebar-grain[\s\S]*?\.theme-light \.lynx-sidebar-chrome-header--authority/u,
    )?.[0];

    expect(lightFallback).toContain(".theme-light .composer-pending-authority-copy");
    expect(lightFallback).toContain(".theme-light .composer-editor-authority-surface");
    expect(lightFallback).toContain(".theme-light .ui-button__authority-label");
    expect(lightFallback).toContain("display: none;");
    expect(lightFallback).toContain("opacity: 0;");
    expect(lightFallback).toContain("pointer-events: none;");
  });

  it("keeps the light approval fallback on light theme tokens", () => {
    const pendingBlock =
      overridesSource.match(/\.composer-surface \.composer-pending-approval \{[^}]+\}/)?.[0] ?? "";
    const headingBlock =
      overridesSource.match(/\.composer-pending-approval__heading \{[^}]+\}/)?.[0] ?? "";

    expect(pendingBlock).toContain("padding: 16px 20px;");
    expect(pendingBlock).toContain("height: 114px;");
    expect(pendingBlock).toContain("box-sizing: border-box;");
    expect(headingBlock).not.toContain("margin-top:");
    expect(overridesSource).toContain(
      ".theme-light .ui-button--outline,\n.theme-light .ui-button--destructive-outline {",
    );
    expect(overridesSource).toContain("border-color: var(--input);");
    expect(overridesSource).toContain("border-top-color: var(--input);");
    expect(overridesSource).toContain("border-right-color: var(--input);");
    expect(overridesSource).toContain("border-bottom-color: var(--input);");
    expect(overridesSource).toContain("border-left-color: var(--input);");
    expect(overridesSource).toContain("background-color: var(--popover);");
    expect(overridesSource).toContain(
      ".theme-light .composer-approval-action--cancel .ui-button__label,\n.theme-light .composer-approval-action--session .ui-button__label {",
    );
    expect(overridesSource).toContain(
      ".theme-light .composer-approval-action--decline .ui-button__label {",
    );
  });
});
