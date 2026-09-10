import { useCallback, useMemo, useState, type ReactNode } from "@lynx-js/react";
import {
  buildChangedFilesTree,
  type ChangedFilesTreeNode,
} from "@t3tools/client-runtime/presentation/diff";
import type { OrchestrationCheckpointFile } from "@t3tools/contracts";

import { hasNonZeroStat } from "../../../../web/src/components/chat/DiffStatLabel";
import {
  FileTreeChildrenSurface,
  FileTreeDirectoryRowSurface,
  FileTreeFileRowSurface,
} from "../../../../web/src/components/chat/FileTreeSurface";
import { Icon } from "./Icon";
import { ProjectFileIcon } from "./ProjectFileIcon";

const EMPTY_DIRECTORY_OVERRIDES: Record<string, boolean> = {};

function LynxDiffStatLabel({
  additions,
  deletions,
}: {
  readonly additions: number;
  readonly deletions: number;
}) {
  return (
    <view className="lynx-diff-stat">
      <text className="lynx-diff-stat__additions">+{additions}</text>
      <text className="lynx-diff-stat__deletions">−{deletions}</text>
    </view>
  );
}

export function LynxChangedFilesTree({
  files,
  onOpenFile,
  onDirectoryToggle,
  allDirectoriesExpanded,
  selectedPath = null,
}: {
  readonly files: ReadonlyArray<OrchestrationCheckpointFile>;
  readonly onOpenFile?: (path: string) => void;
  readonly onDirectoryToggle?: (() => void) | undefined;
  readonly allDirectoriesExpanded: boolean;
  readonly selectedPath?: string | null;
}) {
  const tree = useMemo(() => buildChangedFilesTree(files), [files]);
  const directoryPathsKey = useMemo(() => collectDirectoryPaths(tree).join("\u0000"), [tree]);
  const hasDirectoryNodes = directoryPathsKey.length > 0;
  const expansionStateKey = `${allDirectoriesExpanded ? "expanded" : "collapsed"}\u0000${directoryPathsKey}`;
  const [directoryExpansionState, setDirectoryExpansionState] = useState<{
    key: string;
    overrides: Record<string, boolean>;
  }>(() => ({
    key: expansionStateKey,
    overrides: {},
  }));
  const expandedDirectories =
    directoryExpansionState.key === expansionStateKey
      ? directoryExpansionState.overrides
      : EMPTY_DIRECTORY_OVERRIDES;

  const toggleDirectory = useCallback(
    (pathValue: string) => {
      onDirectoryToggle?.();
      setDirectoryExpansionState((current) => {
        const nextOverrides = current.key === expansionStateKey ? current.overrides : {};
        return {
          key: expansionStateKey,
          overrides: {
            ...nextOverrides,
            [pathValue]: !(nextOverrides[pathValue] ?? allDirectoriesExpanded),
          },
        };
      });
    },
    [allDirectoriesExpanded, expansionStateKey, onDirectoryToggle],
  );

  const renderNode = (node: ChangedFilesTreeNode, depth: number): ReactNode => {
    if (node.kind === "directory") {
      const expanded = expandedDirectories[node.path] ?? allDirectoriesExpanded;
      return (
        <view key={`directory:${node.path}`}>
          <FileTreeDirectoryRowSurface
            name={node.name}
            depth={depth}
            expanded={expanded}
            chevron={<Icon name="chevron-right" size={14} color="#818181" />}
            folderIcon={<Icon name="folder" size={14} color="#818181" />}
            onToggle={() => toggleDirectory(node.path)}
            {...(hasNonZeroStat(node.stat)
              ? {
                  trailing: (
                    <LynxDiffStatLabel
                      additions={node.stat.additions}
                      deletions={node.stat.deletions}
                    />
                  ),
                }
              : {})}
          />
          {expanded ? (
            <FileTreeChildrenSurface>
              {node.children.map((child) => renderNode(child, depth + 1))}
            </FileTreeChildrenSurface>
          ) : null}
        </view>
      );
    }

    return (
      <view
        key={`file:${node.path}`}
        data-review-file-path={node.path}
        data-review-file-selected={node.path === selectedPath ? "true" : "false"}
        className={node.path === selectedPath ? "lynx-file-tree-row--selected" : undefined}
      >
        <FileTreeFileRowSurface
          name={node.name}
          depth={depth}
          showLeadingSpacer={hasDirectoryNodes || depth > 0}
          fileIcon={<ProjectFileIcon path={node.path} />}
          onSelect={onOpenFile ? () => onOpenFile(node.path) : undefined}
          {...(node.stat
            ? {
                trailing: (
                  <LynxDiffStatLabel
                    additions={node.stat.additions}
                    deletions={node.stat.deletions}
                  />
                ),
              }
            : {})}
        />
      </view>
    );
  };

  return (
    <view
      className="lynx-changed-files-tree"
      data-review-tree
      data-review-file-count={String(files.length)}
    >
      <FileTreeChildrenSurface>{tree.map((node) => renderNode(node, 0))}</FileTreeChildrenSurface>
    </view>
  );
}

function collectDirectoryPaths(nodes: ReadonlyArray<ChangedFilesTreeNode>): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.kind !== "directory") continue;
    paths.push(node.path);
    paths.push(...collectDirectoryPaths(node.children));
  }
  return paths;
}
