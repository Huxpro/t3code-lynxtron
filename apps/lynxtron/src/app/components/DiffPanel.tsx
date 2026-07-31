import {
  buildChangedFilesTree,
  summarizeChangedFiles,
  type ChangedFilesTreeNode,
} from "@t3tools/client-runtime/presentation/diff";
import type { OrchestrationCheckpointSummary } from "@t3tools/contracts";
import { useMemo, useState, type ReactNode } from "@lynx-js/react";

import { DiffStatLabel, hasNonZeroStat } from "../../../../web/src/components/chat/DiffStatLabel";
import {
  FileTreeChildrenSurface,
  FileTreeDirectoryRowSurface,
  FileTreeFileRowSurface,
} from "../../../../web/src/components/chat/FileTreeSurface";
import { useT3ClientState } from "../state/t3Client";

function latestFirst(
  checkpoints: ReadonlyArray<OrchestrationCheckpointSummary>,
): OrchestrationCheckpointSummary[] {
  return checkpoints
    .filter((checkpoint) => checkpoint.status === "ready" && checkpoint.files.length > 0)
    .sort(
      (left, right) =>
        right.checkpointTurnCount - left.checkpointTurnCount ||
        right.completedAt.localeCompare(left.completedAt),
    );
}

export function DiffPanel() {
  const { checkpoints, sessionStatus } = useT3ClientState();
  const orderedCheckpoints = useMemo(() => latestFirst(checkpoints), [checkpoints]);
  const [selectedTurnId, setSelectedTurnId] = useState<string | null>(null);
  const [collapsedDirectories, setCollapsedDirectories] = useState<Record<string, boolean>>({});
  const selectedCheckpoint =
    orderedCheckpoints.find((checkpoint) => checkpoint.turnId === selectedTurnId) ??
    orderedCheckpoints[0];
  const tree = useMemo(
    () => buildChangedFilesTree(selectedCheckpoint?.files ?? []),
    [selectedCheckpoint],
  );
  const total = useMemo(
    () => summarizeChangedFiles(selectedCheckpoint?.files ?? []),
    [selectedCheckpoint],
  );
  const hasDirectoryNodes = useMemo(() => tree.some((node) => node.kind === "directory"), [tree]);

  const toggleDirectory = (path: string) => {
    setCollapsedDirectories((current) => ({
      ...current,
      [path]: !(current[path] ?? false),
    }));
  };

  const renderTreeNode = (node: ChangedFilesTreeNode, depth: number): ReactNode => {
    if (node.kind === "directory") {
      const expanded = !(collapsedDirectories[node.path] ?? false);
      return (
        <view key={`directory:${node.path}`}>
          <FileTreeDirectoryRowSurface
            name={node.name}
            depth={depth}
            expanded={expanded}
            chevron={<text className="file-tree__chevron-glyph">▸</text>}
            onToggle={() => toggleDirectory(node.path)}
            {...(hasNonZeroStat(node.stat)
              ? {
                  trailing: (
                    <DiffStatLabel
                      additions={node.stat.additions}
                      deletions={node.stat.deletions}
                    />
                  ),
                }
              : {})}
          />
          {expanded ? (
            <FileTreeChildrenSurface>
              {node.children.map((child) => renderTreeNode(child, depth + 1))}
            </FileTreeChildrenSurface>
          ) : null}
        </view>
      );
    }

    return (
      <FileTreeFileRowSurface
        key={`file:${node.path}`}
        name={node.name}
        depth={depth}
        showLeadingSpacer={hasDirectoryNodes || depth > 0}
        {...(node.stat
          ? {
              trailing: (
                <DiffStatLabel additions={node.stat.additions} deletions={node.stat.deletions} />
              ),
            }
          : {})}
      />
    );
  };

  return (
    <scroll-view className="diff-panel" scroll-orientation="vertical">
      <view className="diff-panel__inner">
        {orderedCheckpoints.length > 0 ? (
          <>
            <scroll-view className="diff-panel__scopes" scroll-orientation="horizontal">
              {orderedCheckpoints.map((checkpoint, index) => {
                const active = checkpoint.turnId === selectedCheckpoint?.turnId;
                return (
                  <view
                    key={checkpoint.turnId}
                    className={`diff-panel__scope ${active ? "diff-panel__scope--active" : ""}`}
                    bindtap={() => setSelectedTurnId(checkpoint.turnId)}
                  >
                    <text
                      className={`diff-panel__scope-label ${active ? "diff-panel__scope-label--active" : ""}`}
                    >
                      {index === 0 ? "Latest turn" : `Turn ${checkpoint.checkpointTurnCount}`}
                    </text>
                  </view>
                );
              })}
            </scroll-view>

            <view className="diff-panel__summary">
              <view className="diff-panel__summary-copy">
                <text className="diff-panel__summary-title">
                  {selectedCheckpoint?.files.length ?? 0} changed{" "}
                  {selectedCheckpoint?.files.length === 1 ? "file" : "files"}
                </text>
                <text className="diff-panel__summary-note">
                  Checkpoint for turn {selectedCheckpoint?.checkpointTurnCount}
                </text>
              </view>
              <DiffStatLabel additions={total.additions} deletions={total.deletions} />
            </view>

            <FileTreeChildrenSurface>
              {tree.map((node) => renderTreeNode(node, 0))}
            </FileTreeChildrenSurface>

            <view className="diff-panel__runtime-note">
              <text className="diff-panel__runtime-note-text">
                Full patch rendering is unavailable in the current Lynx runtime; this view uses the
                canonical checkpoint file summary.
              </text>
            </view>
          </>
        ) : (
          <view className="diff-panel__empty">
            <text className="diff-panel__empty-title">
              {sessionStatus === "running" ? "Waiting for checkpoint" : "No turn changes"}
            </text>
            <text className="diff-panel__empty-desc">
              {sessionStatus === "running"
                ? "Changed files appear after the current turn captures its checkpoint."
                : "This thread has no completed checkpoint with changed files."}
            </text>
          </view>
        )}
      </view>
    </scroll-view>
  );
}
