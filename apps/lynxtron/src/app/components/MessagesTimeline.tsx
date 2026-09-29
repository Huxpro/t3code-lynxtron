import { useCallback, useEffect, useMemo, useRef, useState } from "@lynx-js/react";
import type { NodesRef } from "@lynx-js/types";
import { isSessionBusy } from "@t3tools/client-runtime/presentation/session";
import {
  selectChangedFilePreview,
  summarizeChangedFiles,
} from "@t3tools/client-runtime/presentation/diff";
import {
  deriveActiveWorkStartedAt,
  deriveMessagesTimelineRows,
  deriveTranscriptNewTurnAnchor,
  deriveTimelineEntries,
  deriveWorkLogEntries,
  formatDuration,
  INITIAL_TRANSCRIPT_FOLLOW_STATE,
  reduceTranscriptFollow,
  type MessagesTimelineRow,
  type TranscriptFollowState,
} from "@t3tools/client-runtime/presentation/transcript";
import { proposedPlanTitle } from "@t3tools/client-runtime/presentation/proposed-plan";
import type {
  OrchestrationLatestTurn,
  OrchestrationCheckpointSummary,
  OrchestrationProposedPlan,
  TurnId,
} from "@t3tools/contracts";
import {
  TranscriptEmptySurface,
  TranscriptRowSurface,
  type TranscriptRowElements,
} from "../../../../web/src/components/chat/TranscriptRowSurface";
import type { ActivityEntry, ChatMessage, SessionStatus } from "../bridge";
import { Icon } from "./Icon";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface MessagesTimelineProps {
  messages: ReadonlyArray<ChatMessage>;
  activities: ReadonlyArray<ActivityEntry>;
  sessionStatus: SessionStatus;
  cwd?: string | undefined;
  latestTurn?: OrchestrationLatestTurn | null;
  proposedPlans?: ReadonlyArray<OrchestrationProposedPlan>;
  activeTurnId?: TurnId | null;
  checkpoints?: ReadonlyArray<OrchestrationCheckpointSummary>;
}

type TimelineRow = MessagesTimelineRow<
  ChatMessage,
  OrchestrationProposedPlan,
  OrchestrationCheckpointSummary
>;

/** ListEventSource.SCROLL — only user/fling scrolling may break follow mode. */
const LIST_EVENT_SOURCE_SCROLL = 2;

function estimateRowSizePx(row: TimelineRow): number {
  switch (row.kind) {
    case "message":
      return row.message.role === "assistant" ? 96 : 56;
    case "work":
      return 34;
    case "work-toggle":
      return 30;
    case "turn-fold":
      return 32;
    case "proposed-plan":
      return 72;
    case "working":
      return 34;
  }
}

/** Lynx checkpoint island: compact turn-diff card (full patch renderer is R10). */
function LynxTurnDiffCard({ summary }: { summary: OrchestrationCheckpointSummary }) {
  const stat = summarizeChangedFiles(summary.files);
  const preview = selectChangedFilePreview(summary.files);
  const statusLabel =
    summary.status === "ready"
      ? `${summary.files.length} changed file${summary.files.length === 1 ? "" : "s"}`
      : summary.status === "missing"
        ? "Checkpoint unavailable"
        : "Checkpoint failed";
  return (
    <view className="turn-diff-card">
      <view className="turn-diff-card__header">
        <text className="turn-diff-card__title">Turn changes</text>
        <text className="turn-diff-card__status">{statusLabel}</text>
        {summary.status === "ready" ? (
          <text className="turn-diff-card__stat">
            <text className="turn-diff-card__additions">+{stat.additions}</text>
            <text className="turn-diff-card__deletions"> −{stat.deletions}</text>
          </text>
        ) : null}
      </view>
      {preview.map((file) => (
        <view key={file.path} className="turn-diff-card__file">
          <text className="turn-diff-card__path" text-maxline="1">
            {file.path}
          </text>
          <text className="turn-diff-card__file-stat">
            +{file.additions} −{file.deletions}
          </text>
        </view>
      ))}
    </view>
  );
}

/** Lynx proposed-plan island: eyebrow + title card. */
function LynxProposedPlanCard({ plan }: { plan: OrchestrationProposedPlan }) {
  const title = proposedPlanTitle(plan.planMarkdown) ?? "Proposed plan";
  return (
    <view className="plan-row">
      <text className="plan-row__eyebrow">Proposed plan</text>
      <text className="plan-row__title" text-maxline="2">
        {title}
      </text>
    </view>
  );
}

/** Ticking elapsed label for the shared working row. */
function LynxWorkingLabel({ createdAt }: { createdAt: string | null }) {
  const [elapsedLabel, setElapsedLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!createdAt) {
      setElapsedLabel(null);
      return;
    }
    const update = () => {
      const startedMs = Date.parse(createdAt);
      if (!Number.isFinite(startedMs)) {
        setElapsedLabel(null);
        return;
      }
      setElapsedLabel(formatDuration(Math.max(0, Date.now() - startedMs)));
    };
    update();
    const timer = setInterval(update, 1_000);
    return () => clearInterval(timer);
  }, [createdAt]);

  return (
    <text className="transcript-working-label">
      {createdAt && elapsedLabel ? `Working… ${elapsedLabel}` : "Working…"}
    </text>
  );
}

