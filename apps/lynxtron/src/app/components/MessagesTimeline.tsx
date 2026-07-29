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
  workEntryIndicatesToolFailure,
  workEntryIndicatesToolSuccess,
  type MessagesTimelineRow,
  type TranscriptFollowState,
  type WorkLogEntry,
} from "@t3tools/client-runtime/presentation/transcript";
import { proposedPlanTitle } from "@t3tools/client-runtime/presentation/proposed-plan";
import type {
  OrchestrationLatestTurn,
  OrchestrationCheckpointSummary,
  OrchestrationProposedPlan,
  TurnId,
} from "@t3tools/contracts";
import type { ActivityEntry, ChatMessage, SessionStatus } from "../bridge";
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

function WorkEntryRow({ entry }: { entry: WorkLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((value) => !value), []);
  const failed = workEntryIndicatesToolFailure(entry);
  const succeeded = workEntryIndicatesToolSuccess(entry);
  const statusGlyph = failed ? "✗" : succeeded ? "✓" : "•";
  const statusClass = failed
    ? "work-entry__status work-entry__status--failure"
    : succeeded
      ? "work-entry__status work-entry__status--success"
      : "work-entry__status";
  const heading = entry.toolTitle ?? entry.label;
  const preview = entry.command ?? entry.detail;

  return (
    <view className="work-entry">
      <view className="work-entry__header" bindtap={toggle}>
        <text className={statusClass}>{statusGlyph}</text>
        <text className="work-entry__heading">{heading}</text>
        {preview ? (
          <text className="work-entry__preview" text-maxline="1">
            {preview}
          </text>
        ) : null}
      </view>
      {expanded && (entry.detail || entry.command) ? (
        <view className="work-entry__body">
          {entry.command ? <text className="work-entry__command">{entry.command}</text> : null}
          {entry.detail ? <text className="work-entry__detail">{entry.detail}</text> : null}
        </view>
      ) : null}
    </view>
  );
}

function WorkingRow({ startedAt }: { startedAt: string | null }) {
  const [elapsedLabel, setElapsedLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!startedAt) {
      setElapsedLabel(null);
      return;
    }
    const update = () => {
      const startedMs = Date.parse(startedAt);
      if (!Number.isFinite(startedMs)) {
        setElapsedLabel(null);
        return;
      }
      setElapsedLabel(formatDuration(Math.max(0, Date.now() - startedMs)));
    };
    update();
    const timer = setInterval(update, 1_000);
    return () => clearInterval(timer);
  }, [startedAt]);

  return (
    <view className="timeline__running-indicator">
      <text className="timeline__running-text">
        {elapsedLabel ? `● Working… ${elapsedLabel}` : "● Working…"}
      </text>
    </view>
  );
}

function TurnDiffCard({ summary }: { summary: OrchestrationCheckpointSummary }) {
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

function MessageRowView({
  message,
  cwd,
  turnDiffSummary,
}: {
  message: ChatMessage;
  cwd?: string | undefined;
  turnDiffSummary?: OrchestrationCheckpointSummary | undefined;
}) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const hasText = message.text && message.text.trim().length > 0;

  if (isSystem) {
    return (
      <view className="msg msg--system">
        <text className="msg__text msg__text--system">{message.text}</text>
      </view>
    );
  }

  if (isUser) {
    // Reference: group flex-col items-end; bubble max-w-[80%] rounded-2xl
    // bg-secondary (white 4%) p-3; no role label; timestamp on hover only.
    return (
      <view className="msg msg--user">
        <view className="msg__bubble msg__bubble--user">
          <text className="msg__text">{message.text}</text>
        </view>
      </view>
    );
  }

  // Assistant: full-width chat-markdown, no bubble, no label.
  return (
    <view className="msg msg--assistant">
      {hasText ? (
        <MarkdownRenderer text={message.text} streaming={message.streaming} cwd={cwd} />
      ) : message.streaming ? (
        <text className="msg__text msg__text--dim">Thinking…</text>
      ) : null}
      {turnDiffSummary ? <TurnDiffCard summary={turnDiffSummary} /> : null}
    </view>
  );
}

function TimelineRowView({
  row,
  cwd,
  onToggleTurn,
  onToggleWorkGroup,
}: {
  row: TimelineRow;
  cwd?: string | undefined;
  onToggleTurn: (turnId: TurnId) => void;
  onToggleWorkGroup: (groupId: string) => void;
}) {
  switch (row.kind) {
    case "message":
      return (
        <MessageRowView
          message={row.message}
          cwd={cwd}
          turnDiffSummary={row.assistantTurnDiffSummary}
        />
      );
    case "turn-fold":
      return (
        <view className="turn-fold" bindtap={() => onToggleTurn(row.turnId)}>
          <text className="turn-fold__chevron">{row.expanded ? "▾" : "▸"}</text>
          <text className="turn-fold__label">{row.label}</text>
        </view>
      );
    case "work":
      return (
        <view className="work-rows">
          {row.groupedEntries.map((entry) => (
            <WorkEntryRow key={entry.id} entry={entry} />
          ))}
        </view>
      );
    case "work-toggle":
      return (
        <view className="work-toggle" bindtap={() => onToggleWorkGroup(row.groupId)}>
          <text className="work-toggle__label">
            {row.expanded
              ? "Show less"
              : `+${row.hiddenCount} previous ${row.onlyToolEntries ? "tool call" : "step"}${
                  row.hiddenCount === 1 ? "" : "s"
                }`}
          </text>
        </view>
      );
    case "proposed-plan": {
      const title = proposedPlanTitle(row.proposedPlan.planMarkdown) ?? "Proposed plan";
      return (
        <view className="plan-row">
          <text className="plan-row__eyebrow">Proposed plan</text>
          <text className="plan-row__title" text-maxline="2">
            {title}
          </text>
        </view>
      );
    }
    case "working":
      return <WorkingRow startedAt={row.createdAt} />;
  }
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
      <view className="timeline">
        <view className="timeline__empty">
          <text className="timeline__empty-title">Start a conversation</text>
          <text className="timeline__empty-sub">
            Ask T3 Code to build, explain, or fix something in your project.
          </text>
        </view>
      </view>
    );
  }

  return (
    <view className="timeline-host">
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
            <TimelineRowView
              row={row}
              cwd={cwd}
              onToggleTurn={handleToggleTurn}
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
