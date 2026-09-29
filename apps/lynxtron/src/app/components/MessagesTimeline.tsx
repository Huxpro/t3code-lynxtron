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
  assistantMessageDisplayText,
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
  deriveRevertTurnCountByUserMessageId,
  indexCheckpointSummariesByAssistantMessageId,
  projectRevertCheckpointConfirmation,
} from "@t3tools/client-runtime/presentation/transcript";
import { formatShortTimestamp } from "@t3tools/client-runtime/presentation/time";
import { parseMarkdownInline } from "@t3tools/client-runtime/presentation/markdown";
import { formatWorkspaceRelativePath } from "@t3tools/client-runtime/presentation/paths";
import {
  formatReviewCommentFence,
  parseReviewCommentMessageSegments,
  type ReviewCommentContext,
} from "@t3tools/client-runtime/presentation/review-comment";
import { type ParsedPreviewAnnotation } from "@t3tools/client-runtime/presentation/preview-annotation";
import {
  deriveUserMessagePresentation,
  type ParsedUserContextEntry,
  shouldCollapseUserMessage,
} from "@t3tools/client-runtime/presentation/user-message";
import {
  buildCollapsedProposedPlanPreviewMarkdown,
  proposedPlanTitle,
} from "@t3tools/client-runtime/presentation/proposed-plan";
import type {
  OrchestrationLatestTurn,
  OrchestrationCheckpointSummary,
  OrchestrationProposedPlan,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";
import {
  TranscriptRowSurface,
  type TranscriptRowElements,
} from "../../../../web/src/components/chat/TranscriptRowSurface";
import { ChangedFilesCardSurface } from "../../../../web/src/components/chat/ChangedFilesCardSurface";
import { hasNonZeroStat } from "../../../../web/src/components/chat/DiffStatLabel";
import { HostButton, HostText, HostView } from "../../../../web/src/components/ui/hostElements";
import type { ActivityEntry, ChatMessage, SessionStatus } from "../bridge";
import externalChevronDownUrl from "../assets/chevron-down.svg?external";
import externalTerminalUrl from "../assets/terminal.svg?external";
import workingLabelFullAtlasUrl from "../assets/working-label-64-71h@2x.png?external";
import workingLabelAtlasUrl from "../assets/working-label-atlas@2x.png?external";
import { Icon } from "./Icon";
import {
  InlineMarkdownRenderer,
  MarkdownRenderer,
  markdownLinkContextMenuHandler,
} from "./MarkdownRenderer";
import { shouldRenderBlockMarkdown } from "@t3tools/client-runtime/presentation/markdown-blocks";
import { uiActions, useChangedFilesExpanded } from "../state/uiState";
import { clientCapabilities } from "../platform/clientCapabilities.lynx";
import { showNativeConfirm } from "../platform/clientCapabilities.lynx";
import { t3ClientActions } from "../state/t3Client";
import { useClientSettingsState } from "../state/prefsStore";
import { deriveDisplayedUserMessageState } from "../../../../web/src/lib/terminalContext";
import { LynxChangedFilesTree } from "./LynxChangedFilesTree";
import { ProjectFileIcon } from "./ProjectFileIcon";
import {
  layoutWorkingLabel,
  resolveWorkingLabelFullCell,
  WORKING_LABEL_ATLAS,
  WORKING_LABEL_FULL_ATLAS,
} from "./workingLabelAtlas";
import { resolveNativeTimelineScrollUpdate, timelineRowReuseIdentifier } from "./timelineRowSize";
import { runMessageCopy, type MessageCopyStatus } from "./messageCopy";
import { runMessageRevert, type MessageRevertStatus } from "./messageRevert";
import type { ExpandedImagePreview } from "@t3tools/client-runtime/presentation/image-preview";
import { buildExpandedImagePreview } from "@t3tools/client-runtime/presentation/image-preview";
import {
  resolveTimelineMinimapHasPersistentGutter,
  resolveTimelineMinimapHeightStyle,
  resolveTimelineMinimapTopPercent,
  TIMELINE_MINIMAP_MIN_ITEMS,
} from "../../../../web/src/components/chat/MessagesTimeline.logic";

type LynxChatMessage = Omit<ChatMessage, "attachments"> & {
  readonly attachments?: ReadonlyArray<
    NonNullable<ChatMessage["attachments"]>[number] & { readonly previewUrl?: string }
  >;
};

interface MessagesTimelineProps {
  threadId?: ThreadId | undefined;
  messages: ReadonlyArray<LynxChatMessage>;
  activities: ReadonlyArray<ActivityEntry>;
  sessionStatus: SessionStatus;
  hasTopBanner?: boolean;
  cwd?: string | undefined;
  latestTurn?: OrchestrationLatestTurn | null;
  proposedPlans?: ReadonlyArray<OrchestrationProposedPlan>;
  activeTurnId?: TurnId | null;
  checkpoints?: ReadonlyArray<OrchestrationCheckpointSummary>;
  availableWidth?: number;
  onImageExpand?: ((preview: ExpandedImagePreview) => void) | undefined;
}

type TimelineRow = MessagesTimelineRow<
  LynxChatMessage,
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
  threadId,
  summary,
  isLatestTurn,
  compact,
  compactActions,
  onManualNavigation,
}: {
  threadId: ThreadId | undefined;
  summary: OrchestrationCheckpointSummary;
  isLatestTurn: boolean;
  compact: boolean;
  compactActions: boolean;
  onManualNavigation: () => void;
}) {
  const persistedExpanded = useChangedFilesExpanded(threadId ?? "", summary.turnId);
  const [autoExpanded, setAutoExpanded] = useState(() =>
    shouldAutoExpandChangedFiles(summary.files, isLatestTurn),
  );
  const [allDirectoriesExpanded, setAllDirectoriesExpanded] = useState(autoExpanded);
  useEffect(() => {
    // Native list recycling hands this instance another checkpoint: snapshot
    // the auto-expand default again, as Web does once per mount.
    const next = shouldAutoExpandChangedFiles(summary.files, isLatestTurn);
    setAutoExpanded(next);
    setAllDirectoriesExpanded(next);
  }, [summary.checkpointRef, summary.turnId]);
  const expanded = persistedExpanded ?? (isLatestTurn && autoExpanded);
  const setExpanded = (value: boolean) => {
    if (threadId) uiActions.setChangedFilesExpanded(threadId, summary.turnId, value);
  };
  const stat = summarizeChangedFiles(summary.files);
  const preview = selectChangedFilePreview(summary.files);
  const scopeSummary = summarizeChangedFileScopes(summary.files);
  const statusLabel =
    summary.status === "ready"
      ? `${summary.files.length} changed file${summary.files.length === 1 ? "" : "s"}`
      : summary.status === "missing"
        ? "Checkpoint unavailable"
        : "Checkpoint failed";
  const openDiff = (filePath?: string) => {
    onManualNavigation();
    uiActions.openRightPanelSurface("diff", {
      turnId: summary.turnId,
      filePath,
    });
  };

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
        summary.status === "ready" && hasNonZeroStat(stat) ? (
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
        title: file.path,
        icon: <ProjectFileIcon path={file.path} />,
        onSelect: () => openDiff(file.path),
      }))}
      expandedBody={
        <LynxChangedFilesTree
          files={summary.files}
          allDirectoriesExpanded={allDirectoriesExpanded}
          onOpenFile={openDiff}
          onDirectoryToggle={onManualNavigation}
        />
      }
      onExpandedChange={(value) => {
        onManualNavigation();
        setExpanded(value);
      }}
      onShowAll={() => {
        onManualNavigation();
        setExpanded(true);
      }}
    />
  );
}

