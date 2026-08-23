import { describe, expect, it } from "vite-plus/test";

import {
  DISPOSABLE_EMPTY_THREAD_CLEANUP_GRACE_MS,
  formatThreadActionConfirmationMessage,
  isDisposableEmptyThread,
  projectThreadActionConfirmation,
  selectStaleDisposableThreadIds,
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

  it("selects only stale canonical empty shells for automatic recovery", () => {
    const nowMs = Date.parse("2026-08-23T12:00:00.000Z");
    const staleEmptyThread = {
      id: "stale-empty",
      title: "New thread",
      createdAt: "2026-08-21T10:00:00.000Z",
      updatedAt: "2026-08-21T10:00:00.000Z",
      archivedAt: null,
      latestUserMessageAt: null,
      latestTurn: null,
      session: null,
      hasPendingApprovals: false,
      hasPendingUserInput: false,
      hasActionableProposedPlan: false,
    };

    expect(
      selectStaleDisposableThreadIds(
        [
          staleEmptyThread,
          {
            ...staleEmptyThread,
            id: "fresh-empty",
            createdAt: "2026-08-23T11:58:00.000Z",
            updatedAt: "2026-08-23T11:58:00.000Z",
          },
          {
            ...staleEmptyThread,
            id: "recently-updated-empty",
            updatedAt: "2026-08-23T11:59:00.000Z",
          },
          {
            ...staleEmptyThread,
            id: "active-thread",
            latestUserMessageAt: "2026-08-21T10:01:00.000Z",
          },
          {
            ...staleEmptyThread,
            id: "archived-empty",
            archivedAt: "2026-08-22T10:00:00.000Z",
          },
          {
            ...staleEmptyThread,
            id: "invalid-timestamp",
            createdAt: "invalid",
            updatedAt: "invalid",
          },
        ],
        { nowMs },
      ),
    ).toEqual(["stale-empty"]);
  });

  it("includes an empty shell exactly at the cleanup grace boundary", () => {
    const nowMs = Date.parse("2026-08-23T12:00:00.000Z");
    const timestamp = new Date(nowMs - DISPOSABLE_EMPTY_THREAD_CLEANUP_GRACE_MS).toISOString();

    expect(
      selectStaleDisposableThreadIds(
        [
          {
            id: "boundary-empty",
            title: "New thread",
            createdAt: timestamp,
            updatedAt: timestamp,
            archivedAt: null,
            latestUserMessageAt: null,
            latestTurn: null,
            session: null,
            hasPendingApprovals: false,
            hasPendingUserInput: false,
            hasActionableProposedPlan: false,
          },
        ],
        { nowMs },
      ),
    ).toEqual(["boundary-empty"]);
  });
});
