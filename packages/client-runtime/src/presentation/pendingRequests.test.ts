import { describe, expect, it } from "vite-plus/test";
import { EventId, type OrchestrationThreadActivity } from "@t3tools/contracts";

import { derivePendingApprovals, derivePendingUserInputs } from "./pendingRequests.ts";

function activity(
  kind: string,
  sequence: number,
  payload: Record<string, unknown>,
): OrchestrationThreadActivity {
  return {
    id: EventId.make(`activity-${sequence}`),
    kind,
    sequence,
    summary: kind,
    tone: "info",
    payload,
    turnId: null,
    createdAt: `2026-09-08T00:00:0${sequence}.000Z`,
  };
}

describe("pending request projection", () => {
  it("keeps only unresolved approvals in canonical order", () => {
    expect(
      derivePendingApprovals([
        activity("approval.requested", 2, {
          requestId: "second",
          requestKind: "file-read",
        }),
        activity("approval.resolved", 3, { requestId: "second" }),
        activity("approval.requested", 1, {
          requestId: "first",
          requestType: "command_execution_approval",
          detail: "pnpm test",
        }),
      ]),
    ).toEqual([
      {
        requestId: "first",
        requestKind: "command",
        createdAt: "2026-09-08T00:00:01.000Z",
        detail: "pnpm test",
      },
    ]);
  });

  it("projects valid structured questions and removes resolved requests", () => {
    expect(
      derivePendingUserInputs([
        activity("user-input.requested", 1, {
          requestId: "input-1",
          questions: [
            {
              id: "scope",
              header: "Scope",
              question: "Which surface?",
              options: [{ label: "Lynx", description: "Use the native renderer" }],
            },
          ],
        }),
      ]),
    ).toEqual([
      {
        requestId: "input-1",
        createdAt: "2026-09-08T00:00:01.000Z",
        questions: [
          {
            id: "scope",
            header: "Scope",
            question: "Which surface?",
            options: [{ label: "Lynx", description: "Use the native renderer" }],
            multiSelect: false,
          },
        ],
      },
    ]);
  });
});
