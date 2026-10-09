import { describe, expect, it } from "vite-plus/test";

import { EventId, TurnId, type OrchestrationThreadActivity } from "@t3tools/contracts";

import {
  computeStableMessagesTimelineRows,
  deriveActiveWorkStartedAt,
  deriveMessagesTimelineRows,
  deriveWorkLogEntries,
  summarizeToolGroup,
  toolGroupSummaryKind,
  workEntryDisplayIndicatesToolFailure,
  workEntryIndicatesToolFailure,
  type MessagesTimelineRow,
  type TimelineEntry,
  type TimelineLatestTurn,
  type TranscriptMessage,
  type WorkLogEntry,
} from "./transcript.ts";

const turn1 = TurnId.make("turn-1");

const runningTurn: TimelineLatestTurn = {
  turnId: turn1,
  state: "running",
  startedAt: "2026-01-01T00:00:00Z",
  completedAt: null,
};

function workEntry(
  entryId: string,
  createdAt: string,
  entry: Omit<WorkLogEntry, "id" | "createdAt">,
): Extract<TimelineEntry, { kind: "work" }> {
  return {
    id: `${entryId}-entry`,
    kind: "work",
    createdAt,
    entry: { id: entryId, createdAt, ...entry },
  };
}

function messageEntry(
  messageId: string,
  createdAt: string,
  message: Pick<TranscriptMessage, "role" | "text"> & { turnId?: TurnId | null },
): Extract<TimelineEntry, { kind: "message" }> {
  return {
    id: `${messageId}-entry`,
    kind: "message",
    createdAt,
    message: {
      id: messageId,
      streaming: false,
      createdAt,
      updatedAt: createdAt,
      turnId: message.turnId ?? null,
      ...message,
    },
  };
}

function command(
  entryId: string,
  createdAt: string,
  status: WorkLogEntry["toolLifecycleStatus"],
  overrides: Partial<WorkLogEntry> = {},
) {
  return workEntry(entryId, createdAt, {
    turnId: turn1,
    label: status === "inProgress" ? "Running command" : "Ran command",
    command: `rg ${entryId}`,
    requestKind: "command",
    tone: "tool",
    ...(status ? { toolLifecycleStatus: status } : {}),
    ...overrides,
  });
}

function runningRows(timelineEntries: ReadonlyArray<TimelineEntry>): MessagesTimelineRow[] {
  return deriveMessagesTimelineRows({
    timelineEntries,
    latestTurn: runningTurn,
    isWorking: true,
    activeTurnStartedAt: "2026-01-01T00:00:00Z",
  });
}

function activity(input: {
  readonly id: string;
  readonly kind: string;
  readonly createdAt: string;
  readonly turnId: string;
  readonly summary: string;
  readonly payload: unknown;
}): OrchestrationThreadActivity {
  return {
    id: EventId.make(input.id),
    kind: input.kind,
    summary: input.summary,
    tone: "tool",
    payload: input.payload,
    turnId: TurnId.make(input.turnId),
    createdAt: input.createdAt,
  };
}

describe("summarizeToolGroup", () => {
  const base = { label: "Tool", tone: "tool" as const };

  it("counts each action and joins them as a sentence", () => {
    expect(summarizeToolGroup([{ ...base, requestKind: "command", command: "ls" }])).toBe(
      "Ran 1 command",
    );
    expect(
      summarizeToolGroup([
        { ...base, requestKind: "command", command: "ls" },
        { ...base, requestKind: "file-read" },
      ]),
    ).toBe("Ran 1 command and read 1 file");
    expect(
      summarizeToolGroup([
        { ...base, requestKind: "file-read" },
        { ...base, itemType: "image_view" },
        { ...base, requestKind: "file-change", changedFiles: ["a.ts", "b.ts"] },
        { ...base, requestKind: "file-change", changedFiles: ["a.ts"] },
        { ...base, itemType: "web_search", toolTitle: "grep" },
        { ...base, itemType: "web_search", toolTitle: "Search the docs" },
        { ...base, itemType: "mcp_tool_call" },
      ]),
    ).toBe(
      "Read 2 files, changed 2 files, searched code 1 time, searched the web 1 time, and used 1 tool",
    );
  });

  it("ignores superseded id-less lifecycle markers", () => {
    expect(
      summarizeToolGroup([
        { ...base, itemType: "mcp_tool_call", sourceActivityKind: "tool.updated" },
        { ...base, itemType: "mcp_tool_call", sourceActivityKind: "tool.completed" },
      ]),
    ).toBe("Used 1 tool");
  });

  it("derives the icon kind from a single action or fallback tone", () => {
    expect(toolGroupSummaryKind([{ ...base, requestKind: "file-read" }])).toBe("read");
    expect(
      toolGroupSummaryKind([
        { ...base, requestKind: "file-read" },
        { ...base, command: "ls" },
      ]),
    ).toBe("mixed");
    expect(toolGroupSummaryKind([{ ...base, itemType: "dynamic_tool_call" }])).toBe("dynamic-tool");
    expect(toolGroupSummaryKind([{ ...base, tone: "thinking" }])).toBe("agent-tool");
    expect(toolGroupSummaryKind([base])).toBe("tone-tool");
  });
});

