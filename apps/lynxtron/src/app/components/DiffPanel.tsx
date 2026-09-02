import { summarizeChangedFiles } from "@t3tools/client-runtime/presentation/diff";
import { projectFileLineTokens } from "@t3tools/client-runtime/presentation/files";
import type { OrchestrationCheckpointSummary } from "@t3tools/contracts";
import type { ThreadId, TurnId } from "@t3tools/contracts";
import { useEffect, useMemo, useState } from "@lynx-js/react";

import { DiffPanelSurface } from "../../../../web/src/components/DiffPanelSurface";
import { useT3ClientState } from "../state/t3Client";
import { t3ClientActions } from "../state/t3Client";
import { Icon } from "./Icon";
import { LynxChangedFilesTree } from "./LynxChangedFilesTree";
import {
  diffScopeLabel,
  initialDiffScope,
  selectedDiffCheckpoint,
  selectedDiffPreviewSource,
  type LynxDiffScope,
} from "./diffScope.logic";
import { parseUnifiedDiff, type UnifiedDiffFile } from "./unifiedDiff";

type DiffRenderMode = "stacked" | "split";

function LynxDiffStatLabel({
  additions,
  deletions,
}: {
  readonly additions: number;
  readonly deletions: number;
}) {
  return (
    <view className="lynx-diff-stat" aria-label={`${additions} additions, ${deletions} deletions`}>
      <text className="lynx-diff-stat__additions">+{additions}</text>
      <text className="lynx-diff-stat__deletions">−{deletions}</text>
    </view>
  );
}

function latestFirst(
  checkpoints: ReadonlyArray<OrchestrationCheckpointSummary>,
): OrchestrationCheckpointSummary[] {
  return checkpoints
    .filter((checkpoint) => checkpoint.status === "ready")
    .sort(
      (left, right) =>
        right.checkpointTurnCount - left.checkpointTurnCount ||
        right.completedAt.localeCompare(left.completedAt),
    );
}

