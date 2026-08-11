export type UnifiedDiffLineKind = "context" | "addition" | "deletion";

export interface UnifiedDiffLine {
  readonly kind: UnifiedDiffLineKind;
  readonly content: string;
  readonly oldLine: number | null;
  readonly newLine: number | null;
}

export interface UnifiedDiffFile {
  readonly path: string;
  readonly additions: number;
  readonly deletions: number;
  readonly lines: ReadonlyArray<UnifiedDiffLine>;
}

const DIFF_HEADER = /^diff --git a\/(.+) b\/(.+)$/u;
const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/u;

export function parseUnifiedDiff(patch: string): ReadonlyArray<UnifiedDiffFile> {
  const files: Array<{
    path: string;
    additions: number;
    deletions: number;
    lines: UnifiedDiffLine[];
  }> = [];
  let current:
    | {
        path: string;
        additions: number;
        deletions: number;
        lines: UnifiedDiffLine[];
      }
    | undefined;
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;

  for (const rawLine of patch.replace(/\r\n/gu, "\n").split("\n")) {
    const fileHeader = DIFF_HEADER.exec(rawLine);
    if (fileHeader) {
      current = {
        path: fileHeader[2] ?? fileHeader[1] ?? "",
        additions: 0,
        deletions: 0,
        lines: [],
      };
      files.push(current);
      inHunk = false;
      continue;
    }
    if (!current) continue;

    const hunkHeader = HUNK_HEADER.exec(rawLine);
    if (hunkHeader) {
      oldLine = Number(hunkHeader[1]);
      newLine = Number(hunkHeader[2]);
      inHunk = true;
      continue;
    }
    if (!inHunk || rawLine === "\\ No newline at end of file") continue;

    if (rawLine.startsWith("+") && !rawLine.startsWith("+++")) {
      current.lines.push({
        kind: "addition",
        content: rawLine.slice(1),
        oldLine: null,
        newLine,
      });
      current.additions += 1;
      newLine += 1;
      continue;
    }
    if (rawLine.startsWith("-") && !rawLine.startsWith("---")) {
      current.lines.push({
        kind: "deletion",
        content: rawLine.slice(1),
        oldLine,
        newLine: null,
      });
      current.deletions += 1;
      oldLine += 1;
      continue;
    }
    if (rawLine.startsWith(" ")) {
      current.lines.push({
        kind: "context",
        content: rawLine.slice(1),
        oldLine,
        newLine,
      });
      oldLine += 1;
      newLine += 1;
    }
  }

  return files.filter((file) => file.path.length > 0 && file.lines.length > 0);
}
