/**
 * Renderer-neutral transcript row composition (AR3).
 *
 * One physical module owns the transcript's row anatomy for both Web and
 * Lynx: user/system/assistant message rows, collapsed work and tool summary
 * rows, turn folds, working rows, proposed-plan and checkpoint card
 * placement, typography, and semantic class names. State projection stays
 * outside this module (the shared `MessagesTimelineRow` projection feeds it);
 * platform islands (Markdown, checkpoint/plan cards, work icons, timestamps,
 * copy/revert affordances) enter through the `TranscriptRowElements`
 * contract. Compiled by both renderers: Web resolves the host leaves to DOM
 * elements, Lynx to Lynx elements.
 */
import { memo, useEffect, useState, type ReactNode } from "react";

import {
  normalizeCompactToolLabel,
  workEntryDisplayIndicatesToolFailure,
  workEntryIndicatesToolFailure,
  workEntryIndicatesToolNeutralStatus,
  workEntryIndicatesToolSuccess,
  workEntryIsVisibleInGroup,
  workLogEntryIsToolLike,
  type MessagesTimelineRow,
  type TranscriptMessage,
  type TranscriptProposedPlan,
} from "@t3tools/client-runtime/presentation/transcript";
import type { TurnId } from "@t3tools/contracts";
import { cn } from "../../lib/cn";

import { HostButton, HostText, HostView } from "../ui/hostElements";
import {
  buildToolCallExpandedBody,
  liveWorkEntryLabel,
  toolGroupSummaryIconName,
  toolWorkEntryHeading,
  workEntryIconName,
  workEntryPreview,
  workGroupSectionLabel,
  workGroupToggleNoun,
  workToneIcon,
  type TimelineWorkEntry,
  type WorkEntryIconName,
} from "./transcriptRowPresentation";

export type TranscriptTimelineRow<
  M extends TranscriptMessage = TranscriptMessage,
  P extends TranscriptProposedPlan = TranscriptProposedPlan,
  D = unknown,
> = MessagesTimelineRow<M, P, D>;

type MessageRowOf<M extends TranscriptMessage, P extends TranscriptProposedPlan, D> = Extract<
  MessagesTimelineRow<M, P, D>,
  { kind: "message" }
>;

/** Platform islands injected into the shared transcript row anatomy. */
export interface TranscriptRowElements<
  M extends TranscriptMessage = TranscriptMessage,
  P extends TranscriptProposedPlan = TranscriptProposedPlan,
  D = unknown,
> {
  /** User message body inside the bubble (Web: collapsible body + contexts). */
  renderUserBody(input: { row: MessageRowOf<M, P, D> }): ReactNode;
  /** Renderer-visible message text for semantic/test surfaces, without provider-only wrappers. */
  messageVisibleText?(input: { row: MessageRowOf<M, P, D> }): string;
  /** Host-only bubble sizing compensation when platform intrinsic width differs. */
  userBubbleClassName?(input: { row: MessageRowOf<M, P, D> }): string | undefined;
  /** Assistant Markdown island. */
  renderAssistantMarkdown(input: { row: MessageRowOf<M, P, D> }): ReactNode;
  /** Meta row under the user bubble (Web: timestamp/copy/revert; Lynx: none). */
  renderUserMeta?(input: { row: MessageRowOf<M, P, D> }): ReactNode;
  /** Attachments/context strip inside the user bubble (Web-only today). */
  renderUserExtras?(input: { row: MessageRowOf<M, P, D> }): ReactNode;
  /** Meta row under an assistant message (Web: copy/timestamp; Lynx: none). */
  renderAssistantMeta?(input: { row: MessageRowOf<M, P, D> }): ReactNode;
  /** Turn checkpoint card island placed after the assistant Markdown. */
  renderCheckpointCard(input: { row: MessageRowOf<M, P, D> }): ReactNode;
  /** Proposed-plan card island. */
  renderProposedPlanCard(input: {
    row: Extract<MessagesTimelineRow<M, P, D>, { kind: "proposed-plan" }>;
  }): ReactNode;
  /** Leading work-entry icon leaf (Web: lucide SVG; Lynx: raster icon). */
  renderWorkIcon(input: { name: WorkEntryIconName; className: string }): ReactNode;
  /** Host-native work-entry copy when nested text cannot honor flex gaps. */
  renderWorkCopy?(input: {
    heading: string;
    headingClassName: string;
    preview: string | null;
  }): ReactNode;
  /** Trailing work-entry status affordance (Web: tooltip icons; Lynx: glyph). */
  renderWorkStatus(input: { failed: boolean; succeeded: boolean; warning: boolean }): ReactNode;
  /** Disclosure chevron leaf (Web: lucide SVG icons; Lynx: text glyph). */
  renderDisclosureChevron(input: {
    kind: "turn-fold" | "work-toggle" | "work-entry";
    expanded: boolean;
  }): ReactNode;
  /** Working-row indicator for hosts that collapse empty text leaves. */
  renderWorkingIndicator?(): ReactNode;
  /** Ticking working-row label and its host-native visual wrapper. */
  renderWorkingLabel(input: { createdAt: string | null }): ReactNode;
}

