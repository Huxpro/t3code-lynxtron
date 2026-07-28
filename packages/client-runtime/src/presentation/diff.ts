import type { OrchestrationCheckpointFile } from "@t3tools/contracts";

export type ChangedFile = OrchestrationCheckpointFile;

export interface ChangedFilesStat {
  readonly additions: number;
  readonly deletions: number;
}

export interface ChangedFilesTreeDirectoryNode {
  readonly kind: "directory";
  readonly name: string;
  readonly path: string;
  readonly stat: ChangedFilesStat;
  readonly children: ReadonlyArray<ChangedFilesTreeNode>;
}

export interface ChangedFilesTreeFileNode {
  readonly kind: "file";
  readonly name: string;
  readonly path: string;
  readonly stat: ChangedFilesStat;
}

export type ChangedFilesTreeNode = ChangedFilesTreeDirectoryNode | ChangedFilesTreeFileNode;

export interface ChangedFilesScopeSummary {
  readonly label: string;
  readonly fileCount: number;
}

interface MutableDirectoryNode {
  name: string;
  path: string;
  stat: ChangedFilesStat;
  directories: Map<string, MutableDirectoryNode>;
  files: ChangedFilesTreeFileNode[];
}

export const CHANGED_FILES_AUTO_EXPAND_FILE_LIMIT = 5;
export const CHANGED_FILES_AUTO_EXPAND_LINE_LIMIT = 200;
export const CHANGED_FILES_PREVIEW_FILE_LIMIT = 3;
export const CHANGED_FILES_PREVIEW_SCOPE_LIMIT = 4;

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

function compactDirectoryNode(node: ChangedFilesTreeDirectoryNode): ChangedFilesTreeDirectoryNode {
  const compactedChildren = node.children.map((child) =>
    child.kind === "directory" ? compactDirectoryNode(child) : child,
  );

  let compactedNode: ChangedFilesTreeDirectoryNode = {
    ...node,
    children: compactedChildren,
  };

  while (compactedNode.children.length === 1 && compactedNode.children[0]?.kind === "directory") {
    const onlyChild = compactedNode.children[0];
    compactedNode = {
      kind: "directory",
      name: `${compactedNode.name}/${onlyChild.name}`,
      path: onlyChild.path,
      stat: onlyChild.stat,
      children: onlyChild.children,
    };
  }

  return compactedNode;
}

function toTreeNodes(directory: MutableDirectoryNode): ChangedFilesTreeNode[] {
  const subdirectories = Array.from(directory.directories.values())
    .sort(compareByName)
    .map<ChangedFilesTreeDirectoryNode>((subdirectory) => ({
      kind: "directory",
      name: subdirectory.name,
      path: subdirectory.path,
      stat: subdirectory.stat,
      children: toTreeNodes(subdirectory),
    }))
    .map(compactDirectoryNode);

  return [...subdirectories, ...[...directory.files].sort(compareByName)];
}

export function changedFileName(pathValue: string): string {
  const segments = pathSegments(pathValue);
  return segments[segments.length - 1] ?? pathValue;
}

export function summarizeChangedFiles(files: ReadonlyArray<ChangedFile>): ChangedFilesStat {
  return files.reduce(
    (accumulator, file) => ({
      additions: accumulator.additions + file.additions,
      deletions: accumulator.deletions + file.deletions,
    }),
    { additions: 0, deletions: 0 },
  );
}

export function buildChangedFilesTree(files: ReadonlyArray<ChangedFile>): ChangedFilesTreeNode[] {
  const root: MutableDirectoryNode = {
    name: "",
    path: "",
    stat: { additions: 0, deletions: 0 },
    directories: new Map(),
    files: [],
  };

  for (const file of files) {
    const segments = pathSegments(file.path);
    const fileName = segments[segments.length - 1];
    if (!fileName) continue;

    const filePath = segments.join("/");
    const ancestors: MutableDirectoryNode[] = [root];
    let currentDirectory = root;

    for (const segment of segments.slice(0, -1)) {
      const nextPath = currentDirectory.path ? `${currentDirectory.path}/${segment}` : segment;
      const existing = currentDirectory.directories.get(segment);
      if (existing) {
        currentDirectory = existing;
      } else {
        const created: MutableDirectoryNode = {
          name: segment,
          path: nextPath,
          stat: { additions: 0, deletions: 0 },
          directories: new Map(),
          files: [],
        };
        currentDirectory.directories.set(segment, created);
        currentDirectory = created;
      }
      ancestors.push(currentDirectory);
    }

    currentDirectory.files.push({
      kind: "file",
      name: fileName,
      path: filePath,
      stat: { additions: file.additions, deletions: file.deletions },
    });

    for (const ancestor of ancestors) {
      ancestor.stat = {
        additions: ancestor.stat.additions + file.additions,
        deletions: ancestor.stat.deletions + file.deletions,
      };
    }
  }

  return toTreeNodes(root);
}

export function shouldAutoExpandChangedFiles(
  files: ReadonlyArray<ChangedFile>,
  isLatestTurn: boolean,
): boolean {
  if (!isLatestTurn || files.length > CHANGED_FILES_AUTO_EXPAND_FILE_LIMIT) return false;
  const stat = summarizeChangedFiles(files);
  return stat.additions + stat.deletions <= CHANGED_FILES_AUTO_EXPAND_LINE_LIMIT;
}

function changedFileScope(pathValue: string): string {
  const segments = pathSegments(pathValue);
  return segments.length > 1 ? (segments[0] ?? "root") : "root";
}

export function summarizeChangedFileScopes(
  files: ReadonlyArray<ChangedFile>,
  limit = CHANGED_FILES_PREVIEW_SCOPE_LIMIT,
): ChangedFilesScopeSummary[] {
  const scopes = new Map<string, { fileCount: number; firstIndex: number }>();
  files.forEach((file, index) => {
    const label = changedFileScope(file.path);
    const current = scopes.get(label);
    scopes.set(label, {
      fileCount: (current?.fileCount ?? 0) + 1,
      firstIndex: current?.firstIndex ?? index,
    });
  });

  return Array.from(scopes, ([label, scope]) => ({
    label,
    fileCount: scope.fileCount,
    firstIndex: scope.firstIndex,
  }))
    .sort(
      (left, right) =>
        right.fileCount - left.fileCount ||
        left.firstIndex - right.firstIndex ||
        left.label.localeCompare(right.label),
    )
    .slice(0, limit)
    .map(({ label, fileCount }) => ({ label, fileCount }));
}

export function selectChangedFilePreview(
  files: ReadonlyArray<ChangedFile>,
  limit = CHANGED_FILES_PREVIEW_FILE_LIMIT,
): ChangedFile[] {
  const selected: ChangedFile[] = [];
  const selectedPaths = new Set<string>();
  const selectedScopes = new Set<string>();

  for (const file of files) {
    const scope = changedFileScope(file.path);
    if (selectedScopes.has(scope)) continue;
    selected.push(file);
    selectedPaths.add(file.path);
    selectedScopes.add(scope);
    if (selected.length === limit) return selected;
  }

  for (const file of files) {
    if (selectedPaths.has(file.path)) continue;
    selected.push(file);
    if (selected.length === limit) break;
  }

  return selected;
}
