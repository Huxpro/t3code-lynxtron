import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  EMPTY_TRANSCRIPT_PLACEHOLDER,
  type MessagesTimelineRow,
} from "@t3tools/client-runtime/presentation/transcript";

import {
  TranscriptEmptySurface,
  TranscriptRowSurface,
  type TranscriptRowElements,
} from "./TranscriptRowSurface";

const noop = vi.fn();

const testElements: TranscriptRowElements = {
  renderUserBody: ({ row }) => <span data-user-body>{row.message.text}</span>,
  renderAssistantMarkdown: ({ row }) => <div data-assistant-markdown>{row.message.text}</div>,
  renderCheckpointCard: () => <div data-checkpoint-card>checkpoint</div>,
  renderProposedPlanCard: ({ row }) => <div data-plan-card>{row.proposedPlan.planMarkdown}</div>,
  renderWorkIcon: ({ name }) => <span data-work-icon={name} />,
  renderWorkStatus: ({ failed, succeeded }) =>
    failed ? (
      <span data-work-status="failed">✗</span>
    ) : succeeded ? (
      <span data-work-status="succeeded">✓</span>
    ) : null,
  renderDisclosureChevron: ({ kind, expanded }) => (
    <span data-chevron={`${kind}:${expanded ? "open" : "closed"}`} />
  ),
  renderWorkingLabel: ({ createdAt }) => <span data-working-label>{createdAt ?? "none"}</span>,
};

function renderRow(row: MessagesTimelineRow): string {
  return renderToStaticMarkup(
    <TranscriptRowSurface
      row={row}
      workspaceRoot="/repo"
      activeTurnInProgress={false}
      elements={testElements}
      onToggleTurnFold={noop}
      onToggleWorkGroup={noop}
    />,
  );
}

function messageRow(
  overrides: Partial<Extract<MessagesTimelineRow, { kind: "message" }>["message"]> = {},
  rowOverrides: Partial<Extract<MessagesTimelineRow, { kind: "message" }>> = {},
): Extract<MessagesTimelineRow, { kind: "message" }> {
  return {
    kind: "message",
    id: `row-${overrides.id ?? "m1"}`,
    createdAt: "2026-07-31T00:00:00.000Z",
    durationStart: "2026-07-31T00:00:00.000Z",
    showAssistantMeta: false,
    showAssistantCopyButton: false,
    assistantCopyStreaming: false,
    message: {
      id: "m1",
      role: "user",
      streaming: false,
      createdAt: "2026-07-31T00:00:00.000Z",
      updatedAt: "2026-07-31T00:00:01.000Z",
      text: "hello",
      ...overrides,
    },
    ...rowOverrides,
  };
}