describe("tool failure display", () => {
  it("treats the command as intent, not output", () => {
    const entry: WorkLogEntry = {
      id: "e1",
      createdAt: "2026-01-01T00:00:00Z",
      label: "Ran command",
      tone: "tool",
      command: "echo 'command not found'",
      toolLifecycleStatus: "completed",
    };
    expect(workEntryIndicatesToolFailure(entry)).toBe(true);
    expect(workEntryDisplayIndicatesToolFailure(entry)).toBe(false);
  });
});

describe("deriveMessagesTimelineRows tool groups", () => {
  it("places the working row at the top of the active turn", () => {
    const rows = runningRows([
      messageEntry("assistant-thought", "2026-01-01T00:00:05Z", {
        role: "assistant",
        text: "Working on it.",
        turnId: turn1,
      }),
      workEntry("work-1", "2026-01-01T00:00:08Z", {
        turnId: turn1,
        label: "Ran command",
        tone: "tool",
      }),
    ]);

    expect(rows.some((row) => row.kind === "turn-fold")).toBe(false);
    expect(rows.map((row) => row.id)).toEqual([
      "working-indicator-row",
      "assistant-thought-entry",
      "work-live:work-1-entry",
    ]);
    expect(rows[0]).toMatchObject({ kind: "working", showThinking: false });
  });

  it("shows Thinking while the active turn has nothing visible", () => {
    const rows = deriveMessagesTimelineRows({
      timelineEntries: [messageEntry("user", "2026-01-01T00:00:01Z", { role: "user", text: "go" })],
      isWorking: true,
      activeTurnStartedAt: "2026-01-01T00:00:01Z",
    });
    expect(rows.map((row) => row.kind)).toEqual(["message", "working"]);
    expect(rows[1]).toMatchObject({ showThinking: true });
  });

  it("keeps adjacent active tool calls in one replacing row", () => {
    const rows = runningRows([
      command("completed-command", "2026-01-01T00:00:05Z", "completed"),
      workEntry("completed-edit", "2026-01-01T00:00:06Z", {
        turnId: turn1,
        label: "Edited files",
        requestKind: "file-change",
        changedFiles: ["src/one.ts", "src/two.ts"],
        tone: "tool",
        toolLifecycleStatus: "completed",
      }),
      command("running-command", "2026-01-01T00:00:07Z", "inProgress"),
    ]);

    expect(rows.map((row) => row.kind)).toEqual(["working", "work-live"]);
    expect(rows.find((row) => row.kind === "work-live")).toMatchObject({
      entry: { id: "running-command" },
      groupedEntries: [
        { id: "completed-command" },
        { id: "completed-edit" },
        { id: "running-command" },
      ],
    });
  });

  it("expands the live row into per-entry rows marking the last one", () => {
    const entries = [
      command("completed-command", "2026-01-01T00:00:05Z", "completed", {
        toolCallId: "call-1",
      }),
      command("running-command", "2026-01-01T00:00:07Z", "inProgress"),
    ];
    const collapsed = runningRows(entries);
    const live = collapsed.find((row) => row.kind === "work-live");
    if (live?.kind !== "work-live") throw new Error("expected live row");
    expect(live.groupId).toBe("work-group:tool:turn-1:call-1");
    expect(live.id).toBe("work-live:tool:turn-1:call-1");

    const expanded = deriveMessagesTimelineRows({
      timelineEntries: entries,
      latestTurn: runningTurn,
      isWorking: true,
      activeTurnStartedAt: "2026-01-01T00:00:00Z",
      expandedWorkGroupIds: new Set([live.groupId]),
    });
    expect(expanded.map((row) => row.id)).toEqual([
      "working-indicator-row",
      "work-live:tool:turn-1:call-1",
      "completed-command",
      "running-command",
    ]);
    expect(
      expanded
        .filter((row) => row.kind === "work")
        .map((row) => [row.isExpandedToolGroupEntry, row.isLastExpandedToolGroupEntry]),
    ).toEqual([
      [true, false],
      [true, true],
    ]);
  });

  it("summarizes a tool run after commentary starts a new run", () => {
    const rows = runningRows([
      command("completed-command", "2026-01-01T00:00:05Z", "completed"),
      messageEntry("assistant-commentary", "2026-01-01T00:00:06Z", {
        role: "assistant",
        text: "Checking another thing.",
        turnId: turn1,
      }),
      command("running-command", "2026-01-01T00:00:07Z", "inProgress"),
    ]);

    expect(rows.map((row) => row.kind)).toEqual(["working", "work-toggle", "message", "work-live"]);
    expect(rows.find((row) => row.kind === "work-toggle")).toMatchObject({
      hiddenCount: 1,
      summary: "Ran 1 command",
      summaryKind: "command",
      hasFailure: false,
    });
  });

  it("keeps separated in-progress tool runs visible", () => {
    const rows = runningRows([
      command("first-running", "2026-01-01T00:00:05Z", "inProgress"),
      messageEntry("assistant-commentary", "2026-01-01T00:00:06Z", {
        role: "assistant",
        text: "Starting another command.",
        turnId: turn1,
      }),
      command("second-running", "2026-01-01T00:00:07Z", "inProgress"),
    ]);

    expect(rows.map((row) => row.kind)).toEqual(["working", "work-live", "message", "work-live"]);
    expect(rows.flatMap((row) => (row.kind === "work-live" ? [row.entry.id] : []))).toEqual([
      "first-running",
      "second-running",
    ]);
  });

  it("does not revive stale in-progress tools before a fresh send has a turn id", () => {
    const rows = deriveMessagesTimelineRows({
      timelineEntries: [
        command("stale-running", "2026-01-01T00:00:05Z", "inProgress"),
        messageEntry("user-followup", "2026-01-01T00:01:00Z", { role: "user", text: "continue" }),
      ],
      latestTurn: null,
      isWorking: true,
      activeTurnStartedAt: "2026-01-01T00:01:00Z",
    });

    expect(rows.some((row) => row.kind === "work-live")).toBe(false);
  });

  it("does not revive separated historical task progress", () => {
    const rows = runningRows([
      workEntry("stale-progress", "2026-01-01T00:00:05Z", {
        turnId: turn1,
        label: "Old progress",
        tone: "thinking",
        sourceActivityKind: "task.progress",
      }),
      messageEntry("assistant-commentary", "2026-01-01T00:00:06Z", {
        role: "assistant",
        text: "Starting another command.",
        turnId: turn1,
      }),
      command("running-command", "2026-01-01T00:00:07Z", "inProgress"),
    ]);

    expect(rows.flatMap((row) => (row.kind === "work-live" ? [row.entry.id] : []))).toEqual([
      "running-command",
    ]);
  });

  it("keeps the latest completed tool call live while the turn is running", () => {
    const rows = runningRows([command("latest-command", "2026-01-01T00:00:05Z", "completed")]);

    expect(rows.map((row) => row.kind)).toEqual(["working", "work-live"]);
    expect(rows.find((row) => row.kind === "work-live")).toMatchObject({
      entry: { id: "latest-command" },
      groupedEntries: [{ id: "latest-command" }],
    });
  });

  it("models tool group expansion as inserted list rows", () => {
    const timelineEntries = [
      workEntry("work-1", "2026-01-01T00:00:01Z", {
        label: "read",
        detail: "Reading package.json",
        tone: "tool",
      }),
      workEntry("work-2", "2026-01-01T00:00:02Z", {
        label: "edit",
        detail: "Editing MessagesTimeline.tsx",
        tone: "tool",
      }),
      workEntry("work-3", "2026-01-01T00:00:03Z", {
        label: "test",
        detail: "Running tests",
        tone: "tool",
      }),
    ];
    const baseInput = { timelineEntries, isWorking: false, activeTurnStartedAt: null };
    const collapsedRows = deriveMessagesTimelineRows(baseInput);
    const expandedRows = deriveMessagesTimelineRows({
      ...baseInput,
      expandedWorkGroupIds: new Set(["work-group:work-1-entry"]),
    });

    expect(collapsedRows.map((row) => row.id)).toEqual(["work-toggle:work-1-entry"]);
    expect(collapsedRows.find((row) => row.kind === "work-toggle")).toMatchObject({
      groupId: "work-group:work-1-entry",
      hiddenCount: 3,
      expanded: false,
      onlyToolEntries: true,
      summary: "Used 3 tools",
      summaryKind: "tone-tool",
    });
    expect(expandedRows.map((row) => row.id)).toEqual([
      "work-toggle:work-1-entry",
      "work-1",
      "work-2",
      "work-3",
    ]);
  });

  it("marks a summary row that hides a failed tool call", () => {
    const rows = deriveMessagesTimelineRows({
      timelineEntries: [
        command("ok", "2026-01-01T00:00:01Z", "completed", { turnId: null }),
        command("bad", "2026-01-01T00:00:02Z", "failed", { turnId: null }),
      ],
      isWorking: false,
      activeTurnStartedAt: null,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "work-toggle",
      summary: "Ran 2 commands",
      hasFailure: true,
    });
  });

  it("keeps the +N previous toggle for groups with non-tool entries", () => {
    const rows = deriveMessagesTimelineRows({
      timelineEntries: [
        command("ok", "2026-01-01T00:00:01Z", "completed", { turnId: null }),
        workEntry("note", "2026-01-01T00:00:02Z", { label: "Note", tone: "info" }),
        command("last", "2026-01-01T00:00:03Z", "completed", { turnId: null }),
      ],
      isWorking: false,
      activeTurnStartedAt: null,
    });
    expect(rows.map((row) => row.id)).toEqual(["last", "work-toggle:ok-entry"]);
    expect(rows[1]).toMatchObject({
      hiddenCount: 2,
      onlyToolEntries: false,
      summary: null,
      summaryKind: null,
    });
  });
});

