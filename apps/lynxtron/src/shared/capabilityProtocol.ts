export const T3_CLIPBOARD_WRITE_TEXT_METHOD = "t3:capability.clipboard.write-text";
export const T3_CONTEXT_MENU_SHOW_METHOD = "t3:capability.context-menu.show";
export const T3_CONFIRM_METHOD = "t3:capability.confirm";

export interface NativeConfirmInput {
  readonly message: string;
  readonly detail?: string;
  readonly confirmLabel?: string;
}

export function parseNativeConfirmInput(input: unknown): NativeConfirmInput {
  if (typeof input !== "object" || input === null) {
    throw new Error("Confirm request must be an object.");
  }
  const candidate = input as Record<string, unknown>;
  if (typeof candidate.message !== "string" || candidate.message.trim().length === 0) {
    throw new Error("Confirm request requires a message.");
  }
  return {
    message: candidate.message,
    ...(typeof candidate.detail === "string" ? { detail: candidate.detail } : {}),
    ...(typeof candidate.confirmLabel === "string" ? { confirmLabel: candidate.confirmLabel } : {}),
  };
}

export interface NativeContextMenuItem {
  readonly id: string;
  readonly label: string;
  readonly destructive?: boolean;
  readonly disabled?: boolean;
  readonly children?: ReadonlyArray<NativeContextMenuItem>;
}

export interface NativeContextMenuShowInput {
  readonly items: ReadonlyArray<NativeContextMenuItem>;
  readonly x?: number;
  readonly y?: number;
}

function parseMenuItems(input: unknown): ReadonlyArray<NativeContextMenuItem> {
  if (!Array.isArray(input)) throw new Error("Context menu items must be an array.");
  return input.map((item) => {
    if (typeof item !== "object" || item === null) throw new Error("Invalid context menu item.");
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.id !== "string" || typeof candidate.label !== "string") {
      throw new Error("Context menu items require string id and label.");
    }
    return {
      id: candidate.id,
      label: candidate.label,
      ...(candidate.destructive === true ? { destructive: true } : {}),
      ...(candidate.disabled === true ? { disabled: true } : {}),
      ...(candidate.children === undefined ? {} : { children: parseMenuItems(candidate.children) }),
    };
  });
}

export function parseNativeContextMenuShowInput(input: unknown): NativeContextMenuShowInput {
  if (typeof input !== "object" || input === null) {
    throw new Error("Context menu request must be an object.");
  }
  const candidate = input as {
    readonly items?: unknown;
    readonly x?: unknown;
    readonly y?: unknown;
  };
  const hasPosition =
    typeof candidate.x === "number" &&
    Number.isFinite(candidate.x) &&
    candidate.x >= 0 &&
    typeof candidate.y === "number" &&
    Number.isFinite(candidate.y) &&
    candidate.y >= 0;
  return {
    items: parseMenuItems(candidate.items),
    ...(hasPosition ? { x: candidate.x as number, y: candidate.y as number } : {}),
  };
}

export interface ClipboardWriteTextInput {
  readonly value: string;
}

export function parseClipboardWriteTextInput(input: unknown): ClipboardWriteTextInput {
  if (
    typeof input !== "object" ||
    input === null ||
    typeof (input as { readonly value?: unknown }).value !== "string"
  ) {
    throw new Error("Clipboard text must be a string.");
  }
  return { value: (input as { readonly value: string }).value };
}
