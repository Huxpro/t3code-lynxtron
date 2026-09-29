import type { PendingUserInput } from "@t3tools/client-runtime/presentation/pending-requests";
import type { PendingUserInputProgress } from "@t3tools/client-runtime/presentation/pending-user-input";
import { HostButton, HostText, HostView } from "../ui/hostElements";

export function ComposerPendingUserInputSurface({
  prompt,
  progress,
  isResponding,
  onToggleOption,
}: {
  readonly prompt: PendingUserInput;
  readonly progress: PendingUserInputProgress;
  readonly isResponding: boolean;
  readonly onToggleOption: (questionId: string, optionLabel: string) => void;
}) {
  const question = progress.activeQuestion;
  if (!question) return null;
  return (
    <HostView className="composer-user-input-panel px-4 py-3 sm:px-5">
      <HostView className="composer-user-input-heading mb-2 flex items-center gap-3">
        <HostText className="text-[11px] font-semibold tracking-widest text-muted-foreground/55 uppercase">
          {question.header}
        </HostText>
        {prompt.questions.length > 1 ? (
          <HostText className="composer-user-input-progress">
            {progress.questionIndex + 1}/{prompt.questions.length}
          </HostText>
        ) : null}
      </HostView>
      <HostText className="composer-user-input-question text-sm text-foreground/90">
        {question.question}
      </HostText>
      {question.multiSelect ? (
        <HostText className="composer-user-input-hint mt-1 text-xs text-muted-foreground/65">
          Select one or more options.
        </HostText>
      ) : null}
      <HostView className="composer-user-input-options mt-3 space-y-1.5">
        {question.options.map((option) => {
          const selected =
            !progress.usingCustomAnswer && progress.selectedOptionLabels.includes(option.label);
          return (
            <HostButton
              key={`${question.id}:${option.label}`}
              className={
                selected
                  ? "composer-user-input-option composer-user-input-option--selected"
                  : "composer-user-input-option"
              }
              disabled={isResponding}
              onClick={() => {
                if (!isResponding) onToggleOption(question.id, option.label);
              }}
            >
              <HostView className="composer-user-input-option-copy">
                <HostText className="composer-user-input-option-label">{option.label}</HostText>
                {option.description !== option.label ? (
                  <HostText className="composer-user-input-option-description">
                    {option.description}
                  </HostText>
                ) : null}
              </HostView>
              {selected ? <HostText className="composer-user-input-check">✓</HostText> : null}
            </HostButton>
          );
        })}
      </HostView>
    </HostView>
  );
}
