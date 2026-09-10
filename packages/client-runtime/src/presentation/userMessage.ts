const TRAILING_USER_CONTEXT_BLOCK_PATTERN =
  /\n*<(terminal_context|element_context)>\n[\s\S]*?\n<\/\1>\s*$/;

export interface VisibleUserMessage {
  readonly visibleText: string;
  readonly copyText: string;
  readonly contextKinds: ReadonlyArray<"terminal" | "element">;
}

/** Strip send-time context payloads from the visible user-authored prompt. */
export function deriveVisibleUserMessage(prompt: string): VisibleUserMessage {
  let visibleText = prompt;
  const contextKinds: Array<"terminal" | "element"> = [];
  while (true) {
    const match = TRAILING_USER_CONTEXT_BLOCK_PATTERN.exec(visibleText);
    if (!match) break;
    contextKinds.unshift(match[1] === "terminal_context" ? "terminal" : "element");
    visibleText = visibleText.slice(0, match.index).replace(/\n+$/u, "");
  }
  return { visibleText, copyText: prompt, contextKinds };
}
