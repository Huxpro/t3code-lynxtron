import type { OrchestrationThreadShell } from "@t3tools/contracts";

export type ThreadDestructiveAction = "archive" | "delete";

export const DISPOSABLE_EMPTY_THREAD_CLEANUP_GRACE_MS = 24 * 60 * 60 * 1000;

export interface ThreadActionConfirmationPresentation {
  readonly action: ThreadDestructiveAction;
  readonly title: string;
  readonly description: string | null;
  readonly confirmLabel: string;
  readonly destructive: boolean;
}

export function projectThreadActionConfirmation(options: {
  readonly action: ThreadDestructiveAction;
  readonly threadTitle: string | null | undefined;
}): ThreadActionConfirmationPresentation {
  const threadTitle = options.threadTitle?.trim() || "this thread";
  if (options.action === "archive") {
    return {
      action: "archive",
      title: `Archive thread "${threadTitle}"?`,
      description: null,
      confirmLabel: "Archive",
      destructive: false,
    };
  }
  return {
    action: "delete",
    title: `Delete thread "${threadTitle}"?`,
    description: "This permanently clears conversation history for this thread.",
    confirmLabel: "Delete",
    destructive: true,
  };
}

export function formatThreadActionConfirmationMessage(
  presentation: ThreadActionConfirmationPresentation,
): string {
  return presentation.description
    ? `${presentation.title}\n${presentation.description}`
    : presentation.title;
}

export function isDisposableEmptyThread(
  thread: Pick<
    OrchestrationThreadShell,
    | "hasActionableProposedPlan"
    | "hasPendingApprovals"
    | "hasPendingUserInput"
    | "latestTurn"
    | "latestUserMessageAt"
    | "session"
    | "title"
  >,
): boolean {
  return (
    thread.title.trim() === "New thread" &&
    thread.latestUserMessageAt === null &&
    thread.latestTurn === null &&
    thread.session === null &&
    !thread.hasPendingApprovals &&
    !thread.hasPendingUserInput &&
    !thread.hasActionableProposedPlan
  );
}

export function selectStaleDisposableThreadIds(
  threads: ReadonlyArray<
    Pick<
      OrchestrationThreadShell,
      | "archivedAt"
      | "createdAt"
      | "hasActionableProposedPlan"
      | "hasPendingApprovals"
      | "hasPendingUserInput"
      | "id"
      | "latestTurn"
      | "latestUserMessageAt"
      | "session"
      | "title"
      | "updatedAt"
    >
  >,
  options: {
    readonly nowMs: number;
    readonly graceMs?: number;
  },
): ReadonlyArray<OrchestrationThreadShell["id"]> {
  const graceMs = options.graceMs ?? DISPOSABLE_EMPTY_THREAD_CLEANUP_GRACE_MS;
  return threads.flatMap((thread) => {
    if (thread.archivedAt !== null || !isDisposableEmptyThread(thread)) return [];
    const lastTouchedAtMs = Math.max(Date.parse(thread.createdAt), Date.parse(thread.updatedAt));
    return Number.isFinite(lastTouchedAtMs) && options.nowMs - lastTouchedAtMs >= graceMs
      ? [thread.id]
      : [];
  });
}
