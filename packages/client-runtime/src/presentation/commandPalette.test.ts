import { describe, expect, it } from "vite-plus/test";

import { parseCommandPaletteSearchQuery, rankCommandPaletteSearchItems } from "./commandPalette.ts";

describe("shared command palette presentation", () => {
  it("parses the actions-only prefix and normalizes whitespace", () => {
    expect(parseCommandPaletteSearchQuery(">  Open   Settings ")).toEqual({
      actionsOnly: true,
      normalizedQuery: "open settings",
    });
  });

  it("ranks title matches ahead of contextual matches while preserving ties", () => {
    const items = [
      { id: "context", terms: ["Fix navbar spacing", "Project"] },
      { id: "title", terms: ["Project kickoff", "Workspace"] },
      { id: "later", terms: ["Project cleanup", "Workspace"] },
    ];

    expect(
      rankCommandPaletteSearchItems(items, "project", (item) => item.terms).map((item) => item.id),
    ).toEqual(["title", "later", "context"]);
  });

  it("filters rows that do not contain the normalized query", () => {
    expect(
      rankCommandPaletteSearchItems(
        [
          { id: "settings", terms: ["Open settings"] },
          { id: "thread", terms: ["Fix sidebar"] },
        ],
        "settings",
        (item) => item.terms,
      ).map((item) => item.id),
    ).toEqual(["settings"]);
  });
});
