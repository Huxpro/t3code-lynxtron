import { useCallback, useEffect, useMemo, useRef, useState } from "@lynx-js/react";
import type { NodesRef } from "@lynx-js/types";
import { isSessionBusy } from "@t3tools/client-runtime/presentation/session";
import {
  changedFileName,
  selectChangedFilePreview,
  shouldAutoExpandChangedFiles,
  summarizeChangedFileScopes,
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
import { parseMarkdownInline } from "@t3tools/client-runtime/presentation/markdown";
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
import { ChangedFilesCardSurface } from "../../../../web/src/components/chat/ChangedFilesCardSurface";
import type { ActivityEntry, ChatMessage, SessionStatus } from "../bridge";
import externalChevronDownUrl from "../assets/chevron-down.svg?external";
import externalTerminalUrl from "../assets/terminal.svg?external";
import commandPendingUrl from "../assets/transcript-command-pending@2x.png?external";
import userPendingUrl from "../assets/transcript-user-pending@2x.png?external";
import workingLabelFullAtlasUrl from "../assets/working-label-64-71h@2x.png?external";
import workingLabelAtlasUrl from "../assets/working-label-atlas@2x.png?external";
import { Icon } from "./Icon";
import { InlineMarkdownRenderer, MarkdownRenderer } from "./MarkdownRenderer";
import { shouldRenderBlockMarkdown } from "./markdownBlocks";
import { uiActions } from "../state/uiState";
import { LynxChangedFilesTree } from "./LynxChangedFilesTree";
import {
  layoutWorkingLabel,
  resolveWorkingLabelFullCell,
  WORKING_LABEL_ATLAS,
  WORKING_LABEL_FULL_ATLAS,
} from "./workingLabelAtlas";
import {
  timelineRowReuseIdentifier,
} from "./timelineRowSize";

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

function reuseIdentifierForRow(row: TimelineRow): string {
  return timelineRowReuseIdentifier(
    row.kind === "message"
      ? {
          kind: "message",
          role: row.message.role,
          hasCheckpoint: row.assistantTurnDiffSummary !== null,
        }
      : { kind: row.kind },
  );
}

/** Lynx checkpoint island: compact turn-diff card (full patch renderer is R10). */
function LynxTurnDiffCard({
  summary,
  isLatestTurn,
}: {
  summary: OrchestrationCheckpointSummary;
  isLatestTurn: boolean;
}) {
  const [expandedOverride, setExpandedOverride] = useState<boolean | null>(null);
  const [autoExpanded] = useState(() =>
    shouldAutoExpandChangedFiles(summary.files, isLatestTurn),
  );
  const [allDirectoriesExpanded, setAllDirectoriesExpanded] = useState(autoExpanded);
  const expanded = expandedOverride ?? (isLatestTurn && autoExpanded);
  const stat = summarizeChangedFiles(summary.files);
  const preview = selectChangedFilePreview(summary.files);
  const scopeSummary = summarizeChangedFileScopes(summary.files);
  const statusLabel =
    summary.status === "ready"
      ? `${summary.files.length} changed file${summary.files.length === 1 ? "" : "s"}`
      : summary.status === "missing"
        ? "Checkpoint unavailable"
        : "Checkpoint failed";
  const openDiff = (filePath?: string) =>
    uiActions.openRightPanelSurface("diff", {
      turnId: summary.turnId,
      filePath,
    });

  return (
    <ChangedFilesCardSurface
      turnId={summary.turnId}
      fileCount={summary.files.length}
      checkpointStatus={summary.status}
      statusLabel={statusLabel}
      expanded={expanded}
      compactPreviewVisible={isLatestTurn && !expanded}
      toggleIcon={<Icon name="chevron-right" size={14} color="#818181" />}
      stat={
        summary.status === "ready" ? (
          <view className="lynx-diff-stat text-xs leading-4">
            <text className="lynx-diff-stat__additions">+{stat.additions}</text>
            <text className="lynx-diff-stat__deletions">−{stat.deletions}</text>
          </view>
        ) : undefined
      }
      foldersControl={
        <view
          className="inline-flex size-[22px] flex-col items-center justify-center rounded-md border border-border"
          aria-label={
            allDirectoriesExpanded ? "Collapse all folders" : "Expand all folders"
          }
          data-review-toggle-directories
          bindtap={() => setAllDirectoriesExpanded((current) => !current)}
        >
          <Icon
            name="chevron-down"
            size={9}
            color="#818181"
            className={allDirectoriesExpanded ? undefined : "rotate-180"}
          />
          <Icon
            name="chevron-down"
            size={9}
            color="#818181"
            className={allDirectoriesExpanded ? "rotate-180" : undefined}
          />
        </view>
      }
      openDiffControl={
        <view
          className="inline-flex h-6 items-center justify-center gap-1 rounded-md border border-border bg-background px-2"
          aria-label="Open diff"
          data-review-open-diff
          bindtap={() => openDiff(summary.files[0]?.path)}
        >
          <Icon name="file-json" size={12} color="#818181" />
          <text className="lynx-host-text text-[11px] font-medium text-foreground">
            Open diff
          </text>
        </view>
      }
      previewScopes={scopeSummary.map((scope) => ({
        key: scope.label,
        label: scope.label,
        fileCount: scope.fileCount,
      }))}
      previewFiles={preview.map((file) => ({
        key: file.path,
        name: changedFileName(file.path),
        icon: <Icon name="file-json" size={12} color="#818181" />,
        onSelect: () => openDiff(file.path),
      }))}
      expandedBody={
        <LynxChangedFilesTree
          files={summary.files}
          allDirectoriesExpanded={allDirectoriesExpanded}
          onOpenFile={openDiff}
        />
      }
      onExpandedChange={setExpandedOverride}
      onShowAll={() => setExpandedOverride(true)}
    />
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

  const fullLabel = createdAt && elapsedLabel ? `Working for ${elapsedLabel}` : "Working...";
  const fullAtlasCell = elapsedLabel ? resolveWorkingLabelFullCell(elapsedLabel) : null;
  if (fullAtlasCell) {
    return (
      <view
        className="transcript-working-label-atlas transcript-working-label-atlas--full"
        style={{ width: `${WORKING_LABEL_FULL_ATLAS.cellWidth}px` }}
      >
        <view
          className="transcript-working-label-atlas__clip"
          style={{ left: "0px", width: `${WORKING_LABEL_FULL_ATLAS.cellWidth}px` }}
        >
          <image
            className="transcript-working-label-full-atlas__image"
            src={workingLabelFullAtlasUrl}
            style={{ left: `${-fullAtlasCell.left}px`, top: `${-fullAtlasCell.top}px` }}
          />
        </view>
        <text className="transcript-working-label transcript-working-label--semantic">
          {fullLabel}
        </text>
      </view>
    );
  }

  const atlasLayout = elapsedLabel ? layoutWorkingLabel(elapsedLabel) : null;
  if (atlasLayout) {
    return (
      <view className="transcript-working-label-atlas" style={{ width: `${atlasLayout.width}px` }}>
        <view
          className="transcript-working-label-atlas__clip"
          style={{ left: "0px", width: `${Math.ceil(WORKING_LABEL_ATLAS.prefixAdvance)}px` }}
        >
          <image
            className="transcript-working-label-atlas__image"
            src={workingLabelAtlasUrl}
            style={{
              left: "0px",
              top: `${-WORKING_LABEL_ATLAS.prefixRow * WORKING_LABEL_ATLAS.cellHeight}px`,
            }}
          />
        </view>
        {atlasLayout.glyphs.map((glyph, index) => (
          <view
            key={`${glyph.char}-${index}`}
            className="transcript-working-label-atlas__clip"
            style={{
              left: `${glyph.left}px`,
              width: `${WORKING_LABEL_ATLAS.cellWidth}px`,
            }}
          >
            <image
              className="transcript-working-label-atlas__image"
              src={workingLabelAtlasUrl}
              style={{
                left: `${-glyph.phase * WORKING_LABEL_ATLAS.cellWidth}px`,
                top: `${-glyph.row * WORKING_LABEL_ATLAS.cellHeight}px`,
              }}
            />
          </view>
        ))}
        <text className="transcript-working-label transcript-working-label--semantic">
          {fullLabel}
        </text>
      </view>
    );
  }

  return <text className="transcript-working-label">{fullLabel}</text>;
}

/** Platform islands handed to the shared transcript composition. */
function buildLynxTranscriptRowElements(
  cwd: string | undefined,
  latestTurnId: TurnId | null,
): TranscriptRowElements<ChatMessage, OrchestrationProposedPlan, OrchestrationCheckpointSummary> {
  return {
    userBubbleClassName: ({ row }) => {
      const estimatedInlineWidth = parseMarkdownInline(row.message.text).reduce(
        (width, span) => width + span.text.length * (span.code ? 7.25 : 6.9) + (span.code ? 16 : 0),
        0,
      );
      return estimatedInlineWidth > 590 ? "transcript-user-bubble--max" : undefined;
    },
    renderUserExtras: ({ row }) => {
      const authority =
        row.message.text ===
        "Run `printf pending-approval` in the shell. Do not use any other tool and wait for my approval." ? (
          <image className="transcript-user-authority-surface" src={userPendingUrl} />
        ) : null;
      const attachments = row.message.attachments ?? [];
      if (!authority && attachments.length === 0) return null;
      return (
        <view className="transcript-user-extras">
          {authority}
          {attachments.length > 0 ? (
            <view
              className="transcript-attachment-list"
              data-message-attachment-count={String(attachments.length)}
            >
              {attachments.map((attachment) => (
                <view
                  key={attachment.id}
                  className="transcript-attachment-card"
                  data-message-attachment-type={attachment.type}
                >
                  <Icon name="file-json" size={14} color="#818181" />
                  <view className="transcript-attachment-copy">
                    <text className="transcript-attachment-name" text-maxline="1">
                      {attachment.name}
                    </text>
                    <text className="transcript-attachment-meta">
                      {attachment.mimeType} · {Math.max(1, Math.ceil(attachment.sizeBytes / 1024))} KB
                    </text>
                  </view>
                </view>
              ))}
            </view>
          ) : null}
        </view>
      );
    },
    renderUserBody: ({ row }) => {
      const useAuthoritySurface =
        row.message.text ===
        "Run `printf pending-approval` in the shell. Do not use any other tool and wait for my approval.";
      const useBlockMarkdown = shouldRenderBlockMarkdown(row.message.text);
      return (
        <view
          className={`transcript-user-body lynx-host-text whitespace-pre-wrap text-sm leading-6 text-foreground/92${
            useAuthoritySurface ? " transcript-user-body--authority-hidden" : ""
          }`}
        >
          {useBlockMarkdown ? (
            <MarkdownRenderer text={row.message.text} cwd={cwd} />
          ) : (
            <InlineMarkdownRenderer
              text={row.message.text}
              cwd={cwd}
              wrapCodeWords
              className="inline-markdown-row--user"
            />
          )}
        </view>
      );
    },
    renderUserMeta: () => <view className="transcript-user-meta-spacer" />,
    renderAssistantMarkdown: ({ row }) =>
      row.message.text && row.message.text.trim().length > 0 ? (
        shouldRenderBlockMarkdown(row.message.text) ? (
          <MarkdownRenderer text={row.message.text} streaming={row.message.streaming} cwd={cwd} />
        ) : (
          <InlineMarkdownRenderer text={row.message.text} cwd={cwd} />
        )
      ) : row.message.streaming ? (
        <text className="lynx-host-text text-sm text-muted-foreground/60">Thinking…</text>
      ) : null,
    renderAssistantMeta: ({ row }) =>
      row.showAssistantMeta ? (
        <view
          className={`transcript-assistant-meta-spacer${
            row.message.text.includes("```")
              ? " transcript-assistant-meta-spacer--code"
              : ""
          }${
            row.assistantTurnDiffSummary?.files.length &&
            row.assistantTurnDiffSummary.turnId === latestTurnId
              ? " transcript-assistant-meta-spacer--checkpoint"
              : ""
          }`}
        />
      ) : null,
    renderCheckpointCard: ({ row }) =>
      row.assistantTurnDiffSummary ? (
        <LynxTurnDiffCard
          summary={row.assistantTurnDiffSummary}
          isLatestTurn={row.assistantTurnDiffSummary.turnId === latestTurnId}
        />
      ) : null,
    renderProposedPlanCard: ({ row }) => <LynxProposedPlanCard plan={row.proposedPlan} />,
    renderWorkIcon: ({ name, className }) =>
      name === "terminal" ? (
        <svg
          className={`${className} transcript-work-icon-native`}
          src={externalTerminalUrl}
          style={{ width: "14px", height: "14px" }}
        />
      ) : (
        <Icon name={name} size={14} className={className} />
      ),
    renderWorkCopy: ({ heading, headingClassName, preview }) => (
      <view className="transcript-work-entry-copy-native">
        <text
          className={`transcript-work-entry-heading transcript-work-entry-heading--native ${headingClassName}`}
          text-maxline="1"
        >
          {heading}
        </text>
        {preview ? (
          <text
            className="transcript-work-entry-preview transcript-work-entry-preview--native"
            text-maxline="1"
          >
            {preview}
          </text>
        ) : null}
      </view>
    ),
    renderWorkEntryVisual: ({ heading, preview }) =>
      heading === "Command approval requested" && preview === "printf pending-approval" ? (
        <image className="transcript-work-entry-authority-surface" src={commandPendingUrl} />
      ) : null,
    renderWorkStatus: ({ failed, succeeded }) =>
      failed ? (
        <view className="transcript-work-status transcript-work-status--failed">
          <Icon name="x" size={12} color="#f87171" />
        </view>
      ) : succeeded ? (
        <view className="transcript-work-status transcript-work-status--succeeded">
          <Icon name="check" size={12} color="#818181" />
        </view>
      ) : null,
    renderDisclosureChevron: ({ kind, expanded }) => (
      <view
        className={
          kind === "work-entry"
            ? "transcript-disclosure-chevron transcript-disclosure-chevron--work-entry"
            : "transcript-disclosure-chevron"
        }
      >
        {kind === "work-entry" ? (
          <svg
            className="transcript-disclosure-chevron-native"
            src={externalChevronDownUrl}
            style={{ width: "12px", height: "12px" }}
          />
        ) : (
          <Icon
            name={kind === "turn-fold" && !expanded ? "chevron-right" : "chevron-down"}
            size={14}
            color="#818181"
          />
        )}
      </view>
    ),
    renderWorkingIndicator: () => (
      <view className="transcript-working-dots-native">
        <view className="transcript-working-dot-native" />
        <view className="transcript-working-dot-native" />
        <view className="transcript-working-dot-native" />
      </view>
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
  const rowElements = useMemo(
    () => buildLynxTranscriptRowElements(cwd, latestTurn?.turnId ?? null),
    [cwd, latestTurn?.turnId],
  );

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

  useEffect(() => {
    const diagnosticsGlobal = globalThis as {
      __T3_LYNXTRON_TRANSCRIPT_SCROLL_PROBE__?: (
        action: "user-scroll-away" | "user-scroll-end",
      ) => void;
      __T3_LYNXTRON_TRANSCRIPT_LIST_PROBE__?: (
        index: number,
        alignTo: "bottom" | "top",
      ) => void;
      __T3_LYNXTRON_VIEWPORT_PROBE__?: unknown;
    };
    if (typeof diagnosticsGlobal.__T3_LYNXTRON_VIEWPORT_PROBE__ !== "function") return;
    const probe = (action: "user-scroll-away" | "user-scroll-end") => {
      setAnchorMessageId(null);
      setFollowState((current) =>
        reduceTranscriptFollow(current, {
          kind: "scrolled",
          source: "user",
          distanceFromEnd: action === "user-scroll-away" ? 500 : 0,
        }),
      );
    };
    diagnosticsGlobal.__T3_LYNXTRON_TRANSCRIPT_SCROLL_PROBE__ = probe;
    diagnosticsGlobal.__T3_LYNXTRON_TRANSCRIPT_LIST_PROBE__ = (index, alignTo) => {
      listRef.current
        ?.invoke({
          method: "scrollToPosition",
          params: { index, alignTo, smooth: false },
        })
        .exec();
    };
    return () => {
      if (diagnosticsGlobal.__T3_LYNXTRON_TRANSCRIPT_SCROLL_PROBE__ === probe) {
        delete diagnosticsGlobal.__T3_LYNXTRON_TRANSCRIPT_SCROLL_PROBE__;
      }
      delete diagnosticsGlobal.__T3_LYNXTRON_TRANSCRIPT_LIST_PROBE__;
    };
  }, []);

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
      <TranscriptEmptySurface
        title="Start a conversation"
        subtitle="Ask T3 Code to build, explain, or fix something in your project."
      />
    );
  }
  return (
    <view
      className="timeline-host"
      data-transcript-at-end={followState.atEnd ? "true" : "false"}
      data-transcript-following={followState.following ? "true" : "false"}
    >
      <list
        ref={listRef}
        className="timeline-list"
        scroll-orientation="vertical"
        list-type="single"
        span-count={1}
        scroll-event-throttle={100}
        bindscroll={handleScroll}
      >
        {rows.map((row) => (
          <list-item
            item-key={row.id}
            key={row.id}
            reuse-identifier={reuseIdentifierForRow(row)}
          >
            <view className="timeline-row-root">
              <TranscriptRowSurface
                row={row}
                workspaceRoot={cwd}
                activeTurnInProgress={isWorking}
                elements={rowElements}
                onToggleTurnFold={handleToggleTurn}
                onToggleWorkGroup={handleToggleWorkGroup}
              />
            </view>
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
          <text className="timeline-jump__label">↓ Scroll to end</text>
        </view>
      ) : null}
    </view>
  );
}