/** Platform islands handed to the shared transcript composition. */
function buildLynxTranscriptRowElements(
  cwd: string | undefined,
): TranscriptRowElements<ChatMessage, OrchestrationProposedPlan, OrchestrationCheckpointSummary> {
  return {
    renderUserBody: ({ row }) => (
      <text className="transcript-user-body lynx-host-text whitespace-pre-wrap text-sm leading-6 text-foreground/92">
        {row.message.text}
      </text>
    ),
    renderAssistantMarkdown: ({ row }) =>
      row.message.text && row.message.text.trim().length > 0 ? (
        <MarkdownRenderer text={row.message.text} streaming={row.message.streaming} cwd={cwd} />
      ) : row.message.streaming ? (
        <text className="lynx-host-text text-sm text-muted-foreground/60">Thinking…</text>
      ) : null,
    renderCheckpointCard: ({ row }) =>
      row.assistantTurnDiffSummary ? (
        <LynxTurnDiffCard summary={row.assistantTurnDiffSummary} />
      ) : null,
    renderProposedPlanCard: ({ row }) => <LynxProposedPlanCard plan={row.proposedPlan} />,
    renderWorkIcon: ({ name, className }) => <Icon name={name} size={14} className={className} />,
    renderWorkStatus: ({ failed, succeeded }) =>
      failed ? (
        <text className="transcript-work-status transcript-work-status--failed text-destructive">
          ✗
        </text>
      ) : succeeded ? (
        <text className="transcript-work-status transcript-work-status--succeeded text-muted-foreground/65">
          ✓
        </text>
      ) : null,
    renderDisclosureChevron: ({ kind, expanded }) => (
      <text
        aria-hidden
        className={
          kind === "work-entry"
            ? "transcript-disclosure-chevron text-[10px] leading-none text-muted-foreground/65"
            : "transcript-disclosure-chevron text-[11px] leading-none text-muted-foreground/65"
        }
      >
        {expanded ? "▾" : "▸"}
      </text>
    ),
    renderWorkingLabel: ({ createdAt }) => <LynxWorkingLabel createdAt={createdAt} />,
  };
}

