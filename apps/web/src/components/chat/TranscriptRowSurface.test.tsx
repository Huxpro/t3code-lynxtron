import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import type { MessagesTimelineRow } from "@t3tools/client-runtime/presentation/transcript";

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
  });

  it("marks failed tool entries with the destructive heading and ✗ affordance", () => {
    const markup = renderRow({
      kind: "work",
      id: "w2",
      createdAt: "2026-07-31T00:00:00.000Z",
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
    });
    expect(markup).toContain("+3 previous tool calls");
    expect(markup).toContain('data-chevron="work-toggle:closed"');
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
    });
    expect(markup).toContain("transcript-working-row");
    expect(markup.match(/transcript-working-dot /g)?.length).toBe(3);
    expect(markup).toContain("data-working-label");
  });

  it("keeps the empty surface copy placement", () => {
    const markup = renderToStaticMarkup(
      <TranscriptEmptySurface title="Start a conversation" subtitle="Ask T3 Code anything." />,
    );
    expect(markup.indexOf("Start a conversation")).toBeLessThan(
      markup.indexOf("Ask T3 Code anything."),
    );
  });
});
