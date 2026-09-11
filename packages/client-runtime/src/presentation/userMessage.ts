import {
  extractTrailingPreviewAnnotations,
  type ParsedPreviewAnnotation,
} from "./previewAnnotation.ts";
import { reviewCommentMessageVisibleText } from "./reviewComment.ts";

const TRAILING_USER_CONTEXT_BLOCK_PATTERN =
  /\n*<(terminal_context|element_context)>\n[\s\S]*?\n<\/\1>\s*$/;
const TRAILING_TERMINAL_CONTEXT_BLOCK_PATTERN =
  /\n*<terminal_context>\n([\s\S]*?)\n<\/terminal_context>\s*$/;
const TRAILING_ELEMENT_CONTEXT_BLOCK_PATTERN =
  /\n*<element_context>\n([\s\S]*?)\n<\/element_context>\s*$/;

export interface ParsedUserContextEntry {
  readonly header: string;
  readonly body: string;
}

export interface ExtractedUserContexts {
  readonly promptText: string;
  readonly contextCount: number;
  readonly contexts: ParsedUserContextEntry[];
}

export interface ExtractedTerminalContexts extends ExtractedUserContexts {
  readonly previewTitle: string | null;
}

export interface VisibleUserMessage {
  readonly visibleText: string;
  readonly copyText: string;
  readonly contextKinds: ReadonlyArray<"terminal" | "element">;
}

export interface UserMessagePresentation {
  readonly visibleText: string;
  readonly semanticText: string;
  readonly copyText: string;
  readonly contextKinds: ReadonlyArray<"terminal" | "element">;
  readonly terminalContexts: ReadonlyArray<ParsedUserContextEntry>;
  readonly elementContexts: ReadonlyArray<ParsedUserContextEntry>;
  readonly previewAnnotations: ReadonlyArray<ParsedPreviewAnnotation>;
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

function parseContextEntries(block: string): ParsedUserContextEntry[] {
  const entries: ParsedUserContextEntry[] = [];
  let current: { header: string; bodyLines: string[] } | null = null;
  const commit = () => {
    if (!current) return;
    entries.push({ header: current.header, body: current.bodyLines.join("\n").trimEnd() });
    current = null;
  };
  for (const line of block.split("\n")) {
    const headerMatch = /^- (.+):$/.exec(line);
    if (headerMatch) {
      commit();
      current = { header: headerMatch[1]!, bodyLines: [] };
    } else if (current && line.startsWith("  ")) {
      current.bodyLines.push(line.slice(2));
    } else if (current && line.length === 0) {
      current.bodyLines.push("");
    }
  }
  commit();
  return entries;
}

export function extractTrailingElementContexts(prompt: string): ExtractedUserContexts {
  const match = TRAILING_ELEMENT_CONTEXT_BLOCK_PATTERN.exec(prompt);
  if (!match) return { promptText: prompt, contextCount: 0, contexts: [] };
  const contexts = parseContextEntries(match[1] ?? "");
  return {
    promptText: prompt.slice(0, match.index).replace(/\n+$/u, ""),
    contextCount: contexts.length,
    contexts,
  };
}

export function extractTrailingTerminalContexts(prompt: string): ExtractedTerminalContexts {
  const match = TRAILING_TERMINAL_CONTEXT_BLOCK_PATTERN.exec(prompt);
  if (!match) {
    return { promptText: prompt, contextCount: 0, previewTitle: null, contexts: [] };
  }
  const contexts = parseContextEntries(match[1] ?? "");
  return {
    promptText: prompt.slice(0, match.index).replace(/\n+$/u, ""),
    contextCount: contexts.length,
    previewTitle:
      contexts.length > 0
        ? contexts
            .map(({ header, body }) => (body.length > 0 ? `${header}\n${body}` : header))
            .join("\n\n")
        : null,
    contexts,
  };
}

function extractTrailingContextGroup(prompt: string) {
  const element = extractTrailingElementContexts(prompt);
  const terminal = extractTrailingTerminalContexts(element.promptText);
  return {
    promptText: terminal.promptText,
    terminalContexts: terminal.contexts,
    elementContexts: element.contexts,
    contextKinds: [
      ...(terminal.contextCount > 0 ? (["terminal"] as const) : []),
      ...(element.contextCount > 0 ? (["element"] as const) : []),
    ],
  };
}

export function deriveUserMessagePresentation(prompt: string): UserMessagePresentation {
  const outerContexts = extractTrailingContextGroup(prompt);
  const preview = extractTrailingPreviewAnnotations(outerContexts.promptText);
  const innerContexts = extractTrailingContextGroup(preview.promptText);
  const visibleText = innerContexts.promptText;
  return {
    visibleText,
    semanticText: reviewCommentMessageVisibleText(visibleText),
    copyText: prompt,
    contextKinds: [...innerContexts.contextKinds, ...outerContexts.contextKinds],
    terminalContexts: [...innerContexts.terminalContexts, ...outerContexts.terminalContexts],
    elementContexts: [...innerContexts.elementContexts, ...outerContexts.elementContexts],
    previewAnnotations: preview.annotations,
  };
}

/** Visible user content used by renderer-neutral labels, search, and navigation previews. */
export function deriveUserMessageSemanticText(prompt: string): string {
  return deriveUserMessagePresentation(prompt).semanticText;
}

export function shouldCollapseUserMessage(text: string): boolean {
  if (text.trim().length === 0) return false;
  return (
    text.length > MAX_COLLAPSED_USER_MESSAGE_LENGTH ||
    text.split("\n").length > MAX_COLLAPSED_USER_MESSAGE_LINES
  );
}
