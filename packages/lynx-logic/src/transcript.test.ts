import { describe, expect, it } from "vite-plus/test";

import { EventId, MessageId, TurnId, type OrchestrationThreadActivity } from "@t3tools/contracts";

import {
  assistantMessageDisplayText,
  computeMessageDurationStart,
  computeStableMessagesTimelineRows,
  deriveMessagesTimelineRows,
  deriveTimelineMinimapItems,
  deriveTimelineEntries,
  deriveWorkLogEntries,
  formatDuration,
  getAnchoredTurnMetrics,
  getTimelineRowBottom,
  shouldShowAssistantChangedFiles,
  INITIAL_TRANSCRIPT_FOLLOW_STATE,
  reduceTimelineScrollMode,
  reduceTranscriptFollow,
  deriveTranscriptNewTurnAnchor,
  shouldShowEmptyTranscript,
  workEntryIndicatesToolFailure,
  workEntryIndicatesToolSuccess,
  type StableMessagesTimelineRowsState,
  type TimelineEntry,
  type TranscriptMessage,
  deriveRevertTurnCountByUserMessageId,
  indexCheckpointSummariesByAssistantMessageId,
  projectRevertCheckpointConfirmation,
} from "./transcript.ts";

describe("assistantMessageDisplayText", () => {
  it("preserves authored text and distinguishes streaming from settled emptiness", () => {
    expect(assistantMessageDisplayText("done", false)).toBe("done");
    expect(assistantMessageDisplayText("", true)).toBe("");
    expect(assistantMessageDisplayText("   ", false)).toBe("(empty response)");
    expect(assistantMessageDisplayText(undefined, false)).toBe("(empty response)");
  });
});

function buildTimelineMeasurementState({
  positions,
  sizes,
  scroll = 0,
  scrollLength = 700,
}: {
  readonly positions: readonly number[];
  readonly sizes: readonly number[];
  readonly scroll?: number;
  readonly scrollLength?: number;
}) {
  return {
    data: positions.map((_, index) => index),
    scroll,
    scrollLength,
    positionAtIndex: (index: number) => positions[index],
    sizeAtIndex: (index: number) => sizes[index],
  };
}

describe("timeline scroll anchoring", () => {
  it("measures row bottoms from renderer-neutral row position and size", () => {
    const state = buildTimelineMeasurementState({ positions: [0, 120], sizes: [80, 40] });
    expect(getTimelineRowBottom(state, 1)).toBe(160);
  });

  it("treats the active turn as fitting when it fits above the composer", () => {
    const metrics = getAnchoredTurnMetrics({
      state: buildTimelineMeasurementState({
        positions: [0, 300, 460],
        sizes: [240, 80, 140],
        scrollLength: 760,
      }),
      anchorIndex: 1,
      composerOverlayHeight: 180,
      anchorOffset: 16,
    });
    expect(metrics).toMatchObject({
      turnHeight: 300,
      usableViewportHeight: 564,
      overflowsUsableViewport: false,
      targetScrollToRevealEnd: 36,
      scrollDeltaToRevealEnd: 36,
    });
  });

  it("targets the real row end instead of any temporary reserved tail", () => {
    const metrics = getAnchoredTurnMetrics({
      state: buildTimelineMeasurementState({
        positions: [0, 1720, 1880],
        sizes: [1600, 80, 120],
        scroll: 1900,
        scrollLength: 760,
      }),
      anchorIndex: 1,
      composerOverlayHeight: 180,
      anchorOffset: 16,
    });
    expect(metrics).toMatchObject({
      lastBottom: 2000,
      targetScrollToRevealEnd: 1436,
      scrollDeltaToRevealEnd: 0,
    });
  });

  it("reports overflow only for the current anchored turn", () => {
    const metrics = getAnchoredTurnMetrics({
      state: buildTimelineMeasurementState({
        positions: [0, 900, 1180],
        sizes: [800, 220, 300],
        scroll: 900,
        scrollLength: 760,
      }),
      anchorIndex: 1,
      composerOverlayHeight: 180,
      anchorOffset: 16,
    });
    expect(metrics).toMatchObject({
      turnHeight: 580,
      usableViewportHeight: 564,
      overflowsUsableViewport: true,
    });
  });

  it("returns the minimal positive scroll delta needed to reveal the turn end", () => {
    const metrics = getAnchoredTurnMetrics({
      state: buildTimelineMeasurementState({
        positions: [0, 900, 1180],
        sizes: [800, 220, 360],
        scroll: 900,
        scrollLength: 760,
      }),
      anchorIndex: 1,
      composerOverlayHeight: 180,
      anchorOffset: 16,
    });
    expect(metrics).toMatchObject({
      lastBottom: 1540,
      visibleUsableBottom: 1464,
      scrollDeltaToRevealEnd: 76,
    });
  });

  it("subtracts composer height from usable viewport height", () => {
    const state = buildTimelineMeasurementState({
      positions: [0, 300],
      sizes: [120, 470],
      scrollLength: 700,
    });
    expect(
      getAnchoredTurnMetrics({
        state,
        anchorIndex: 1,
        composerOverlayHeight: 0,
        anchorOffset: 16,
      })?.overflowsUsableViewport,
    ).toBe(false);
    expect(
      getAnchoredTurnMetrics({
        state,
        anchorIndex: 1,
        composerOverlayHeight: 220,
        anchorOffset: 16,
      })?.overflowsUsableViewport,
    ).toBe(true);
  });
});

