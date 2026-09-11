import type { FileDiffMetadata, SelectedLineRange, SelectionSide } from "@pierre/diffs";
import {
  type ReviewCommentContext,
  formatReviewCommentFence,
  hasReviewCommentMessageSegments,
  parseReviewCommentMessageSegments,
} from "@t3tools/client-runtime/presentation/review-comment";
import * as Schema from "effect/Schema";

export {
  formatReviewCommentFence,
  hasReviewCommentMessageSegments,
  parseReviewCommentMessageSegments,
};
export type {
  ReviewCommentContext,
  ReviewCommentMessageSegment,
} from "@t3tools/client-runtime/presentation/review-comment";

export const ReviewCommentContextSchema = Schema.Struct({
  id: Schema.String,
  sectionId: Schema.String,
  sectionTitle: Schema.String,
  filePath: Schema.String,
  startIndex: Schema.Number,
  endIndex: Schema.Number,
  rangeLabel: Schema.String,
  text: Schema.String,
  diff: Schema.String,
  fenceLanguage: Schema.optional(Schema.String),
});

interface DiffReviewLine {
  readonly change: "context" | "add" | "delete";
  readonly oldLineNumber: number | null;
  readonly newLineNumber: number | null;
  readonly content: string;
}

function escapeReviewCommentAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function formatReviewCommentContext(comment: ReviewCommentContext): string {
  return [
    [
      "<review_comment",
      ` sectionId="${escapeReviewCommentAttribute(comment.sectionId)}"`,
      ` sectionTitle="${escapeReviewCommentAttribute(comment.sectionTitle)}"`,
      ` filePath="${escapeReviewCommentAttribute(comment.filePath)}"`,
      ` startIndex="${comment.startIndex}"`,
      ` endIndex="${comment.endIndex}"`,
      ` rangeLabel="${escapeReviewCommentAttribute(comment.rangeLabel)}"`,
      ">",
    ].join(""),
    comment.text.trim(),
    formatReviewCommentFence(comment.fenceLanguage ?? "diff", comment.diff),
    "</review_comment>",
  ].join("\n");
}

export function appendReviewCommentsToPrompt(
  prompt: string,
  comments: ReadonlyArray<ReviewCommentContext>,
): string {
  const blocks = comments.map(formatReviewCommentContext);
  if (blocks.length === 0) return prompt;
  const trimmedPrompt = prompt.trim();
  return trimmedPrompt.length > 0
    ? `${trimmedPrompt}\n\n${blocks.join("\n\n")}`
    : blocks.join("\n\n");
}

export function buildFileReviewComment(input: {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  text: string;
  contents: string;
}): ReviewCommentContext {
  const startLine = Math.max(1, Math.min(input.startLine, input.endLine));
  const endLine = Math.max(startLine, Math.max(input.startLine, input.endLine));
  const selectedLines = input.contents.split("\n").slice(startLine - 1, endLine);
  return {
    id: input.id,
    sectionId: `file:${input.filePath}`,
    sectionTitle: "File comment",
    filePath: input.filePath,
    startIndex: startLine - 1,
    endIndex: endLine - 1,
    rangeLabel: startLine === endLine ? `L${startLine}` : `L${startLine} to L${endLine}`,
    text: input.text.trim(),
    diff: selectedLines.join("\n"),
    fenceLanguage: inferReviewCommentFenceLanguage(input.filePath),
  };
}

export function inferReviewCommentFenceLanguage(filePath: string): string {
  const normalizedPath = filePath.replaceAll("\\", "/");
  const fileName = normalizedPath.slice(normalizedPath.lastIndexOf("/") + 1).toLowerCase();
  const extensionIndex = fileName.lastIndexOf(".");
  if (extensionIndex > 0 && extensionIndex < fileName.length - 1) {
    return fileName.slice(extensionIndex + 1);
  }
  if (fileName.startsWith(".") && fileName.length > 1) {
    return fileName.slice(1);
  }
  return "text";
}

function stripTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value.slice(0, -1) : value;
}

function buildDiffReviewLines(fileDiff: FileDiffMetadata): ReadonlyArray<DiffReviewLine> {
  const rows: DiffReviewLine[] = [];

  for (const hunk of fileDiff.hunks) {
    let oldLineNumber = hunk.deletionStart;
    let newLineNumber = hunk.additionStart;
    let deletionLineIndex = hunk.deletionLineIndex;
    let additionLineIndex = hunk.additionLineIndex;

    for (const segment of hunk.hunkContent) {
      if (segment.type === "context") {
        for (let index = 0; index < segment.lines; index += 1) {
          rows.push({
            change: "context",
            oldLineNumber,
            newLineNumber,
            content: stripTrailingNewline(
              fileDiff.additionLines[additionLineIndex] ??
                fileDiff.deletionLines[deletionLineIndex] ??
                "",
            ),
          });
          oldLineNumber += 1;
          newLineNumber += 1;
          deletionLineIndex += 1;
          additionLineIndex += 1;
        }
        continue;
      }

      for (let index = 0; index < segment.deletions; index += 1) {
        rows.push({
          change: "delete",
          oldLineNumber,
          newLineNumber: null,
          content: stripTrailingNewline(fileDiff.deletionLines[deletionLineIndex] ?? ""),
        });
        oldLineNumber += 1;
        deletionLineIndex += 1;
      }

      for (let index = 0; index < segment.additions; index += 1) {
        rows.push({
          change: "add",
          oldLineNumber: null,
          newLineNumber,
          content: stripTrailingNewline(fileDiff.additionLines[additionLineIndex] ?? ""),
        });
        newLineNumber += 1;
        additionLineIndex += 1;
      }
    }
  }

  return rows;
}

