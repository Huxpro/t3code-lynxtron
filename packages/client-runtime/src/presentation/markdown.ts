import {
  formatWorkspaceRelativePath,
  resolvePathLinkTarget,
  splitPathAndPosition,
} from "./paths.ts";

const CODE_FENCE_LANGUAGE_REGEX = /(?:^|\s)language-([^\s]+)/;
const FENCE_TITLE_ATTR_REGEX = /(?:^|\s)(?:title|file(?:name)?)=(?:"([^"]+)"|'([^']+)'|(\S+))/i;
const FENCE_FILENAME_TOKEN_REGEX = /^[\w@][\w@./-]*\.[A-Za-z0-9]+$/;
const MARKDOWN_LINK_HREF_PATTERN = /\[[^\]]*]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
const WINDOWS_DRIVE_PATH_PATTERN = /^[A-Za-z]:[\\/]/;
const WINDOWS_UNC_PATH_PATTERN = /^\\\\/;
const EXTERNAL_SCHEME_PATTERN = /^([A-Za-z][A-Za-z0-9+.-]*):(.*)$/;
const RELATIVE_PATH_PREFIX_PATTERN = /^(~\/|\.{1,2}\/)/;
const RELATIVE_FILE_PATH_PATTERN = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+(?::\d+){0,2}$/;
const RELATIVE_FILE_NAME_PATTERN = /^[A-Za-z0-9._-]+\.[A-Za-z0-9_-]+(?::\d+){0,2}$/;
const POSITION_SUFFIX_PATTERN = /:\d+(?::\d+)?$/;
const POSITION_ONLY_PATTERN = /^\d+(?::\d+)?$/;
const POSIX_FILE_ROOT_PREFIXES = [
  "/Users/",
  "/home/",
  "/tmp/",
  "/var/",
  "/etc/",
  "/opt/",
  "/mnt/",
  "/Volumes/",
  "/private/",
  "/root/",
  "/usr/",
  "/bin/",
  "/sbin/",
  "/lib/",
  "/lib64/",
  "/srv/",
  "/dev/",
  "/proc/",
  "/sys/",
  "/run/",
  "/boot/",
  "/media/",
  "/workspace/",
  "/workspaces/",
] as const;

export interface MarkdownFenceInfo {
  readonly rawLanguage: string | null;
  readonly language: string;
  readonly meta: string | null;
  readonly title: string | null;
}

export interface MarkdownListItemPresentation {
  readonly kind: "ordered" | "unordered";
  readonly marker: string;
  readonly ordinal: number | null;
  readonly depth: number;
  readonly content: string;
  readonly taskChecked: boolean | null;
  readonly taskMarkerOffset: number | null;
}

export interface MarkdownTablePresentation {
  readonly headers: ReadonlyArray<string>;
  readonly alignments: ReadonlyArray<"left" | "center" | "right" | null>;
  readonly rows: ReadonlyArray<ReadonlyArray<string>>;
}

export interface MarkdownInlinePresentation {
  readonly text: string;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly code: boolean;
  readonly href: string | null;
  readonly strikethrough?: boolean;
}

export interface MarkdownFileLinkMeta {
  readonly filePath: string;
  readonly targetPath: string;
  readonly displayPath: string;
  readonly workspaceRelativePath: string | null;
  readonly basename: string;
  readonly line?: number;
  readonly column?: number;
}

/**
 * Resolve the syntax-highlighter language encoded by React Markdown's
 * `language-*` class. The gitignore alias matches the Web highlighter's
 * supported grammar.
 */
export function resolveMarkdownCodeLanguage(className: string | undefined): string {
  const match = className?.match(CODE_FENCE_LANGUAGE_REGEX);
  const raw = match?.[1] ?? "text";
  return raw === "gitignore" ? "ini" : raw;
}

