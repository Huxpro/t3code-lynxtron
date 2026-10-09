import type { ContextMenuItem } from "@t3tools/contracts";

export type FileLinkContextMenuAction = "open" | "open-in-browser" | "copy-relative" | "copy-full";

/** Items for a transcript file link's context menu, shared by Web and Lynx. */
export function buildFileLinkContextMenuItems(options: {
  readonly canOpenInBrowser: boolean;
}): readonly ContextMenuItem<FileLinkContextMenuAction>[] {
  return [
    { id: "open", label: "Open in editor" },
    ...(options.canOpenInBrowser
      ? ([{ id: "open-in-browser", label: "Open in integrated browser" }] as const)
      : []),
    { id: "copy-relative", label: "Copy relative path" },
    { id: "copy-full", label: "Copy full path" },
  ];
}

export const FILE_LINK_COPY_LABELS = {
  "copy-relative": "Relative path",
  "copy-full": "Full path",
} as const satisfies Partial<Record<FileLinkContextMenuAction, string>>;

const describeCause = (cause: unknown): string =>
  cause instanceof Error ? cause.message : "An error occurred.";

/** Toast shown after a file path is copied from a file link menu. */
export function fileLinkCopiedToast(label: string, value: string) {
  return { type: "success" as const, title: `${label} copied`, description: value };
}

/** Toast shown when a file link action fails. */
export function fileLinkFailureToast(
  failure:
    | { readonly kind: "open-in-editor" | "open-in-browser"; readonly cause: unknown }
    | { readonly kind: "copy"; readonly label: string; readonly cause: unknown },
) {
  if (failure.kind === "copy") {
    return {
      type: "error" as const,
      title: `Failed to copy ${failure.label.toLowerCase()}`,
      description: describeCause(failure.cause),
    };
  }
  return {
    type: "error" as const,
    title:
      failure.kind === "open-in-browser" ? "Unable to open file in browser" : "Unable to open file",
    description: describeCause(failure.cause),
  };
}