export function MessagesTimeline({
  messages,
  activities,
  sessionStatus,
  cwd,
  latestTurn = null,
  proposedPlans = [],
  activeTurnId = null,
  checkpoints = [],
}: MessagesTimelineProps) {
  const [expandedTurnIds, setExpandedTurnIds] = useState<ReadonlySet<TurnId>>(new Set());
  const [expandedWorkGroupIds, setExpandedWorkGroupIds] = useState<ReadonlySet<string>>(new Set());
  const [followState, setFollowState] = useState<TranscriptFollowState>(
    INITIAL_TRANSCRIPT_FOLLOW_STATE,
  );
  const followStateRef = useRef(followState);
  followStateRef.current = followState;
  const listRef = useRef<NodesRef>(null);
  const newestUserMessageIdRef = useRef<string | null | undefined>(undefined);
  const [anchorMessageId, setAnchorMessageId] = useState<string | null>(null);

  const isWorking = isSessionBusy(sessionStatus);
  const rowElements = useMemo(() => buildLynxTranscriptRowElements(cwd), [cwd]);

  const rows = useMemo<TimelineRow[]>(() => {
    const workEntries = deriveWorkLogEntries(activities);
    const timelineEntries = deriveTimelineEntries<ChatMessage, OrchestrationProposedPlan>(
      messages,
      proposedPlans,
      workEntries,
    );
    const activeTurnStartedAt = deriveActiveWorkStartedAt(
      latestTurn,
      { status: sessionStatus, activeTurnId },
      null,
    );
    const turnDiffSummaryByAssistantMessageId = new Map<string, OrchestrationCheckpointSummary>();
    for (const checkpoint of checkpoints) {
      if (checkpoint.assistantMessageId) {
        turnDiffSummaryByAssistantMessageId.set(checkpoint.assistantMessageId, checkpoint);
      }
    }
    return deriveMessagesTimelineRows<
      ChatMessage,
      OrchestrationProposedPlan,
      OrchestrationCheckpointSummary
    >({
      timelineEntries,
      latestTurn,
      runningTurnId: activeTurnId,
      expandedTurnIds,
      expandedWorkGroupIds,
      isWorking,
      activeTurnStartedAt,
      turnDiffSummaryByAssistantMessageId,
    });
  }, [
    messages,
    activities,
    proposedPlans,
    latestTurn,
    activeTurnId,
    sessionStatus,
    isWorking,
    expandedTurnIds,
    expandedWorkGroupIds,
    checkpoints,
  ]);

  useEffect(() => {
    const next = deriveTranscriptNewTurnAnchor(
      newestUserMessageIdRef.current,
      messages,
      followStateRef.current.following,
    );
    newestUserMessageIdRef.current = next.newestUserMessageId;
    if (!next.anchorMessageId) return;
    setAnchorMessageId(next.anchorMessageId);
    const rowIndex = rows.findIndex(
      (row) => row.kind === "message" && row.message.id === next.anchorMessageId,
    );
    if (rowIndex < 0) return;
    listRef.current
      ?.invoke({
        method: "scrollToPosition",
        params: { index: rowIndex, alignTo: "top", smooth: false },
      })
      .exec();
  }, [messages, rows]);

  const scrollToEnd = useCallback(
    (smooth: boolean) => {
      if (rows.length === 0) return;
      listRef.current
        ?.invoke({
          method: "scrollToPosition",
          params: { index: rows.length - 1, alignTo: "bottom", smooth },
        })
        .exec();
    },
    [rows.length],
  );

  // Follow the end while new rows arrive or the tail row grows (streaming
  // bumps the last message's updatedAt). A user scroll away detaches follow;
  // scrolling back to the bottom re-attaches it (see handleScroll).
  const lastRow = rows.length > 0 ? rows[rows.length - 1] : undefined;
  const tailFingerprint = lastRow
    ? `${rows.length}:${lastRow.id}:${
        lastRow.kind === "message"
          ? `${lastRow.message.updatedAt}:${lastRow.message.text.length}`
          : lastRow.createdAt
      }`
    : "empty";
  useEffect(() => {
    if (!followStateRef.current.following || anchorMessageId) return;
    scrollToEnd(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tailFingerprint, anchorMessageId]);

  const handleScroll = useCallback(
    (event: {
      detail: {
        scrollTop: number;
        scrollHeight: number;
        listHeight: number;
        eventSource: number;
      };
    }) => {
      const { scrollTop, scrollHeight, listHeight, eventSource } = event.detail;
      if (eventSource === LIST_EVENT_SOURCE_SCROLL) {
        setAnchorMessageId(null);
      }
      setFollowState((current) =>
        reduceTranscriptFollow(current, {
          kind: "scrolled",
          source: eventSource === LIST_EVENT_SOURCE_SCROLL ? "user" : "layout",
          distanceFromEnd: scrollHeight - scrollTop - listHeight,
        }),
      );
    },
    [],
  );

  const handleJumpToLatest = useCallback(() => {
    setAnchorMessageId(null);
    setFollowState((current) => reduceTranscriptFollow(current, { kind: "jump-to-latest" }));
    scrollToEnd(true);
  }, [scrollToEnd]);

  useEffect(() => {
    (
      globalThis as typeof globalThis & {
        __T3_LYNXTRON_TRANSCRIPT_FOLLOW__?: {
          following: boolean;
          atEnd: boolean;
          rowCount: number;
          anchorMessageId: string | null;
        };
      }
    ).__T3_LYNXTRON_TRANSCRIPT_FOLLOW__ = {
      ...followState,
      rowCount: rows.length,
      anchorMessageId,
    };
  }, [anchorMessageId, followState, rows.length]);

  const handleToggleTurn = useCallback((turnId: TurnId) => {
    setExpandedTurnIds((current) => {
      const next = new Set(current);
      if (next.has(turnId)) {
        next.delete(turnId);
      } else {
        next.add(turnId);
      }
      return next;
    });
  }, []);

  const handleToggleWorkGroup = useCallback((groupId: string) => {
    setExpandedWorkGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  if (rows.length === 0) {
    return (
      <TranscriptEmptySurface
        title="Start a conversation"
        subtitle="Ask T3 Code to build, explain, or fix something in your project."
      />
    );
  }

  return (
    <view
      className="timeline-host"
      data-transcript-following={followState.following ? "true" : "false"}
      data-transcript-at-end={followState.atEnd ? "true" : "false"}
      data-transcript-row-count={String(rows.length)}
    >
      <list
        ref={listRef}
        className="timeline-list"
        scroll-orientation="vertical"
        list-type="single"
        span-count={1}
        initial-scroll-index={rows.length - 1}
        scroll-event-throttle={100}
        bindscroll={handleScroll}
      >
        {rows.map((row) => (
          <list-item
            item-key={row.id}
            key={row.id}
            estimated-main-axis-size-px={estimateRowSizePx(row)}
          >
            <TranscriptRowSurface
              row={row}
              workspaceRoot={cwd}
              activeTurnInProgress={isWorking}
              elements={rowElements}
              onToggleTurnFold={handleToggleTurn}
              onToggleWorkGroup={handleToggleWorkGroup}
            />
          </list-item>
        ))}
        {anchorMessageId ? (
          <list-item
            item-key="timeline-new-turn-anchor-space"
            key="timeline-new-turn-anchor-space"
            estimated-main-axis-size-px={480}
          >
            <view className="timeline-new-turn-anchor-space" />
          </list-item>
        ) : null}
      </list>
      {!followState.atEnd ? (
        <view className="timeline-jump" bindtap={handleJumpToLatest}>
          <text className="timeline-jump__label">↓ Jump to latest</text>
        </view>
      ) : null}
    </view>
  );
}
