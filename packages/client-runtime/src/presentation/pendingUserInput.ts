import type { UserInputQuestion } from "@t3tools/contracts";

export interface PendingUserInputDraftAnswer {
  readonly selectedOptionLabels?: string[];
  readonly customAnswer?: string;
}

export interface PendingUserInputProgress {
  readonly questionIndex: number;
  readonly activeQuestion: UserInputQuestion | null;
  readonly activeDraft: PendingUserInputDraftAnswer | undefined;
  readonly selectedOptionLabels: string[];
  readonly customAnswer: string;
  readonly resolvedAnswer: string | string[] | null;
  readonly usingCustomAnswer: boolean;
  readonly answeredQuestionCount: number;
  readonly isLastQuestion: boolean;
  readonly isComplete: boolean;
  readonly canAdvance: boolean;
}

function normalizeDraftAnswer(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeSelectedOptionLabels(value: string[] | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((entry) => entry.trim()).filter(Boolean)));
}

export function resolvePendingUserInputAnswer(
  question: UserInputQuestion,
  draft: PendingUserInputDraftAnswer | undefined,
): string | string[] | null {
  const customAnswer = normalizeDraftAnswer(draft?.customAnswer);
  if (customAnswer) return customAnswer;
  const selected = normalizeSelectedOptionLabels(draft?.selectedOptionLabels);
  return question.multiSelect ? (selected.length > 0 ? selected : null) : (selected[0] ?? null);
}

export function setPendingUserInputCustomAnswer(
  draft: PendingUserInputDraftAnswer | undefined,
  customAnswer: string,
): PendingUserInputDraftAnswer {
  const selected =
    customAnswer.trim().length > 0
      ? undefined
      : normalizeSelectedOptionLabels(draft?.selectedOptionLabels);
  return {
    customAnswer,
    ...(selected && selected.length > 0 ? { selectedOptionLabels: selected } : {}),
  };
}

export function togglePendingUserInputOptionSelection(
  question: UserInputQuestion,
  draft: PendingUserInputDraftAnswer | undefined,
  optionLabel: string,
): PendingUserInputDraftAnswer {
  if (question.multiSelect) {
    const selected = normalizeSelectedOptionLabels(draft?.selectedOptionLabels);
    const next = selected.includes(optionLabel)
      ? selected.filter((label) => label !== optionLabel)
      : [...selected, optionLabel];
    return { customAnswer: "", ...(next.length > 0 ? { selectedOptionLabels: next } : {}) };
  }
  return { customAnswer: "", selectedOptionLabels: [optionLabel] };
}

export function buildPendingUserInputAnswers(
  questions: ReadonlyArray<UserInputQuestion>,
  draftAnswers: Record<string, PendingUserInputDraftAnswer>,
): Record<string, string | string[]> | null {
  const answers: Record<string, string | string[]> = {};
  for (const question of questions) {
    const answer = resolvePendingUserInputAnswer(question, draftAnswers[question.id]);
    if (!answer) return null;
    answers[question.id] = answer;
  }
  return answers;
}

export function countAnsweredPendingUserInputQuestions(
  questions: ReadonlyArray<UserInputQuestion>,
  draftAnswers: Record<string, PendingUserInputDraftAnswer>,
): number {
  return questions.reduce(
    (count, question) =>
      count + (resolvePendingUserInputAnswer(question, draftAnswers[question.id]) ? 1 : 0),
    0,
  );
}

export function findFirstUnansweredPendingUserInputQuestionIndex(
  questions: ReadonlyArray<UserInputQuestion>,
  draftAnswers: Record<string, PendingUserInputDraftAnswer>,
): number {
  const index = questions.findIndex(
    (question) => !resolvePendingUserInputAnswer(question, draftAnswers[question.id]),
  );
  return index === -1 ? Math.max(questions.length - 1, 0) : index;
}

export function derivePendingUserInputProgress(
  questions: ReadonlyArray<UserInputQuestion>,
  draftAnswers: Record<string, PendingUserInputDraftAnswer>,
  questionIndex: number,
): PendingUserInputProgress {
  const normalizedIndex =
    questions.length === 0 ? 0 : Math.max(0, Math.min(questionIndex, questions.length - 1));
  const activeQuestion = questions[normalizedIndex] ?? null;
  const activeDraft = activeQuestion ? draftAnswers[activeQuestion.id] : undefined;
  const resolvedAnswer = activeQuestion
    ? resolvePendingUserInputAnswer(activeQuestion, activeDraft)
    : null;
  const customAnswer = activeDraft?.customAnswer ?? "";
  return {
    questionIndex: normalizedIndex,
    activeQuestion,
    activeDraft,
    selectedOptionLabels: normalizeSelectedOptionLabels(activeDraft?.selectedOptionLabels),
    customAnswer,
    resolvedAnswer,
    usingCustomAnswer: customAnswer.trim().length > 0,
    answeredQuestionCount: countAnsweredPendingUserInputQuestions(questions, draftAnswers),
    isLastQuestion: questions.length === 0 || normalizedIndex >= questions.length - 1,
    isComplete: buildPendingUserInputAnswers(questions, draftAnswers) !== null,
    canAdvance: Boolean(resolvedAnswer),
  };
}