export interface TranscriptRowSurfaceProps<
  M extends TranscriptMessage = TranscriptMessage,
  P extends TranscriptProposedPlan = TranscriptProposedPlan,
  D = unknown,
> {
  readonly row: MessagesTimelineRow<M, P, D>;
  readonly workspaceRoot: string | undefined;
  readonly activeTurnInProgress: boolean;
  readonly elements: TranscriptRowElements<M, P, D>;
  readonly onToggleTurnFold: (turnId: TurnId) => void;
  readonly onToggleWorkGroup: (groupId: string, anchorElement?: unknown) => void;
  readonly onWorkEntryDisclosure?: (() => void) | undefined;
}

function UserRow({
  row,
  elements,
}: {
  readonly row: Extract<TranscriptTimelineRow, { kind: "message" }>;
  readonly elements: TranscriptRowElements;
}) {
  return (
    <HostView
      className="transcript-user-row group flex flex-col items-end gap-1"
      hoverRevealSelector=".transcript-message-meta"
    >
      <HostView
        className={cn(
          "transcript-user-bubble relative max-w-[80%] rounded-2xl bg-accent p-3",
          elements.userBubbleClassName?.({ row }),
        )}
      >
        {elements.renderUserExtras?.({ row })}
        {elements.renderUserBody({ row })}
      </HostView>
      {elements.renderUserMeta?.({ row })}
    </HostView>
  );
}

function SystemRow({ row }: { readonly row: Extract<TranscriptTimelineRow, { kind: "message" }> }) {
  return (
    <HostView className="transcript-system-row px-1 py-0.5">
      <HostText className="text-xs text-muted-foreground/75">{row.message.text}</HostText>
    </HostView>
  );
}

function AssistantRow({
  row,
  elements,
}: {
  readonly row: Extract<TranscriptTimelineRow, { kind: "message" }>;
  readonly elements: TranscriptRowElements;
}) {
  return (
    <HostView
      className="transcript-assistant-row relative min-w-0 px-1 py-0.5"
      hoverRevealSelector=".transcript-message-meta"
    >
      {elements.renderAssistantMarkdown({ row })}
      {row.assistantTurnDiffSummary ? elements.renderCheckpointCard({ row }) : null}
      {elements.renderAssistantMeta?.({ row })}
    </HostView>
  );
}

function TurnFoldRow({
  row,
  elements,
  onToggleTurnFold,
}: {
  readonly row: Extract<TranscriptTimelineRow, { kind: "turn-fold" }>;
  readonly elements: TranscriptRowElements;
  readonly onToggleTurnFold: (turnId: TurnId) => void;
}) {
  return (
    <HostView
      className="transcript-turn-fold border-b border-border/60 pb-2 pt-1"
      data-transcript-turn-fold={String(row.turnId)}
      data-transcript-turn-fold-state={row.expanded ? "expanded" : "collapsed"}
    >
      <HostButton
        type="button"
        aria-expanded={row.expanded}
        data-scroll-anchor-ignore
        onClick={() => onToggleTurnFold(row.turnId)}
        className="transcript-turn-fold-button flex cursor-pointer select-none items-center gap-1 rounded-md px-1 text-xs text-muted-foreground tabular-nums"
      >
        <HostText>{row.label}</HostText>
        {elements.renderDisclosureChevron({ kind: "turn-fold", expanded: row.expanded })}
      </HostButton>
    </HostView>
  );
}

