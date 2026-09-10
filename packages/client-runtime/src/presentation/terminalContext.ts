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

export type ComposerTerminalContextsByScopeKey = Readonly<
  Record<string, ReadonlyArray<ComposerTerminalContext>>
>;

const VALID_SCOPE_KEY = /^(?:thread|project):.+/u;
export const MAX_TERMINAL_CONTEXTS_PER_SCOPE = 8;

function normalizeComposerTerminalContext(value: unknown): ComposerTerminalContext | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const context = value as Partial<ComposerTerminalContext>;
  if (
    typeof context.id !== "string" ||
    context.id.length === 0 ||
    typeof context.terminalId !== "string" ||
    context.terminalId.length === 0 ||
    typeof context.terminalLabel !== "string" ||
    context.terminalLabel.trim().length === 0 ||
    typeof context.lineStart !== "number" ||
    !Number.isSafeInteger(context.lineStart) ||
    context.lineStart < 1 ||
    typeof context.lineEnd !== "number" ||
    !Number.isSafeInteger(context.lineEnd) ||
    typeof context.text !== "string"
  ) {
    return null;
  }
  const text = normalizeTerminalContextText(context.text);
  const lineCount = text ? text.split("\n").length : 0;
  if (!text || context.lineEnd !== context.lineStart + lineCount - 1) return null;
  return {
    id: context.id,
    terminalId: context.terminalId,
    terminalLabel: context.terminalLabel.trim(),
    lineStart: context.lineStart,
    lineEnd: context.lineEnd,
    text,
  };
}

export function normalizeComposerTerminalContextsByScopeKey(
  value: unknown,
): ComposerTerminalContextsByScopeKey {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([scopeKey, contexts]) => {
      if (!VALID_SCOPE_KEY.test(scopeKey) || !Array.isArray(contexts)) return [];
      const normalized = contexts
        .map(normalizeComposerTerminalContext)
        .filter((context): context is ComposerTerminalContext => context !== null)
        .slice(-MAX_TERMINAL_CONTEXTS_PER_SCOPE);
      return normalized.length > 0 ? [[scopeKey, normalized]] : [];
    }),
  );
}

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
