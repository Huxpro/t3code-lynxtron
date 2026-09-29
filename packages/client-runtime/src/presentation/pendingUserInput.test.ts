import { describe, expect, it } from "vite-plus/test";
import type { UserInputQuestion } from "@t3tools/contracts";

import {
  buildPendingUserInputAnswers,
  derivePendingUserInputProgress,
  setPendingUserInputCustomAnswer,
  togglePendingUserInputOptionSelection,
} from "./pendingUserInput.ts";

const questions: UserInputQuestion[] = [
  {
    id: "renderers",
    header: "Renderers",
    question: "Which renderers?",
    options: [
      { label: "Lynx", description: "Native renderer" },
      { label: "Web", description: "Browser renderer" },
    ],
    multiSelect: true,
  },
  {
    id: "proof",
    header: "Proof",
    question: "Which proof?",
    options: [{ label: "Tap", description: "Real input" }],
    multiSelect: false,
  },
];

describe("pending user-input projection", () => {
  it("preserves multi-question answers across previous and next navigation", () => {
    const first = togglePendingUserInputOptionSelection(questions[0]!, undefined, "Lynx");
    const both = togglePendingUserInputOptionSelection(questions[0]!, first, "Web");
    const answers = {
      renderers: both,
      proof: togglePendingUserInputOptionSelection(questions[1]!, undefined, "Tap"),
    };

    expect(derivePendingUserInputProgress(questions, answers, 0)).toMatchObject({
      questionIndex: 0,
      selectedOptionLabels: ["Lynx", "Web"],
      answeredQuestionCount: 2,
      isComplete: true,
    });
    expect(derivePendingUserInputProgress(questions, answers, 1)).toMatchObject({
      questionIndex: 1,
      selectedOptionLabels: ["Tap"],
      isLastQuestion: true,
      isComplete: true,
    });
    expect(buildPendingUserInputAnswers(questions, answers)).toEqual({
      renderers: ["Lynx", "Web"],
      proof: "Tap",
    });
  });

  it("uses a custom answer instead of stale option selections", () => {
    const selected = togglePendingUserInputOptionSelection(questions[1]!, undefined, "Tap");
    const custom = setPendingUserInputCustomAnswer(selected, "Visual and canonical state");

    expect(custom.selectedOptionLabels).toBeUndefined();
    expect(derivePendingUserInputProgress([questions[1]!], { proof: custom }, 0)).toMatchObject({
      customAnswer: "Visual and canonical state",
      resolvedAnswer: "Visual and canonical state",
      usingCustomAnswer: true,
      canAdvance: true,
    });
  });
});
