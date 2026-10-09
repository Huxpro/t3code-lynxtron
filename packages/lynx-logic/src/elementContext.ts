import type { PickedElementPayload, PickedElementStackFrame, ThreadId } from "@t3tools/contracts";

export interface ElementContextSelection {
  readonly pageUrl: string;
  readonly pageTitle: string | null;
  readonly tagName: string;
  readonly selector: string | null;
  readonly htmlPreview: string;
  readonly componentName: string | null;
  readonly source: PickedElementStackFrame | null;
  readonly styles: string;
}

export interface ElementContextDraft extends ElementContextSelection {
  readonly id: string;
  readonly threadId: ThreadId;
  readonly pickedAt: string;
}

export type ComposerElementContextsByScopeKey = Readonly<
  Record<string, ReadonlyArray<ElementContextDraft>>
>;

const HTML_PREVIEW_LIMIT = 4_000;
const STYLES_LIMIT = 4_000;
const LABEL_TAG_MAX = 24;
const VALID_SCOPE_KEY = /^(?:thread|project):.+/u;
export const MAX_ELEMENT_CONTEXTS_PER_SCOPE = 20;

function truncateString(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, Math.max(0, limit - 1))}…`;
}

function normalizeText(value: string): string {
  return value.replace(/\r\n/gu, "\n").replace(/^\n+|\n+$/gu, "");
}

export function normalizeElementContextSelection(
  raw: PickedElementPayload,
): ElementContextSelection | null {
  const pageUrl = raw.pageUrl.trim();
  const tagName = raw.tagName.trim().toLowerCase();
  if (!pageUrl || !tagName) return null;
  const stackFrame = raw.source ?? raw.stack[0] ?? null;
  return {
    pageUrl,
    pageTitle: raw.pageTitle?.trim() ?? null,
    tagName,
    selector: raw.selector?.trim() || null,
    htmlPreview: truncateString(normalizeText(raw.htmlPreview), HTML_PREVIEW_LIMIT),
    componentName: raw.componentName?.trim() || null,
    source: stackFrame
      ? {
          functionName: stackFrame.functionName?.trim() || null,
          fileName: stackFrame.fileName?.trim() || null,
          lineNumber: stackFrame.lineNumber ?? null,
          columnNumber: stackFrame.columnNumber ?? null,
        }
      : null,
    styles: truncateString(normalizeText(raw.styles), STYLES_LIMIT),
  };
}

export function elementContextDedupKey(context: ElementContextSelection): string {
  return [context.pageUrl, context.selector ?? "", context.tagName, context.componentName ?? ""]
    .join("|")
    .toLowerCase();
}

function shortenTagLabel(tagName: string): string {
  return tagName.length <= LABEL_TAG_MAX ? tagName : `${tagName.slice(0, LABEL_TAG_MAX - 1)}…`;
}

export function formatElementContextLabel(context: ElementContextSelection): string {
  return context.componentName
    ? `<${context.componentName}>`
    : `<${shortenTagLabel(context.tagName)}>`;
}

function basenameFromPath(filePath: string): string {
  const parts = filePath.split(/[\/]/u);
  return parts[parts.length - 1] ?? filePath;
}

export function formatElementContextSourceLabel(context: ElementContextSelection): string | null {
  const source = context.source;
  if (!source?.fileName) return null;
  const base = basenameFromPath(source.fileName);
  return source.lineNumber == null ? base : `${base}:${source.lineNumber}`;
}

function buildContextHeader(context: ElementContextSelection): string {
  const label = formatElementContextLabel(context);
  const source = formatElementContextSourceLabel(context);
  return source ? `${label} (${source})` : label;
}

function indentLines(value: string): string[] {
  return value.split("\n").map((line) => `  ${line}`);
}

function buildSingleContextLines(context: ElementContextSelection): string[] {
  const lines = [`- ${buildContextHeader(context)}:`];
  if (context.pageUrl) lines.push(`  url: ${context.pageUrl}`);
  if (context.selector) lines.push(`  selector: ${context.selector}`);
  if (context.source?.fileName) {
    const { fileName, lineNumber, columnNumber } = context.source;
    const location =
      lineNumber == null
        ? fileName
        : `${fileName}:${lineNumber}${columnNumber != null ? `:${columnNumber}` : ""}`;
    lines.push(`  source: ${location}`);
  }
  const html = context.htmlPreview.trim();
  if (html) lines.push("  html:", ...indentLines(html));
  const styles = context.styles.trim();
  if (styles) lines.push("  styles:", ...indentLines(styles));
  return lines;
}

export function buildElementContextBlock(contexts: ReadonlyArray<ElementContextSelection>): string {
  if (contexts.length === 0) return "";
  const lines: string[] = [];
  contexts.forEach((context, index) => {
    lines.push(...buildSingleContextLines(context));
    if (index < contexts.length - 1) lines.push("");
  });
  return ["<element_context>", ...lines, "</element_context>"].join("\n");
}

export function appendElementContextsToPrompt(
  prompt: string,
  contexts: ReadonlyArray<ElementContextSelection>,
): string {
  const block = buildElementContextBlock(contexts);
  if (!block) return prompt;
  const trimmed = prompt.trim();
  return trimmed ? `${trimmed}\n\n${block}` : block;
}

export function normalizeComposerElementContextsByScopeKey(
  value: unknown,
): ComposerElementContextsByScopeKey {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([scopeKey, contexts]) => {
      if (!VALID_SCOPE_KEY.test(scopeKey) || !Array.isArray(contexts)) return [];
      const normalized = contexts.flatMap((value): ElementContextDraft[] => {
        if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
        const context = value as Partial<ElementContextDraft>;
        const source = context.source;
        const sourceValid =
          source === null ||
          (typeof source === "object" &&
            (source.functionName === null || typeof source.functionName === "string") &&
            (source.fileName === null || typeof source.fileName === "string") &&
            (source.lineNumber === null || typeof source.lineNumber === "number") &&
            (source.columnNumber === null || typeof source.columnNumber === "number"));
        if (
          !(
            typeof context.id === "string" &&
            context.id.length > 0 &&
            typeof context.threadId === "string" &&
            typeof context.pickedAt === "string" &&
            typeof context.pageUrl === "string" &&
            context.pageUrl.length > 0 &&
            (context.pageTitle === null || typeof context.pageTitle === "string") &&
            typeof context.tagName === "string" &&
            context.tagName.length > 0 &&
            (context.selector === null || typeof context.selector === "string") &&
            typeof context.htmlPreview === "string" &&
            (context.componentName === null || typeof context.componentName === "string") &&
            sourceValid &&
            typeof context.styles === "string"
          )
        )
          return [];
        return [{ ...context, threadId: context.threadId as ThreadId } as ElementContextDraft];
      });
      const unique = [
        ...new Map(
          normalized.map((context) => [elementContextDedupKey(context), context]),
        ).values(),
      ].slice(-MAX_ELEMENT_CONTEXTS_PER_SCOPE);
      return unique.length > 0 ? [[scopeKey, unique]] : [];
    }),
  );
}

export function addComposerElementContext(
  contextsByScopeKey: ComposerElementContextsByScopeKey,
  scopeKey: string,
  context: ElementContextDraft,
): ComposerElementContextsByScopeKey {
  const current = contextsByScopeKey[scopeKey] ?? [];
  const key = elementContextDedupKey(context);
  if (current.some((candidate) => elementContextDedupKey(candidate) === key)) {
    return contextsByScopeKey;
  }
  const next = [...current, context].slice(-MAX_ELEMENT_CONTEXTS_PER_SCOPE);
  return { ...contextsByScopeKey, [scopeKey]: next };
}

export function removeComposerElementContext(
  contextsByScopeKey: ComposerElementContextsByScopeKey,
  scopeKey: string,
  contextId: string,
): ComposerElementContextsByScopeKey {
  const current = contextsByScopeKey[scopeKey] ?? [];
  const nextForScope = current.filter((context) => context.id !== contextId);
  if (nextForScope.length === current.length) return contextsByScopeKey;
  if (nextForScope.length === 0) {
    const { [scopeKey]: _cleared, ...remaining } = contextsByScopeKey;
    return remaining;
  }
  return { ...contextsByScopeKey, [scopeKey]: nextForScope };
}

let nextElementContextSequence = 0;
export function newElementContextId(): string {
  nextElementContextSequence += 1;
  return `el_${nextElementContextSequence.toString(36)}`;
}
