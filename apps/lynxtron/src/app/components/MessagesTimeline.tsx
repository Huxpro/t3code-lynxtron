import { useCallback, useEffect, useMemo, useRef, useState } from "@lynx-js/react";
import type { NodesRef } from "@lynx-js/types";
import { isSessionWorking } from "@t3tools/client-runtime/presentation/session";
import {
  changedFileName,
  selectChangedFilePreview,
  shouldAutoExpandChangedFiles,
  summarizeChangedFileScopes,
  summarizeChangedFiles,
} from "@t3tools/client-runtime/presentation/diff";
import {
  deriveActiveWorkStartedAt,
  computeStableMessagesTimelineRows,
  deriveMessagesTimelineRows,
  deriveTimelineMinimapItems,
  inferCheckpointTurnCountByTurnId,
  deriveTranscriptNewTurnAnchor,
  deriveTimelineEntries,
  deriveWorkLogEntries,
  formatDuration,
  shouldShowAssistantChangedFiles,
  reduceTimelineScrollMode,
  resolveAssistantMessageCopyState,
  type MessagesTimelineRow,
  type StableMessagesTimelineRowsState,
  type TimelineScrollMode,
} from "@t3tools/client-runtime/presentation/transcript";
import { formatShortTimestamp } from "@t3tools/client-runtime/presentation/time";
import { parseMarkdownInline } from "@t3tools/client-runtime/presentation/markdown";
import { deriveVisibleUserMessage } from "@t3tools/client-runtime/presentation/user-message";
import { proposedPlanTitle } from "@t3tools/client-runtime/presentation/proposed-plan";
import type {
  OrchestrationLatestTurn,
  OrchestrationCheckpointSummary,
  OrchestrationProposedPlan,
  TurnId,
} from "@t3tools/contracts";
import {
  TranscriptRowSurface,
  type TranscriptRowElements,
} from "../../../../web/src/components/chat/TranscriptRowSurface";
import { ChangedFilesCardSurface } from "../../../../web/src/components/chat/ChangedFilesCardSurface";
import { HostView } from "../../../../web/src/components/ui/hostElements";
import type { ActivityEntry, ChatMessage, SessionStatus } from "../bridge";
import externalChevronDownUrl from "../assets/chevron-down.svg?external";
import externalTerminalUrl from "../assets/terminal.svg?external";
import commandPendingUrl from "../assets/transcript-command-pending@2x.png?external";
import userPendingUrl from "../assets/transcript-user-pending@2x.png?external";
import workingLabelFullAtlasUrl from "../assets/working-label-64-71h@2x.png?external";
import workingLabelAtlasUrl from "../assets/working-label-atlas@2x.png?external";
import { Icon } from "./Icon";
import { InlineMarkdownRenderer, MarkdownRenderer } from "./MarkdownRenderer";
import { shouldRenderBlockMarkdown } from "@t3tools/client-runtime/presentation/markdown-blocks";
import { uiActions } from "../state/uiState";
import { clientCapabilities } from "../platform/clientCapabilities.lynx";
import { showNativeConfirm, showNativeContextMenu } from "../platform/clientCapabilities.lynx";
import { t3ClientActions } from "../state/t3Client";
import { useClientSettingsState } from "../state/prefsStore";
import { deriveDisplayedUserMessageState } from "../../../../web/src/lib/terminalContext";
import { LynxChangedFilesTree } from "./LynxChangedFilesTree";
import {
  layoutWorkingLabel,
  resolveWorkingLabelFullCell,
  WORKING_LABEL_ATLAS,
  WORKING_LABEL_FULL_ATLAS,
} from "./workingLabelAtlas";
import { timelineRowReuseIdentifier } from "./timelineRowSize";
import { runMessageCopy, type MessageCopyStatus } from "./messageCopy";
import {
  resolveTimelineMinimapHeightStyle,
  resolveTimelineMinimapTopPercent,
} from "../../../../web/src/components/chat/MessagesTimeline.logic";