/** Lynx proposed-plan island: eyebrow + title card. */
function LynxProposedPlanCard({
  plan,
  cwd,
  threadId,
  onManualNavigation,
}: {
  plan: OrchestrationProposedPlan;
  cwd: string | undefined;
  threadId: ThreadId | undefined;
  onManualNavigation: () => void;
}) {
  const title = proposedPlanTitle(plan.planMarkdown) ?? "Proposed plan";
  const preview = buildCollapsedProposedPlanPreviewMarkdown(plan.planMarkdown, { maxLines: 4 });
  return (
    <HostView
      className="plan-row"
      aria-label={`Open proposed plan: ${title}`}
      data-transcript-plan-open="true"
      onClick={() => {
        onManualNavigation();
        uiActions.openRightPanelSurface("plan");
      }}
    >
      <text className="plan-row__eyebrow">Proposed plan</text>
      <text className="plan-row__title" text-maxline="2">
        {title}
      </text>
      <view className="plan-row__preview">
        <MarkdownRenderer
          text={preview}
          identity={`plan:${plan.id}`}
          streaming={false}
          cwd={cwd}
          threadId={threadId}
        />
      </view>
      <text className="plan-row__open-label">Open full plan</text>
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

function MessageCopyControl({
  text,
  identity,
}: {
  readonly text: string;
  readonly identity: string;
}) {
  const [status, setStatus] = useState<MessageCopyStatus | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestGenerationRef = useRef(0);
  useEffect(() => {
    requestGenerationRef.current += 1;
    if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = null;
    setStatus(null);
    return () => {
      requestGenerationRef.current += 1;
      if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current);
    };
  }, [identity, text]);
  const pending = status === "pending";
  const handleCopy = useCallback(() => {
    if (pending) return;
    if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current);
    const requestGeneration = ++requestGenerationRef.current;
    const setCurrentStatus = (nextStatus: MessageCopyStatus) => {
      if (requestGenerationRef.current === requestGeneration) setStatus(nextStatus);
    };
    void runMessageCopy(clientCapabilities.clipboard.writeText, text, setCurrentStatus).then(() => {
      if (requestGenerationRef.current !== requestGeneration) return;
      resetTimerRef.current = setTimeout(() => {
        if (requestGenerationRef.current === requestGeneration) setStatus(null);
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

function nativeRevertConfirmation(turnCount: number) {
  const confirmation = projectRevertCheckpointConfirmation(turnCount);
  return {
    message: confirmation.title,
    detail: confirmation.consequences.join(" "),
    confirmLabel: confirmation.confirmLabel,
  };
}

function UserMessageMeta({
  messageId,
  createdAt,
  copyText,
  revertTurnCount,
  isWorking,
  timestampFormat,
}: {
  readonly messageId: string;
  readonly createdAt: string;
  readonly copyText: string;
  readonly revertTurnCount: number | undefined;
  readonly isWorking: boolean;
  readonly timestampFormat: Parameters<typeof formatShortTimestamp>[1];
}) {
  const [revertStatus, setRevertStatus] = useState<MessageRevertStatus | null>(null);
  useEffect(() => setRevertStatus(null), [messageId, revertTurnCount]);
  const revertPending = revertStatus === "pending";
  const revertFailed = revertStatus === "failed";
  const handleRevert = useCallback(() => {
    if (revertTurnCount === undefined || isWorking || revertPending) return;
    void runMessageRevert(
      () => showNativeConfirm(nativeRevertConfirmation(revertTurnCount)),
      () => t3ClientActions.revertCheckpoint(revertTurnCount),
      setRevertStatus,
    );
  }, [isWorking, revertPending, revertTurnCount]);
  return (
    <view
      flatten={false}
      className={`transcript-message-meta transcript-user-meta${
        revertFailed ? " transcript-message-meta--visible" : ""
      }`}
      data-message-revert-state={revertStatus ?? "idle"}
    >
      <text className="transcript-message-meta__time">
        {formatShortTimestamp(createdAt, timestampFormat)}
      </text>
      {revertTurnCount !== undefined ? (
        <view
          className={`transcript-message-meta__action${
            isWorking || revertPending ? " transcript-message-meta__action--disabled" : ""
          }${revertFailed ? " transcript-message-meta__action--failed" : ""}`}
          aria-label={revertFailed ? "Revert failed" : "Revert to this message"}
          aria-disabled={isWorking || revertPending ? "true" : "false"}
          bindtap={isWorking || revertPending ? undefined : handleRevert}
        >
          <Icon
            name={revertFailed ? "x" : "rotate-ccw"}
            size={14}
            color={revertFailed ? "#f87171" : "#818181"}
          />
        </view>
      ) : null}
      {revertFailed ? (
        <text className="transcript-message-meta__failure">Revert failed</text>
      ) : null}
      <MessageCopyControl key={messageId} text={copyText} identity={messageId} />
    </view>
  );
}

function TranscriptAttachmentCard({
  attachment,
  attachments,
  onImageExpand,
}: {
  readonly attachment: NonNullable<LynxChatMessage["attachments"]>[number];
  readonly attachments: ReadonlyArray<NonNullable<LynxChatMessage["attachments"]>[number]>;
  readonly onImageExpand: ((preview: ExpandedImagePreview) => void) | undefined;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [attachment.id, attachment.previewUrl]);
  const canPreview = Boolean(attachment.previewUrl && !failed);
  return (
    <view
      className={`transcript-attachment-card${canPreview ? " transcript-attachment-card--image" : ""}`}
      data-message-attachment-type={attachment.type}
      data-message-attachment-state={canPreview ? "preview" : failed ? "failed" : "fallback"}
      aria-label={canPreview ? `Preview ${attachment.name}` : attachment.name}
      bindtap={
        canPreview && onImageExpand
          ? () => {
              const preview = buildExpandedImagePreview(attachments, attachment.id);
              if (preview) onImageExpand(preview);
            }
          : undefined
      }
    >
      {canPreview ? (
        <image
          className="transcript-attachment-preview"
          src={attachment.previewUrl}
          mode="aspectFill"
          binderror={() => setFailed(true)}
        />
      ) : (
        <text className="transcript-attachment-name" text-maxline="2">
          {attachment.name}
        </text>
      )}
    </view>
  );
}

function LynxUserMessagePreviewAnnotationCard({
  annotation,
  image,
  onImageExpand,
}: {
  readonly annotation: ParsedPreviewAnnotation;
  readonly image: NonNullable<LynxChatMessage["attachments"]>[number] | null;
  readonly onImageExpand: ((preview: ExpandedImagePreview) => void) | undefined;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [annotation.id, image?.id, image?.previewUrl]);
  const canPreview = Boolean(image?.previewUrl && !failed);
  return (
    <view className="transcript-preview-annotation" data-preview-annotation={annotation.id}>
      {canPreview && image ? (
        <image
          className="transcript-preview-annotation__image"
          src={image.previewUrl}
          mode="aspectFill"
          aria-label={`Preview ${image.name}`}
          bindtap={() => {
            if (!onImageExpand) return;
            const preview = buildExpandedImagePreview([image], image.id);
            if (preview) onImageExpand(preview);
          }}
          binderror={() => setFailed(true)}
        />
      ) : null}
      <view className="transcript-preview-annotation__copy">
        {annotation.comment ? (
          <text className="transcript-preview-annotation__comment" text-maxline="1">
            {annotation.comment}
          </text>
        ) : null}
        <view className="transcript-preview-annotation__meta">
          {annotation.targetSummary ? (
            <text className="transcript-preview-annotation__targets" text-maxline="1">
              {annotation.targetSummary}
            </text>
          ) : null}
          {annotation.styleChanges.length > 0 ? (
            <text className="transcript-preview-annotation__styles">
              ◇ {annotation.styleChanges.length}
            </text>
          ) : null}
        </view>
      </view>
    </view>
  );
}

function LynxUserMessageContextChip({
  context,
  kind,
}: {
  readonly context: ParsedUserContextEntry;
  readonly kind: "terminal" | "element";
}) {
  return (
    <view
      className={`transcript-context-chip transcript-context-chip--${kind}`}
      data-message-context-kind={kind}
      aria-label={context.body ? `${context.header}\n${context.body}` : context.header}
    >
      <text className="transcript-context-chip__label" text-maxline="1">
        {context.header}
      </text>
    </view>
  );
}

function LynxUserMessageReviewCommentCard({
  comment,
  cwd,
  messageId,
  onManualNavigation,
  onImageExpand,
  threadId,
}: {
  readonly comment: ReviewCommentContext;
  readonly cwd: string | undefined;
  readonly messageId: string;
  readonly onManualNavigation: () => void;
  readonly onImageExpand: ((preview: ExpandedImagePreview) => void) | undefined;
  readonly threadId: ThreadId | undefined;
}) {
  const fenceLanguage = comment.fenceLanguage ?? "diff";
  return (
    <view
      className="transcript-review-comment"
      data-review-comment={comment.id}
      data-review-comment-file={comment.filePath}
      data-review-comment-range={comment.rangeLabel}
    >
      <view className="transcript-review-comment__header">
        <text className="transcript-review-comment__path" text-maxline="2">
          {formatWorkspaceRelativePath(comment.filePath, cwd)}
        </text>
        <text className="transcript-review-comment__meta">
          {comment.sectionTitle} · {comment.rangeLabel}
        </text>
      </view>
      {comment.text.length > 0 ? (
        <MarkdownRenderer
          text={comment.text}
          identity={`message:${messageId}:${comment.id}:comment`}
          cwd={cwd}
          onManualNavigation={onManualNavigation}
          onImageExpand={onImageExpand}
          threadId={threadId}
        />
      ) : null}
      {comment.diff.trim().length > 0 ? (
        <MarkdownRenderer
          text={formatReviewCommentFence(fenceLanguage, comment.diff)}
          identity={`message:${messageId}:${comment.id}:context`}
          cwd={cwd}
          onManualNavigation={onManualNavigation}
          onImageExpand={onImageExpand}
          threadId={threadId}
        />
      ) : null}
    </view>
  );
}

function CollapsibleLynxUserMessageBody({
  messageId,
  text,
  cwd,
  onManualNavigation,
  onImageExpand,
  threadId,
}: {
  readonly messageId: string;
  readonly text: string;
  readonly cwd: string | undefined;
  readonly onManualNavigation: () => void;
  readonly onImageExpand: ((preview: ExpandedImagePreview) => void) | undefined;
  readonly threadId: ThreadId | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setExpanded(false), [messageId]);
  const canCollapse = shouldCollapseUserMessage(text);
  const collapsed = canCollapse && !expanded;
  const reviewCommentSegments = parseReviewCommentMessageSegments(text);
  const hasReviewComments = reviewCommentSegments.some(
    (segment) => segment.kind === "review-comment",
  );
  return (
    <view className="transcript-user-body-shell">
      <view
        className={[
          "transcript-user-body lynx-host-text whitespace-pre-wrap text-sm leading-6 text-foreground/92",
          collapsed ? "transcript-user-body--collapsed" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        data-user-message-body="true"
        data-user-message-collapsed={collapsed ? "true" : "false"}
        data-user-message-collapsible={canCollapse ? "true" : "false"}
      >
        {hasReviewComments ? (
          <view className="transcript-review-comments">
            {reviewCommentSegments.map((segment) =>
              segment.kind === "text" ? (
                segment.text.trim().length > 0 ? (
                  <MarkdownRenderer
                    key={segment.id}
                    text={segment.text.trim()}
                    identity={`message:${messageId}:${segment.id}`}
                    cwd={cwd}
                    onManualNavigation={onManualNavigation}
                    onImageExpand={onImageExpand}
                    threadId={threadId}
                  />
                ) : null
              ) : (
                <LynxUserMessageReviewCommentCard
                  key={segment.comment.id}
                  comment={segment.comment}
                  cwd={cwd}
                  messageId={messageId}
                  onManualNavigation={onManualNavigation}
                  onImageExpand={onImageExpand}
                  threadId={threadId}
                />
              ),
            )}
          </view>
        ) : (
          <MarkdownRenderer
            text={text}
            identity={`message:${messageId}`}
            cwd={cwd}
            onManualNavigation={onManualNavigation}
            onImageExpand={onImageExpand}
            threadId={threadId}
          />
        )}
        {collapsed ? <view className="transcript-user-body-fade" event-through /> : null}
      </view>
      {canCollapse ? (
        <HostButton
          type="button"
          className="transcript-user-body-toggle"
          aria-expanded={expanded}
          data-scroll-anchor-ignore
          onClick={() => {
            onManualNavigation();
            setExpanded((value) => !value);
          }}
        >
          <HostText>{expanded ? "Show less" : "Show full message"}</HostText>
        </HostButton>
      ) : null}
    </view>
  );
}

/** Platform islands handed to the shared transcript composition. */
const lynxUserRowStateCache = new WeakMap<
  LynxChatMessage,
  ReturnType<typeof deriveUserMessagePresentation> & {
    readonly previewImages: ReadonlyArray<NonNullable<LynxChatMessage["attachments"]>[number]>;
    readonly regularAttachments: ReadonlyArray<NonNullable<LynxChatMessage["attachments"]>[number]>;
  }
>();

function extractLynxUserMessageState(message: LynxChatMessage) {
  const cached = lynxUserRowStateCache.get(message);
  if (cached) return cached;
  const presentation = deriveUserMessagePresentation(message.text);
  const attachments = message.attachments ?? [];
  const state = {
    ...presentation,
    previewImages: attachments.filter((attachment) =>
      attachment.name.startsWith("preview-annotation-"),
    ),
    regularAttachments: attachments.filter(
      (attachment) => !attachment.name.startsWith("preview-annotation-"),
    ),
  };
  lynxUserRowStateCache.set(message, state);
  return state;
}

function extractLynxUserRowState(row: Extract<TimelineRow, { kind: "message" }>) {
  return extractLynxUserMessageState(row.message);
}

function buildLynxTranscriptRowElements(
  cwd: string | undefined,
  latestTurnId: TurnId | null,
  compactChangedFiles: boolean,
  compactChangedFilesActions: boolean,
  timestampFormat: Parameters<typeof formatShortTimestamp>[1],
  isWorking: boolean,
  onManualNavigation: () => void,
  onImageExpand: ((preview: ExpandedImagePreview) => void) | undefined,
  threadId: ThreadId | undefined,
): TranscriptRowElements<
  LynxChatMessage,
  OrchestrationProposedPlan,
  OrchestrationCheckpointSummary
> {
  return {
    messageVisibleText: ({ row }) =>
      row.message.role === "user" ? extractLynxUserRowState(row).semanticText : row.message.text,
    userBubbleClassName: ({ row }) => {
      const visibleText = extractLynxUserRowState(row).visibleText;
      const estimatedInlineWidth = parseMarkdownInline(visibleText).reduce(
        (width, span) => width + span.text.length * (span.code ? 7.25 : 6.9) + (span.code ? 16 : 0),
        0,
      );
      return estimatedInlineWidth > 590 ? "transcript-user-bubble--max" : undefined;
    },
    renderUserExtras: ({ row }) => {
      const displayed = extractLynxUserRowState(row);
      if (
        displayed.regularAttachments.length === 0 &&
        displayed.previewAnnotations.length === 0 &&
        displayed.contextKinds.length === 0
      )
        return null;
      return (
        <view className="transcript-user-extras">
          {displayed.regularAttachments.length > 0 ? (
            <view
              className="transcript-attachment-list"
              data-message-attachment-count={String(displayed.regularAttachments.length)}
            >
              {displayed.regularAttachments.map((attachment) => (
                <TranscriptAttachmentCard
                  key={attachment.id}
                  attachment={attachment}
                  attachments={displayed.regularAttachments}
                  onImageExpand={onImageExpand}
                />
              ))}
            </view>
          ) : null}
          {displayed.previewAnnotations.map((annotation, index) => (
            <LynxUserMessagePreviewAnnotationCard
              key={annotation.id}
              annotation={annotation}
              image={displayed.previewImages[index] ?? null}
              onImageExpand={onImageExpand}
            />
          ))}
          {displayed.terminalContexts.length > 0 || displayed.elementContexts.length > 0 ? (
            <view
              className="transcript-context-chips"
              data-message-context-count={String(
                displayed.terminalContexts.length + displayed.elementContexts.length,
              )}
            >
              {displayed.terminalContexts.map((context, index) => (
                <LynxUserMessageContextChip
                  key={`terminal:${context.header}:${index}`}
                  context={context}
                  kind="terminal"
                />
              ))}
              {displayed.elementContexts.map((context, index) => (
                <LynxUserMessageContextChip
                  key={`element:${context.header}:${index}`}
                  context={context}
                  kind="element"
                />
              ))}
            </view>
          ) : null}
        </view>
      );
    },
    renderUserBody: ({ row }) => {
      const displayed = extractLynxUserRowState(row);
      if (displayed.visibleText.trim().length === 0) return null;
      return (
        <CollapsibleLynxUserMessageBody
          messageId={row.message.id}
          text={displayed.visibleText}
          cwd={cwd}
          onManualNavigation={onManualNavigation}
          onImageExpand={onImageExpand}
          threadId={threadId}
        />
      );
    },
    renderUserMeta: ({ row }) => {
      const copyText = deriveDisplayedUserMessageState(row.message.text).copyText;
      return (
        <UserMessageMeta
          messageId={row.message.id}
          createdAt={row.message.createdAt}
          copyText={copyText}
          revertTurnCount={row.revertTurnCount}
          isWorking={isWorking}
          timestampFormat={timestampFormat}
        />
      );
    },
    renderAssistantMarkdown: ({ row }) =>
      row.message.text && row.message.text.trim().length > 0 ? (
        shouldRenderBlockMarkdown(row.message.text) ? (
          <MarkdownRenderer
            text={row.message.text}
            identity={`message:${row.message.id}`}
            streaming={row.message.streaming}
            cwd={cwd}
            onManualNavigation={onManualNavigation}
            onImageExpand={onImageExpand}
            threadId={threadId}
          />
        ) : (
          <InlineMarkdownRenderer
            text={row.message.text}
            cwd={cwd}
            onManualNavigation={onManualNavigation}
          />
        )
      ) : (
        <InlineMarkdownRenderer
          text={assistantMessageDisplayText(row.message.text, row.message.streaming)}
          cwd={cwd}
          onManualNavigation={onManualNavigation}
        />
      ),
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
            <MessageCopyControl
              key={row.message.id}
              text={copyState.text}
              identity={row.message.id}
            />
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
          threadId={threadId}
          summary={summary}
          isLatestTurn={summary.turnId === latestTurnId}
          compact={compactChangedFiles}
          compactActions={compactChangedFilesActions}
          onManualNavigation={onManualNavigation}
        />
      ) : null;
    },
    renderProposedPlanCard: ({ row }) => (
      <LynxProposedPlanCard
        plan={row.proposedPlan}
        cwd={cwd}
        threadId={threadId}
        onManualNavigation={onManualNavigation}
      />
    ),
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
    renderWorkStatus: ({ failed, succeeded, warning }) =>
      failed ? (
        <view
          className="transcript-work-status transcript-work-status--failed"
          aria-label={warning ? "Tool warning" : "Tool call failed"}
        >
          <Icon name="x" size={12} color="#f87171" />
        </view>
      ) : succeeded ? (
        <view
          className="transcript-work-status transcript-work-status--succeeded"
          aria-label="Tool call completed"
        >
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
            className={`transcript-disclosure-chevron-native${
              expanded ? " transcript-disclosure-chevron-native--expanded" : ""
            }`}
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
  threadId,
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
  onImageExpand,
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
  const jumpToLatestInFlightRef = useRef(false);
  const [activeMinimapItemId, setActiveMinimapItemId] = useState<string | null>(null);

  const isWorking = isSessionWorking(sessionStatus);
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
        isWorking,
        detachForManualNavigation,
        onImageExpand,
        threadId,
      ),
    [
      clientSettings.timestampFormat,
      timelineViewportWidth,
      cwd,
      latestTurn?.turnId,
      isWorking,
      detachForManualNavigation,
      onImageExpand,
      threadId,
    ],
  );

  const derivedRows = useMemo<TimelineRow[]>(() => {
    const workEntries = deriveWorkLogEntries(activities);
    const timelineEntries = deriveTimelineEntries<LynxChatMessage, OrchestrationProposedPlan>(
      messages,
      proposedPlans,
      workEntries,
    );
    const activeTurnStartedAt = deriveActiveWorkStartedAt(
      latestTurn,
      { status: sessionStatus, activeTurnId },
      null,
    );
    const turnDiffSummaryByAssistantMessageId =
      indexCheckpointSummariesByAssistantMessageId(checkpoints);
    const revertTurnCountByUserMessageId = deriveRevertTurnCountByUserMessageId(
      timelineEntries,
      turnDiffSummaryByAssistantMessageId,
      inferCheckpointTurnCountByTurnId(checkpoints),
    );
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
  const minimapItems = useMemo(
    () =>
      deriveTimelineMinimapItems(
        rows,
        (message) => extractLynxUserMessageState(message).semanticText,
      ),
    [rows],
  );
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
      if (!Number.isFinite(listHeight) || listHeight <= 0) return;
      const contentFits = scrollHeight <= listHeight + 60;
      const atEnd = contentFits || scrollHeight - scrollTop - listHeight <= 60;
      const update = resolveNativeTimelineScrollUpdate({
        mode: timelineScrollModeRef.current,
        eventSource,
        userScrollEventSource: LIST_EVENT_SOURCE_SCROLL,
        atEnd,
        contentFits,
        jumpToLatestInFlight: jumpToLatestInFlightRef.current,
      });
      jumpToLatestInFlightRef.current = update.jumpToLatestInFlight;
      if (update.clearAnchor) setAnchorMessageId(null);
      setTimelineAtEnd(atEnd);
      setTimelineScrollMode(update.mode);
    },
    [],
  );

  useEffect(() => {
    const diagnosticsGlobal = globalThis as {
      __T3_LYNXTRON_TRANSCRIPT_SCROLL_PROBE__?: (
        action: "user-scroll-away" | "user-scroll-end",
      ) => void;
      __T3_LYNXTRON_TRANSCRIPT_LIST_PROBE__?: (index: number, alignTo: "bottom" | "top") => void;
      __T3_LYNXTRON_TRANSCRIPT_ROW_COUNT__?: () => number;
      __T3_LYNXTRON_TRANSCRIPT_MINIMAP_COUNT__?: () => number;
      __T3_LYNXTRON_LINK_CONTEXT_MENU_PROBE__?: (href: string) => boolean;
      __T3_LYNXTRON_VIEWPORT_PROBE__?: unknown;
    };
    if (typeof diagnosticsGlobal.__T3_LYNXTRON_VIEWPORT_PROBE__ !== "function") return;
    const probe = (action: "user-scroll-away" | "user-scroll-end") => {
      setAnchorMessageId(null);
      setTimelineAtEnd(action === "user-scroll-end");
      setTimelineScrollMode((current) => reduceTimelineScrollMode(current, { kind: action }));
    };
    diagnosticsGlobal.__T3_LYNXTRON_TRANSCRIPT_SCROLL_PROBE__ = probe;
    // DevTool touches carry no mouse button, so the probe invokes the same
    // secondary-click handler a transcript link registers.
    diagnosticsGlobal.__T3_LYNXTRON_LINK_CONTEXT_MENU_PROBE__ = (href) => {
      const handler = markdownLinkContextMenuHandler(href, cwd);
      handler?.();
      return handler !== undefined;
    };
    diagnosticsGlobal.__T3_LYNXTRON_TRANSCRIPT_LIST_PROBE__ = (index, alignTo) => {
      listRef.current
        ?.invoke({
          method: "scrollToPosition",
          params: { index, alignTo, smooth: false },
        })
        .exec();
    };
    diagnosticsGlobal.__T3_LYNXTRON_TRANSCRIPT_ROW_COUNT__ = () => rows.length;
    diagnosticsGlobal.__T3_LYNXTRON_TRANSCRIPT_MINIMAP_COUNT__ = () => minimapItems.length;
    return () => {
      if (diagnosticsGlobal.__T3_LYNXTRON_TRANSCRIPT_SCROLL_PROBE__ === probe) {
        delete diagnosticsGlobal.__T3_LYNXTRON_TRANSCRIPT_SCROLL_PROBE__;
      }
      delete diagnosticsGlobal.__T3_LYNXTRON_TRANSCRIPT_LIST_PROBE__;
      delete diagnosticsGlobal.__T3_LYNXTRON_TRANSCRIPT_ROW_COUNT__;
      delete diagnosticsGlobal.__T3_LYNXTRON_TRANSCRIPT_MINIMAP_COUNT__;
      delete diagnosticsGlobal.__T3_LYNXTRON_LINK_CONTEXT_MENU_PROBE__;
    };
  }, [cwd, minimapItems.length, rows.length]);

  const handleJumpToLatest = useCallback(() => {
    jumpToLatestInFlightRef.current = true;
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
      {resolveTimelineMinimapHasPersistentGutter(timelineViewportWidth) &&
      minimapItems.length >= TIMELINE_MINIMAP_MIN_ITEMS ? (
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