function WorkEntryRow({
  workEntry,
  workspaceRoot,
  activeTurnInProgress,
  isExpandedToolGroupEntry,
  elements,
  onDisclosure,
}: {
  readonly workEntry: TimelineWorkEntry;
  readonly workspaceRoot: string | undefined;
  readonly activeTurnInProgress: boolean;
  readonly isExpandedToolGroupEntry: boolean;
  readonly elements: TranscriptRowElements;
  readonly onDisclosure: (() => void) | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setExpanded(false), [workEntry.id]);
  const iconConfig = workToneIcon(workEntry.tone);
  const showWarningIndicator = workEntry.sourceActivityKind === "runtime.warning";
  const rawPreview = workEntryPreview(workEntry, workspaceRoot);
  // Entries under a tool-group summary read as one line of copy; their
  // failure shows as the leading x instead of a trailing status glyph.
  const heading = isExpandedToolGroupEntry
    ? (rawPreview ?? toolWorkEntryHeading(workEntry))
    : toolWorkEntryHeading(workEntry);
  const preview =
    isExpandedToolGroupEntry ||
    (rawPreview &&
      normalizeCompactToolLabel(rawPreview).toLowerCase() ===
        normalizeCompactToolLabel(heading).toLowerCase())
      ? null
      : rawPreview;
  const displayText = preview ? `${heading} - ${preview}` : heading;
  const expandedBody = buildToolCallExpandedBody(workEntry, workspaceRoot);
  const canExpand = expandedBody !== null;
  const showFailedIndicator = isExpandedToolGroupEntry
    ? workEntryDisplayIndicatesToolFailure(workEntry)
    : workEntryIndicatesToolFailure(workEntry);
  const entryIconName =
    showWarningIndicator || (isExpandedToolGroupEntry && showFailedIndicator)
      ? "x"
      : workEntryIconName(workEntry);
  const showEntryIcon = !isExpandedToolGroupEntry || showWarningIndicator || showFailedIndicator;
  const showDestructiveRowStyle =
    showFailedIndicator &&
    (workEntry.sourceActivityKind === "runtime.error" || !workLogEntryIsToolLike(workEntry));
  const iconWrapperClass = cn(
    "transcript-work-entry-icon flex size-5 shrink-0 items-center justify-center",
    showWarningIndicator ||
      showDestructiveRowStyle ||
      (isExpandedToolGroupEntry && showFailedIndicator)
      ? "text-destructive"
      : workEntry.tone === "tool" || showFailedIndicator
        ? "text-muted-foreground/65"
        : iconConfig.className,
  );
  const headingClass = showWarningIndicator
    ? "font-medium text-warning"
    : showDestructiveRowStyle
      ? "font-medium text-destructive"
      : isExpandedToolGroupEntry
        ? "transcript-work-entry-heading--grouped text-muted-foreground/70"
        : "font-medium text-foreground/82";
  const turnSettled = !activeTurnInProgress;
  const showSuccessIndicator =
    workEntryIndicatesToolSuccess(workEntry) ||
    (turnSettled && workEntryIndicatesToolNeutralStatus(workEntry));
  return (
    <HostView
      className={cn(
        "transcript-work-entry flex flex-col rounded-md px-0.5",
        isExpandedToolGroupEntry ? "transcript-work-entry--grouped py-0" : "py-0.5",
        canExpand && "cursor-pointer",
      )}
      role={canExpand ? "button" : undefined}
      aria-label={
        canExpand
          ? showFailedIndicator && isExpandedToolGroupEntry
            ? `${displayText}, tool call failed`
            : displayText
          : undefined
      }
      aria-expanded={canExpand ? expanded : undefined}
      data-transcript-work-entry={workEntry.id}
      data-transcript-work-tone={workEntry.tone}
      data-transcript-work-state={canExpand ? (expanded ? "expanded" : "collapsed") : "static"}
      onClick={
        canExpand
          ? () => {
              onDisclosure?.();
              setExpanded((value) => !value);
            }
          : undefined
      }
    >
      <HostView className="transcript-work-entry-line flex select-none items-center gap-1.5">
        <HostText
          className={iconWrapperClass}
          aria-label={
            isExpandedToolGroupEntry && showFailedIndicator ? "Tool call failed" : undefined
          }
        >
          {showEntryIcon
            ? elements.renderWorkIcon({
                name: entryIconName,
                className: cn(
                  "block size-3.5 shrink-0 opacity-80",
                  isExpandedToolGroupEntry && showFailedIndicator && "text-destructive",
                ),
              })
            : null}
        </HostText>
        <HostView className="transcript-work-entry-content flex min-w-0 flex-1 items-center gap-1.5">
          <HostView className="transcript-work-entry-copy-wrap min-w-0 flex-1 overflow-hidden">
            {elements.renderWorkCopy?.({
              heading,
              headingClassName: headingClass,
              preview,
            }) ?? (
              <HostText className="transcript-work-entry-copy flex min-w-0 w-full items-baseline gap-1.5 text-[12px] leading-5">
                <HostText
                  className={cn(
                    "transcript-work-entry-heading min-w-0 shrink truncate",
                    headingClass,
                  )}
                >
                  {heading}
                </HostText>
                {preview ? (
                  <HostText className="transcript-work-entry-preview min-w-0 flex-1 truncate text-muted-foreground/55">
                    {preview}
                  </HostText>
                ) : null}
              </HostText>
            )}
          </HostView>
          <HostView className="transcript-work-entry-trailing flex shrink-0 items-center gap-px text-muted-foreground/55">
            <HostText
              className="transcript-work-entry-disclosure flex size-4 shrink-0 items-center justify-center"
              aria-hidden={!canExpand}
            >
              {canExpand
                ? elements.renderDisclosureChevron({ kind: "work-entry", expanded })
                : null}
            </HostText>
            {isExpandedToolGroupEntry
              ? null
              : elements.renderWorkStatus({
                  failed: showFailedIndicator,
                  succeeded: showSuccessIndicator,
                  warning: showWarningIndicator,
                })}
          </HostView>
        </HostView>
      </HostView>
      {expanded && expandedBody ? (
        <HostView className="transcript-work-entry-body mt-0.5 rounded-md bg-muted/20 px-2 py-1.5">
          <HostText className="whitespace-pre-wrap font-mono text-[11px] leading-4 text-muted-foreground/85">
            {expandedBody}
          </HostText>
        </HostView>
      ) : null}
    </HostView>
  );
}

