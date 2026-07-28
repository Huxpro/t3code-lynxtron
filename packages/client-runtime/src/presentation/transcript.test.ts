import { describe, expect, it } from "vite-plus/test";

import { EventId, MessageId, TurnId, type OrchestrationThreadActivity } from "@t3tools/contracts";

import {
  computeMessageDurationStart,
  computeStableMessagesTimelineRows,
  deriveMessagesTimelineRows,
  deriveTimelineEntries,
  deriveWorkLogEntries,
  formatDuration,
  workEntryIndicatesToolFailure,
  workEntryIndicatesToolSuccess,
  type StableMessagesTimelineRowsState,
  type TimelineEntry,
  type TranscriptMessage,
} from "./transcript.ts";

function activity(input: {
  readonly id: string;
  readonly kind: string;
  readonly createdAt: string;
  readonly turnId?: string | null;
  readonly tone?: OrchestrationThreadActivity["tone"];
  readonly summary?: string;
  readonly payload?: unknown;
  readonly sequence?: number;
}): OrchestrationThreadActivity {
  return {
    id: EventId.make(input.id),
    kind: input.kind,
    summary: input.summary ?? "Activity",
    tone: input.tone ?? "tool",
    payload: input.payload ?? null,
    turnId: input.turnId === null ? null : TurnId.make(input.turnId ?? "turn-1"),
    createdAt: input.createdAt,
    ...(input.sequence !== undefined ? { sequence: input.sequence } : {}),
  };
}

interface FixtureMessage extends TranscriptMessage {
  readonly text: string;
}

function message(input: {
  readonly id: string;
  readonly role: "user" | "assistant" | "system";
  readonly createdAt: string;
  readonly turnId?: string | null;
  readonly streaming?: boolean;
  readonly updatedAt?: string;
  readonly text?: string;
}): FixtureMessage {
  return {
    id: MessageId.make(input.id),
    role: input.role,
    text: input.text ?? `${input.role} says`,
    turnId: input.turnId === null ? null : TurnId.make(input.turnId ?? "turn-1"),
    streaming: input.streaming ?? false,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt ?? input.createdAt,
  };
}

