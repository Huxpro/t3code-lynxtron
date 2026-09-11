const TRAILING_USER_CONTEXT_BLOCK_PATTERN =
  /\n*<(terminal_context|element_context)>\n[\s\S]*?\n<\/\1>\s*$/;

export interface VisibleUserMessage {
  readonly visibleText: string;
  readonly copyText: string;
  readonly contextKinds: ReadonlyArray<"terminal" | "element">;
}

const MAX_COLLAPSED_USER_MESSAGE_LINES = 8;
const MAX_COLLAPSED_USER_MESSAGE_LENGTH = 600;

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

export function shouldCollapseUserMessage(text: string): boolean {
  if (text.trim().length === 0) return false;
  return (
    text.length > MAX_COLLAPSED_USER_MESSAGE_LENGTH ||
    text.split("\n").length > MAX_COLLAPSED_USER_MESSAGE_LINES
  );
}
