import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import { ApprovalRequestId } from "@t3tools/contracts";

import { ComposerPendingUserInputSurface } from "./ComposerPendingUserInputSurface";

describe("ComposerPendingUserInputSurface", () => {
  it("renders the active canonical question, options, and progress", () => {
    const markup = renderToStaticMarkup(
      <ComposerPendingUserInputSurface
        prompt={{
          requestId: ApprovalRequestId.make("input-1"),
          createdAt: "2026-09-08T00:00:00.000Z",
          questions: [
            {
              id: "scope",
              header: "Scope",
              question: "Which surface?",
              options: [{ label: "Lynx", description: "Use the native renderer" }],
              multiSelect: false,
            },
            {
              id: "proof",
              header: "Proof",
              question: "Which proof?",
              options: [{ label: "Tap", description: "Use real input" }],
              multiSelect: false,
            },
          ],
        }}
        progress={{
          questionIndex: 0,
          activeQuestion: {
            id: "scope",
            header: "Scope",
            question: "Which surface?",
            options: [{ label: "Lynx", description: "Use the native renderer" }],
            multiSelect: false,
          },
          activeDraft: undefined,
          selectedOptionLabels: [],
          customAnswer: "",
          resolvedAnswer: null,
          usingCustomAnswer: false,
          answeredQuestionCount: 0,
          isLastQuestion: false,
          isComplete: false,
          canAdvance: false,
        }}
        isResponding={false}
        onToggleOption={vi.fn()}
      />,
    );
    expect(markup).toContain("Scope");
    expect(markup).toContain("Which surface?");
    expect(markup).toContain("Use the native renderer");
    expect(markup).toContain("1/2");
  });
});
