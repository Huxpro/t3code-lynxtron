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
import { memo, useState, type ReactNode } from "react";

import {
  normalizeCompactToolLabel,
  workEntryIndicatesToolFailure,
  workEntryIndicatesToolNeutralStatus,
  workEntryIndicatesToolSuccess,
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
  renderWorkEntryVisual?(input: { heading: string; preview: string | null }): ReactNode;
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
  elements,
}: {
  readonly workEntry: TimelineWorkEntry;
  readonly workspaceRoot: string | undefined;
  readonly activeTurnInProgress: boolean;
  readonly elements: TranscriptRowElements;
}) {
  const [expanded, setExpanded] = useState(false);
  const iconConfig = workToneIcon(workEntry.tone);
  const showWarningIndicator = workEntry.sourceActivityKind === "runtime.warning";
  const entryIconName = showWarningIndicator ? "x" : workEntryIconName(workEntry);
  const heading = toolWorkEntryHeading(workEntry);
  const rawPreview = workEntryPreview(workEntry, workspaceRoot);
  const preview =
    rawPreview &&
    normalizeCompactToolLabel(rawPreview).toLowerCase() ===
      normalizeCompactToolLabel(heading).toLowerCase()
      ? null
      : rawPreview;
  const displayText = preview ? `${heading} - ${preview}` : heading;
  const expandedBody = buildToolCallExpandedBody(workEntry, workspaceRoot);
  const canExpand = expandedBody !== null;
  const showFailedIndicator = workEntryIndicatesToolFailure(workEntry);
  const showDestructiveRowStyle =
    showFailedIndicator &&
    (workEntry.sourceActivityKind === "runtime.error" || !workLogEntryIsToolLike(workEntry));
  const iconWrapperClass = cn(
    "flex size-5 shrink-0 items-center justify-center",
    showWarningIndicator || showDestructiveRowStyle
      ? "text-destructive"
      : workEntry.tone === "tool" || showFailedIndicator
        ? "text-muted-foreground/65"
        : iconConfig.className,
  );
  const headingClass = showWarningIndicator
    ? "font-medium text-warning"
    : showDestructiveRowStyle
      ? "font-medium text-destructive"
      : "font-medium text-foreground/82";
  const turnSettled = !activeTurnInProgress;
  const showSuccessIndicator =
    workEntryIndicatesToolSuccess(workEntry) ||
    (turnSettled && workEntryIndicatesToolNeutralStatus(workEntry));
  const authorityVisual = elements.renderWorkEntryVisual?.({ heading, preview });

  return (
    <HostView
      className={cn(
        "transcript-work-entry flex flex-col rounded-md px-0.5 py-0.5",
        canExpand && "cursor-pointer",
        authorityVisual && "transcript-work-entry--authority",
      )}
      role={canExpand ? "button" : undefined}
      aria-label={canExpand ? displayText : undefined}
      aria-expanded={canExpand ? expanded : undefined}
      data-transcript-work-entry={workEntry.id}
      data-transcript-work-tone={workEntry.tone}
      data-transcript-work-state={canExpand ? (expanded ? "expanded" : "collapsed") : "static"}
      onClick={canExpand ? () => setExpanded((value) => !value) : undefined}
    >
      {authorityVisual}
      <HostView
        className={cn(
          "transcript-work-entry-line flex select-none items-center gap-1.5",
          authorityVisual && "transcript-work-entry-line--authority-hidden",
        )}
      >
        <HostText className={iconWrapperClass}>
          {elements.renderWorkIcon({
            name: entryIconName,
            className: "block size-3.5 shrink-0 opacity-80",
          })}
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
            {elements.renderWorkStatus({
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
}: {
  readonly row: Extract<TranscriptTimelineRow, { kind: "work" }>;
  readonly workspaceRoot: string | undefined;
  readonly activeTurnInProgress: boolean;
  readonly elements: TranscriptRowElements;
}) {
  const nonEmptyEntries = row.groupedEntries.filter(
    (entry) => entry.tone === "thinking" || !workEntryIndicatesToolNeutralStatus(entry),
  );
  const onlyToolEntries = nonEmptyEntries.every((entry) => workLogEntryIsToolLike(entry));
  const groupLabel = workGroupSectionLabel({
    onlyToolEntries,
    entryCount: nonEmptyEntries.length,
  });
  if (nonEmptyEntries.length === 0) return null;

  return (
    <HostView className="transcript-work-group -mx-1 px-1 py-0.5" aria-label={groupLabel}>
      {!onlyToolEntries ? (
        <HostText className="px-0.5 pb-0.5 font-medium text-[11px] text-muted-foreground/65">
          {groupLabel}
        </HostText>
      ) : null}
      <HostView className="flex flex-col gap-px">
        {nonEmptyEntries.map((workEntry) => (
          <WorkEntryRow
            key={workEntry.id}
            workEntry={workEntry}
            workspaceRoot={workspaceRoot}
            activeTurnInProgress={activeTurnInProgress}
            elements={elements}
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
  const labelNoun = workGroupToggleNoun({
    onlyToolEntries: row.onlyToolEntries,
    hiddenCount: row.hiddenCount,
  });

  return (
    <HostButton
      type="button"
      className="transcript-work-toggle flex w-full cursor-pointer items-center gap-1.5 rounded-md px-0.5 py-0.5 text-left text-[12px] leading-5"
      aria-expanded={row.expanded}
      onClick={(event: unknown) =>
        onToggleWorkGroup(
          row.groupId,
          (event as { currentTarget?: unknown } | null | undefined)?.currentTarget,
        )
      }
    >
      <HostText className="flex size-5 shrink-0 items-center justify-center text-muted-foreground/65">
        {elements.renderDisclosureChevron({ kind: "work-toggle", expanded: row.expanded })}
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
    <HostView className="transcript-working-row py-0.5 pl-1.5">
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
}: TranscriptRowSurfaceProps<M, P, D>) {
  const isCommentaryAssistant =
    row.kind === "message" && row.message.role === "assistant" && !row.showAssistantMeta;
  return (
    <HostView
      className={cn(
        isCommentaryAssistant || row.kind === "work" || row.kind === "work-toggle"
          ? "pb-2"
          : "pb-4",
        row.kind === "message" && row.message.role === "user" ? "transcript-user-outer" : null,
        row.kind === "message" && row.message.role === "assistant"
          ? "transcript-assistant-group group/assistant"
          : null,
        row.kind === "turn-fold" ? "transcript-turn-fold-outer" : null,
        row.kind === "working" ? "transcript-working-outer" : null,
      )}
      data-timeline-row-id={row.id}
      data-timeline-row-kind={row.kind}
      data-message-id={row.kind === "message" ? row.message.id : undefined}
      data-message-role={row.kind === "message" ? row.message.role : undefined}
      data-timeline-row-text={row.kind === "message" ? row.message.text : undefined}
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
