export interface ReviewCommentSelection {
  readonly start: number;
  readonly side: "additions" | "deletions";
  readonly end: number;
  readonly endSide: "additions" | "deletions";
}

export interface ReviewCommentContext {
  readonly id: string;
  readonly sectionId: string;
  readonly sectionTitle: string;
  readonly filePath: string;
  readonly startIndex: number;
  readonly endIndex: number;
  readonly rangeLabel: string;
  readonly text: string;
  readonly diff: string;
  readonly fenceLanguage?: string | undefined;
  readonly selection?: ReviewCommentSelection | undefined;
}

export type ReviewCommentMessageSegment =
  | { readonly kind: "text"; readonly id: string; readonly text: string }
  | { readonly kind: "review-comment"; readonly comment: ReviewCommentContext };

const BLOCK_PATTERN = /<review_comment\b([^>]*)>\s*([\s\S]*?)<\/review_comment>/g;
const ATTRIBUTE_PATTERN = /([a-zA-Z][a-zA-Z0-9_-]*)="([^"]*)"/g;
const FENCE_PATTERN = /(`{3,})([^\s`]*)[^\n]*\n([\s\S]*?)\n\1/g;

function unescapeAttribute(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

function parseReviewComment(attributesSource: string, bodySource: string, index: number) {
  const attributes: Record<string, string> = {};
  for (const match of attributesSource.matchAll(ATTRIBUTE_PATTERN)) {
    attributes[match[1]!] = unescapeAttribute(match[2] ?? "");
  }
  const startIndex = /^\d+$/.test(attributes.startIndex ?? "")
    ? Number(attributes.startIndex)
    : null;
  const endIndex = /^\d+$/.test(attributes.endIndex ?? "") ? Number(attributes.endIndex) : null;
  const filePath = attributes.filePath?.trim();
  const sectionId = attributes.sectionId?.trim();
  if (!filePath || !sectionId || startIndex === null || endIndex === null) return null;
  const fence = Array.from(bodySource.matchAll(FENCE_PATTERN)).at(-1);
  return {
    id: `review-comment:${index}:${sectionId}:${filePath}:${startIndex}:${endIndex}`,
    sectionId,
    sectionTitle: attributes.sectionTitle?.trim() || "Review",
    filePath,
    startIndex: Math.min(startIndex, endIndex),
    endIndex: Math.max(startIndex, endIndex),
    rangeLabel: attributes.rangeLabel?.trim() || "line",
    text: bodySource.slice(0, fence?.index ?? bodySource.length).trim(),
    diff: fence?.[3] ?? "",
    fenceLanguage: fence?.[2]?.trim() || "diff",
  } satisfies ReviewCommentContext;
}

export function parseReviewCommentMessageSegments(
  value: string,
): ReadonlyArray<ReviewCommentMessageSegment> {
  const segments: ReviewCommentMessageSegment[] = [];
  let cursor = 0;
  let commentIndex = 0;
  for (const match of value.matchAll(BLOCK_PATTERN)) {
    const matchIndex = match.index ?? 0;
    const before = value.slice(cursor, matchIndex);
    if (before) segments.push({ kind: "text", id: `review-comment-text:${cursor}`, text: before });
    const comment = parseReviewComment(match[1] ?? "", match[2] ?? "", commentIndex);
    if (comment) {
      segments.push({ kind: "review-comment", comment });
      commentIndex += 1;
    } else {
      segments.push({ kind: "text", id: `review-comment-invalid:${matchIndex}`, text: match[0] });
    }
    cursor = matchIndex + match[0].length;
  }
  const rest = value.slice(cursor);
  if (rest) segments.push({ kind: "text", id: `review-comment-text:${cursor}`, text: rest });
  return segments;
}

export function hasReviewCommentMessageSegments(value: string): boolean {
  return parseReviewCommentMessageSegments(value).some(
    (segment) => segment.kind === "review-comment",
  );
}

export function reviewCommentMessageVisibleText(value: string): string {
  const segments = parseReviewCommentMessageSegments(value);
  if (!segments.some((segment) => segment.kind === "review-comment")) return value;
  return segments
    .map((segment) =>
      segment.kind === "text"
        ? segment.text
        : [
            `${segment.comment.filePath} · ${segment.comment.sectionTitle} · ${segment.comment.rangeLabel}`,
            segment.comment.text,
            segment.comment.diff,
          ]
            .filter(Boolean)
            .join("\n"),
    )
    .join("")
    .trim();
}

export function formatReviewCommentFence(language: string, contents: string): string {
  const longestBacktickRun = Math.max(
    0,
    ...Array.from(contents.matchAll(/`+/g), (match) => match[0].length),
  );
  const fence = "`".repeat(Math.max(3, longestBacktickRun + 1));
  return [`${fence}${language}`, contents.trimEnd(), fence].join("\n");
}
