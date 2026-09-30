import type { ReactNode } from "react";

import { cn } from "../../lib/cn";
import { HostButton, HostText, HostView } from "../ui/hostElements";

/**
 * One-line approval detail for the composer's attached top drawer (upstream
 * `ComposerPendingApprovalPanel`, #7150): the monospace request detail, then
 * the `1/N` pending count. Hosts place the approval actions after it.
 */
export function ComposerPendingApprovalSurface({
  fallbackLabel,
  detail,
  detailLabel,
  pendingCount,
  className,
}: {
  readonly fallbackLabel: string;
  readonly detail?: string | undefined;
  readonly detailLabel: string;
  readonly pendingCount: number;
  readonly className?: string | undefined;
}) {
  return (
    <HostView
      role="group"
      aria-label={fallbackLabel}
      data-composer-pending-kind="approval"
      className={cn("composer-pending-approval flex min-w-0 flex-1 items-center gap-2", className)}
    >
      <HostText
        aria-label={detailLabel}
        className="composer-pending-approval__detail block min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/85"
        data-approval-detail="complete"
        text-maxline="1"
      >
        {detail || fallbackLabel}
      </HostText>
      {pendingCount > 1 ? (
        <HostText className="composer-pending-approval__count shrink-0 text-[10px] font-medium tabular-nums text-muted-foreground">
          1/{pendingCount}
        </HostText>
      ) : null}
    </HostView>
  );
}

export interface ComposerPendingQuestionOption {
  readonly label: string;
  readonly description: string;
}

/**
 * Pending user-input card for the composer's attached top drawer (upstream
 * `ComposerPendingUserInputPanel`, #6773/#7150). The header row toggles the
 * card: collapsed, it keeps the header, the counter, and a one-line echo of
 * the question while the options fold away.
 */
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
  collapsed = false,
  toggleIcon,
  onToggleCollapsed,
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
  readonly collapsed?: boolean;
  /** Chevron glyph; the surface points it up while collapsed. */
  readonly toggleIcon?: ReactNode;
  readonly onToggleCollapsed?: () => void;
  readonly onSelect: (optionLabel: string) => void;
}) {
  return (
    <HostView
      data-composer-pending-kind="question"
      data-question-index={String(questionIndex)}
      data-question-count={String(questionCount)}
      data-question-multi-select={multiSelect ? "true" : "false"}
      data-pending-user-input-collapsed={collapsed ? "true" : "false"}
      className={cn(
        "composer-pending-question flex w-full flex-col py-2",
        collapsed && "composer-pending-question--collapsed",
      )}
    >
      <HostView className="composer-pending-question__heading flex items-center gap-1 px-1 sm:px-2">
        <HostButton
          type="button"
          title={
            collapsed ? "Show the question and its options" : "Hide the question and its options"
          }
          data-pending-user-input-toggle={collapsed ? "collapsed" : "expanded"}
          onClick={onToggleCollapsed}
          className="composer-pending-question__toggle group -my-1 flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none"
        >
          <HostText className="composer-pending-question__header text-xs font-medium text-muted-foreground">
            {header}
          </HostText>
          {questionCount > 1 ? (
            <HostText className="composer-pending-question__counter text-[10px] font-medium tabular-nums text-muted-foreground">
              {questionIndex + 1}/{questionCount}
            </HostText>
          ) : null}
          {collapsed ? (
            <HostText
              className="composer-pending-question__echo min-w-0 flex-1 truncate text-xs text-muted-foreground"
              text-maxline="1"
            >
              {question}
            </HostText>
          ) : null}
          {toggleIcon ? (
            <HostView
              aria-hidden="true"
              className={cn(
                "composer-pending-question__chevron ml-auto shrink-0",
                collapsed && "composer-pending-question__chevron--collapsed rotate-180",
              )}
            >
              {toggleIcon}
            </HostView>
          ) : null}
        </HostButton>
      </HostView>
      {collapsed ? null : (
        <HostView className="composer-pending-question__body flex flex-col px-3 pt-2 pb-0.5 sm:px-4">
          <HostText className="composer-pending-question__prompt text-sm text-foreground/85">
            {question}
          </HostText>
          {multiSelect ? (
            <HostText className="composer-pending-question__hint mt-1 text-xs text-muted-foreground">
              Select one or more options.
            </HostText>
          ) : null}
          <HostView className="composer-pending-question__options mt-2 flex flex-col gap-0.5">
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
                    "composer-pending-question__option group flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left outline-none",
                    selected
                      ? "composer-pending-question__option--selected bg-muted/55 text-foreground"
                      : "bg-transparent text-foreground/85",
                    responding && "opacity-50",
                  )}
                >
                  <HostView className="composer-pending-question__option-copy flex min-w-0 flex-1 flex-col gap-0.5">
                    <HostText className="composer-pending-question__option-label text-sm font-medium">
                      {option.label}
                    </HostText>
                    {option.description && option.description !== option.label ? (
                      <HostText className="composer-pending-question__option-description text-[11px] text-muted-foreground">
                        {option.description}
                      </HostText>
                    ) : null}
                  </HostView>
                  {selected ? (
                    selectedIcon
                  ) : index < 9 ? (
                    <HostText className="composer-pending-question__option-index flex size-5 shrink-0 items-center justify-center text-[10px] font-medium tabular-nums text-muted-foreground">
                      {index + 1}
                    </HostText>
                  ) : null}
                </HostButton>
              );
            })}
          </HostView>
        </HostView>
      )}
    </HostView>
  );
}
