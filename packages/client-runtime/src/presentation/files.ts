import type { ProjectEntry } from "@t3tools/contracts";

export interface ProjectEntriesSummary {
  readonly fileCount: number;
  readonly directoryCount: number;
  readonly treePaths: ReadonlyArray<string>;
}

export interface ProjectEntryTreeDirectoryNode {
  readonly kind: "directory";
  readonly name: string;
  readonly path: string;
  readonly children: ReadonlyArray<ProjectEntryTreeNode>;
}

export interface ProjectEntryTreeFileNode {
  readonly kind: "file";
  readonly name: string;
  readonly path: string;
}

export type ProjectEntryTreeNode = ProjectEntryTreeDirectoryNode | ProjectEntryTreeFileNode;

export const FILE_DETAIL_INLINE_EXPLORER_MIN_WIDTH = 512;

export interface ProjectFileDetailLayout {
  readonly showBackToFiles: boolean;
  readonly showExplorer: boolean;
}

export function projectFileDetailLayout(panelWidth: number | null): ProjectFileDetailLayout {
  const narrow = panelWidth !== null && panelWidth < FILE_DETAIL_INLINE_EXPLORER_MIN_WIDTH;
  return {
    showBackToFiles: true,
    showExplorer: !narrow,
  };
}

interface MutableDirectoryNode {
  name: string;
  path: string;
  directories: Map<string, MutableDirectoryNode>;
  files: Map<string, ProjectEntryTreeFileNode>;
}

const SORT_LOCALE_OPTIONS: Intl.CollatorOptions = { numeric: true, sensitivity: "base" };

function pathSegments(pathValue: string): string[] {
  return pathValue
    .split("\\")
    .join("/")
    .split("/")
    .filter((segment) => segment.length > 0);
}

function compareByName(left: { readonly name: string }, right: { readonly name: string }): number {
  return left.name.localeCompare(right.name, undefined, SORT_LOCALE_OPTIONS);
}

function ensureDirectory(
  root: MutableDirectoryNode,
  segments: ReadonlyArray<string>,
): MutableDirectoryNode {
  let current = root;
  for (const segment of segments) {
    const nextPath = current.path ? `${current.path}/${segment}` : segment;
    const existing = current.directories.get(segment);
    if (existing) {
      current = existing;
      continue;
    }
    const created: MutableDirectoryNode = {
      name: segment,
      path: nextPath,
      directories: new Map(),
      files: new Map(),
    };
    current.directories.set(segment, created);
    current = created;
  }
  return current;
}

function toTreeNodes(directory: MutableDirectoryNode): ProjectEntryTreeNode[] {
  const directories = Array.from(directory.directories.values())
    .sort(compareByName)
    .map<ProjectEntryTreeDirectoryNode>((child) => ({
      kind: "directory",
      name: child.name,
      path: child.path,
      children: toTreeNodes(child),
    }));
  const files = Array.from(directory.files.values()).sort(compareByName);
  return [...directories, ...files];
}

export function summarizeProjectEntries(
  entries: ReadonlyArray<ProjectEntry>,
): ProjectEntriesSummary {
  let fileCount = 0;
  let directoryCount = 0;
  const treePaths = entries.map((entry) => {
    if (entry.kind === "directory") {
      directoryCount += 1;
      return `${entry.path}/`;
    }
    fileCount += 1;
    return entry.path;
  });
  return { fileCount, directoryCount, treePaths };
}

export function buildProjectEntryTree(
  entries: ReadonlyArray<ProjectEntry>,
): ProjectEntryTreeNode[] {
  const root: MutableDirectoryNode = {
    name: "",
    path: "",
    directories: new Map(),
    files: new Map(),
  };

  for (const entry of entries) {
    const segments = pathSegments(entry.path);
    const name = segments[segments.length - 1];
    if (!name) continue;

    if (entry.kind === "directory") {
      ensureDirectory(root, segments);
      continue;
    }

    const directory = ensureDirectory(root, segments.slice(0, -1));
    const normalizedPath = segments.join("/");
    directory.files.set(normalizedPath, {
      kind: "file",
      name,
      path: normalizedPath,
    });
  }

  return toTreeNodes(root);
}

export const isMarkdownPreviewFile = (path: string): boolean => /\.(?:md|mdx)$/i.test(path);

export type ProjectFileTokenTone =
  | "plain"
  | "muted"
  | "heading"
  | "keyword"
  | "string"
  | "number"
  | "property"
  | "link";

export interface ProjectFileLineToken {
  readonly text: string;
  readonly tone: ProjectFileTokenTone;
}

interface TokenPattern {
  readonly expression: RegExp;
  readonly tone: ProjectFileTokenTone;
}

const STRING_PATTERN = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/gu;
const NUMBER_PATTERN = /\b\d+(?:\.\d+)?\b/gu;
const CODE_KEYWORD_PATTERN =
  /\b(?:async|await|break|case|catch|class|const|continue|default|else|export|extends|false|finally|for|from|function|if|implements|import|in|instanceof|interface|let|new|null|of|return|switch|throw|true|try|type|typeof|undefined|var|while)\b/gu;

function pushFileToken(
  tokens: ProjectFileLineToken[],
  text: string,
  tone: ProjectFileTokenTone,
): void {
  if (!text) return;
  const previous = tokens[tokens.length - 1];
  if (previous?.tone === tone) {
    tokens[tokens.length - 1] = { text: `${previous.text}${text}`, tone };
    return;
  }
  tokens.push({ text, tone });
}

