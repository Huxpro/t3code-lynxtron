import {
  deriveVisibleUserMessage,
  extractTrailingElementContexts,
  extractTrailingTerminalContexts,
  type ParsedUserContextEntry,
} from "@t3tools/lynx-logic/userMessage";

export interface DisplayedUserMessageState {
  visibleText: string;
  copyText: string;
  contextCount: number;
  previewTitle: string | null;
  contexts: ParsedUserContextEntry[];
  /**
   * Element-context entries extracted from the trailing `<element_context>`
   * block (if any). Stripped from `visibleText` so the raw block doesn't
   * leak into the user's bubble.
   */
  elementContexts: ParsedUserContextEntry[];
}

export function deriveDisplayedUserMessageState(prompt: string): DisplayedUserMessageState {
  // Order matters: send-time appends `<terminal_context>` first, then
  // `<element_context>` last. Strip element first so the (now-trailing)
  // terminal block can be matched by `extractTrailingTerminalContexts`.
  const extractedElement = extractTrailingElementContexts(prompt);
  const extractedTerminal = extractTrailingTerminalContexts(extractedElement.promptText);
  const shared = deriveVisibleUserMessage(prompt);
  return {
    visibleText: shared.visibleText,
    copyText: shared.copyText,
    contextCount: extractedTerminal.contextCount,
    previewTitle: extractedTerminal.previewTitle,
    contexts: extractedTerminal.contexts,
    elementContexts: extractedElement.contexts,
  };
}