interface MessagesTimelineProps {
  messages: ReadonlyArray<ChatMessage>;
  activities: ReadonlyArray<ActivityEntry>;
  sessionStatus: SessionStatus;
  hasTopBanner?: boolean;
  cwd?: string | undefined;
  latestTurn?: OrchestrationLatestTurn | null;
  proposedPlans?: ReadonlyArray<OrchestrationProposedPlan>;
  activeTurnId?: TurnId | null;
  checkpoints?: ReadonlyArray<OrchestrationCheckpointSummary>;
  availableWidth?: number;
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
  compact,
  compactActions,
  onManualNavigation,
}: {
  summary: OrchestrationCheckpointSummary;
  isLatestTurn: boolean;
  compact: boolean;
  compactActions: boolean;
  onManualNavigation: () => void;
}) {
  const [expandedOverride, setExpandedOverride] = useState<boolean | null>(null);
  const autoExpanded = useMemo(
    () => shouldAutoExpandChangedFiles(summary.files, isLatestTurn),
    [isLatestTurn, summary.files],
  );
  const [allDirectoriesExpanded, setAllDirectoriesExpanded] = useState(autoExpanded);
  useEffect(() => {
    setExpandedOverride(null);
    setAllDirectoriesExpanded(autoExpanded);
  }, [autoExpanded, summary.checkpointRef, summary.turnId]);
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
      compact={compact}
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
        <HostView
          className="turn-diff-card__folders-toggle inline-flex size-[22px] flex-col items-center justify-center rounded-md border border-border"
          aria-label={allDirectoriesExpanded ? "Collapse all folders" : "Expand all folders"}
          data-review-toggle-directories
          onClick={() => {
            onManualNavigation();
            setAllDirectoriesExpanded((current) => !current);
          }}
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
        </HostView>
      }
      openDiffControl={
        <HostView
          className="turn-diff-card__open inline-flex h-6 items-center justify-center gap-1 rounded-md border border-border bg-background px-2"
          aria-label="Open diff"
          data-review-open-diff
          onClick={() => openDiff(summary.files[0]?.path)}
        >
          <Icon name="file-diff" size={12} color="#818181" />
          {!compactActions ? (
            <text className="lynx-host-text turn-diff-card__open-label text-[11px] font-medium text-foreground">
              Open diff
            </text>
          ) : null}
        </HostView>
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
      onExpandedChange={(value) => {
        onManualNavigation();
        setExpandedOverride(value);
      }}
      onShowAll={() => {
        onManualNavigation();
        setExpandedOverride(true);
      }}
    />
  );
}

/** Lynx proposed-plan island: eyebrow + title card. */
function LynxProposedPlanCard({ plan }: { plan: OrchestrationProposedPlan }) {
  const title = proposedPlanTitle(plan.planMarkdown) ?? "Proposed plan";
  return (
    <HostView
      className="plan-row"
      aria-label={`Open proposed plan: ${title}`}
      data-transcript-plan-open="true"
      onClick={() => uiActions.openRightPanelSurface("plan")}
    >
      <text className="plan-row__eyebrow">Proposed plan</text>
      <text className="plan-row__title" text-maxline="2">
        {title}
      </text>
    </HostView>
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

function MessageCopyControl({ text }: { readonly text: string }) {
  const [status, setStatus] = useState<MessageCopyStatus | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current);
    },
    [],
  );
  const pending = status === "pending";
  const handleCopy = useCallback(() => {
    if (pending) return;
    if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current);
    void runMessageCopy(clientCapabilities.clipboard.writeText, text, setStatus).then(() => {
      resetTimerRef.current = setTimeout(() => {
        setStatus(null);
        resetTimerRef.current = null;
      }, 1_000);
    });
  }, [pending, text]);
  return (
    <view
      className={`transcript-message-meta__action${
        pending ? " transcript-message-meta__action--disabled" : ""
      }`}
      aria-label={status === "failed" ? "Copy failed" : "Copy link"}
      aria-disabled={pending ? "true" : "false"}
      bindtap={pending ? undefined : handleCopy}
    >
      <Icon
        name={status === "copied" ? "check" : status === "failed" ? "x" : "copy"}
        size={14}
        color="#818181"
      />
    </view>
  );
}