describe("computeStableMessagesTimelineRows tool groups", () => {
  it("replaces rows when summary, live entry, or expansion flags change", () => {
    const entries = [
      command("completed", "2026-01-01T00:00:05Z", "completed"),
      command("running", "2026-01-01T00:00:06Z", "inProgress"),
    ];
    const first = computeStableMessagesTimelineRows(runningRows(entries), {
      byId: new Map(),
      result: [],
    });
    const same = computeStableMessagesTimelineRows(runningRows(entries), first);
    expect(same).toBe(first);

    const finished = computeStableMessagesTimelineRows(
      runningRows([entries[0]!, command("running", "2026-01-01T00:00:06Z", "completed")]),
      same,
    );
    expect(finished).not.toBe(same);
    expect(finished.result[0]).toBe(same.result[0]);
    expect(finished.result[1]).not.toBe(same.result[1]);
  });
});

describe("deriveWorkLogEntries lifecycle collapse", () => {
  it("collapses interleaved lifecycle updates by tool call id", () => {
    const activities = [
      activity({
        id: "tool-a-progress",
        createdAt: "2026-02-23T00:00:01.000Z",
        turnId: "turn-1",
        kind: "tool.updated",
        summary: "Tool A",
        payload: {
          itemType: "command_execution",
          toolCallId: "call-a",
          status: "inProgress",
          data: { command: "vp test run" },
        },
      }),
      activity({
        id: "tool-b-progress",
        createdAt: "2026-02-23T00:00:02.000Z",
        turnId: "turn-1",
        kind: "tool.updated",
        summary: "Tool B",
        payload: {
          itemType: "command_execution",
          toolCallId: "call-b",
          status: "inProgress",
          data: { command: "vp lint" },
        },
      }),
      activity({
        id: "tool-a-complete",
        createdAt: "2026-02-23T00:00:03.000Z",
        turnId: "turn-1",
        kind: "tool.completed",
        summary: "Tool A completed",
        payload: { itemType: "command_execution", toolCallId: "call-a", status: "completed" },
      }),
      activity({
        id: "tool-b-complete",
        createdAt: "2026-02-23T00:00:04.000Z",
        turnId: "turn-1",
        kind: "tool.completed",
        summary: "Tool B completed",
        payload: { itemType: "command_execution", toolCallId: "call-b", status: "completed" },
      }),
    ];

    expect(deriveWorkLogEntries(activities)).toMatchObject([
      {
        id: "tool-a-complete",
        command: "vp test run",
        toolCallId: "call-a",
        toolLifecycleStatus: "completed",
      },
      {
        id: "tool-b-complete",
        command: "vp lint",
        toolCallId: "call-b",
        toolLifecycleStatus: "completed",
      },
    ]);
  });

  it("does not merge reused tool call ids across turns", () => {
    const activities = [
      activity({
        id: "turn-1-tool",
        createdAt: "2026-02-23T00:00:01.000Z",
        turnId: "turn-1",
        kind: "tool.updated",
        summary: "Tool",
        payload: { itemType: "command_execution", toolCallId: "reused-call", status: "inProgress" },
      }),
      activity({
        id: "turn-2-tool",
        createdAt: "2026-02-23T00:00:02.000Z",
        turnId: "turn-2",
        kind: "tool.completed",
        summary: "Tool completed",
        payload: { itemType: "command_execution", toolCallId: "reused-call", status: "completed" },
      }),
    ];

    expect(deriveWorkLogEntries(activities)).toHaveLength(2);
  });
});

describe("deriveActiveWorkStartedAt", () => {
  it("falls back to the latest user message while a running turn is being acknowledged", () => {
    expect(
      deriveActiveWorkStartedAt(
        {
          turnId: turn1,
          startedAt: "2026-02-27T21:10:00.000Z",
          completedAt: "2026-02-27T21:10:30.000Z",
        },
        { status: "running", activeTurnId: TurnId.make("turn-2") },
        null,
        "2026-02-27T21:11:00.000Z",
      ),
    ).toBe("2026-02-27T21:11:00.000Z");
  });
});
