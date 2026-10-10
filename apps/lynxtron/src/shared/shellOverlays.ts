// What a shell source shows that the server has not said yet: a thread's
// model selection from the moment it is picked until the server reports it,
// and nothing for an empty disposable thread, which the cleanup deletes as
// soon as it is seen. The renderer's upstream source passes these to
// `projectConnectorShell`.
import type { ModelSelection, OrchestrationThreadShell } from "@t3tools/contracts";
import { selectRecoverableDisposableThreadIds } from "@t3tools/lynx-logic/threadActions";

/** The selection each thread was last asked to use, by thread id. */
export type PendingModelSelections = ReadonlyMap<string, ModelSelection>;

function sameSelection(left: ModelSelection, right: ModelSelection): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** The threads whose pending selection the server now reports. */
export function confirmedModelSelectionThreadIds(
  pending: PendingModelSelections,
  threads: ReadonlyArray<Pick<OrchestrationThreadShell, "id" | "modelSelection">>,
): ReadonlyArray<string> {
  if (pending.size === 0) return [];
  return threads.flatMap((thread) => {
    const selection = pending.get(thread.id);
    return selection && sameSelection(thread.modelSelection, selection) ? [thread.id] : [];
  });
}

/** Forgets every pending selection the server has confirmed. */
export function dropConfirmedModelSelections(
  pending: Map<string, ModelSelection>,
  threads: ReadonlyArray<Pick<OrchestrationThreadShell, "id" | "modelSelection">>,
): void {
  for (const threadId of confirmedModelSelectionThreadIds(pending, threads)) {
    pending.delete(threadId);
  }
}

/** The thread with its pending selection, or the same thread when it has none. */
export function withPendingModelSelection(
  thread: OrchestrationThreadShell,
  pending: PendingModelSelections,
): OrchestrationThreadShell {
  const selection = pending.get(thread.id);
  return selection ? { ...thread, modelSelection: selection } : thread;
}

type DisposableCandidates = Parameters<typeof selectRecoverableDisposableThreadIds>[0];

/**
 * The empty disposable threads in a shell. The connector's cleanup deletes
 * each one it sees, so a source that does not run the cleanup hides them all.
 */
export function disposableThreadIds(threads: DisposableCandidates): ReadonlySet<string> {
  return new Set(selectRecoverableDisposableThreadIds(threads));
}

export interface DisposableThreadCleanup {
  /**
   * Takes the server's current threads. Each empty disposable thread seen for
   * the first time is hidden and deleted.
   */
  readonly observe: (threads: DisposableCandidates) => void;
  /** Whether a thread is being deleted and is left out of the shell meanwhile. */
  readonly isHidden: (threadId: string) => boolean;
}

/**
 * Deletes empty disposable threads as a shell source sees them: a thread is
 * hidden from the moment it is seen, deleted on the next tick if it is still empty, shown again if
 * the delete fails, and tried again the next time the shell changes.
 */
export function createDisposableThreadCleanup(options: {
  readonly deleteThread: (threadId: string) => Promise<unknown>;
  /** A hidden thread is shown again: the delete failed, or it was written in. */
  readonly onRevealed: () => void;
}): DisposableThreadCleanup {
  const hidden = new Set<string>();
  let latest: DisposableCandidates = [];
  const reveal = (threadId: string) => {
    if (!hidden.delete(threadId)) return;
    if (latest.some((thread) => thread.id === threadId)) options.onRevealed();
  };
  return {
    observe(threads) {
      latest = threads;
      const present = new Set<string>(threads.map((thread) => thread.id));
      for (const threadId of hidden) {
        if (!present.has(threadId)) hidden.delete(threadId);
      }
      const candidates = selectRecoverableDisposableThreadIds(threads).filter(
        (threadId) => !hidden.has(threadId),
      );
      for (const threadId of candidates) hidden.add(threadId);
      if (candidates.length === 0) return;
      void Promise.resolve().then(() => {
        for (const threadId of candidates) {
          const current = latest.find((thread) => thread.id === threadId);
          if (!current) continue;
          if (!selectRecoverableDisposableThreadIds([current]).includes(threadId)) {
            reveal(threadId);
            continue;
          }
          options.deleteThread(threadId).catch(() => reveal(threadId));
        }
      });
    },
    isHidden: (threadId) => hidden.has(threadId),
  };
}
