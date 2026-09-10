import type { ReactNode } from "react";

import { cn } from "../../lib/cn";
import { HostButton, HostText, HostView } from "../ui/hostElements";

export function ComposerPendingApprovalSurface({
  approvalSummary,
  detail,
  detailLabel,
  pendingCount,
}: {
  readonly approvalSummary: string;
  readonly detail?: string;
  readonly detailLabel: string;
  readonly pendingCount: number;
}) {
  return (
    <HostView
      data-composer-pending-kind="approval"
      className="composer-pending-approval px-4 py-3.5 sm:px-5 sm:py-4"
    >
      <HostView className="composer-pending-approval__heading flex flex-wrap items-center gap-2">
        <HostText className="composer-pending-approval__eyebrow text-sm tracking-[0.2em]">
          PENDING APPROVAL
        </HostText>
        <HostText className="composer-pending-approval__summary text-sm font-medium">
          {approvalSummary}
        </HostText>
        {pendingCount > 1 ? (
          <HostText className="text-xs text-muted-foreground">1/{pendingCount}</HostText>
        ) : null}
      </HostView>
      {detail ? (
        <HostView className="composer-pending-approval__detail mt-3 rounded-lg border border-border/65 bg-background/70 p-3">
          <HostText className="composer-pending-approval__detail-label text-xs font-medium text-muted-foreground">
            {detailLabel}
          </HostText>
          <HostText
            aria-label={detailLabel}
            className="composer-pending-approval__detail-value mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground"
            data-approval-detail="complete"
          >
            {detail}
          </HostText>
        </HostView>
      ) : null}
    </HostView>
  );
}

export interface ComposerPendingQuestionOption {
  readonly label: string;
  readonly description: string;
}

export function ComposerPendingQuestionSurface({
  header,
  question,
  questionIndex,
  questionCount,
  multiSelect,
  options,
  selectedOptionLabels,
  responding,
  selectedIcon,
  onSelect,
}: {
  readonly header: string;
  readonly question: string;
  readonly questionIndex: number;
  readonly questionCount: number;
  readonly multiSelect: boolean;
  readonly options: ReadonlyArray<ComposerPendingQuestionOption>;
  readonly selectedOptionLabels: ReadonlyArray<string>;
  readonly responding: boolean;
  readonly selectedIcon?: ReactNode;
  readonly onSelect: (optionLabel: string) => void;
}) {
  return (
    <HostView
      data-composer-pending-kind="question"
      data-question-index={String(questionIndex)}
      data-question-count={String(questionCount)}
      data-question-multi-select={multiSelect ? "true" : "false"}
      className="composer-pending-question flex w-full flex-col px-4 py-3 sm:px-5"
    >
      <HostView className="composer-pending-question__heading mb-2 flex items-center gap-3">
        <HostText className="composer-pending-question__header text-[11px] font-semibold tracking-widest text-muted-foreground/55">
          {header.toUpperCase()}
        </HostText>
        {questionCount > 1 ? (
          <HostText className="flex h-5 items-center rounded-md bg-muted/60 px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground/60">
            {questionIndex + 1}/{questionCount}
          </HostText>
        ) : null}
      </HostView>
      <HostText className="composer-pending-question__prompt text-sm text-foreground/90">
        {question}
      </HostText>
      {multiSelect ? (
        <HostText className="composer-pending-question__hint mt-1 text-xs text-muted-foreground/65">
          Select one or more options.
        </HostText>
      ) : null}
      <HostView className="composer-pending-question__options mt-3 flex flex-col gap-1.5">
        {options.map((option, index) => {
          const selected = selectedOptionLabels.includes(option.label);
          return (
            <HostButton
              key={option.label}
              type="button"
              disabled={responding}
              data-question-option={option.label}
              data-question-option-selected={selected ? "true" : "false"}
              onClick={() => onSelect(option.label)}
              className={cn(
                "composer-pending-question__option group flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left outline-none",
                selected
                  ? "border-primary/30 bg-primary/8 text-foreground"
                  : "border-transparent bg-muted/22 text-foreground/85",
                responding && "opacity-50",
              )}
            >
              <HostView className="composer-pending-question__option-copy flex min-w-0 flex-1 flex-col gap-0.5">
                <HostText className="composer-pending-question__option-label text-sm font-medium">
                  {option.label}
                </HostText>
                {option.description && option.description !== option.label ? (
                  <HostText className="composer-pending-question__option-description text-xs text-muted-foreground">
                    {option.description}
                  </HostText>
                ) : null}
              </HostView>
              {selected ? (
                selectedIcon
              ) : index < 9 ? (
                <HostText className="composer-pending-question__option-index flex size-5 shrink-0 items-center justify-center rounded border border-border/50 text-[11px] font-medium tabular-nums text-muted-foreground/70">
                  {index + 1}
                </HostText>
              ) : null}
            </HostButton>
          );
        })}
      </HostView>
    </HostView>
  );
}