describe("timeline scroll mode", () => {
  it("enters anchored mode for a newly sent turn", () => {
    expect(reduceTimelineScrollMode("following-end", { kind: "begin-new-turn" })).toBe(
      "anchoring-new-turn",
    );
  });

  it("detaches only for explicit user navigation away", () => {
    expect(reduceTimelineScrollMode("anchoring-new-turn", { kind: "user-scroll-away" })).toBe(
      "free-scrolling",
    );
  });

  it("returns to follow mode at the end or on a thread change", () => {
    expect(reduceTimelineScrollMode("free-scrolling", { kind: "user-scroll-end" })).toBe(
      "following-end",
    );
    expect(reduceTimelineScrollMode("free-scrolling", { kind: "thread-changed" })).toBe(
      "following-end",
    );
  });
});

describe("empty transcript presentation", () => {
  it("shows only for a truly idle empty session projection", () => {
    expect(
      shouldShowEmptyTranscript({
        activityCount: 0,
        isWorking: false,
        messageCount: 0,
        proposedPlanCount: 0,
      }),
    ).toBe(true);
    expect(
      shouldShowEmptyTranscript({
        activityCount: 0,
        isWorking: true,
        messageCount: 0,
        proposedPlanCount: 0,
      }),
    ).toBe(false);
    expect(
      shouldShowEmptyTranscript({
        activityCount: 1,
        isWorking: false,
        messageCount: 0,
        proposedPlanCount: 0,
      }),
    ).toBe(false);
    expect(
      shouldShowEmptyTranscript({
        activityCount: 0,
        isWorking: false,
        messageCount: 1,
        proposedPlanCount: 0,
      }),
    ).toBe(false);
  });
});

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
  it("keeps expandable thinking entries visible even while their lifecycle is neutral", () => {
    const thinking = deriveWorkLogEntries([
      activity({
        id: "thinking-1",
        kind: "task.progress",
        tone: "info",
        summary: "Thinking through the change",
        payload: {
          summary: "Thinking through the change",
          detail: "Compare the existing call sites.",
        },
        createdAt: "2026-01-01T00:00:01.000Z",
      }),
    ]);
    const deriveRows = (expandedWorkGroupIds: ReadonlySet<string>) =>
      deriveMessagesTimelineRows({
        timelineEntries: thinking.map((entry) => ({
          kind: "work" as const,
          id: entry.id,
          createdAt: entry.createdAt,
          entry,
        })),
        expandedTurnIds: new Set([TurnId.make("turn-1")]),
        expandedWorkGroupIds,
        isWorking: false,
        activeTurnStartedAt: null,
      });

    const collapsed = deriveRows(new Set());
    expect(collapsed.map((row) => row.kind)).toEqual(["turn-fold", "work-toggle"]);
    expect(collapsed[1]).toMatchObject({
      summary: "Used 1 tool",
      summaryKind: "agent-tool",
      groupId: "work-group:thinking-1",
    });

    const expanded = deriveRows(new Set(["work-group:thinking-1"]));
    expect(expanded.find((row) => row.kind === "work")).toMatchObject({
      kind: "work",
      isExpandedToolGroupEntry: true,
      groupedEntries: [{ tone: "thinking", detail: "Compare the existing call sites." }],
    });
  });

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

    expect(rows.map((row) => row.kind)).toEqual(["message", "turn-fold", "work-toggle", "message"]);
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

  it("collapses the running turn's trailing tool calls into one live row", () => {
    const workEntries = deriveWorkLogEntries(
      [
        "2026-01-01T00:00:02.000Z",
        "2026-01-01T00:00:03.000Z",
        "2026-01-01T00:00:04.000Z",
        "2026-01-01T00:00:05.000Z",
        "2026-01-01T00:00:06.000Z",
        "2026-01-01T00:00:07.000Z",
        "2026-01-01T00:00:08.000Z",
      ].map((createdAt, index) =>
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

    expect(rows.map((row) => row.kind)).toEqual(["message", "working", "work-live"]);
    const live = rows[2];
    if (live?.kind !== "work-live") throw new Error("expected live work row");
    expect(live.id).toBe("work-live:tool:turn-2:call-0");
    expect(live.groupId).toBe("work-group:tool:turn-2:call-0");
    expect(live.entry.id).toBe("w6");
    expect(live.groupedEntries).toHaveLength(7);
    expect(live.expanded).toBe(false);
  });
});