function WorkGroupRows({
  row,
  workspaceRoot,
  activeTurnInProgress,
  elements,
  onWorkEntryDisclosure,
}: {
  readonly row: Extract<TranscriptTimelineRow, { kind: "work" }>;
  readonly workspaceRoot: string | undefined;
  readonly activeTurnInProgress: boolean;
  readonly elements: TranscriptRowElements;
  readonly onWorkEntryDisclosure: (() => void) | undefined;
}) {
  const { isExpandedToolGroupEntry } = row;
  const nonEmptyEntries = row.groupedEntries.filter((entry) =>
    workEntryIsVisibleInGroup(entry, isExpandedToolGroupEntry),
  );
  const onlyToolEntries = nonEmptyEntries.every((entry) => workLogEntryIsToolLike(entry));
  const groupLabel = workGroupSectionLabel({
    onlyToolEntries,
    entryCount: nonEmptyEntries.length,
  });
  if (nonEmptyEntries.length === 0) return null;

  return (
    <HostView
      className={cn(
        "transcript-work-group -mx-1 px-1",
        isExpandedToolGroupEntry ? "transcript-work-group--grouped py-0" : "py-0.5",
      )}
      aria-label={isExpandedToolGroupEntry ? undefined : groupLabel}
      data-transcript-work-grouped={isExpandedToolGroupEntry ? "true" : undefined}
    >
      {!onlyToolEntries ? (
        <HostText className="px-0.5 pb-0.5 font-medium text-[11px] text-muted-foreground/65">
          {groupLabel}
        </HostText>
      ) : null}
      <HostView className="transcript-work-group__entries flex flex-col gap-px">
        {nonEmptyEntries.map((workEntry) => (
          <WorkEntryRow
            key={workEntry.id}
            workEntry={workEntry}
            workspaceRoot={workspaceRoot}
            activeTurnInProgress={activeTurnInProgress}
            isExpandedToolGroupEntry={isExpandedToolGroupEntry}
            elements={elements}
            onDisclosure={onWorkEntryDisclosure}
          />
        ))}
      </HostView>
    </HostView>
  );
}