/** Platform islands handed to the shared transcript composition. */
function buildLynxTranscriptRowElements(
  cwd: string | undefined,
  latestTurnId: TurnId | null,
  compactChangedFiles: boolean,
  compactChangedFilesActions: boolean,
  timestampFormat: Parameters<typeof formatShortTimestamp>[1],
  revertMessage: (turnCount: number) => void,
  isWorking: boolean,
  onManualNavigation: () => void,
): TranscriptRowElements<ChatMessage, OrchestrationProposedPlan, OrchestrationCheckpointSummary> {
  return {
    userBubbleClassName: ({ row }) => {
      const visibleText = deriveVisibleUserMessage(row.message.text).visibleText;
      const estimatedInlineWidth = parseMarkdownInline(visibleText).reduce(
        (width, span) => width + span.text.length * (span.code ? 7.25 : 6.9) + (span.code ? 16 : 0),
        0,
      );
      return estimatedInlineWidth > 590 ? "transcript-user-bubble--max" : undefined;
    },
    renderUserExtras: ({ row }) => {
      const displayed = deriveVisibleUserMessage(row.message.text);
      const authority =
        row.message.text ===
        "Run `printf pending-approval` in the shell. Do not use any other tool and wait for my approval." ? (
          <image className="transcript-user-authority-surface" src={userPendingUrl} />
        ) : null;
      const attachments = row.message.attachments ?? [];
      if (!authority && attachments.length === 0 && displayed.contextKinds.length === 0)
        return null;
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
                      {attachment.mimeType} · {Math.max(1, Math.ceil(attachment.sizeBytes / 1024))}{" "}
                      KB
                    </text>
                  </view>
                </view>
              ))}
            </view>
          ) : null}
          {displayed.contextKinds.length > 0 ? (
            <view
              className="transcript-context-summary"
              data-message-context-count={String(displayed.contextKinds.length)}
            >
              <text className="transcript-context-summary__label">
                {displayed.contextKinds.length === 1
                  ? displayed.contextKinds[0] === "terminal"
                    ? "Terminal context"
                    : "Element context"
                  : `${displayed.contextKinds.length} attached contexts`}
              </text>
            </view>
          ) : null}
        </view>
      );
    },
    renderUserBody: ({ row }) => {
      const displayed = deriveVisibleUserMessage(row.message.text);
      if (displayed.visibleText.trim().length === 0) return null;
      const useAuthoritySurface =
        row.message.text ===
        "Run `printf pending-approval` in the shell. Do not use any other tool and wait for my approval.";
      return (
        <view
          className={`transcript-user-body lynx-host-text whitespace-pre-wrap text-sm leading-6 text-foreground/92${
            useAuthoritySurface ? " transcript-user-body--authority-hidden" : ""
          }`}
        >
          <MarkdownRenderer
            text={displayed.visibleText}
            cwd={cwd}
            onManualNavigation={onManualNavigation}
          />
        </view>
      );
    },
    renderUserMeta: ({ row }) => {
      const copyText = deriveDisplayedUserMessageState(row.message.text).copyText;
      return (
        <view flatten={false} className="transcript-message-meta transcript-user-meta">
          <text className="transcript-message-meta__time">
            {formatShortTimestamp(row.message.createdAt, timestampFormat)}
          </text>
          {typeof row.revertTurnCount === "number" ? (
            <view
              className={`transcript-message-meta__action${
                isWorking ? " transcript-message-meta__action--disabled" : ""
              }`}
              aria-label="Revert to this message"
              aria-disabled={isWorking ? "true" : "false"}
              bindtap={isWorking ? undefined : () => revertMessage(row.revertTurnCount!)}
            >
              <Icon name="rotate-ccw" size={14} color="#818181" />
            </view>
          ) : null}
          <MessageCopyControl text={copyText} />
        </view>
      );
    },
    renderAssistantMarkdown: ({ row }) =>
      row.message.text && row.message.text.trim().length > 0 ? (
        shouldRenderBlockMarkdown(row.message.text) ? (
          <MarkdownRenderer
            text={row.message.text}
            streaming={row.message.streaming}
            cwd={cwd}
            onManualNavigation={onManualNavigation}
          />
        ) : (
          <InlineMarkdownRenderer text={row.message.text} cwd={cwd} />
        )
      ) : row.message.streaming ? (
        <text className="lynx-host-text text-sm text-muted-foreground/60">Thinking…</text>
      ) : null,
    renderAssistantMeta: ({ row }) => {
      const copyState = resolveAssistantMessageCopyState({
        text: row.message.text,
        showCopyButton: row.showAssistantCopyButton,
        streaming: row.assistantCopyStreaming,
      });
      return row.showAssistantMeta ? (
        <view
          flatten={false}
          className={`transcript-message-meta transcript-assistant-meta${
            row.message.text.includes("```") ? " transcript-assistant-meta--code" : ""
          }${
            row.assistantTurnDiffSummary?.files.length &&
            row.assistantTurnDiffSummary.turnId === latestTurnId
              ? " transcript-assistant-meta--checkpoint"
              : ""
          }`}
        >
          {copyState.visible && copyState.text ? (
            <MessageCopyControl text={copyState.text} />
          ) : null}
          {!row.message.streaming ? (
            <text className="transcript-message-meta__time">
              {formatShortTimestamp(row.message.updatedAt, timestampFormat)}
            </text>
          ) : null}
        </view>
      ) : null;
    },
    renderCheckpointCard: ({ row }) => {
      const summary = row.assistantTurnDiffSummary;
      return shouldShowAssistantChangedFiles(summary) && summary ? (
        <LynxTurnDiffCard
          summary={summary}
          isLatestTurn={summary.turnId === latestTurnId}
          compact={compactChangedFiles}
          compactActions={compactChangedFilesActions}
          onManualNavigation={onManualNavigation}
        />
      ) : null;
    },
    renderProposedPlanCard: ({ row }) => <LynxProposedPlanCard plan={row.proposedPlan} />,
    renderWorkIcon: ({ name, className }) =>
      name === "terminal" ? (
        <svg
          className={`${className} transcript-work-icon-native`}
          src={externalTerminalUrl}
          style={{ width: "14px", height: "14px" }}
        />
      ) : (
        <Icon
          name={name}
          size={14}
          color={
            className.includes("text-destructive")
              ? "#ef4444"
              : className.includes("text-warning")
                ? "#f59e0b"
                : "#818181"
          }
          className={className}
        />
      ),
    renderWorkCopy: ({ heading, headingClassName, preview }) => (
      <view className="transcript-work-entry-copy-native">
        <text
          className={`transcript-work-entry-heading transcript-work-entry-heading--native${
            headingClassName.includes("text-destructive")
              ? " transcript-work-entry-heading--error"
              : headingClassName.includes("text-warning")
                ? " transcript-work-entry-heading--warning"
                : ""
          } ${headingClassName}`}
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
  hasTopBanner = false,
  cwd,
  latestTurn = null,
  proposedPlans = [],
  activeTurnId = null,
  checkpoints = [],
  availableWidth = 1024,
}: MessagesTimelineProps) {
  const [clientSettings] = useClientSettingsState();
  const [timelineViewportWidth, setTimelineViewportWidth] = useState(availableWidth);
  const [expandedTurnIds, setExpandedTurnIds] = useState<ReadonlySet<TurnId>>(new Set());
  const [expandedWorkGroupIds, setExpandedWorkGroupIds] = useState<ReadonlySet<string>>(new Set());
  const [timelineScrollMode, setTimelineScrollMode] = useState<TimelineScrollMode>("following-end");
  const timelineScrollModeRef = useRef(timelineScrollMode);
  timelineScrollModeRef.current = timelineScrollMode;
  const [timelineAtEnd, setTimelineAtEnd] = useState(true);
  const listRef = useRef<NodesRef>(null);
  const pendingTurnFoldAnchorRef = useRef<string | null>(null);
  const newestUserMessageIdRef = useRef<string | null | undefined>(undefined);
  const [anchorMessageId, setAnchorMessageId] = useState<string | null>(null);
  const [activeMinimapItemId, setActiveMinimapItemId] = useState<string | null>(null);

  const isWorking = isSessionWorking(sessionStatus);
  const revertMessage = useCallback((turnCount: number) => {
    void showNativeContextMenu([
      { id: "revert", label: `Revert to checkpoint ${turnCount}`, destructive: true },
    ]).then((selection) => {
      if (selection !== "revert") return;
      void showNativeConfirm({
        message: `Revert this thread to checkpoint ${turnCount}?`,
        detail:
          "This will discard newer messages and turn diffs in this thread. This action cannot be undone.",
        confirmLabel: "Revert",
      }).then((confirmed) => {
        if (confirmed) void t3ClientActions.revertCheckpoint(turnCount).catch(() => undefined);
      });
    });
  }, []);
  const detachForManualNavigation = useCallback(() => {
    setAnchorMessageId(null);
    setTimelineAtEnd(false);
    setTimelineScrollMode((current) =>
      reduceTimelineScrollMode(current, { kind: "user-scroll-away" }),
    );
  }, []);
  const rowElements = useMemo(
    () =>
      buildLynxTranscriptRowElements(
        cwd,
        latestTurn?.turnId ?? null,
        timelineViewportWidth < 360,
        timelineViewportWidth < 640,
        clientSettings.timestampFormat,
        revertMessage,
        isWorking,
        detachForManualNavigation,
      ),
    [
      clientSettings.timestampFormat,
      timelineViewportWidth,
      cwd,
      latestTurn?.turnId,
      revertMessage,
      isWorking,
      detachForManualNavigation,
    ],
  );

  const derivedRows = useMemo<TimelineRow[]>(() => {
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
    const inferredCheckpointTurnCountByTurnId = inferCheckpointTurnCountByTurnId(checkpoints);
    const revertTurnCountByUserMessageId = new Map<string, number>();
    for (let index = 0; index < timelineEntries.length; index += 1) {
      const entry = timelineEntries[index];
      if (!entry || entry.kind !== "message" || entry.message.role !== "user") continue;
      for (let cursor = index + 1; cursor < timelineEntries.length; cursor += 1) {
        const next = timelineEntries[cursor];
        if (!next || next.kind !== "message") continue;
        if (next.message.role === "user") break;
        const summary = turnDiffSummaryByAssistantMessageId.get(next.message.id);
        if (!summary) continue;
        const turnCount =
          summary.checkpointTurnCount ?? inferredCheckpointTurnCountByTurnId[summary.turnId];
        if (typeof turnCount === "number") {
          revertTurnCountByUserMessageId.set(entry.message.id, Math.max(0, turnCount - 1));
        }
        break;
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
      revertTurnCountByUserMessageId,
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
  const stableRowsRef = useRef<
    StableMessagesTimelineRowsState<
      ChatMessage,
      OrchestrationProposedPlan,
      OrchestrationCheckpointSummary
    >
  >({ byId: new Map(), result: [] });
  const rows = useMemo(() => {
    const next = computeStableMessagesTimelineRows(derivedRows, stableRowsRef.current);
    stableRowsRef.current = next;
    return next.result;
  }, [derivedRows]);
  const minimapItems = useMemo(() => deriveTimelineMinimapItems(rows), [rows]);
  const activeMinimapIndex = useMemo(
    () =>
      activeMinimapItemId === null
        ? null
        : minimapItems.findIndex((item) => item.id === activeMinimapItemId),
    [activeMinimapItemId, minimapItems],
  );
  const activeMinimapItem =
    activeMinimapIndex === null ? null : (minimapItems[activeMinimapIndex] ?? null);

  useEffect(() => {
    const next = deriveTranscriptNewTurnAnchor(
      newestUserMessageIdRef.current,
      messages,
      timelineScrollModeRef.current !== "free-scrolling",
    );
    newestUserMessageIdRef.current = next.newestUserMessageId;
    if (!next.anchorMessageId) return;
    setTimelineScrollMode((current) =>
      reduceTimelineScrollMode(current, { kind: "begin-new-turn" }),
    );
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

  useEffect(() => {
    const anchorRowId = pendingTurnFoldAnchorRef.current;
    if (!anchorRowId) return;
    const rowIndex = rows.findIndex((row) => row.id === anchorRowId);
    if (rowIndex < 0) return;
    pendingTurnFoldAnchorRef.current = null;
    listRef.current
      ?.invoke({
        method: "scrollToPosition",
        params: {
          index: rowIndex + (!isWorking && !hasTopBanner ? 1 : 0),
          alignTo: "top",
          smooth: false,
        },
      })
      .exec();
  }, [hasTopBanner, isWorking, rows]);

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
    if (timelineScrollModeRef.current === "free-scrolling" || anchorMessageId) return;
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
      if (!Number.isFinite(listHeight) || listHeight <= 0) return;
      const contentFits = scrollHeight <= listHeight + 60;
      const atEnd = contentFits || scrollHeight - scrollTop - listHeight <= 60;
      setTimelineAtEnd(atEnd);
      if (contentFits) {
        setTimelineScrollMode((current) =>
          reduceTimelineScrollMode(current, { kind: "follow-end" }),
        );
      } else if (eventSource === LIST_EVENT_SOURCE_SCROLL) {
        setTimelineScrollMode((current) =>
          reduceTimelineScrollMode(current, {
            kind: atEnd ? "user-scroll-end" : "user-scroll-away",
          }),
        );
      }
    },
    [],
  );

  useEffect(() => {
    const diagnosticsGlobal = globalThis as {
      __T3_LYNXTRON_TRANSCRIPT_SCROLL_PROBE__?: (
        action: "user-scroll-away" | "user-scroll-end",
      ) => void;
      __T3_LYNXTRON_TRANSCRIPT_LIST_PROBE__?: (index: number, alignTo: "bottom" | "top") => void;
      __T3_LYNXTRON_VIEWPORT_PROBE__?: unknown;
    };
    if (typeof diagnosticsGlobal.__T3_LYNXTRON_VIEWPORT_PROBE__ !== "function") return;
    const probe = (action: "user-scroll-away" | "user-scroll-end") => {
      setAnchorMessageId(null);
      setTimelineAtEnd(action === "user-scroll-end");
      setTimelineScrollMode((current) => reduceTimelineScrollMode(current, { kind: action }));
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
    setTimelineAtEnd(true);
    setTimelineScrollMode((current) => reduceTimelineScrollMode(current, { kind: "follow-end" }));
    scrollToEnd(true);
  }, [scrollToEnd]);

  const handleToggleTurn = useCallback(
    (turnId: TurnId) => {
      detachForManualNavigation();
      pendingTurnFoldAnchorRef.current = `turn-fold:${turnId}`;
      setExpandedTurnIds((current) => {
        const next = new Set(current);
        if (next.has(turnId)) {
          next.delete(turnId);
        } else {
          next.add(turnId);
        }
        return next;
      });
    },
    [detachForManualNavigation],
  );

  const handleToggleWorkGroup = useCallback(
    (groupId: string) => {
      detachForManualNavigation();
      setExpandedWorkGroupIds((current) => {
        const next = new Set(current);
        if (next.has(groupId)) {
          next.delete(groupId);
        } else {
          next.add(groupId);
        }
        return next;
      });
    },
    [detachForManualNavigation],
  );

  if (rows.length === 0) {
    return <view className="timeline-empty-spacer" />;
  }
  return (
    <view
      className="timeline-host"
      data-transcript-at-end={timelineAtEnd ? "true" : "false"}
      data-transcript-following={timelineScrollMode === "free-scrolling" ? "false" : "true"}
      data-transcript-scroll-mode={timelineScrollMode}
      bindlayoutchange={(event: { detail?: { width?: unknown } }) => {
        const width = event.detail?.width;
        if (typeof width === "number" && Number.isFinite(width) && width > 0) {
          setTimelineViewportWidth((current) => (current === width ? current : width));
        }
      }}
    >
      <list
        ref={listRef}
        className={
          hasTopBanner
            ? "timeline-list timeline-list--top-banner"
            : isWorking
              ? "timeline-list timeline-list--working"
              : "timeline-list"
        }
        scroll-orientation="vertical"
        list-type="single"
        span-count={1}
        scroll-event-throttle={100}
        bindscroll={handleScroll}
      >
        {!isWorking && !hasTopBanner ? (
          <list-item
            item-key="timeline-settled-header-space"
            key="timeline-settled-header-space"
            estimated-main-axis-size-px={32}
          >
            <view className="timeline-settled-header-space" />
          </list-item>
        ) : null}
        {rows.map((row) => (
          <list-item item-key={row.id} key={row.id} reuse-identifier={reuseIdentifierForRow(row)}>
            <view
              className={
                row.kind === "working"
                  ? "timeline-row-root timeline-row-root--working"
                  : row.kind === "message" && row.message.role === "assistant"
                    ? "timeline-row-root timeline-row-root--assistant"
                    : row.kind === "message" && row.message.role === "user"
                      ? "timeline-row-root timeline-row-root--user"
                      : row.kind === "turn-fold"
                        ? "timeline-row-root timeline-row-root--turn-fold"
                        : row.kind === "work" &&
                            row.groupedEntries.some(
                              (entry) => entry.sourceActivityKind === "user-input.requested",
                            )
                          ? "timeline-row-root timeline-row-root--user-input"
                          : "timeline-row-root"
              }
            >
              <TranscriptRowSurface
                row={row}
                workspaceRoot={cwd}
                activeTurnInProgress={isWorking}
                elements={rowElements}
                onToggleTurnFold={handleToggleTurn}
                onToggleWorkGroup={handleToggleWorkGroup}
                onWorkEntryDisclosure={detachForManualNavigation}
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
      {timelineViewportWidth >= 864 && minimapItems.length >= 2 ? (
        <HostView
          className="timeline-minimap"
          data-timeline-minimap
          data-timeline-minimap-active={activeMinimapItemId ?? ""}
          onMouseLeave={() => setActiveMinimapItemId(null)}
        >
          <view
            className="timeline-minimap__rail"
            style={{ height: resolveTimelineMinimapHeightStyle(minimapItems.length) }}
          >
            {minimapItems.map((item, index) => {
              const active = activeMinimapIndex === index;
              const distance =
                activeMinimapIndex === null ? null : Math.abs(activeMinimapIndex - index);
              return (
                <HostView
                  key={item.id}
                  className={`timeline-minimap__target${active ? " timeline-minimap__target--active" : ""}`}
                  data-timeline-minimap-item={item.id}
                  data-timeline-minimap-row-index={`${item.rowIndex}`}
                  style={{
                    top: `${resolveTimelineMinimapTopPercent(index, minimapItems.length)}%`,
                  }}
                  onMouseEnter={() => setActiveMinimapItemId(item.id)}
                  onClick={() => {
                    setActiveMinimapItemId(null);
                    detachForManualNavigation();
                    listRef.current
                      ?.invoke({
                        method: "scrollToPosition",
                        params: {
                          index: item.rowIndex + (!isWorking && !hasTopBanner ? 1 : 0),
                          alignTo: "top",
                          smooth: false,
                        },
                      })
                      .exec();
                  }}
                >
                  <view
                    className={`timeline-minimap__strip timeline-minimap__strip--${
                      distance === 0 ? "active" : distance === 1 ? "near" : "idle"
                    }`}
                  />
                </HostView>
              );
            })}
          </view>
          {activeMinimapItem ? (
            <view className="timeline-minimap__preview" data-timeline-minimap-preview>
              <text className="timeline-minimap__preview-title" text-maxline="1">
                {activeMinimapItem.userText ?? "User message"}
              </text>
              {activeMinimapItem.assistantText ? (
                <text className="timeline-minimap__preview-detail" text-maxline="3">
                  {activeMinimapItem.assistantText}
                </text>
              ) : null}
            </view>
          ) : null}
        </HostView>
      ) : null}
      <view
        className={`timeline-jump ${
          timelineScrollMode !== "free-scrolling"
            ? "timeline-jump--hidden"
            : "timeline-jump--visible"
        }`}
        data-transcript-jump-visible={timelineScrollMode === "free-scrolling" ? "true" : "false"}
        bindtap={timelineScrollMode === "free-scrolling" ? handleJumpToLatest : undefined}
      >
        <text className="timeline-jump__label">↓ Scroll to end</text>
      </view>
    </view>
  );
}
