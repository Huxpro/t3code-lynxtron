export interface ComposerTerminalContext {
  readonly id: string;
  readonly terminalId: string;
  readonly terminalLabel: string;
  readonly lineStart: number;
  readonly lineEnd: number;
  readonly text: string;
}

export type TerminalContextContent = Omit<ComposerTerminalContext, "id"> & {
  readonly id?: string;
};

export function normalizeTerminalContextText(text: string): string {
  return text.replace(/\r\n/gu, "\n").replace(/^\n+|\n+$/gu, "");
}

export function formatTerminalContextRange(context: {
  readonly lineStart: number;
  readonly lineEnd: number;
}): string {
  return context.lineStart === context.lineEnd
    ? `line ${context.lineStart}`
    : `lines ${context.lineStart}-${context.lineEnd}`;
}

export function formatTerminalContextLabel(context: {
  readonly terminalLabel: string;
  readonly lineStart: number;
  readonly lineEnd: number;
}): string {
  return `${context.terminalLabel} ${formatTerminalContextRange(context)}`;
}

export function buildTerminalContextBlock(contexts: ReadonlyArray<TerminalContextContent>): string {
  const lines: string[] = [];
  for (const context of contexts) {
    const text = normalizeTerminalContextText(context.text);
    if (!text) continue;
    if (lines.length > 0) lines.push("");
    lines.push(`- ${formatTerminalContextLabel(context)}:`);
    lines.push(
      ...text.split("\n").map((line, index) => `  ${context.lineStart + index} | ${line}`),
    );
  }
  return lines.length > 0 ? ["<terminal_context>", ...lines, "</terminal_context>"].join("\n") : "";
}

export function appendTerminalContextsToPrompt(
  prompt: string,
  contexts: ReadonlyArray<TerminalContextContent>,
): string {
  const trimmedPrompt = prompt.trim();
  const block = buildTerminalContextBlock(contexts);
  if (!block) return trimmedPrompt;
  return trimmedPrompt ? `${trimmedPrompt}\n\n${block}` : block;
}

export function recentTerminalContext(input: {
  readonly terminalId: string;
  readonly terminalLabel: string;
  readonly history: string;
  readonly maxLines?: number;
}): ComposerTerminalContext | null {
  const allLines = normalizeTerminalContextText(input.history).split("\n");
  if (allLines.length === 1 && allLines[0] === "") return null;
  const maxLines = Math.max(1, Math.floor(input.maxLines ?? 50));
  const selected = allLines.slice(-maxLines);
  const lineStart = allLines.length - selected.length + 1;
  return {
    id: `${input.terminalId}:${lineStart}:${allLines.length}`,
    terminalId: input.terminalId,
    terminalLabel: input.terminalLabel.trim() || "Terminal",
    lineStart,
    lineEnd: allLines.length,
    text: selected.join("\n"),
  };
}