/** Pull a filename out of fence meta: `title="x.ts"` or `src/main.ts`. */
export function extractMarkdownFenceTitle(meta: string | undefined): string | null {
  const normalized = meta?.trim();
  if (!normalized) return null;

  const attrMatch = FENCE_TITLE_ATTR_REGEX.exec(normalized);
  const attrTitle = attrMatch?.[1] ?? attrMatch?.[2] ?? attrMatch?.[3];
  if (attrTitle) return attrTitle;

  return (
    normalized.split(/\s+/).find((candidate) => FENCE_FILENAME_TOKEN_REGEX.test(candidate)) ?? null
  );
}

/**
 * Project the text following an opening Markdown fence into the canonical
 * language/meta/title shape used by renderer hosts.
 */
export function parseMarkdownFenceInfo(info: string | undefined): MarkdownFenceInfo {
  const normalized = info?.trim() ?? "";
  if (normalized.length === 0) {
    return {
      rawLanguage: null,
      language: "text",
      meta: null,
      title: null,
    };
  }

  const separator = normalized.search(/\s/);
  const rawLanguage = separator === -1 ? normalized : normalized.slice(0, separator);
  const meta = separator === -1 ? null : normalized.slice(separator).trim() || null;

  return {
    rawLanguage,
    language: rawLanguage === "gitignore" ? "ini" : rawLanguage,
    meta,
    title: extractMarkdownFenceTitle(meta ?? undefined),
  };
}

/**
 * Parse a single Markdown list-item line without taking a dependency on a DOM
 * or Markdown AST implementation. Offsets are relative to the start of the
 * supplied line.
 */
export function parseMarkdownListItem(line: string): MarkdownListItemPresentation | null {
  const prefix = line.match(/^(\s*)([-+*]|\d+[.)])\s+/);
  if (!prefix?.[2]) return null;

  const indentation = prefix[1]?.replaceAll("\t", "    ").length ?? 0;
  const marker = prefix[2];
  const orderedMatch = marker.match(/^(\d+)[.)]$/);
  const remainder = line.slice(prefix[0].length);
  const taskMatch = remainder.match(/^(\[[ xX]\])/);
  const taskMarkerOffset = taskMatch ? prefix[0].length : null;
  const taskChecked = taskMatch ? taskMatch[1]!.toLowerCase() === "[x]" : null;
  const content = taskMatch ? remainder.slice(taskMatch[1]!.length).replace(/^\s+/, "") : remainder;

  return {
    kind: orderedMatch ? "ordered" : "unordered",
    marker,
    ordinal: orderedMatch?.[1] ? Number.parseInt(orderedMatch[1], 10) : null,
    depth: Math.floor(indentation / 2),
    content,
    taskChecked,
    taskMarkerOffset,
  };
}

function splitMarkdownTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let cell = "";
  let escaped = false;
  for (const character of trimmed) {
    if (escaped) {
      cell += character;
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
      cell += character;
    } else if (character === "|") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());
  return cells;
}

/**
 * Parse a contiguous GFM-style table without depending on a renderer AST.
 * Returns null unless the second line is a valid delimiter row.
 */
export function parseMarkdownTable(lines: ReadonlyArray<string>): MarkdownTablePresentation | null {
  if (lines.length < 2 || !lines[0]?.includes("|")) return null;
  const headers = splitMarkdownTableRow(lines[0]);
  const delimiters = splitMarkdownTableRow(lines[1] ?? "");
  if (
    headers.length === 0 ||
    delimiters.length !== headers.length ||
    delimiters.some((cell) => !/^:?-{3,}:?$/.test(cell))
  ) {
    return null;
  }

  const alignments = delimiters.map((cell) =>
    cell.startsWith(":") && cell.endsWith(":")
      ? ("center" as const)
      : cell.endsWith(":")
        ? ("right" as const)
        : cell.startsWith(":")
          ? ("left" as const)
          : null,
  );
  const rows: string[][] = [];
  for (const line of lines.slice(2)) {
    if (!line.includes("|") || line.trim().length === 0) break;
    const cells = splitMarkdownTableRow(line);
    rows.push(headers.map((_, index) => cells[index] ?? ""));
  }
  return { headers, alignments, rows };
}