describe("timeline minimap projection", () => {
  it("pairs each user turn with its final assistant preview", () => {
    const rows = [
      {
        kind: "message",
        id: "u1",
        message: message({ id: "u1", role: "user", text: " First   request " }),
      },
      {
        kind: "message",
        id: "a1",
        message: message({ id: "a1", role: "assistant", text: "draft" }),
      },
      {
        kind: "message",
        id: "a2",
        message: message({ id: "a2", role: "assistant", text: " Final   reply " }),
      },
      { kind: "message", id: "u2", message: message({ id: "u2", role: "user", text: "Second" }) },
    ] as unknown as Parameters<typeof deriveTimelineMinimapItems>[0];

    expect(deriveTimelineMinimapItems(rows)).toEqual([
      { id: "u1", rowIndex: 0, userText: "First request", assistantText: "Final reply" },
      { id: "u2", rowIndex: 3, userText: "Second", assistantText: null },
    ]);
  });

  it("keeps send-time context payloads out of minimap previews", () => {
    const rows = [
      {
        kind: "message",
        id: "u-context",
        message: message({
          id: "u-context",
          role: "user",
          text: [
            "Inspect this",
            "",
            "<terminal_context>",
            "- Terminal line 1:",
            "  1 | secret output",
            "</terminal_context>",
          ].join("\n"),
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
      },
    ] as unknown as Parameters<typeof deriveTimelineMinimapItems>[0];

    expect(deriveTimelineMinimapItems(rows)[0]?.userText).toBe("Inspect this");
  });

  it("keeps preview wrappers out of minimap previews while summarizing review cards", () => {
    const rows = [
      {
        kind: "message",
        id: "u-structured",
        message: message({
          id: "u-structured",
          role: "user",
          text: [
            '<review_comment sectionId="turn:2" sectionTitle="Turn 2" filePath="src/app.ts" startIndex="0" endIndex="0" rangeLabel="+1">',
            "Keep this compatible.",
            "```diff",
            "+new",
            "```",
            "</review_comment>",
            "",
            "<preview_annotation>",
            "Preview annotation:",
            "Id: one",
            "Page: Example",
            "Comment: Tighten the spacing.",
            "</preview_annotation>",
          ].join("\n"),
        }),
      },
    ] as unknown as Parameters<typeof deriveTimelineMinimapItems>[0];

    expect(deriveTimelineMinimapItems(rows)[0]?.userText).toBe(
      "src/app.ts · Turn 2 · +1 Keep this compatible. +new",
    );
  });

  it("accepts a renderer-owned cached user-text projection", () => {
    const rows = [
      { kind: "message", id: "u1", message: message({ id: "u1", role: "user" }) },
    ] as unknown as Parameters<typeof deriveTimelineMinimapItems>[0];
    let projections = 0;
    expect(
      deriveTimelineMinimapItems(rows, () => {
        projections += 1;
        return "Cached visible text";
      })[0]?.userText,
    ).toBe("Cached visible text");
    expect(projections).toBe(1);
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

  it("reuses historical rows when only the streaming tail changes", () => {
    const initial: StableMessagesTimelineRowsState<FixtureMessage> = {
      byId: new Map(),
      result: [],
    };
    const historicalMessage = message({
      id: "u1",
      role: "user",
      text: "request",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const firstRows = deriveMessagesTimelineRows<FixtureMessage, never>({
      timelineEntries: deriveTimelineEntries<FixtureMessage, never>(
        [
          historicalMessage,
          message({
            id: "a1",
            role: "assistant",
            text: "draft",
            streaming: true,
            createdAt: "2026-01-01T00:00:01.000Z",
          }),
        ],
        [],
        [],
      ),
      isWorking: true,
      activeTurnStartedAt: null,
    });
    const first = computeStableMessagesTimelineRows(firstRows, initial);
    const nextRows = deriveMessagesTimelineRows<FixtureMessage, never>({
      timelineEntries: deriveTimelineEntries<FixtureMessage, never>(
        [
          historicalMessage,
          message({
            id: "a1",
            role: "assistant",
            text: "draft extended",
            streaming: true,
            createdAt: "2026-01-01T00:00:01.000Z",
            updatedAt: "2026-01-01T00:00:02.000Z",
          }),
        ],
        [],
        [],
      ),
      isWorking: true,
      activeTurnStartedAt: null,
    });
    const second = computeStableMessagesTimelineRows(nextRows, first);

    expect(second.result.map((row) => row.kind)).toEqual(["message", "working", "message"]);
    expect(second.result[0]).toBe(first.result[0]);
    expect(second.result[1]).toBe(first.result[1]);
    expect(second.result[2]).not.toBe(first.result[2]);
  });

  it("reuses rows from value-equal connector payload clones", () => {
    const initial: StableMessagesTimelineRowsState<FixtureMessage> = {
      byId: new Map(),
      result: [],
    };
    const sourceMessage = message({
      id: "u1",
      role: "user",
      text: "stable",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const derive = (value: FixtureMessage) =>
      deriveMessagesTimelineRows<FixtureMessage, never>({
        timelineEntries: deriveTimelineEntries([value], [], []),
        isWorking: false,
        activeTurnStartedAt: null,
      });
    const first = computeStableMessagesTimelineRows(derive(sourceMessage), initial);
    const equalClone = { ...sourceMessage };
    const second = computeStableMessagesTimelineRows(derive(equalClone), first);
    const changed = computeStableMessagesTimelineRows(
      derive({ ...sourceMessage, text: "changed" }),
      second,
    );

    expect(second).toBe(first);
    expect(changed.result[0]).not.toBe(second.result[0]);
  });
});

describe("reduceTranscriptFollow", () => {
  it("detaches only on a user scroll away from the end", () => {
    let state = INITIAL_TRANSCRIPT_FOLLOW_STATE;
    state = reduceTranscriptFollow(state, {
      kind: "scrolled",
      source: "layout",
      distanceFromEnd: 500,
    });
    expect(state.following).toBe(true);
    expect(state.atEnd).toBe(false);

    state = reduceTranscriptFollow(state, {
      kind: "scrolled",
      source: "user",
      distanceFromEnd: 500,
    });
    expect(state.following).toBe(false);
  });

  it("reattaches when the user scrolls back within the threshold", () => {
    let state = reduceTranscriptFollow(INITIAL_TRANSCRIPT_FOLLOW_STATE, {
      kind: "scrolled",
      source: "user",
      distanceFromEnd: 500,
    });
    state = reduceTranscriptFollow(state, {
      kind: "scrolled",
      source: "user",
      distanceFromEnd: 10,
    });
    expect(state).toEqual({ following: true, atEnd: true });
  });

  it("resets on jump-to-latest and thread switches", () => {
    const detached = reduceTranscriptFollow(INITIAL_TRANSCRIPT_FOLLOW_STATE, {
      kind: "scrolled",
      source: "user",
      distanceFromEnd: 999,
    });
    expect(reduceTranscriptFollow(detached, { kind: "jump-to-latest" })).toEqual(
      INITIAL_TRANSCRIPT_FOLLOW_STATE,
    );
    expect(reduceTranscriptFollow(detached, { kind: "thread-changed" })).toEqual(
      INITIAL_TRANSCRIPT_FOLLOW_STATE,
    );
  });

  it("returns the same reference when nothing changes", () => {
    const state = INITIAL_TRANSCRIPT_FOLLOW_STATE;
    expect(
      reduceTranscriptFollow(state, { kind: "scrolled", source: "user", distanceFromEnd: 0 }),
    ).toBe(state);
  });

  it("honors a custom threshold", () => {
    const state = reduceTranscriptFollow(INITIAL_TRANSCRIPT_FOLLOW_STATE, {
      kind: "scrolled",
      source: "user",
      distanceFromEnd: 100,
      threshold: 120,
    });
    expect(state).toEqual({ following: true, atEnd: true });
  });

  it("cannot detach when the transcript does not overflow", () => {
    const detached = { following: false, atEnd: false };
    expect(
      reduceTranscriptFollow(detached, {
        kind: "scrolled",
        source: "user",
        distanceFromEnd: 500,
        contentLength: 220,
        viewportLength: 490,
      }),
    ).toEqual(INITIAL_TRANSCRIPT_FOLLOW_STATE);
  });

  it("ignores scroll events before the viewport has a valid extent", () => {
    const state = INITIAL_TRANSCRIPT_FOLLOW_STATE;
    expect(
      reduceTranscriptFollow(state, {
        kind: "scrolled",
        source: "user",
        distanceFromEnd: 500,
        contentLength: 220,
        viewportLength: 0,
      }),
    ).toBe(state);
    expect(
      reduceTranscriptFollow(state, {
        kind: "scrolled",
        source: "user",
        distanceFromEnd: Number.NaN,
      }),
    ).toBe(state);
  });
});

describe("deriveTranscriptNewTurnAnchor", () => {
  const messages = [
    message({ id: "u1", role: "user", createdAt: "2026-01-01T00:00:00.000Z" }),
    message({ id: "a1", role: "assistant", createdAt: "2026-01-01T00:00:01.000Z" }),
  ];

  it("initializes existing history without requesting an anchor", () => {
    expect(deriveTranscriptNewTurnAnchor(undefined, messages, true)).toEqual({
      newestUserMessageId: "u1",
      anchorMessageId: null,
    });
  });

  it("does not finish hydration from an empty intermediate projection", () => {
    expect(deriveTranscriptNewTurnAnchor(undefined, [], true)).toEqual({
      newestUserMessageId: undefined,
      anchorMessageId: null,
    });
    expect(deriveTranscriptNewTurnAnchor(undefined, messages, true)).toEqual({
      newestUserMessageId: "u1",
      anchorMessageId: null,
    });
  });

  it("anchors only a newly materialized user turn while following", () => {
    const nextMessages = [
      ...messages,
      message({ id: "u2", role: "user", createdAt: "2026-01-01T00:00:02.000Z" }),
    ];
    expect(deriveTranscriptNewTurnAnchor("u1", nextMessages, true)).toEqual({
      newestUserMessageId: "u2",
      anchorMessageId: "u2",
    });
    expect(deriveTranscriptNewTurnAnchor("u1", nextMessages, false).anchorMessageId).toBeNull();
  });
});

describe("formatDuration", () => {
  it("formats bucket boundaries", () => {
    expect(formatDuration(500)).toBe("500ms");
    expect(formatDuration(9_950)).toBe("10s");
    expect(formatDuration(59_000)).toBe("59s");
    expect(formatDuration(60_000)).toBe("1m");
    expect(formatDuration(90_000)).toBe("1m 30s");
    expect(formatDuration(3_600_000)).toBe("1h");
    expect(formatDuration(8_100_000)).toBe("2h 15m");
  });
});

describe("shouldShowAssistantChangedFiles", () => {
  it("hides missing and empty checkpoint summaries", () => {
    expect(shouldShowAssistantChangedFiles(undefined)).toBe(false);
    expect(shouldShowAssistantChangedFiles({ files: [] })).toBe(false);
    expect(shouldShowAssistantChangedFiles({ files: [{ path: "src/app.ts" }] })).toBe(true);
  });
});

describe("checkpoint revert targets", () => {
  const message = (id: string, role: "user" | "assistant") => ({
    id: `entry-${id}`,
    kind: "message" as const,
    createdAt: "2026-09-29T00:00:00.000Z",
    message: {
      id,
      role,
      streaming: false,
      createdAt: "2026-09-29T00:00:00.000Z",
      updatedAt: "2026-09-29T00:00:00.000Z",
      text: id,
    },
  });
  const summary = (assistantMessageId: string, turnId: string, checkpointTurnCount: number) =>
    ({
      turnId: TurnId.make(turnId),
      checkpointTurnCount,
      checkpointRef: `ref-${turnId}`,
      status: "ready",
      files: [],
      assistantMessageId: MessageId.make(assistantMessageId),
      completedAt: "2026-09-29T00:00:00.000Z",
    }) as unknown as Parameters<typeof indexCheckpointSummariesByAssistantMessageId>[0][number];

  it("reverts each user message to the checkpoint before its reply's diff", () => {
    const byAssistant = indexCheckpointSummariesByAssistantMessageId([
      summary("a1", "t1", 1),
      summary("a3", "t3", 3),
    ]);
    const counts = deriveRevertTurnCountByUserMessageId(
      [
        message("u1", "user"),
        message("a1", "assistant"),
        message("u2", "user"),
        message("a2", "assistant"),
        message("u3", "user"),
        message("a3", "assistant"),
      ],
      byAssistant,
      {},
    );
    expect([...counts]).toEqual([
      ["u1", 0],
      ["u3", 2],
    ]);
  });

  it("keeps the dialog copy as a title plus consequences", () => {
    expect(projectRevertCheckpointConfirmation(2)).toEqual({
      title: "Revert this thread to checkpoint 2?",
      consequences: [
        "This will discard newer messages and turn diffs in this thread.",
        "This action cannot be undone.",
      ],
      confirmLabel: "Revert",
    });
  });
});
