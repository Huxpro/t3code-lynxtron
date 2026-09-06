import { describe, expect, it } from "vite-plus/test";

import {
  parseCommandPaletteSearchQuery,
  projectCommandPaletteThread,
  rankCommandPaletteSearchItems,
} from "./commandPalette.ts";
import { formatRelativeTimeLabel } from "./time.ts";

describe("shared command palette presentation", () => {
  it("omits missing branches and prefers the latest user activity timestamp", () => {
    expect(
      projectCommandPaletteThread({
        thread: {
          id: "thread-1",
          title: "New thread",
          branch: null,
          createdAt: "2026-04-07T10:00:00.000Z",
          updatedAt: "2026-04-07T12:00:00.000Z",
          latestUserMessageAt: "2026-04-07T11:18:00.000Z",
        },
        projectTitle: "t3code-lynxtron",
        activeThreadId: "thread-1",
        now: Date.parse("2026-04-07T12:00:00.000Z"),
        formatTimestamp: formatRelativeTimeLabel,
      }),
    ).toEqual({
      title: "New thread",
      description: "t3code-lynxtron · Current thread",
      timestamp: "42m ago",
      searchTerms: ["New thread", "t3code-lynxtron", ""],
    });
  });

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