export function DiffPanel({
  turnId,
  filePath,
}: {
  readonly turnId?: TurnId | null;
  readonly filePath?: string | null;
}) {
  const { activeThreadId, checkpoints, draftThread, projects, sessionStatus, threads } =
    useT3ClientState();
  const orderedCheckpoints = useMemo(() => latestFirst(checkpoints), [checkpoints]);
  const [scope, setScope] = useState<LynxDiffScope>(() => initialDiffScope(turnId));
  const [scopeMenuOpen, setScopeMenuOpen] = useState(false);
  const [turnMenuOpen, setTurnMenuOpen] = useState(false);
  const [diffRenderMode, setDiffRenderMode] = useState<DiffRenderMode>("stacked");
  const [wordWrap, setWordWrap] = useState(false);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [collapsedFiles, setCollapsedFiles] = useState<ReadonlySet<string>>(new Set());
  const [patch, setPatch] = useState("");
  const [patchStatus, setPatchStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [patchError, setPatchError] = useState<string | null>(null);
  useEffect(() => {
    if (turnId !== null && turnId !== undefined) {
      setScope({ kind: "turn", turnId });
    }
  }, [turnId]);
  const selectedCheckpoint = selectedDiffCheckpoint(orderedCheckpoints, scope);
  const activeThread =
    threads.find((thread) => thread.id === activeThreadId) ??
    (draftThread?.id === activeThreadId ? draftThread : undefined);
  const activeProject =
    projects.find((project) => project.id === activeThread?.projectId) ?? projects[0];
  const activeCwd = activeThread?.worktreePath ?? activeProject?.workspaceRoot;
  const parsedFiles = useMemo(() => parseUnifiedDiff(patch), [patch]);
  const total = useMemo(
    () => ({
      additions: parsedFiles.reduce((sum, file) => sum + file.additions, 0),
      deletions: parsedFiles.reduce((sum, file) => sum + file.deletions, 0),
    }),
    [parsedFiles],
  );
  const orderedFiles = useMemo(() => {
    if (!filePath) return parsedFiles;
    return [...parsedFiles].sort((left, right) => {
      if (left.path === filePath) return -1;
      if (right.path === filePath) return 1;
      return 0;
    });
  }, [filePath, parsedFiles]);

  useEffect(() => {
    if (!activeThreadId || (scope.kind === "turn" ? !selectedCheckpoint : !activeCwd)) {
      setPatch("");
      setPatchStatus("idle");
      setPatchError(null);
      return;
    }
    let cancelled = false;
    setPatchStatus("loading");
    setPatchError(null);
    const request =
      scope.kind === "turn" && selectedCheckpoint
        ? t3ClientActions.getTurnDiff({
            threadId: activeThreadId as ThreadId,
            fromTurnCount: Math.max(0, selectedCheckpoint.checkpointTurnCount - 1),
            toTurnCount: selectedCheckpoint.checkpointTurnCount,
            ignoreWhitespace,
          })
        : t3ClientActions
            .getDiffPreview({
              cwd: activeCwd!,
              ignoreWhitespace,
            })
            .then(
              (result) =>
                selectedDiffPreviewSource(
                  result.sources,
                  scope as Extract<LynxDiffScope, { kind: "unstaged" | "branch" }>,
                )?.diff ?? "",
            );
    void request.then(
      (result) => {
        if (cancelled) return;
        setPatch(typeof result === "string" ? result : result.diff);
        setPatchStatus("ready");
      },
      (error) => {
        if (cancelled) return;
        setPatch("");
        setPatchStatus("error");
        setPatchError(error instanceof Error ? error.message : String(error));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [
    activeThreadId,
    activeCwd,
    ignoreWhitespace,
    scope.kind,
    scope.kind === "turn" ? scope.turnId : null,
    selectedCheckpoint?.checkpointTurnCount,
    selectedCheckpoint?.turnId,
  ]);

  const allFilesCollapsed =
    orderedFiles.length > 0 && orderedFiles.every((file) => collapsedFiles.has(file.path));
  const toggleAllFiles = () => {
    setCollapsedFiles(
      allFilesCollapsed ? new Set() : new Set(orderedFiles.map((file) => file.path)),
    );
  };
  const toggleFile = (path: string) => {
    setCollapsedFiles((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };
  const selectedScopeLabel = diffScopeLabel(orderedCheckpoints, scope);
  const selectScope = (nextScope: LynxDiffScope) => {
    setScope(nextScope);
    setScopeMenuOpen(false);
    setTurnMenuOpen(false);
  };

  const header = (
    <>
      <view className="diff-panel-header__scope-wrap lynx-titlebar-no-drag">
        <view
          className="diff-panel-header__scope"
          aria-label={`Diff scope: ${selectedScopeLabel}`}
          data-floating-anchor="diff-scope-menu"
          bindtap={() => setScopeMenuOpen((open) => !open)}
        >
          <text className="diff-panel-header__scope-label" text-maxline="1">
            {selectedScopeLabel}
          </text>
          <Icon name="chevron-down" size={14} color="#818181" />
        </view>
        {scopeMenuOpen ? (
          <>
            <view
              className="diff-panel-header__scope-dismiss"
              bindtap={() => {
                setScopeMenuOpen(false);
                setTurnMenuOpen(false);
              }}
            />
            <view className="diff-panel-header__scope-menu" data-floating-popup="diff-scope-menu">
              <view
                className={`diff-panel-header__scope-item${
                  scope.kind === "unstaged" ? " diff-panel-header__scope-item--active" : ""
                }`}
                data-diff-scope="working-tree"
                bindtap={() => selectScope({ kind: "unstaged" })}
              >
                <text className="diff-panel-header__scope-item-label">Working tree</text>
              </view>
              <view
                className={`diff-panel-header__scope-item${
                  scope.kind === "branch" ? " diff-panel-header__scope-item--active" : ""
                }`}
                data-diff-scope="branch"
                bindtap={() => selectScope({ kind: "branch" })}
              >
                <text className="diff-panel-header__scope-item-label">Branch changes</text>
              </view>
              <view
                className={`diff-panel-header__scope-item${
                  scope.kind === "turn" && selectedCheckpoint === orderedCheckpoints[0]
                    ? " diff-panel-header__scope-item--active"
                    : ""
                }`}
                data-diff-scope="latest-turn"
                bindtap={() => {
                  const latest = orderedCheckpoints[0];
                  if (latest) selectScope({ kind: "turn", turnId: latest.turnId });
                }}
              >
                <text className="diff-panel-header__scope-item-label">Latest turn</text>
              </view>
              <view
                className={`diff-panel-header__scope-item diff-panel-header__scope-item--submenu${
                  turnMenuOpen ? " diff-panel-header__scope-item--active" : ""
                }`}
                data-diff-scope="turn"
                bindtap={() => setTurnMenuOpen((open) => !open)}
              >
                <text className="diff-panel-header__scope-item-label">Turn</text>
                <Icon name="chevron-right" size={14} color="#818181" />
              </view>
              {turnMenuOpen ? (
                <view className="diff-panel-header__scope-submenu">
                  {orderedCheckpoints.map((checkpoint) => (
                    <view
                      key={checkpoint.turnId}
                      className={`diff-panel-header__scope-item${
                        scope.kind === "turn" && checkpoint.turnId === selectedCheckpoint?.turnId
                          ? " diff-panel-header__scope-item--active"
                          : ""
                      }`}
                      data-diff-scope-turn={String(checkpoint.checkpointTurnCount)}
                      bindtap={() => selectScope({ kind: "turn", turnId: checkpoint.turnId })}
                    >
                      <text className="diff-panel-header__scope-item-label">
                        Turn {checkpoint.checkpointTurnCount}
                      </text>
                    </view>
                  ))}
                </view>
              ) : null}
            </view>
          </>
        ) : null}
      </view>
      <view className="diff-panel-header__controls lynx-titlebar-no-drag">
        {orderedFiles.length > 0 || selectedCheckpoint ? (
          <LynxDiffStatLabel additions={total.additions} deletions={total.deletions} />
        ) : null}
        {orderedFiles.length > 0 ? (
          <view
            className="diff-panel-header__icon-button diff-panel-header__collapse"
            aria-label={allFilesCollapsed ? "Expand all files" : "Collapse all files"}
            bindtap={toggleAllFiles}
          >
            <Icon
              name={allFilesCollapsed ? "chevrons-up-down" : "chevrons-down-up"}
              size={14}
              color="#818181"
            />
          </view>
        ) : null}
        <view className="diff-panel-header__segmented">
          <view
            className={`diff-panel-header__segment${
              diffRenderMode === "stacked" ? " diff-panel-header__segment--active" : ""
            }`}
            aria-label="Stacked diff view"
            bindtap={() => setDiffRenderMode("stacked")}
          >
            <Icon name="rows-3" size={14} color="#818181" />
          </view>
          <view
            className={`diff-panel-header__segment${
              diffRenderMode === "split" ? " diff-panel-header__segment--active" : ""
            }`}
            aria-label="Split diff view"
            bindtap={() => setDiffRenderMode("split")}
          >
            <Icon name="columns-2" size={14} color="#818181" />
          </view>
        </view>
        <view
          className={`diff-panel-header__icon-button${
            wordWrap ? " diff-panel-header__icon-button--active" : ""
          }`}
          aria-label={wordWrap ? "Disable diff line wrapping" : "Enable diff line wrapping"}
          bindtap={() => setWordWrap((enabled) => !enabled)}
        >
          <Icon name="text-wrap" size={14} color="#818181" />
        </view>
        <view
          className={`diff-panel-header__icon-button${
            ignoreWhitespace ? " diff-panel-header__icon-button--active" : ""
          }`}
          aria-label={ignoreWhitespace ? "Show whitespace changes" : "Hide whitespace changes"}
          bindtap={() => setIgnoreWhitespace((enabled) => !enabled)}
        >
          <Icon name="pilcrow" size={14} color="#818181" />
        </view>
      </view>
    </>
  );

  return (
    <DiffPanelSurface
      mode="embedded"
      header={header}
      reviewCheckpointCount={orderedCheckpoints.length}
      reviewSelectedTurn={selectedCheckpoint?.turnId ?? ""}
      reviewFileCount={orderedFiles.length}
    >
      <scroll-view
        className="diff-panel"
        scroll-orientation="vertical"
        data-review-selected-file={filePath ?? ""}
      >
        <view className="diff-panel__inner">
          {scope.kind !== "turn" || orderedCheckpoints.length > 0 ? (
            <>
              {patchStatus === "loading" ? (
                <view className="diff-code-state" data-review-patch-loading>
                  <text className="diff-code-state__text">Loading code diff…</text>
                </view>
              ) : patchStatus === "error" ? (
                <view className="diff-code-state diff-code-state--error" data-review-patch-error>
                  <text className="diff-code-state__text">
                    {patchError ?? "Failed to load code diff."}
                  </text>
                </view>
              ) : orderedFiles.length > 0 ? (
                <view className="diff-code-files" data-review-code-diff>
                  {orderedFiles.map((file) => (
                    <LynxCodeDiffFile
                      key={file.path}
                      file={file}
                      selected={file.path === filePath}
                      collapsed={collapsedFiles.has(file.path)}
                      mode={diffRenderMode}
                      wordWrap={wordWrap}
                      onToggle={() => toggleFile(file.path)}
                    />
                  ))}
                </view>
              ) : patchStatus === "ready" ? (
                <view className="diff-panel__summary-fallback" data-review-patch-empty>
                  <view className="diff-panel__summary">
                    <view className="diff-panel__summary-copy">
                      <text className="diff-panel__summary-title">
                        {scope.kind === "turn" ? (selectedCheckpoint?.files.length ?? 0) : 0}{" "}
                        changed{" "}
                        {scope.kind === "turn" && selectedCheckpoint?.files.length === 1
                          ? "file"
                          : "files"}
                      </text>
                      <text className="diff-panel__summary-note">
                        {scope.kind === "turn"
                          ? `Checkpoint for turn ${selectedCheckpoint?.checkpointTurnCount}`
                          : selectedScopeLabel}
                      </text>
                    </view>
                    <LynxDiffStatLabel additions={total.additions} deletions={total.deletions} />
                  </view>
                  <LynxChangedFilesTree
                    files={scope.kind === "turn" ? (selectedCheckpoint?.files ?? []) : []}
                    allDirectoriesExpanded
                    selectedPath={filePath}
                  />
                </view>
              ) : null}
            </>
          ) : (
            <view className="diff-panel__empty" data-review-empty-state>
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
    </DiffPanelSurface>
  );
}

function LynxCodeDiffFile({
  file,
  selected,
  collapsed,
  mode,
  wordWrap,
  onToggle,
}: {
  readonly file: UnifiedDiffFile;
  readonly selected: boolean;
  readonly collapsed: boolean;
  readonly mode: DiffRenderMode;
  readonly wordWrap: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <view
      className={`diff-code-file${selected ? " diff-code-file--selected" : ""}`}
      data-review-code-file={file.path}
      data-review-file-path={file.path}
    >
      <view className="diff-code-file__header" bindtap={onToggle}>
        <view className="diff-code-file__title">
          <Icon
            name="chevron-right"
            size={14}
            color="#818181"
            className={collapsed ? undefined : "rotate-90"}
          />
          <text className="diff-code-file__path">{file.path}</text>
        </view>
        <view className="diff-code-file__stat">
          <text className="diff-code-file__additions">+{file.additions}</text>
          <text className="diff-code-file__deletions">−{file.deletions}</text>
        </view>
      </view>
      {!collapsed ? (
        mode === "split" ? (
          <LynxSplitDiffBody file={file} wordWrap={wordWrap} />
        ) : (
          <view className="diff-code-file__body">
            {file.lines.map((line, index) => (
              <view
                key={`${file.path}:${index}`}
                className={`diff-code-line diff-code-line--${line.kind}${
                  wordWrap ? " diff-code-line--wrap" : ""
                }`}
                data-review-code-line={line.kind}
              >
                <text className="diff-code-line__number">{line.newLine ?? line.oldLine ?? ""}</text>
                <text className="diff-code-line__marker">
                  {line.kind === "addition" ? "+" : line.kind === "deletion" ? "−" : " "}
                </text>
                <text className="diff-code-line__content">
                  {projectFileLineTokens(file.path, line.content || " ").map(
                    (token, tokenIndex) => (
                      <text
                        key={`${file.path}:${index}:${tokenIndex}:${token.tone}`}
                        className={`diff-code-token diff-code-token--${token.tone}`}
                      >
                        {token.text}
                      </text>
                    ),
                  )}
                </text>
              </view>
            ))}
          </view>
        )
      ) : null}
    </view>
  );
}

function LynxSplitDiffBody({
  file,
  wordWrap,
}: {
  readonly file: UnifiedDiffFile;
  readonly wordWrap: boolean;
}) {
  return (
    <view className="diff-code-file__body diff-code-file__body--split">
      {pairSplitLines(file).map((pair, index) => (
        <view key={`${file.path}:split:${index}`} className="diff-code-split-row">
          <LynxSplitDiffCell path={file.path} line={pair.left} side="left" wordWrap={wordWrap} />
          <LynxSplitDiffCell path={file.path} line={pair.right} side="right" wordWrap={wordWrap} />
        </view>
      ))}
    </view>
  );
}

function LynxSplitDiffCell({
  path,
  line,
  side,
  wordWrap,
}: {
  readonly path: string;
  readonly line: UnifiedDiffFile["lines"][number] | null;
  readonly side: "left" | "right";
  readonly wordWrap: boolean;
}) {
  const kind = line?.kind ?? "empty";
  return (
    <view
      className={`diff-code-split-cell diff-code-split-cell--${side} diff-code-line--${kind}${
        wordWrap ? " diff-code-line--wrap" : ""
      }`}
    >
      <text className="diff-code-line__number">
        {line ? ((side === "left" ? line.oldLine : line.newLine) ?? "") : ""}
      </text>
      <text className="diff-code-line__marker">
        {line?.kind === "addition" ? "+" : line?.kind === "deletion" ? "−" : " "}
      </text>
      <text className="diff-code-line__content">
        {projectFileLineTokens(path, line?.content || " ").map((token, tokenIndex) => (
          <text
            key={`${path}:${side}:${tokenIndex}:${token.tone}`}
            className={`diff-code-token diff-code-token--${token.tone}`}
          >
            {token.text}
          </text>
        ))}
      </text>
    </view>
  );
}

function pairSplitLines(file: UnifiedDiffFile) {
  const rows: Array<{
    left: UnifiedDiffFile["lines"][number] | null;
    right: UnifiedDiffFile["lines"][number] | null;
  }> = [];
  let index = 0;
  while (index < file.lines.length) {
    const line = file.lines[index];
    if (!line) break;
    if (line.kind === "context") {
      rows.push({ left: line, right: line });
      index += 1;
      continue;
    }
    const deletions = [];
    const additions = [];
    while (file.lines[index]?.kind === "deletion") {
      deletions.push(file.lines[index]!);
      index += 1;
    }
    while (file.lines[index]?.kind === "addition") {
      additions.push(file.lines[index]!);
      index += 1;
    }
    const rowCount = Math.max(deletions.length, additions.length);
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      rows.push({
        left: deletions[rowIndex] ?? null,
        right: additions[rowIndex] ?? null,
      });
    }
  }
  return rows;
}
