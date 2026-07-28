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