describe("deriveWorkLogEntries", () => {
  it("filters lifecycle noise and checkpoint captures", () => {
    const entries = deriveWorkLogEntries([
      activity({ id: "a1", kind: "tool.started", createdAt: "2026-01-01T00:00:01.000Z" }),
      activity({ id: "a2", kind: "task.started", createdAt: "2026-01-01T00:00:02.000Z" }),
      activity({
        id: "a3",
        kind: "context-window.updated",
        createdAt: "2026-01-01T00:00:03.000Z",
      }),
      activity({
        id: "a4",
        kind: "checkpoint.captured",
        summary: "Checkpoint captured",
        createdAt: "2026-01-01T00:00:04.000Z",
      }),
      activity({
        id: "a5",
        kind: "tool.completed",
        summary: "Read file",
        createdAt: "2026-01-01T00:00:05.000Z",
      }),
    ]);

    expect(entries.map((entry) => entry.id)).toEqual(["a5"]);
    expect(entries[0]?.sourceActivityKind).toBe("tool.completed");
    expect(entries[0]?.toolLifecycleStatus).toBe("completed");
  });

  it("collapses tool.updated -> tool.completed with a shared toolCallId", () => {
    const entries = deriveWorkLogEntries([
      activity({
        id: "u1",
        kind: "tool.updated",
        summary: "Run tests",
        createdAt: "2026-01-01T00:00:01.000Z",
        payload: { status: "inProgress", data: { toolCallId: "call-1" } },
      }),
      activity({
        id: "u2",
        kind: "tool.completed",
        summary: "Run tests complete",
        createdAt: "2026-01-01T00:00:02.000Z",
        payload: { status: "completed", data: { toolCallId: "call-1" } },
      }),
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.toolLifecycleStatus).toBe("completed");
  });

  it("orders by sequence before createdAt", () => {
    const entries = deriveWorkLogEntries([
      activity({
        id: "late",
        kind: "info.logged",
        tone: "info",
        createdAt: "2026-01-01T00:00:09.000Z",
        sequence: 1,
      }),
      activity({
        id: "early",
        kind: "info.logged",
        tone: "info",
        createdAt: "2026-01-01T00:00:01.000Z",
        sequence: 2,
      }),
    ]);

    expect(entries.map((entry) => entry.id)).toEqual(["late", "early"]);
  });
});

describe("tool status affordances", () => {
  it("marks failure from error-shaped detail even when status is completed", () => {
    const [entry] = deriveWorkLogEntries([
      activity({
        id: "f1",
        kind: "tool.completed",
        summary: "Read file",
        createdAt: "2026-01-01T00:00:01.000Z",
        payload: { status: "completed", detail: "cat: missing.txt: No such file or directory" },
      }),
    ]);
    expect(entry).toBeDefined();
    expect(workEntryIndicatesToolFailure(entry!)).toBe(true);
    expect(workEntryIndicatesToolSuccess(entry!)).toBe(false);
  });
});

describe("deriveTimelineEntries", () => {
  it("merges messages, plans, and work sorted by createdAt", () => {
    const workEntries = deriveWorkLogEntries([
      activity({ id: "w1", kind: "tool.completed", createdAt: "2026-01-01T00:00:02.000Z" }),
    ]);
    const entries = deriveTimelineEntries(
      [message({ id: "m1", role: "user", createdAt: "2026-01-01T00:00:01.000Z" })],
      [{ id: "p1", createdAt: "2026-01-01T00:00:03.000Z" }],
      workEntries,
    );

    expect(entries.map((entry) => entry.kind)).toEqual(["message", "work", "proposed-plan"]);
  });
});

describe("deriveMessagesTimelineRows", () => {
  const settledLatestTurn = {
    turnId: TurnId.make("turn-1"),
    state: "completed" as const,
    startedAt: "2026-01-01T00:00:01.000Z",
    completedAt: "2026-01-01T00:00:13.000Z",
  };

  function turnOneEntries(): TimelineEntry<FixtureMessage, { id: string; createdAt: string }>[] {
    const workEntries = deriveWorkLogEntries([
      activity({
        id: "w1",
        kind: "tool.completed",
        summary: "Read file",
        createdAt: "2026-01-01T00:00:02.000Z",
      }),
    ]);
    return deriveTimelineEntries(
      [
        message({ id: "m-user", role: "user", createdAt: "2026-01-01T00:00:01.000Z" }),
        message({
          id: "m-assistant",
          role: "assistant",
          createdAt: "2026-01-01T00:00:03.000Z",
          updatedAt: "2026-01-01T00:00:12.000Z",
        }),
      ],
      [],
      workEntries,
    );
  }

  it("folds a settled turn behind a Worked-for row and keeps the terminal message", () => {
    const rows = deriveMessagesTimelineRows({
      timelineEntries: turnOneEntries(),
      latestTurn: settledLatestTurn,
      isWorking: false,
      activeTurnStartedAt: null,
    });

    expect(rows.map((row) => row.kind)).toEqual(["message", "turn-fold", "message"]);
    const fold = rows[1];
    if (fold?.kind !== "turn-fold") throw new Error("expected turn fold");
    expect(fold.label).toBe("Worked for 12s");
    expect(fold.expanded).toBe(false);
    const terminal = rows[2];
    if (terminal?.kind !== "message") throw new Error("expected message row");
    expect(terminal.message.id).toBe("m-assistant");
    expect(terminal.showAssistantMeta).toBe(true);
  });

  it("expands folded work when the turn id is in expandedTurnIds", () => {
    const rows = deriveMessagesTimelineRows({
      timelineEntries: turnOneEntries(),
      latestTurn: settledLatestTurn,
      expandedTurnIds: new Set([TurnId.make("turn-1")]),
      isWorking: false,
      activeTurnStartedAt: null,
    });

    expect(rows.map((row) => row.kind)).toEqual(["message", "turn-fold", "work", "message"]);
  });

  it("labels the latest interrupted turn as stopped", () => {
    const rows = deriveMessagesTimelineRows({
      timelineEntries: turnOneEntries(),
      latestTurn: { ...settledLatestTurn, state: "interrupted" },
      isWorking: false,
      activeTurnStartedAt: null,
    });

    const fold = rows.find((row) => row.kind === "turn-fold");
    if (fold?.kind !== "turn-fold") throw new Error("expected turn fold");
    expect(fold.label).toBe("You stopped after 12s");
  });

  it("collapses long unsettled work runs behind a work-toggle row", () => {
    const workEntries = deriveWorkLogEntries(
      ["2026-01-01T00:00:02.000Z", "2026-01-01T00:00:03.000Z", "2026-01-01T00:00:04.000Z"].map(
        (createdAt, index) =>
          activity({
            id: `w${index}`,
            kind: "tool.completed",
            summary: `Step ${index}`,
            turnId: "turn-2",
            createdAt,
            payload: { data: { toolCallId: `call-${index}` } },
          }),
      ),
    );
    const entries = deriveTimelineEntries(
      [
        message({
          id: "m-user",
          role: "user",
          turnId: "turn-2",
          createdAt: "2026-01-01T00:00:01.000Z",
        }),
      ],
      [],
      workEntries,
    );

    const rows = deriveMessagesTimelineRows({
      timelineEntries: entries,
      runningTurnId: TurnId.make("turn-2"),
      isWorking: true,
      activeTurnStartedAt: "2026-01-01T00:00:01.500Z",
    });

    const kinds = rows.map((row) => row.kind);
    expect(kinds).toEqual(["message", "work", "work-toggle", "working"]);
    const toggle = rows[2];
    if (toggle?.kind !== "work-toggle") throw new Error("expected work toggle");
    expect(toggle.hiddenCount).toBe(2);
    expect(toggle.expanded).toBe(false);
  });
});

describe("computeMessageDurationStart", () => {
  it("anchors assistant durations to the preceding user boundary", () => {
    const result = computeMessageDurationStart([
      message({ id: "u1", role: "user", createdAt: "2026-01-01T00:00:01.000Z" }),
      message({
        id: "a1",
        role: "assistant",
        createdAt: "2026-01-01T00:00:05.000Z",
        updatedAt: "2026-01-01T00:00:09.000Z",
      }),
    ]);
    expect(result.get("a1")).toBe("2026-01-01T00:00:01.000Z");
  });
});

describe("computeStableMessagesTimelineRows", () => {
  it("preserves row identity for unchanged rows", () => {
    const initial: StableMessagesTimelineRowsState<FixtureMessage> = {
      byId: new Map(),
      result: [],
    };
    const rows = deriveMessagesTimelineRows<FixtureMessage, never>({
      timelineEntries: deriveTimelineEntries<FixtureMessage, never>(
        [message({ id: "m1", role: "user", createdAt: "2026-01-01T00:00:01.000Z" })],
        [],
        [],
      ),
      isWorking: false,
      activeTurnStartedAt: null,
    });
    const first = computeStableMessagesTimelineRows(rows, initial);
    const second = computeStableMessagesTimelineRows([...rows], first);
    expect(second).toBe(first);
  });
});

describe("formatDuration", () => {
  it("formats bucket boundaries", () => {
    expect(formatDuration(500)).toBe("500ms");
    expect(formatDuration(9_950)).toBe("10s");
    expect(formatDuration(59_000)).toBe("59s");
    expect(formatDuration(60_000)).toBe("1m");
    expect(formatDuration(90_000)).toBe("1m 30s");
  });
});