function getDiffReviewSelectionPoint(
  line: DiffReviewLine,
): { lineNumber: number; side: SelectionSide } | null {
  if (line.change === "delete" && line.oldLineNumber !== null) {
    return { lineNumber: line.oldLineNumber, side: "deletions" };
  }
  if (line.newLineNumber !== null) {
    return { lineNumber: line.newLineNumber, side: "additions" };
  }
  if (line.oldLineNumber !== null) {
    return { lineNumber: line.oldLineNumber, side: "deletions" };
  }
  return null;
}

export function restoreDiffReviewCommentRange(
  fileDiff: FileDiffMetadata,
  comment: ReviewCommentContext,
): SelectedLineRange | null {
  const lines = buildDiffReviewLines(fileDiff);
  const startLine = lines[comment.startIndex];
  const endLine = lines[comment.endIndex];
  if (!startLine || !endLine) return null;
  const start = getDiffReviewSelectionPoint(startLine);
  const end = getDiffReviewSelectionPoint(endLine);
  if (!start || !end) return null;
  return {
    start: start.lineNumber,
    side: start.side,
    end: end.lineNumber,
    endSide: end.side,
  };
}

function findDiffReviewLineIndex(
  lines: ReadonlyArray<DiffReviewLine>,
  lineNumber: number,
  side: SelectionSide | undefined,
): number {
  const preferredKey = side === "deletions" ? "oldLineNumber" : "newLineNumber";
  const preferredIndex = lines.findIndex((line) => line[preferredKey] === lineNumber);
  if (preferredIndex >= 0) return preferredIndex;
  const fallbackKey = preferredKey === "oldLineNumber" ? "newLineNumber" : "oldLineNumber";
  return lines.findIndex((line) => line[fallbackKey] === lineNumber);
}

function getDiffRange(
  lines: ReadonlyArray<DiffReviewLine>,
  key: "oldLineNumber" | "newLineNumber",
): { start: number; count: number } {
  const numberedLines = lines.filter((line) => line[key] !== null);
  return {
    start: numberedLines[0]?.[key] ?? 0,
    count: numberedLines.length,
  };
}

function getDiffChangeMarker(change: DiffReviewLine["change"]): string {
  if (change === "add") return "+";
  if (change === "delete") return "-";
  return " ";
}

function formatDiffReviewRangeLabel(lines: ReadonlyArray<DiffReviewLine>): string {
  const firstLine = lines[0];
  const lastLine = lines.at(-1);
  if (!firstLine || !lastLine) return "line";
  const firstNumber = firstLine.newLineNumber ?? firstLine.oldLineNumber;
  const lastNumber = lastLine.newLineNumber ?? lastLine.oldLineNumber;
  if (firstNumber === null || lastNumber === null) {
    return lines.length === 1 ? "line" : `${lines.length} lines`;
  }

  const firstMarker = getDiffChangeMarker(firstLine.change).trim();
  const marker =
    firstMarker.length > 0 && lines.every((line) => line.change === firstLine.change)
      ? firstMarker
      : "";
  return firstNumber === lastNumber
    ? `${marker}${firstNumber}`
    : `${marker}${firstNumber} to ${marker}${lastNumber}`;
}

export function buildDiffReviewComment(input: {
  id: string;
  sectionId: string;
  sectionTitle: string;
  filePath: string;
  fileDiff: FileDiffMetadata;
  range: SelectedLineRange;
  text: string;
}): ReviewCommentContext | null {
  const lines = buildDiffReviewLines(input.fileDiff);
  const startIndex = findDiffReviewLineIndex(lines, input.range.start, input.range.side);
  const endIndex = findDiffReviewLineIndex(
    lines,
    input.range.end,
    input.range.endSide ?? input.range.side,
  );
  if (startIndex < 0 || endIndex < 0) return null;

  const normalizedStartIndex = Math.min(startIndex, endIndex);
  const normalizedEndIndex = Math.max(startIndex, endIndex);
  const selectedLines = lines.slice(normalizedStartIndex, normalizedEndIndex + 1);
  const oldRange = getDiffRange(selectedLines, "oldLineNumber");
  const newRange = getDiffRange(selectedLines, "newLineNumber");

  return {
    id: input.id,
    sectionId: input.sectionId,
    sectionTitle: input.sectionTitle,
    filePath: input.filePath,
    startIndex: normalizedStartIndex,
    endIndex: normalizedEndIndex,
    rangeLabel: formatDiffReviewRangeLabel(selectedLines),
    text: input.text.trim(),
    diff: [
      `@@ -${oldRange.start},${oldRange.count} +${newRange.start},${newRange.count} @@`,
      ...selectedLines.map((line) => `${getDiffChangeMarker(line.change)}${line.content}`),
    ].join("\n"),
    fenceLanguage: "diff",
  };
}

export function buildReviewCommentRenderablePatch(comment: ReviewCommentContext): string {
  if ((comment.fenceLanguage ?? "diff") !== "diff") {
    return "";
  }
  const diff = comment.diff.trim();
  if (diff.length === 0) {
    return "";
  }
  if (diff.startsWith("diff --git ")) {
    return diff;
  }

  const normalizedPath = comment.filePath.replaceAll("\\", "/");
  return [
    `diff --git a/${normalizedPath} b/${normalizedPath}`,
    `--- a/${normalizedPath}`,
    `+++ b/${normalizedPath}`,
    diff,
  ].join("\n");
}
