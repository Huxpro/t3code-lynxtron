import {
  buildChangedFilesTree,
  changedFileName,
  selectChangedFilePreview,
  summarizeChangedFileScopes,
  summarizeChangedFiles,
  type ChangedFilesTreeNode,
} from "@t3tools/client-runtime/presentation/diff";
import { type TurnId } from "@t3tools/contracts";
import { memo, useCallback, useMemo, useState, type ReactNode } from "react";
import { type TurnDiffFileChange } from "../../types";
import {
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  ChevronRightIcon,
  FileDiffIcon,
  FolderIcon,
  FolderClosedIcon,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { DiffStatLabel, hasNonZeroStat } from "./DiffStatLabel";
import {
  FileTreeChildrenSurface,
  FileTreeDirectoryRowSurface,
  FileTreeFileRowSurface,
} from "./FileTreeSurface";
import { ChangedFilesCardSurface } from "./ChangedFilesCardSurface";
import { PierreEntryIcon } from "./PierreEntryIcon";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

const EMPTY_DIRECTORY_OVERRIDES: Record<string, boolean> = {};

export const ChangedFilesCard = memo(function ChangedFilesCard(props: {
  turnId: TurnId;
  files: ReadonlyArray<TurnDiffFileChange>;
  expanded: boolean;
  showCompactPreview: boolean;
  allDirectoriesExpanded: boolean;
  resolvedTheme: "light" | "dark";
  onExpandedChange: (expanded: boolean) => void;
  onToggleAllDirectories: () => void;
  onOpenTurnDiff: (turnId: TurnId, filePath?: string) => void;
}) {
  const {
    turnId,
    files,
    expanded,
    showCompactPreview,
    allDirectoriesExpanded,
    resolvedTheme,
    onExpandedChange,
    onToggleAllDirectories,
    onOpenTurnDiff,
  } = props;
  const summaryStat = useMemo(() => summarizeChangedFiles(files), [files]);
  const scopeSummary = useMemo(() => summarizeChangedFileScopes(files), [files]);
  const previewFiles = useMemo(() => selectChangedFilePreview(files), [files]);
  const compactPreviewVisible = showCompactPreview && !expanded;

  return (
    <ChangedFilesCardSurface
      turnId={String(turnId)}
      fileCount={files.length}
      expanded={expanded}
      compactPreviewVisible={compactPreviewVisible}
      toggleIcon={<ChevronRightIcon aria-hidden="true" className="size-3.5" />}
      hintClassName="hidden group-hover:text-foreground/80 sm:inline"
      stat={
        hasNonZeroStat(summaryStat) ? (
          <DiffStatLabel
            additions={summaryStat.additions}
            className="text-xs leading-4"
            deletions={summaryStat.deletions}
            layout="inline"
          />
        ) : undefined
      }
      foldersControl={
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                size="icon-xs"
                variant="outline"
                className="!size-[22px]"
                aria-label={
                  allDirectoriesExpanded ? "Collapse all folders" : "Expand all folders"
                }
                data-scroll-anchor-ignore
                onClick={onToggleAllDirectories}
              />
            }
          >
            {allDirectoriesExpanded ? (
              <ChevronsDownUpIcon className="size-3" />
            ) : (
              <ChevronsUpDownIcon className="size-3" />
            )}
          </TooltipTrigger>
          <TooltipPopup side="top">
            {allDirectoriesExpanded ? "Collapse all folders" : "Expand all folders"}
          </TooltipPopup>
        </Tooltip>
      }
      openDiffControl={
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                size="xs"
                variant="outline"
                aria-label="Open diff"
                data-review-open-diff
                onClick={() => onOpenTurnDiff(turnId, files[0]?.path)}
              />
            }
          >
            <FileDiffIcon className="size-3" />
            <span className="hidden sm:inline">Open diff</span>
          </TooltipTrigger>
          <TooltipPopup side="top">Open the full diff</TooltipPopup>
        </Tooltip>
      }
      previewScopes={scopeSummary.map((scope) => ({
        key: scope.label,
        label: scope.label,
        fileCount: scope.fileCount,
      }))}
      previewFiles={previewFiles.map((file) => ({
        key: file.path,
        name: changedFileName(file.path),
        title: file.path,
        icon: (
          <PierreEntryIcon
            pathValue={file.path}
            kind="file"
            theme={resolvedTheme}
            className="size-3 shrink-0 text-muted-foreground/70"
          />
        ),
        onSelect: () => onOpenTurnDiff(turnId, file.path),
      }))}
      expandedBody={
        <ChangedFilesTree
          key={`changed-files-tree:${turnId}`}
          turnId={turnId}
          files={files}
          allDirectoriesExpanded={allDirectoriesExpanded}
          resolvedTheme={resolvedTheme}
          onOpenTurnDiff={onOpenTurnDiff}
        />
      }
      onExpandedChange={onExpandedChange}
      onShowAll={() => onExpandedChange(true)}
    />
  );
});

export const ChangedFilesTree = memo(function ChangedFilesTree(props: {
  turnId: TurnId;
  files: ReadonlyArray<TurnDiffFileChange>;
  allDirectoriesExpanded: boolean;
  resolvedTheme: "light" | "dark";
  onOpenTurnDiff: (turnId: TurnId, filePath?: string) => void;
}) {
  const { files, allDirectoriesExpanded, onOpenTurnDiff, resolvedTheme, turnId } = props;
  const treeNodes = useMemo(() => buildChangedFilesTree(files), [files]);
  const directoryPathsKey = useMemo(
    () => collectDirectoryPaths(treeNodes).join("\u0000"),
    [treeNodes],
  );
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
    [allDirectoriesExpanded, expansionStateKey],
  );

  const renderTreeNode = (node: ChangedFilesTreeNode, depth: number): ReactNode => {
    if (node.kind === "directory") {
      const isExpanded = expandedDirectories[node.path] ?? allDirectoriesExpanded;
      return (
        <div key={`dir:${node.path}`}>
          <FileTreeDirectoryRowSurface
            name={node.name}
            depth={depth}
            expanded={isExpanded}
            chevron={<ChevronRightIcon className="size-3.5" />}
            folderIcon={
              isExpanded ? (
                <FolderIcon className="size-3.5 shrink-0 text-muted-foreground/75" />
              ) : (
                <FolderClosedIcon className="size-3.5 shrink-0 text-muted-foreground/75" />
              )
            }
            onToggle={() => toggleDirectory(node.path)}
            scrollAnchorIgnore
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
          {isExpanded && (
            <FileTreeChildrenSurface>
              {node.children.map((childNode) => renderTreeNode(childNode, depth + 1))}
            </FileTreeChildrenSurface>
          )}
        </div>
      );
    }

    return (
      <FileTreeFileRowSurface
        key={`file:${node.path}`}
        name={node.name}
        depth={depth}
        showLeadingSpacer={hasDirectoryNodes || depth > 0}
        fileIcon={
          <PierreEntryIcon
            pathValue={node.path}
            kind="file"
            theme={resolvedTheme}
            className="size-3.5 text-muted-foreground/70"
          />
        }
        onSelect={() => onOpenTurnDiff(turnId, node.path)}
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
    <div data-review-tree data-review-file-count={String(files.length)}>
      <FileTreeChildrenSurface>
        {treeNodes.map((node) => renderTreeNode(node, 0))}
      </FileTreeChildrenSurface>
    </div>
  );
});

function collectDirectoryPaths(nodes: ReadonlyArray<ChangedFilesTreeNode>): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.kind !== "directory") continue;
    paths.push(node.path);
    paths.push(...collectDirectoryPaths(node.children));
  }
  return paths;
}