function WorkGroupToggleRow({
  row,
  elements,
  onToggleWorkGroup,
}: {
  readonly row: Extract<TranscriptTimelineRow, { kind: "work-toggle" }>;
  readonly elements: TranscriptRowElements;
  readonly onToggleWorkGroup: (groupId: string, anchorElement?: unknown) => void;
}) {
  const onClick = (event: unknown) =>
    onToggleWorkGroup(
      row.groupId,
      (event as { currentTarget?: unknown } | null | undefined)?.currentTarget,
    );
  if (row.onlyToolEntries && row.summary) {
    return (
      <HostButton
        type="button"
        className="transcript-work-toggle transcript-work-toggle--summary flex w-full cursor-pointer items-center gap-1.5 rounded-md px-0.5 py-0.5 text-left text-[12px] leading-5"
        aria-label={row.hasFailure ? `${row.summary}, tool call failed` : undefined}
        aria-expanded={row.expanded}
        data-transcript-tool-summary={row.summaryKind ?? "mixed"}
        data-transcript-tool-summary-state={row.hasFailure ? "failed" : "ok"}
        onClick={onClick}
      >
        <HostView
          className={cn(
            "transcript-tool-summary-icon flex size-5 shrink-0 items-center justify-center",
            row.hasFailure ? "text-destructive" : "text-muted-foreground/65",
          )}
          aria-label={row.hasFailure ? "Tool call failed" : undefined}
        >
          {elements.renderWorkIcon({
            name: row.hasFailure ? "x" : toolGroupSummaryIconName(row.summaryKind),
            className: cn(
              "block size-3.5 shrink-0 opacity-70",
              row.hasFailure && "text-destructive",
            ),
          })}
        </HostView>
        <HostText
          className="transcript-tool-summary-label min-w-0 flex-1 truncate text-muted-foreground/70"
          text-maxline="1"
        >
          {row.summary}
        </HostText>
      </HostButton>
    );
  }
  const labelNoun = workGroupToggleNoun({
    onlyToolEntries: row.onlyToolEntries,
    hiddenCount: row.hiddenCount,
  });
  const showHiddenFailure = row.hasFailure && !row.expanded;

  return (
    <HostButton
      type="button"
      className="transcript-work-toggle flex w-full cursor-pointer items-center gap-1.5 rounded-md px-0.5 py-0.5 text-left text-[12px] leading-5"
      aria-expanded={row.expanded}
      onClick={onClick}
    >
      <HostText
        className={cn(
          "flex size-5 shrink-0 items-center justify-center",
          showHiddenFailure ? "text-destructive" : "text-muted-foreground/65",
        )}
        aria-label={showHiddenFailure ? "Hidden work includes a failure" : undefined}
      >
        {showHiddenFailure
          ? elements.renderWorkIcon({
              name: "x",
              className: "block size-3.5 shrink-0 opacity-70 text-destructive",
            })
          : elements.renderDisclosureChevron({ kind: "work-toggle", expanded: row.expanded })}
      </HostText>
      {row.expanded ? (
        <HostText className="font-medium text-foreground/82">
          Show fewer {row.onlyToolEntries ? "tool calls" : "log entries"}
        </HostText>
      ) : (
        <HostText className="font-medium text-foreground/82">
          +{row.hiddenCount} previous {labelNoun}
        </HostText>
      )}
    </HostButton>
  );
}

