import {
  buildChangedFilesTree,
  summarizeChangedFiles,
  type ChangedFilesTreeNode,
} from "@t3tools/client-runtime/presentation/diff";
import type { OrchestrationCheckpointSummary } from "@t3tools/contracts";
import { useMemo, useState, type ReactNode } from "@lynx-js/react";

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

function renderTreeNode(node: ChangedFilesTreeNode, depth: number): ReactNode {
  const indentation = depth * 12;
  if (node.kind === "directory") {
    return (
      <view key={`directory:${node.path}`} className="diff-panel__tree-group">
        <view className="diff-panel__tree-row" style={{ paddingLeft: indentation } as any}>
          <text className="diff-panel__tree-marker">▾</text>
          <text className="diff-panel__tree-directory">{node.name}</text>
          <view className="diff-panel__file-stats">
            <text className="diff-panel__file-additions">+{node.stat.additions}</text>
            <text className="diff-panel__file-deletions">−{node.stat.deletions}</text>
          </view>
        </view>
        {node.children.map((child) => renderTreeNode(child, depth + 1))}
      </view>
    );
  }

  return (
    <view
      key={`file:${node.path}`}
      className="diff-panel__tree-row"
      style={{ paddingLeft: indentation } as any}
    >
      <text className="diff-panel__tree-marker">·</text>
      <text className="diff-panel__file-path">{node.name}</text>
      <view className="diff-panel__file-stats">
        <text className="diff-panel__file-additions">+{node.stat.additions}</text>
        <text className="diff-panel__file-deletions">−{node.stat.deletions}</text>
      </view>
    </view>
  );
}

export function DiffPanel() {
  const { checkpoints, sessionStatus } = useT3ClientState();
  const orderedCheckpoints = useMemo(() => latestFirst(checkpoints), [checkpoints]);
  const [selectedTurnId, setSelectedTurnId] = useState<string | null>(null);
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
              <view className="diff-panel__file-stats">
                <text className="diff-panel__file-additions">+{total.additions}</text>
                <text className="diff-panel__file-deletions">−{total.deletions}</text>
              </view>
            </view>

            <view className="diff-panel__files">{tree.map((node) => renderTreeNode(node, 0))}</view>

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
