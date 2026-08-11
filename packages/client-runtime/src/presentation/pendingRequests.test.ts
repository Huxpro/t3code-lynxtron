import { EventId, TurnId, type OrchestrationThreadActivity } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { derivePendingApprovals, derivePendingUserInputs } from "./pendingRequests.ts";

function activity(
  kind: string,
  payload: Record<string, unknown>,
  createdAt = "2026-02-23T00:00:01.000Z",
): OrchestrationThreadActivity {
  return {
    id: EventId.make(`${kind}:${createdAt}`),
    createdAt,
    kind,
    summary: kind,
    tone: "info",
    payload,
    turnId: TurnId.make("turn-1"),
  };
}

describe("pending request projections", () => {
  it("tracks and resolves approvals", () => {
    expect(
      derivePendingApprovals([
        activity("approval.requested", {
          requestId: "approval-1",
          requestType: "command_execution_approval",
          detail: "pnpm test",
        }),
        activity(
          "approval.requested",
          { requestId: "approval-2", requestKind: "file-change" },
          "2026-02-23T00:00:02.000Z",
        ),
        activity(
          "approval.resolved",
          { requestId: "approval-2" },
          "2026-02-23T00:00:03.000Z",
        ),
      ]),
    ).toEqual([
      {
        requestId: "approval-1",
        requestKind: "command",
        createdAt: "2026-02-23T00:00:01.000Z",
        detail: "pnpm test",
      },
    ]);
  });

  it("tracks structured user input and removes stale requests", () => {
    const requested = activity("user-input.requested", {
      requestId: "question-1",
      questions: [
        {
          id: "mode",
          header: "Mode",
          question: "Which mode?",
          options: [
            { label: "Safe", description: "Use safe mode" },
            { label: "Fast", description: "Use fast mode" },
          ],
          multiSelect: false,
        },
      ],
    });
    expect(derivePendingUserInputs([requested])).toEqual([
      {
        requestId: "question-1",
        createdAt: "2026-02-23T00:00:01.000Z",
        questions: [
          {
            id: "mode",
            header: "Mode",
            question: "Which mode?",
            options: [
              { label: "Safe", description: "Use safe mode" },
              { label: "Fast", description: "Use fast mode" },
            ],
            multiSelect: false,
          },
        ],
      },
    ]);
    expect(
      derivePendingUserInputs([
        requested,
        activity(
          "provider.user-input.respond.failed",
          {
            requestId: "question-1",
            detail: "Unknown pending user-input request: question-1",
          },
          "2026-02-23T00:00:02.000Z",
        ),
      ]),
    ).toEqual([]);
  });
});