/** The running turn's latest tool call; tapping expands the contiguous run. */
function LiveWorkRow({
  row,
  workspaceRoot,
  elements,
  onToggleWorkGroup,
}: {
  readonly row: Extract<TranscriptTimelineRow, { kind: "work-live" }>;
  readonly workspaceRoot: string | undefined;
  readonly elements: TranscriptRowElements;
  readonly onToggleWorkGroup: (groupId: string, anchorElement?: unknown) => void;
}) {
  const label = liveWorkEntryLabel(row.entry, workspaceRoot);
  const failed = workEntryDisplayIndicatesToolFailure(row.entry);
  return (
    <HostButton
      type="button"
      className="transcript-work-live flex w-full cursor-pointer items-center gap-1.5 rounded-md px-0.5 py-0.5 text-left text-[12px] leading-5"
      aria-label={failed ? `${label}, tool call failed` : undefined}
      aria-expanded={row.expanded}
      data-transcript-work-live={row.entry.id}
      data-transcript-work-live-state={failed ? "failed" : "running"}
      onClick={(event: unknown) =>
        onToggleWorkGroup(
          row.groupId,
          (event as { currentTarget?: unknown } | null | undefined)?.currentTarget,
        )
      }
    >
      <HostView
        className={cn(
          "transcript-work-live-icon flex size-5 shrink-0 items-center justify-center",
          failed ? "text-destructive" : "text-foreground/82",
        )}
        aria-label={failed ? "Tool call failed" : undefined}
      >
        {elements.renderWorkIcon({
          name: failed ? "x" : workEntryIconName(row.entry),
          className: cn("block size-3.5 shrink-0", failed && "text-destructive"),
        })}
      </HostView>
      <HostText
        className="transcript-work-live-label min-w-0 flex-1 truncate text-foreground/82"
        text-maxline="1"
      >
        {label}
      </HostText>
    </HostButton>
  );
}

function ProposedPlanRow({
  row,
  elements,
}: {
  readonly row: Extract<TranscriptTimelineRow, { kind: "proposed-plan" }>;
  readonly elements: TranscriptRowElements;
}) {
  return (
    <HostView className="transcript-proposed-plan-row min-w-0 px-1 py-0.5">
      {elements.renderProposedPlanCard({ row })}
    </HostView>
  );
}

function WorkingRow({
  row,
  elements,
}: {
  readonly row: Extract<TranscriptTimelineRow, { kind: "working" }>;
  readonly elements: TranscriptRowElements;
}) {
  return (
    <HostView
      className={cn(
        "transcript-working-row py-0.5 pl-1.5",
        row.showThinking && "transcript-working-row--thinking",
      )}
    >
      <HostView className="flex items-center gap-2 pt-1 text-[11px] text-muted-foreground/70 tabular-nums">
        {elements.renderWorkingIndicator?.() ?? (
          <HostText className="transcript-working-dots inline-flex items-center gap-[3px]">
            <HostText className="transcript-working-dot inline-block h-1 w-1 rounded-full bg-muted-foreground/30" />
            <HostText className="transcript-working-dot inline-block h-1 w-1 rounded-full bg-muted-foreground/30" />
            <HostText className="transcript-working-dot inline-block h-1 w-1 rounded-full bg-muted-foreground/30" />
          </HostText>
        )}
        {elements.renderWorkingLabel({ createdAt: row.createdAt })}
      </HostView>
      {row.showThinking ? (
        <HostView className="transcript-working-thinking mt-1 flex items-center px-1 py-0.5">
          <HostText className="transcript-working-thinking-label text-[12px] leading-5 text-muted-foreground/70">
            Thinking
          </HostText>
        </HostView>
      ) : null}
    </HostView>
  );
}

/**
 * One shared transcript row. The outer wrapper keeps the Web's row spacing
 * contract and data attributes so measurements and tests keep working on both
 * renderers.
 */
