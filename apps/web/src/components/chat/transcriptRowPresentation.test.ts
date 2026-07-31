import { describe, expect, it } from "vite-plus/test";

import {
  buildToolCallExpandedBody,
  toolWorkEntryHeading,
  workEntryIconName,
  workEntryPreview,
  workGroupSectionLabel,
  workGroupToggleNoun,
  workToneIcon,
  type TimelineWorkEntry,
} from "./transcriptRowPresentation";

function entry(overrides: Partial<TimelineWorkEntry> = {}): TimelineWorkEntry {
  return {
    id: "e1",
    label: "run command",
    tone: "tool",
    ...overrides,
  } as TimelineWorkEntry;
}

describe("transcriptRowPresentation", () => {
  it("maps tones to icon intents", () => {
    expect(workToneIcon("error").iconName).toBe("circle-alert");
    expect(workToneIcon("thinking").iconName).toBe("bot");
    expect(workToneIcon("info").iconName).toBe("check");
    expect(workToneIcon("tool").iconName).toBe("zap");
  });

  it("prefers command, then detail, then changed files for previews", () => {
    expect(workEntryPreview(entry({ command: "vp test" }), "/repo")).toBe("vp test");
    expect(workEntryPreview(entry({ detail: "compiled" }), "/repo")).toBe("compiled");
    expect(
      workEntryPreview(entry({ changedFiles: ["/repo/src/a.ts", "/repo/src/b.ts"] }), "/repo"),
    ).toBe("repo/src/a.ts +1 more");
    expect(workEntryPreview(entry({}), "/repo")).toBeNull();
  });

  it("builds expanded bodies from raw command, detail, and changed files", () => {
    const body = buildToolCallExpandedBody(
      entry({
        command: "ls",
        rawCommand: "ls -la",
        detail: "total 3",
        changedFiles: ["/repo/x.ts"],
      }),
      "/repo",
    );
    expect(body).toBe("ls -la\n\ntotal 3\n\nrepo/x.ts");
    expect(buildToolCallExpandedBody(entry({}), "/repo")).toBeNull();
  });

  it("deduplicates raw commands that match the display command", () => {
    const body = buildToolCallExpandedBody(entry({ command: "ls", rawCommand: "ls" }), "/repo");
    expect(body).toBe("ls");
  });

  it("derives icon names from request kind and item type", () => {
    expect(workEntryIconName(entry({ requestKind: "command" }))).toBe("terminal");
    expect(workEntryIconName(entry({ requestKind: "file-read" }))).toBe("eye");
    expect(workEntryIconName(entry({ requestKind: "file-change" }))).toBe("square-pen");
    expect(workEntryIconName(entry({ itemType: "web_search" }))).toBe("globe");
    expect(workEntryIconName(entry({ itemType: "mcp_tool_call" }))).toBe("wrench");
    expect(workEntryIconName(entry({ sourceActivityKind: "user-input.requested" }))).toBe(
      "message-circle",
    );
  });

  it("capitalizes and compacts headings", () => {
    expect(toolWorkEntryHeading(entry({ label: "  ran   tests " }))).toBe("Ran   tests");
    expect(toolWorkEntryHeading(entry({ label: "build complete" }))).toBe("Build");
    expect(toolWorkEntryHeading(entry({ toolTitle: "bash" }))).toBe("Bash");
  });

  it("derives work-toggle nouns and section labels", () => {
    expect(workGroupToggleNoun({ onlyToolEntries: true, hiddenCount: 1 })).toBe("tool call");
    expect(workGroupToggleNoun({ onlyToolEntries: true, hiddenCount: 4 })).toBe("tool calls");
    expect(workGroupToggleNoun({ onlyToolEntries: false, hiddenCount: 1 })).toBe("log entry");
    expect(workGroupToggleNoun({ onlyToolEntries: false, hiddenCount: 2 })).toBe("log entries");
    expect(workGroupSectionLabel({ onlyToolEntries: true, entryCount: 1 })).toBe("1 tool call");
    expect(workGroupSectionLabel({ onlyToolEntries: true, entryCount: 5 })).toBe("5 tool calls");
    expect(workGroupSectionLabel({ onlyToolEntries: false, entryCount: 5 })).toBe("Work Log");
  });
});