describe("TranscriptRowSurface", () => {
  it("renders the user row anatomy: right-aligned bubble with the body island", () => {
    const markup = renderRow(messageRow({ id: "u1", role: "user", text: "ship it" }));
    expect(markup).toContain("transcript-user-row");
    expect(markup).toContain("transcript-user-bubble");
    expect(markup).toContain("max-w-[80%]");
    expect(markup).toContain("ship it");
    expect(markup).toContain('data-message-role="user"');
  });

  it("renders the assistant row with markdown, checkpoint card placement, and no bubble", () => {
    const markup = renderRow(
      messageRow(
        { id: "a1", role: "assistant", text: "done." },
        { assistantTurnDiffSummary: { turnId: "t1" }, showAssistantMeta: true },
      ),
    );
    expect(markup).toContain("transcript-assistant-row");
    expect(markup).toContain("data-assistant-markdown");
    expect(markup.indexOf("data-assistant-markdown")).toBeLessThan(
      markup.indexOf("data-checkpoint-card"),
    );
    expect(markup).not.toContain("transcript-user-bubble");
  });

  it("renders a system row without a bubble or markdown island", () => {
    const markup = renderRow(messageRow({ id: "s1", role: "system", text: "note" }));
    expect(markup).toContain("transcript-system-row");
    expect(markup).toContain("note");
    expect(markup).not.toContain("data-assistant-markdown");
  });

  it("renders collapsed work groups with headings, previews, and status affordances", () => {
    const markup = renderRow({
      kind: "work",
      id: "w1",
      createdAt: "2026-07-31T00:00:00.000Z",
      isExpandedToolGroupEntry: false,
      isLastExpandedToolGroupEntry: false,
      groupedEntries: [
        {
          id: "e1",
          label: "run tests",
          tone: "tool",
          command: "vp test",
          requestKind: "command",
          sourceActivityKind: "tool.completed",
        } as never,
      ],
    });
    expect(markup).toContain("transcript-work-group");
    expect(markup).toContain("Run tests");
    expect(markup).toContain("vp test");
    expect(markup).toContain('data-work-icon="terminal"');
    expect(markup).toContain('data-transcript-work-entry="e1"');
    expect(markup).toContain('data-transcript-work-tone="tool"');
    expect(markup).toContain('data-transcript-work-state="collapsed"');
    expect(markup).toContain('aria-expanded="false"');
  });

  it("marks failed tool entries with the destructive heading and ✗ affordance", () => {
    const markup = renderRow({
      kind: "work",
      id: "w2",
      createdAt: "2026-07-31T00:00:00.000Z",
      isExpandedToolGroupEntry: false,
      isLastExpandedToolGroupEntry: false,
      groupedEntries: [
        {
          id: "e2",
          label: "run tests",
          tone: "tool",
          command: "vp test",
          detail: "exited with exit code 1",
          requestKind: "command",
          sourceActivityKind: "runtime.error",
        } as never,
      ],
    });
    expect(markup).toContain("text-destructive");
    expect(markup).toContain('data-work-status="failed"');
  });

  it("renders the work-toggle row with the shared collapsed label", () => {
    const markup = renderRow({
      kind: "work-toggle",
      id: "wt1",
      createdAt: "2026-07-31T00:00:00.000Z",
      groupId: "g1",
      hiddenCount: 3,
      expanded: false,
      onlyToolEntries: true,
      summary: null,
      summaryKind: null,
      hasFailure: false,
    });
    expect(markup).toContain("+3 previous tool calls");
    expect(markup).toContain('data-chevron="work-toggle:closed"');
  });

  it("marks a collapsed mixed toggle that hides a failure with the x icon", () => {
    const markup = renderRow({
      kind: "work-toggle",
      id: "wt3",
      createdAt: "2026-07-31T00:00:00.000Z",
      groupId: "g1",
      hiddenCount: 2,
      expanded: false,
      onlyToolEntries: false,
      summary: null,
      summaryKind: null,
      hasFailure: true,
    });
    expect(markup).toContain("+2 previous log entries");
    expect(markup).toContain('data-work-icon="x"');
    expect(markup).toContain('aria-label="Hidden work includes a failure"');
    expect(markup).not.toContain("data-chevron");
  });

  it("renders a tool-only group as one summary line with its action icon", () => {
    const markup = renderRow({
      kind: "work-toggle",
      id: "work-toggle:e1",
      createdAt: "2026-07-31T00:00:00.000Z",
      groupId: "work-group:e1",
      hiddenCount: 3,
      expanded: false,
      onlyToolEntries: true,
      summary: "Ran 2 commands and read 1 file",
      summaryKind: "mixed",
      hasFailure: false,
    });
    expect(markup).toContain("transcript-work-toggle--summary");
    expect(markup).toContain("Ran 2 commands and read 1 file");
    expect(markup).toContain('data-work-icon="hammer"');
    expect(markup).toContain('data-transcript-tool-summary="mixed"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain("previous tool calls");
    expect(markup).not.toContain("data-chevron");
  });

  it("swaps the summary icon for a failure x and announces it", () => {
    const markup = renderRow({
      kind: "work-toggle",
      id: "work-toggle:e1",
      createdAt: "2026-07-31T00:00:00.000Z",
      groupId: "work-group:e1",
      hiddenCount: 1,
      expanded: true,
      onlyToolEntries: true,
      summary: "Ran 1 command",
      summaryKind: "command",
      hasFailure: true,
    });
    expect(markup).toContain('data-work-icon="x"');
    expect(markup).toContain('aria-label="Ran 1 command, tool call failed"');
    expect(markup).toContain('data-transcript-tool-summary-state="failed"');
    expect(markup).toContain("transcript-work-group-header-outer");
  });

  it("renders the live row with the running program and its action icon", () => {
    const entry = {
      id: "e9",
      createdAt: "2026-07-31T00:00:00.000Z",
      label: "Running command",
      tone: "tool" as const,
      command: "FOO=1 pnpm install",
      requestKind: "command" as const,
      toolLifecycleStatus: "inProgress" as const,
    };
    const markup = renderRow({
      kind: "work-live",
      id: "work-live:e9-entry",
      createdAt: "2026-07-31T00:00:00.000Z",
      entry,
      groupedEntries: [entry],
      groupId: "work-group:e9-entry",
      expanded: false,
    });
    expect(markup).toContain('data-timeline-row-kind="work-live"');
    expect(markup).toContain("Running pnpm");
    expect(markup).toContain('data-work-icon="terminal"');
    expect(markup).toContain('data-transcript-work-live-state="running"');
    expect(markup).toContain('aria-expanded="false"');
  });

  it("renders expanded group entries as one line without a leading icon or status", () => {
    const markup = renderRow({
      kind: "work",
      id: "e1",
      createdAt: "2026-07-31T00:00:00.000Z",
      isExpandedToolGroupEntry: true,
      isLastExpandedToolGroupEntry: true,
      groupedEntries: [
        {
          id: "e1",
          createdAt: "2026-07-31T00:00:00.000Z",
          label: "run tests",
          tone: "tool",
          command: "vp test",
          requestKind: "command",
          toolLifecycleStatus: "completed",
        },
      ],
    });
    expect(markup).toContain("transcript-work-entry--grouped");
    expect(markup).toContain("transcript-work-grouped-outer--last");
    expect(markup).toContain('data-transcript-work-grouped="true"');
    expect(markup).toContain("vp test");
    expect(markup).not.toContain("Run tests");
    expect(markup).not.toContain("data-work-icon");
    expect(markup).not.toContain("data-work-status");
  });

  it("shows a failed expanded group entry with the leading x", () => {
    const markup = renderRow({
      kind: "work",
      id: "e1",
      createdAt: "2026-07-31T00:00:00.000Z",
      isExpandedToolGroupEntry: true,
      isLastExpandedToolGroupEntry: false,
      groupedEntries: [
        {
          id: "e1",
          createdAt: "2026-07-31T00:00:00.000Z",
          label: "run tests",
          tone: "tool",
          command: "vp test",
          requestKind: "command",
          toolLifecycleStatus: "failed",
        },
      ],
    });
    expect(markup).toContain('data-work-icon="x"');
    expect(markup).toContain('aria-label="Tool call failed"');
    expect(markup).not.toContain("transcript-work-grouped-outer--last");
  });

  it("renders the expanded work-toggle row with the show-fewer label", () => {
    const markup = renderRow({
      kind: "work-toggle",
      id: "wt2",
      createdAt: "2026-07-31T00:00:00.000Z",
      groupId: "g1",
      hiddenCount: 0,
      expanded: true,
      onlyToolEntries: false,
      summary: null,
      summaryKind: null,
      hasFailure: false,
    });
    expect(markup).toContain("Show fewer log entries");
  });

  it("renders turn folds with the label and disclosure affordance", () => {
    const markup = renderRow({
      kind: "turn-fold",
      id: "tf1",
      createdAt: "2026-07-31T00:00:00.000Z",
      turnId: "turn-1" as never,
      label: "2 earlier turns",
      expanded: false,
    });
    expect(markup).toContain("2 earlier turns");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('data-transcript-turn-fold="turn-1"');
    expect(markup).toContain('data-transcript-turn-fold-state="collapsed"');
  });

  it("renders the proposed-plan row through the plan island slot", () => {
    const markup = renderRow({
      kind: "proposed-plan",
      id: "pp1",
      createdAt: "2026-07-31T00:00:00.000Z",
      proposedPlan: {
        id: "plan-1",
        createdAt: "2026-07-31T00:00:00.000Z",
        planMarkdown: "# Plan\n\nDo the thing.",
      },
    });
    expect(markup).toContain("transcript-proposed-plan-row");
    expect(markup).toContain("data-plan-card");
  });

  it("renders the working row with three dots and the ticking label slot", () => {
    const markup = renderRow({
      kind: "working",
      id: "wk1",
      createdAt: "2026-07-31T00:00:00.000Z",
      showThinking: false,
    });
    expect(markup).toContain("transcript-working-row");
    expect(markup.match(/transcript-working-dot /g)?.length).toBe(3);
    expect(markup).toContain("data-working-label");
    expect(markup).not.toContain("Thinking");
  });

  it("adds a Thinking line while the active turn has nothing visible", () => {
    const markup = renderRow({
      kind: "working",
      id: "wk1",
      createdAt: "2026-07-31T00:00:00.000Z",
      showThinking: true,
    });
    expect(markup).toContain("transcript-working-row--thinking");
    expect(markup).toContain("Thinking");
  });

  it("keeps the empty surface copy placement", () => {
    const markup = renderToStaticMarkup(
      <TranscriptEmptySurface title="Start a conversation" subtitle="Ask T3 Code anything." />,
    );
    expect(markup.indexOf("Start a conversation")).toBeLessThan(
      markup.indexOf("Ask T3 Code anything."),
    );
    const singleLine = renderToStaticMarkup(
      <TranscriptEmptySurface title={EMPTY_TRANSCRIPT_PLACEHOLDER} />,
    );
    expect(singleLine).toContain(EMPTY_TRANSCRIPT_PLACEHOLDER);
    expect(singleLine).toContain("transcript-empty-title--single");
    expect(singleLine).toContain("text-muted-foreground/30");
    expect(singleLine).not.toContain("transcript-empty-subtitle");
  });
});