export const TranscriptRowSurface = memo(function TranscriptRowSurface<
  M extends TranscriptMessage = TranscriptMessage,
  P extends TranscriptProposedPlan = TranscriptProposedPlan,
  D = unknown,
>({
  row,
  workspaceRoot,
  activeTurnInProgress,
  elements,
  onToggleTurnFold,
  onToggleWorkGroup,
  onWorkEntryDisclosure,
}: TranscriptRowSurfaceProps<M, P, D>) {
  const isCommentaryAssistant =
    row.kind === "message" && row.message.role === "assistant" && !row.showAssistantMeta;
  const isExpandedToolGroupEntry = row.kind === "work" && row.isExpandedToolGroupEntry;
  const isLastExpandedToolGroupEntry = row.kind === "work" && row.isLastExpandedToolGroupEntry;
  const isExpandedToolGroupHeader =
    (row.kind === "work-toggle" && row.summary !== null && row.onlyToolEntries && row.expanded) ||
    (row.kind === "work-live" && row.expanded);
  return (
    <HostView
      className={cn(
        isExpandedToolGroupEntry
          ? isLastExpandedToolGroupEntry
            ? "transcript-work-grouped-outer transcript-work-grouped-outer--last pb-1"
            : "transcript-work-grouped-outer pb-0"
          : isExpandedToolGroupHeader
            ? "transcript-work-group-header-outer pb-0"
            : isCommentaryAssistant ||
                row.kind === "work" ||
                row.kind === "work-live" ||
                row.kind === "work-toggle"
              ? "pb-2"
              : "pb-4",
        row.kind === "message" && row.message.role === "user" ? "transcript-user-outer" : null,
        row.kind === "message" && row.message.role === "assistant"
          ? "transcript-assistant-group group/assistant"
          : null,
        row.kind === "turn-fold" ? "transcript-turn-fold-outer" : null,
        row.kind === "working" ? "transcript-working-outer" : null,
        row.kind === "work-toggle" || row.kind === "work-live"
          ? "transcript-work-line-outer"
          : null,
      )}
      data-timeline-row-id={row.id}
      data-timeline-row-kind={row.kind}
      data-message-id={row.kind === "message" ? row.message.id : undefined}
      data-message-role={row.kind === "message" ? row.message.role : undefined}
      data-timeline-row-text={
        row.kind === "message"
          ? (elements.messageVisibleText?.({ row }) ?? row.message.text)
          : undefined
      }
    >
      {row.kind === "message" && row.message.role === "user" ? (
        <UserRow row={row} elements={elements} />
      ) : null}
      {row.kind === "message" && row.message.role === "system" ? <SystemRow row={row} /> : null}
      {row.kind === "message" && row.message.role === "assistant" ? (
        <AssistantRow row={row} elements={elements} />
      ) : null}
      {row.kind === "work" ? (
        <WorkGroupRows
          row={row}
          workspaceRoot={workspaceRoot}
          activeTurnInProgress={activeTurnInProgress}
          elements={elements}
          onWorkEntryDisclosure={onWorkEntryDisclosure}
        />
      ) : null}
      {row.kind === "work-live" ? (
        <LiveWorkRow
          row={row}
          workspaceRoot={workspaceRoot}
          elements={elements}
          onToggleWorkGroup={onToggleWorkGroup}
        />
      ) : null}
      {row.kind === "work-toggle" ? (
        <WorkGroupToggleRow row={row} elements={elements} onToggleWorkGroup={onToggleWorkGroup} />
      ) : null}
      {row.kind === "turn-fold" ? (
        <TurnFoldRow row={row} elements={elements} onToggleTurnFold={onToggleTurnFold} />
      ) : null}
      {row.kind === "proposed-plan" ? <ProposedPlanRow row={row} elements={elements} /> : null}
      {row.kind === "working" ? <WorkingRow row={row} elements={elements} /> : null}
    </HostView>
  );
});

/** Shared empty-transcript placement (defensive; hero routes own the primary). */
export function TranscriptEmptySurface(input: {
  readonly className?: string;
  readonly title: string;
  readonly subtitle?: string;
}) {
  if (!input.subtitle) {
    return (
      <HostView
        className={cn(
          "transcript-empty flex flex-1 items-center justify-center text-center",
          input.className,
        )}
      >
        <HostText className="transcript-empty-title transcript-empty-title--single text-sm text-muted-foreground/30">
          {input.title}
        </HostText>
      </HostView>
    );
  }
  return (
    <HostView
      className={cn(
        "transcript-empty flex flex-1 flex-col items-center justify-center gap-1 px-6 py-12 text-center",
        input.className,
      )}
    >
      <HostText className="transcript-empty-title text-sm font-medium text-foreground/85">
        {input.title}
      </HostText>
      <HostText className="transcript-empty-subtitle text-xs text-muted-foreground/70">
        {input.subtitle}
      </HostText>
    </HostView>
  );
}