export function findMarkdownTaskListMarkerOffset(
  markdown: string,
  listItemStart: number,
): number | null {
  if (
    !Number.isSafeInteger(listItemStart) ||
    listItemStart < 0 ||
    listItemStart > markdown.length
  ) {
    return null;
  }

  const firstLineEnd = markdown.indexOf("\n", listItemStart);
  const firstLine = markdown.slice(
    listItemStart,
    firstLineEnd === -1 ? markdown.length : firstLineEnd,
  );
  const item = parseMarkdownListItem(firstLine);
  return item?.taskMarkerOffset === null || item?.taskMarkerOffset === undefined
    ? null
    : listItemStart + item.taskMarkerOffset;
}

interface MarkdownInlineStyle {
  readonly bold: boolean;
  readonly italic: boolean;
  readonly href: string | null;
  readonly strikethrough?: boolean;
}

const PLAIN_INLINE_STYLE: MarkdownInlineStyle = {
  bold: false,
  italic: false,
  href: null,
};

function appendInlinePresentation(
  output: MarkdownInlinePresentation[],
  presentation: MarkdownInlinePresentation,
): void {
  if (presentation.text.length === 0) return;
  const previous = output[output.length - 1];
  if (
    previous &&
    previous.bold === presentation.bold &&
    previous.italic === presentation.italic &&
    previous.code === presentation.code &&
    previous.href === presentation.href &&
    previous.strikethrough === presentation.strikethrough
  ) {
    output[output.length - 1] = {
      ...previous,
      text: previous.text + presentation.text,
    };
    return;
  }
  output.push(presentation);
}

function findClosingDelimiter(text: string, delimiter: string, from: number): number {
  let cursor = from;
  while (cursor < text.length) {
    const match = text.indexOf(delimiter, cursor);
    if (match === -1) return -1;
    let escapeCount = 0;
    for (let index = match - 1; index >= 0 && text[index] === "\\"; index -= 1) {
      escapeCount += 1;
    }
    if (escapeCount % 2 === 0) return match;
    cursor = match + delimiter.length;
  }
  return -1;
}

function parseMarkdownLinkDestination(source: string): string | null {
  const match = source.match(/^\s*(<[^>\n]+>|[^\s\n]+?)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*$/);
  if (!match?.[1]) return null;
  return normalizeMarkdownLinkHrefKey(match[1]);
}