function tokenizeLineWithPatterns(
  line: string,
  patterns: ReadonlyArray<TokenPattern>,
): ProjectFileLineToken[] {
  const tokens: ProjectFileLineToken[] = [];
  let cursor = 0;

  while (cursor < line.length) {
    let selected:
      | {
          readonly index: number;
          readonly text: string;
          readonly tone: ProjectFileTokenTone;
        }
      | undefined;

    for (const pattern of patterns) {
      pattern.expression.lastIndex = cursor;
      const match = pattern.expression.exec(line);
      if (!match?.[0]) continue;
      if (!selected || match.index < selected.index) {
        selected = { index: match.index, text: match[0], tone: pattern.tone };
      }
    }

    if (!selected) {
      pushFileToken(tokens, line.slice(cursor), "plain");
      break;
    }
    if (selected.index > cursor) {
      pushFileToken(tokens, line.slice(cursor, selected.index), "plain");
    }
    pushFileToken(tokens, selected.text, selected.tone);
    cursor = selected.index + selected.text.length;
  }

  return tokens.length > 0 ? tokens : [{ text: line || " ", tone: "plain" }];
}

function markdownLineTokens(line: string): ProjectFileLineToken[] {
  if (/^\s*#{1,6}\s/u.test(line)) return [{ text: line, tone: "heading" }];
  return tokenizeLineWithPatterns(line, [
    { expression: /`[^`]*`/gu, tone: "string" },
    { expression: /https?:\/\/[^\s)>]+/gu, tone: "link" },
    { expression: /(?:\*\*|__)(?=\S)(?:.*?\S)?(?:\*\*|__)/gu, tone: "property" },
    { expression: /^\s*(?:[-*+]|\d+\.)\s+/gu, tone: "muted" },
  ]);
}

function tomlLineTokens(line: string): ProjectFileLineToken[] {
  if (/^\s*\[\[?.+\]?\]\s*$/u.test(line)) return [{ text: line, tone: "heading" }];
  const equalsIndex = line.indexOf("=");
  const patterns: TokenPattern[] = [
    { expression: STRING_PATTERN, tone: "string" },
    { expression: /\b(?:false|true)\b/gu, tone: "keyword" },
    { expression: NUMBER_PATTERN, tone: "number" },
    { expression: /#.*$/gu, tone: "muted" },
  ];
  if (equalsIndex < 0) return tokenizeLineWithPatterns(line, patterns);

  const keyStart = line.search(/\S/u);
  const keyEnd = line.slice(0, equalsIndex).trimEnd().length;
  const tokens: ProjectFileLineToken[] = [];
  if (keyStart > 0) pushFileToken(tokens, line.slice(0, keyStart), "plain");
  if (keyStart >= 0 && keyEnd > keyStart) {
    pushFileToken(tokens, line.slice(keyStart, keyEnd), "property");
  }
  const remainderStart = Math.max(keyEnd, 0);
  for (const token of tokenizeLineWithPatterns(line.slice(remainderStart), patterns)) {
    pushFileToken(tokens, token.text, token.tone);
  }
  return tokens;
}

function codeLineTokens(line: string, json: boolean): ProjectFileLineToken[] {
  return tokenizeLineWithPatterns(line, [
    ...(json ? [{ expression: /"(?:\\.|[^"\\])*"(?=\s*:)/gu, tone: "property" as const }] : []),
    { expression: STRING_PATTERN, tone: "string" },
    { expression: CODE_KEYWORD_PATTERN, tone: "keyword" },
    { expression: NUMBER_PATTERN, tone: "number" },
    { expression: /(?:\/\/|#).*$/gu, tone: "muted" },
  ]);
}

export function projectFileLineTokens(path: string, line: string): ProjectFileLineToken[] {
  if (isMarkdownPreviewFile(path)) return markdownLineTokens(line);
  if (/\.toml$/iu.test(path)) return tomlLineTokens(line);
  if (/\.jsonc?$/iu.test(path)) return codeLineTokens(line, true);
  if (/\.(?:[cm]?[jt]sx?|css|scss|rs|go|py|rb|sh|ya?ml)$/iu.test(path)) {
    return codeLineTokens(line, false);
  }
  return [{ text: line || " ", tone: "plain" }];
}

export function setMarkdownTaskChecked(
  markdown: string,
  markerOffset: number,
  checked: boolean,
): string {
  if (
    markerOffset < 0 ||
    markdown[markerOffset] !== "[" ||
    !/[ xX]/.test(markdown[markerOffset + 1] ?? "") ||
    markdown[markerOffset + 2] !== "]"
  ) {
    return markdown;
  }

  return `${markdown.slice(0, markerOffset + 1)}${checked ? "x" : " "}${markdown.slice(markerOffset + 2)}`;
}

export function fileContentRevision(contents: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < contents.length; index += 1) {
    hash ^= contents.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `${contents.length}:${(hash >>> 0).toString(36)}`;
}

export function projectFileCacheKey(cwd: string, relativePath: string, contents: string): string {
  return `${cwd}:${relativePath}:${fileContentRevision(contents)}`;
}

interface EditorFileIdentity {
  readonly cacheKey?: string;
  readonly contents: string;
}

export function projectFileEditorCacheKey(
  environmentId: string,
  cwd: string,
  relativePath: string,
  contents: string,
  editorFile: EditorFileIdentity | undefined,
): string {
  if (editorFile?.contents === contents && editorFile.cacheKey) {
    return editorFile.cacheKey;
  }
  return `editor:${environmentId}:${projectFileCacheKey(cwd, relativePath, contents)}`;
}
