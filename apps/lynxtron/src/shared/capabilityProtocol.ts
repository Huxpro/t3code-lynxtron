export const T3_CLIPBOARD_WRITE_TEXT_METHOD = "t3:capability.clipboard.write-text";

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
