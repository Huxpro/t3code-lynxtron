const TRAILING_USER_CONTEXT_BLOCK_PATTERN =
  /\n*<(terminal_context|element_context)>\n[\s\S]*?\n<\/\1>\s*$/;

export interface VisibleUserMessage {
  readonly visibleText: string;
  readonly copyText: string;
}

/** Strip send-time context payloads from the visible user-authored prompt. */
export function deriveVisibleUserMessage(prompt: string): VisibleUserMessage {
  let visibleText = prompt;
  while (true) {
    const match = TRAILING_USER_CONTEXT_BLOCK_PATTERN.exec(visibleText);
    if (!match) break;
    visibleText = visibleText.slice(0, match.index).replace(/\n+$/u, "");
  }
  return { visibleText, copyText: prompt };
}
