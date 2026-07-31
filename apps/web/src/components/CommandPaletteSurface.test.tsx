import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  PaletteEmptySurface,
  PaletteRowContent,
  PaletteRowSurface,
  PaletteSectionSurface,
} from "./CommandPaletteSurface";

describe("CommandPaletteSurface", () => {
  it("renders a simple action row with icon and title", () => {
    const markup = renderToStaticMarkup(
      <PaletteRowSurface
        icon={<span data-icon>+</span>}
        title="New thread in t3code"
        onSelect={vi.fn()}
      />,
    );
    expect(markup).toContain("palette-row");
    expect(markup).toContain("data-icon");
    expect(markup).toContain("New thread in t3code");
  });

  it("renders the full row anatomy in order: icon, title, description, timestamp, shortcut, chevron", () => {
    const markup = renderToStaticMarkup(
      <PaletteRowContent
        icon={<span data-icon />}
        title="Fix the sidebar"
        titleLeading={<span data-leading />}
        description="t3code · #main"
        titleTrailing={<span data-title-trailing />}
        timestamp="2h"
        shortcut={<kbd data-shortcut>⌘1</kbd>}
        chevron={<span data-chevron>›</span>}
      />,
    );
    const order = [
      "data-icon",
      "data-leading",
      "Fix the sidebar",
      "t3code · #main",
      "data-title-trailing",
      "2h",
      "data-shortcut",
      "data-chevron",
    ].map((needle) => markup.indexOf(needle));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order]).toEqual([...order].sort((a, b) => a - b));
  });

  it("marks the active row and disables interaction for disabled rows", () => {
    const active = renderToStaticMarkup(
      <PaletteRowSurface title="Active" active onSelect={vi.fn()} />,
    );
    expect(active).toContain("bg-accent");

    const disabled = renderToStaticMarkup(<PaletteRowSurface title="Disabled" disabled />);
    expect(disabled).toContain("opacity-64");
    expect(disabled).not.toContain("<button");
  });

  it("renders section labels and the empty state", () => {
    const section = renderToStaticMarkup(<PaletteSectionSurface label="Recent Threads" />);
    expect(section).toContain("palette-section-label");
    expect(section).toContain("Recent Threads");

    const empty = renderToStaticMarkup(
      <PaletteEmptySurface message="No matching commands, projects, or threads." />,
    );
    expect(empty).toContain("palette-empty");
    expect(empty).toContain("No matching commands, projects, or threads.");
  });
});
