import { describe, expect, it } from "vite-plus/test";

import {
  formatThreadActionConfirmationMessage,
  isDisposableEmptyThread,
  projectThreadActionConfirmation,
} from "./threadActions.ts";

describe("thread action confirmation presentation", () => {
  it("projects the canonical delete warning", () => {
    const presentation = projectThreadActionConfirmation({
      action: "delete",
      threadTitle: "Composer parity",
    });
    expect(presentation).toEqual({
      action: "delete",
      title: 'Delete thread "Composer parity"?',
      description: "This permanently clears conversation history for this thread.",
      confirmLabel: "Delete",
      destructive: true,
    });
    expect(formatThreadActionConfirmationMessage(presentation)).toBe(
      'Delete thread "Composer parity"?\n' +
        "This permanently clears conversation history for this thread.",
    );
  });

  it("projects archive and empty-title fallbacks without destructive copy", () => {
    const presentation = projectThreadActionConfirmation({
      action: "archive",
      threadTitle: " ",
    });
    expect(presentation).toEqual({
      action: "archive",
      title: 'Archive thread "this thread"?',
      description: null,
      confirmLabel: "Archive",
      destructive: false,
    });
    expect(formatThreadActionConfirmationMessage(presentation)).toBe(
      'Archive thread "this thread"?',
    );
  });

  it("only treats untouched New thread shells as disposable", () => {
    const emptyThread = {
      title: "New thread",
      latestUserMessageAt: null,
      latestTurn: null,
      session: null,
      hasPendingApprovals: false,
      hasPendingUserInput: false,
      hasActionableProposedPlan: false,
    };

    expect(isDisposableEmptyThread(emptyThread)).toBe(true);
    expect(isDisposableEmptyThread({ ...emptyThread, title: "Renamed draft" })).toBe(false);
    expect(
      isDisposableEmptyThread({
        ...emptyThread,
        latestUserMessageAt: "2026-08-23T00:00:00.000Z",
      }),
    ).toBe(false);
    expect(
      isDisposableEmptyThread({
        ...emptyThread,
        session: {
          status: "stopped",
          activeTurnId: null,
          providerKind: "codex",
          providerName: "Codex",
          providerInstanceId: "codex",
          providerThreadId: null,
          cwd: "/repo",
          createdAt: "2026-08-23T00:00:00.000Z",
          updatedAt: "2026-08-23T00:00:00.000Z",
          lastError: null,
        },
      }),
    ).toBe(false);
  });
});
