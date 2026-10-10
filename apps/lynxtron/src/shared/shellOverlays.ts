// What a shell source shows that the server has not said yet: a thread's
// model selection from the moment it is picked until the server reports it,
// and nothing for an empty disposable thread, which the cleanup deletes as
// soon as it is seen. The main connector and the renderer's upstream source
// both pass these to `projectConnectorShell`.
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

/**
 * The empty disposable threads in a shell. The connector's cleanup deletes
 * each one it sees, so a source that does not run the cleanup hides them all.
 */
export function disposableThreadIds(
  threads: Parameters<typeof selectRecoverableDisposableThreadIds>[0],
): ReadonlySet<string> {
  return new Set(selectRecoverableDisposableThreadIds(threads));
}