function parseMarkdownInlineWithStyle(
  text: string,
  style: MarkdownInlineStyle,
): MarkdownInlinePresentation[] {
  const output: MarkdownInlinePresentation[] = [];
  let cursor = 0;

  const append = (value: string, code = false, override?: Partial<MarkdownInlineStyle>) => {
    appendInlinePresentation(output, {
      text: value,
      bold: override?.bold ?? style.bold,
      italic: override?.italic ?? style.italic,
      code,
      href: override?.href ?? style.href,
      ...((override?.strikethrough ?? style.strikethrough) ? { strikethrough: true } : {}),
    });
  };

  while (cursor < text.length) {
    if (text[cursor] === "\\" && cursor + 1 < text.length) {
      append(text[cursor + 1]!);
      cursor += 2;
      continue;
    }

    if (text[cursor] === "[") {
      const labelEnd = findClosingDelimiter(text, "]", cursor + 1);
      if (labelEnd !== -1 && text[labelEnd + 1] === "(") {
        const destinationEnd = findClosingDelimiter(text, ")", labelEnd + 2);
        if (destinationEnd !== -1) {
          const href = parseMarkdownLinkDestination(text.slice(labelEnd + 2, destinationEnd));
          if (href) {
            const label = text.slice(cursor + 1, labelEnd);
            const labelParts = parseMarkdownInlineWithStyle(label, { ...style, href });
            for (const part of labelParts) appendInlinePresentation(output, part);
            cursor = destinationEnd + 1;
            continue;
          }
        }
      }
    }

    if (text[cursor] === "<") {
      const end = text.indexOf(">", cursor + 1);
      if (end !== -1) {
        const destination = text.slice(cursor + 1, end);
        if (/^(?:https?:|mailto:|file:)/i.test(destination)) {
          append(destination, false, {
            href: normalizeMarkdownLinkHrefKey(destination),
          });
          cursor = end + 1;
          continue;
        }
      }
    }

    const urlMatch = text.slice(cursor).match(/^https?:\/\/[^\s<]+/i);
    if (urlMatch?.[0]) {
      const url = urlMatch[0].replace(/[.,;!?]+$/, "");
      append(url, false, { href: url });
      cursor += url.length;
      continue;
    }

    const atAutolinkBoundary = cursor === 0 || /[\s(\[{]/.test(text[cursor - 1]!);
    if (atAutolinkBoundary) {
      const wwwMatch = text.slice(cursor).match(/^www\.[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:\/[^\s<]*)?/);
      if (wwwMatch?.[0]) {
        const value = wwwMatch[0].replace(/[.,;!?]+$/, "");
        append(value, false, { href: `https://${value}` });
        cursor += value.length;
        continue;
      }

      const emailMatch = text
        .slice(cursor)
        .match(/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/);
      if (emailMatch?.[0]) {
        const value = emailMatch[0].replace(/[.,;!?]+$/, "");
        append(value, false, { href: `mailto:${value}` });
        cursor += value.length;
        continue;
      }
    }

    if (text[cursor] === "`") {
      let tickCount = 1;
      while (text[cursor + tickCount] === "`") tickCount += 1;
      const delimiter = "`".repeat(tickCount);
      const end = findClosingDelimiter(text, delimiter, cursor + tickCount);
      if (end !== -1) {
        append(text.slice(cursor + tickCount, end), true);
        cursor = end + tickCount;
        continue;
      }
    }

    const strongDelimiter =
      text.startsWith("**", cursor) || text.startsWith("__", cursor)
        ? text.slice(cursor, cursor + 2)
        : null;
    if (strongDelimiter) {
      const end = findClosingDelimiter(text, strongDelimiter, cursor + 2);
      if (end !== -1) {
        const parts = parseMarkdownInlineWithStyle(text.slice(cursor + 2, end), {
          ...style,
          bold: true,
        });
        for (const part of parts) appendInlinePresentation(output, part);
        cursor = end + 2;
        continue;
      }
    }

    if (text.startsWith("~~", cursor)) {
      const end = findClosingDelimiter(text, "~~", cursor + 2);
      if (end !== -1) {
        const parts = parseMarkdownInlineWithStyle(text.slice(cursor + 2, end), {
          ...style,
          strikethrough: true,
        });
        for (const part of parts) appendInlinePresentation(output, part);
        cursor = end + 2;
        continue;
      }
    }

    const emphasisDelimiter = text[cursor] === "*" || text[cursor] === "_" ? text[cursor]! : null;
    if (emphasisDelimiter) {
      const end = findClosingDelimiter(text, emphasisDelimiter, cursor + 1);
      if (end !== -1) {
        const parts = parseMarkdownInlineWithStyle(text.slice(cursor + 1, end), {
          ...style,
          italic: true,
        });
        for (const part of parts) appendInlinePresentation(output, part);
        cursor = end + 1;
        continue;
      }
    }

    append(text[cursor]!);
    cursor += 1;
  }

  return output;
}

/**
 * Project common inline Markdown into renderer-neutral spans. Hosts decide how
 * spans look and how link activation crosses their platform boundary.
 */
export function parseMarkdownInline(text: string): MarkdownInlinePresentation[] {
  return parseMarkdownInlineWithStyle(text, PLAIN_INLINE_STYLE);
}

export function extractMarkdownLinkHrefs(text: string): string[] {
  const hrefs: string[] = [];
  for (const match of text.matchAll(MARKDOWN_LINK_HREF_PATTERN)) {
    const href = match[1]?.trim();
    if (href) hrefs.push(href);
  }
  return hrefs;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function unwrapMarkdownLinkDestination(value: string): string {
  return value.startsWith("<") && value.endsWith(">") ? value.slice(1, -1) : value;
}

export function normalizeMarkdownLinkDestination(value: string): string {
  return unwrapMarkdownLinkDestination(value.trim());
}

function stripSearchAndHash(value: string): { path: string; hash: string } {
  const hashIndex = value.indexOf("#");
  const pathWithSearch = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
  const rawHash = hashIndex >= 0 ? value.slice(hashIndex) : "";
  const queryIndex = pathWithSearch.indexOf("?");
  const path = queryIndex >= 0 ? pathWithSearch.slice(0, queryIndex) : pathWithSearch;
  return { path, hash: rawHash };
}

function normalizeWindowsDrivePath(path: string): string {
  return /^\/[A-Za-z]:[\\/]/.test(path) ? path.slice(1) : path;
}

function parseFileUrlHref(
  href: string,
  options?: { readonly decodePath?: boolean },
): { path: string; hash: string } | null {
  if (!href.toLowerCase().startsWith("file:")) return null;

  const hashIndex = href.indexOf("#");
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const queryIndex = withoutHash.indexOf("?");
  const withoutSearch = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  let rawPath = withoutSearch.slice("file:".length);

  if (rawPath.startsWith("//")) {
    const authorityAndPath = rawPath.slice(2);
    if (authorityAndPath.startsWith("/")) {
      rawPath = authorityAndPath;
    } else if (authorityAndPath.toLowerCase().startsWith("localhost/")) {
      rawPath = `/${authorityAndPath.slice("localhost/".length)}`;
    } else {
      rawPath = `//${authorityAndPath}`;
    }
  }
  if (rawPath.length === 0) return null;

  const normalizedPath = normalizeWindowsDrivePath(rawPath);
  return {
    path: options?.decodePath === false ? normalizedPath : safeDecode(normalizedPath),
    hash,
  };
}

export function rewriteMarkdownFileUriHref(href: string | undefined): string | null {
  if (!href) return null;
  const normalizedHref = normalizeMarkdownLinkDestination(href);
  const target = parseFileUrlHref(normalizedHref, { decodePath: false });
  return target ? `${target.path}${target.hash}` : null;
}

export function normalizeMarkdownLinkHrefKey(href: string): string {
  const normalizedHref = normalizeMarkdownLinkDestination(href);
  return rewriteMarkdownFileUriHref(normalizedHref) ?? normalizedHref;
}

function looksLikePosixFilesystemPath(path: string): boolean {
  if (!path.startsWith("/")) return false;
  if (POSIX_FILE_ROOT_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  if (POSITION_SUFFIX_PATTERN.test(path)) return true;
  const basename = path.slice(path.lastIndexOf("/") + 1);
  return /\.[A-Za-z0-9_-]+$/.test(basename);
}

function appendLineColumnFromHash(path: string, hash: string): string {
  if (!hash || POSITION_SUFFIX_PATTERN.test(path)) return path;
  const match = hash.match(/^#L(\d+)(?:C(\d+))?$/i);
  if (!match?.[1]) return path;
  return `${path}:${match[1]}${match[2] ? `:${match[2]}` : ""}`;
}

function isLikelyPathCandidate(path: string): boolean {
  if (WINDOWS_DRIVE_PATH_PATTERN.test(path) || WINDOWS_UNC_PATH_PATTERN.test(path)) return true;
  if (RELATIVE_PATH_PREFIX_PATTERN.test(path)) return true;
  if (path.startsWith("/")) return looksLikePosixFilesystemPath(path);
  return RELATIVE_FILE_PATH_PATTERN.test(path) || RELATIVE_FILE_NAME_PATTERN.test(path);
}

function isRelativePath(path: string): boolean {
  return (
    RELATIVE_PATH_PREFIX_PATTERN.test(path) ||
    (!path.startsWith("/") &&
      !WINDOWS_DRIVE_PATH_PATTERN.test(path) &&
      !WINDOWS_UNC_PATH_PATTERN.test(path))
  );
}

function hasExternalScheme(path: string): boolean {
  const match = path.match(EXTERNAL_SCHEME_PATTERN);
  if (!match) return false;
  const rest = match[2] ?? "";
  return rest.startsWith("//") || !POSITION_ONLY_PATTERN.test(rest);
}

export function resolveMarkdownFileLinkTarget(
  href: string | undefined,
  cwd?: string,
): string | null {
  if (!href) return null;
  const rawHref = normalizeMarkdownLinkDestination(href);
  if (rawHref.length === 0 || rawHref.startsWith("#")) return null;

  const fileUrlTarget = rawHref.toLowerCase().startsWith("file:")
    ? parseFileUrlHref(rawHref)
    : null;
  const source = fileUrlTarget ?? stripSearchAndHash(rawHref);
  const decodedPath = normalizeWindowsDrivePath(
    fileUrlTarget ? source.path.trim() : safeDecode(source.path.trim()),
  );
  const decodedHash = safeDecode(source.hash.trim());

  if (decodedPath.length === 0) return null;
  if (
    !WINDOWS_DRIVE_PATH_PATTERN.test(decodedPath) &&
    !WINDOWS_UNC_PATH_PATTERN.test(decodedPath) &&
    hasExternalScheme(decodedPath)
  ) {
    return null;
  }
  if (!isLikelyPathCandidate(decodedPath)) return null;

  const pathWithPosition = appendLineColumnFromHash(decodedPath, decodedHash);
  if (!isRelativePath(pathWithPosition)) return pathWithPosition;
  return cwd ? resolvePathLinkTarget(pathWithPosition, cwd) : null;
}

const INLINE_CODE_DISQUALIFIER_PATTERN = /[\s`]/;
const PATH_SEPARATOR_PATTERN = /[\\/]/;
const FILE_EXTENSION_PATTERN = /\.[A-Za-z0-9_-]+$/;
const NUMERIC_DOTTED_PATTERN = /^\d+(?:\.\d+)+$/;
const BARE_EXTENSIONLESS_POSITION_PATTERN = /^[A-Za-z0-9_-]+(?::\d+){1,2}$/;
const EXTENSIONLESS_FILE_NAMES = new Set([
  "Makefile",
  "makefile",
  "GNUmakefile",
  "Dockerfile",
  "Containerfile",
  "Justfile",
  "justfile",
  "Rakefile",
  "Gemfile",
  "Procfile",
  "Brewfile",
  "Caddyfile",
  "Vagrantfile",
  "Jenkinsfile",
  "Podfile",
  "Fastfile",
  "BUILD",
  "WORKSPACE",
  "LICENSE",
  "LICENCE",
  "COPYING",
  "NOTICE",
  "AUTHORS",
  "CONTRIBUTORS",
  "CHANGELOG",
  "README",
  "CODEOWNERS",
]);
const SINGLE_LABEL_HOSTNAMES = new Set(["localhost"]);
const GENERIC_HOSTNAME_TLDS = new Set([
  "com",
  "net",
  "org",
  "io",
  "dev",
  "app",
  "ai",
  "co",
  "edu",
  "gov",
  "mil",
  "info",
  "biz",
  "xyz",
  "me",
  "tv",
  "cc",
  "gg",
  "chat",
  "cloud",
  "site",
  "online",
  "tech",
  "store",
  "link",
]);
const COUNTRY_HOSTNAME_TLDS = new Set([
  "uk",
  "de",
  "fr",
  "nl",
  "se",
  "no",
  "fi",
  "dk",
  "pl",
  "ch",
  "at",
  "be",
  "es",
  "it",
  "pt",
  "eu",
  "us",
  "ca",
  "au",
  "nz",
  "jp",
  "kr",
  "cn",
  "br",
  "ru",
  "mx",
  "ie",
  "cz",
  "tr",
  "sg",
  "hk",
]);

function looksLikeHostname(segment: string, hasPosition: boolean): boolean {
  if (segment.startsWith(".")) return false;
  const lowered = segment.toLowerCase();
  if (SINGLE_LABEL_HOSTNAMES.has(lowered)) return true;
  if (NUMERIC_DOTTED_PATTERN.test(segment)) return true;
  const labels = lowered.split(".");
  const lastLabel = labels[labels.length - 1];
  if (labels.length < 2 || lastLabel === undefined) return false;
  if (GENERIC_HOSTNAME_TLDS.has(lastLabel)) return true;
  return !hasPosition && COUNTRY_HOSTNAME_TLDS.has(lastLabel);
}

function basenameOfPath(path: string): string {
  const separatorIndex = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return separatorIndex >= 0 ? path.slice(separatorIndex + 1) : path;
}

function workspaceRelativePath(path: string, workspaceRoot: string | undefined): string | null {
  if (!workspaceRoot) return null;
  const normalizedPath = normalizeWindowsDrivePath(path.split("\\").join("/"));
  const normalizedRoot = normalizeWindowsDrivePath(workspaceRoot.split("\\").join("/")).replace(
    /\/+$/,
    "",
  );
  const pathForCompare = normalizedPath.toLowerCase();
  const rootForCompare = normalizedRoot.toLowerCase();
  if (!pathForCompare.startsWith(`${rootForCompare}/`)) return null;
  return normalizedPath.slice(normalizedRoot.length + 1);
}

export function resolveMarkdownFileLinkMeta(
  href: string | undefined,
  cwd?: string,
): MarkdownFileLinkMeta | null {
  const targetPath = resolveMarkdownFileLinkTarget(href, cwd);
  if (!targetPath) return null;
  return buildFileLinkMetaFromTarget(targetPath, cwd);
}

function buildFileLinkMetaFromTarget(targetPath: string, cwd?: string): MarkdownFileLinkMeta {
  const { path, line, column } = splitPathAndPosition(targetPath);
  const parsedLine = line ? Number.parseInt(line, 10) : Number.NaN;
  const parsedColumn = column ? Number.parseInt(column, 10) : Number.NaN;
  const lineNumber = Number.isFinite(parsedLine) ? parsedLine : undefined;
  const columnNumber = Number.isFinite(parsedColumn) ? parsedColumn : undefined;

  return {
    filePath: path,
    targetPath,
    displayPath: formatWorkspaceRelativePath(targetPath, cwd),
    workspaceRelativePath: workspaceRelativePath(path, cwd),
    basename: basenameOfPath(path),
    ...(lineNumber !== undefined ? { line: lineNumber } : {}),
    ...(columnNumber !== undefined ? { column: columnNumber } : {}),
  };
}

/**
 * Inline code spans require stronger path evidence than explicit Markdown
 * links because they commonly contain commands, identifiers, and git refs.
 */
export function resolveInlineCodeFileLinkMeta(
  codeText: string,
  cwd?: string,
): MarkdownFileLinkMeta | null {
  const trimmed = codeText.trim();
  if (trimmed.length === 0 || INLINE_CODE_DISQUALIFIER_PATTERN.test(trimmed)) return null;

  const candidate =
    WINDOWS_DRIVE_PATH_PATTERN.test(trimmed) || WINDOWS_UNC_PATH_PATTERN.test(trimmed)
      ? trimmed
      : trimmed.split("\\").join("/");
  const hasPosition = POSITION_SUFFIX_PATTERN.test(candidate);
  if (!hasPosition && !PATH_SEPARATOR_PATTERN.test(candidate)) return null;

  const hasExplicitPathShape =
    RELATIVE_PATH_PREFIX_PATTERN.test(candidate) ||
    candidate.startsWith("/") ||
    WINDOWS_DRIVE_PATH_PATTERN.test(candidate) ||
    WINDOWS_UNC_PATH_PATTERN.test(candidate);
  if (!hasExplicitPathShape) {
    const withoutPosition = candidate.replace(POSITION_SUFFIX_PATTERN, "");
    const firstSegment = withoutPosition.split("/")[0] ?? withoutPosition;
    if (looksLikeHostname(firstSegment, hasPosition)) return null;
    if (!hasPosition && !FILE_EXTENSION_PATTERN.test(basenameOfPath(withoutPosition))) {
      return null;
    }
  }

  const resolved = resolveMarkdownFileLinkMeta(candidate, cwd);
  if (resolved) return resolved;
  if (
    cwd &&
    BARE_EXTENSIONLESS_POSITION_PATTERN.test(candidate) &&
    EXTENSIONLESS_FILE_NAMES.has(candidate.replace(POSITION_SUFFIX_PATTERN, ""))
  ) {
    return buildFileLinkMetaFromTarget(resolvePathLinkTarget(candidate, cwd), cwd);
  }
  return null;
}

function pathParentSegments(path: string): string[] {
  const normalized = path.split("\\").join("/");
  const segments = normalized.split("/").filter((segment) => segment.length > 0);
  return segments.slice(0, -1);
}

export function buildFileLinkParentSuffixByPath(
  filePaths: ReadonlyArray<string>,
): Map<string, string> {
  const groups = new Map<string, Set<string>>();
  for (const filePath of filePaths) {
    const pathSegments = filePath
      .split("\\")
      .join("/")
      .split("/")
      .filter((segment) => segment.length > 0);
    const basename = pathSegments[pathSegments.length - 1];
    if (!basename) continue;
    const group = groups.get(basename) ?? new Set<string>();
    group.add(filePath);
    groups.set(basename, group);
  }

  const suffixByPath = new Map<string, string>();
  for (const group of groups.values()) {
    const uniquePaths = [...group];
    if (uniquePaths.length < 2) continue;

    const parentSegmentsByPath = new Map(
      uniquePaths.map((filePath) => [filePath, pathParentSegments(filePath)]),
    );
    const minUniqueDepthByPath = new Map<string, number>();

    for (const filePath of uniquePaths) {
      const segments = parentSegmentsByPath.get(filePath) ?? [];
      let resolvedDepth = segments.length;
      for (let depth = 1; depth <= segments.length; depth += 1) {
        const candidate = segments.slice(-depth).join("/");
        const collision = uniquePaths.some((otherPath) => {
          if (otherPath === filePath) return false;
          const otherSegments = parentSegmentsByPath.get(otherPath) ?? [];
          return otherSegments.slice(-depth).join("/") === candidate;
        });
        if (!collision) {
          resolvedDepth = depth;
          break;
        }
      }
      minUniqueDepthByPath.set(filePath, resolvedDepth);
    }

    for (const filePath of uniquePaths) {
      const segments = parentSegmentsByPath.get(filePath) ?? [];
      if (segments.length === 0) continue;
      const minUniqueDepth = minUniqueDepthByPath.get(filePath) ?? 1;
      const suffixDepth = Math.min(segments.length, Math.max(minUniqueDepth, 2));
      suffixByPath.set(filePath, segments.slice(-suffixDepth).join("/"));
    }
  }

  return suffixByPath;
}
