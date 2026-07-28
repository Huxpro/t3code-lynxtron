export type ThreadDestructiveAction = "archive" | "delete";

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
