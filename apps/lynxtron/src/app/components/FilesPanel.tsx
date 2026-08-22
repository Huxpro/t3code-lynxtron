import {
  buildProjectEntryTree,
  fileContentRevision,
  projectFileDetailLayout,
  projectFileLineTokens,
  type ProjectEntryTreeNode,
} from "@t3tools/client-runtime/presentation/files";
import { getProjectFilePickerMatches } from "@t3tools/client-runtime/presentation/file-picker";
import { FileSaveCoordinator } from "@t3tools/client-runtime/state/file-save-coordinator";
import type { ProjectEntry, ProjectReadFileResult } from "@t3tools/contracts";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "@lynx-js/react";

import {
  FileTreeChildrenSurface,
  FileTreeDirectoryRowSurface,
  FileTreeFileRowSurface,
} from "../../../../web/src/components/chat/FileTreeSurface";
import { t3ClientActions, useT3ClientState } from "../state/t3Client";
import { uiActions } from "../state/uiState";
import { Icon } from "./Icon";

interface ListingState {
  readonly cwd: string | null;
  readonly entries: ReadonlyArray<ProjectEntry>;
  readonly truncated: boolean;
  readonly pending: boolean;
  readonly error: string | null;
}

interface PreviewState {
  readonly path: string | null;
  readonly result: ProjectReadFileResult | null;
  readonly pending: boolean;
  readonly error: string | null;
}

const EMPTY_LISTING: ListingState = {
  cwd: null,
  entries: [],
  truncated: false,
  pending: false,
  error: null,
};

const FILE_SAVE_SCHEDULER = {
  now: () => Date.now(),
  schedule: (callback: () => void, delayMs: number) => setTimeout(callback, delayMs),
  cancel: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function EditableFilePreview({
  cwd,
  path,
  result,
}: {
  cwd: string;
  path: string;
  result: ProjectReadFileResult;
}) {
  const [contents, setContents] = useState(result.contents);
  const [editing, setEditing] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "pending" | "error">("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const coordinator = useMemo(
    () =>
      new FileSaveCoordinator({
        debounceMs: 500,
        scheduler: FILE_SAVE_SCHEDULER,
        onPendingChange: (pending) => {
          if (pending) setSaveError(null);
          setSaveStatus(pending ? "pending" : "saved");
        },
        onConfirmed: () => {
          setSaveError(null);
        },
        onFailure: (failure) => {
          const error =
            failure._tag === "Exception" ? failure.error : new Error("Unable to save this file.");
          setSaveError(errorMessage(error));
          setSaveStatus("error");
        },
        persist: async (nextContents) => {
          await t3ClientActions.writeProjectFile(cwd, path, nextContents);
          return { _tag: "Success" as const };
        },
      }),
    [cwd, path],
  );

  useEffect(() => () => coordinator.dispose(), [coordinator]);

  const handleInput = useCallback(
    (event: { detail: { value: string } }) => {
      setContents(event.detail.value);
      setSaveError(null);
      coordinator.change(event.detail.value);
    },
    [coordinator],
  );
  const flush = useCallback(() => {
    void coordinator.flush();
  }, [coordinator]);

  if (result.truncated) {
    return (
      <view
        className="file-panel__editor-surface"
        data-file-content-revision={fileContentRevision(result.contents)}
      >
        <scroll-view className="file-panel__source-scroll" scroll-orientation="vertical">
          <text className="files-panel__preview-content">{result.contents}</text>
        </scroll-view>
        <view className="file-panel__statusbar">
          <text className="files-panel__preview-status">
            Preview truncated. Editing is disabled to protect the complete file.
          </text>
        </view>
      </view>
    );
  }

  return (
    <view
      className="file-panel__editor-surface"
      data-file-content-revision={fileContentRevision(contents)}
    >
      {editing ? (
        <textarea
          className="files-panel__editor"
          data-file-editor-mode="editing"
          {...({ value: contents } as object)}
          bindinput={handleInput}
          bindblur={() => {
            flush();
            setEditing(false);
          }}
        />
      ) : (
        <scroll-view
          className="file-editor-preview"
          data-file-editor-mode="preview"
          scroll-orientation="vertical"
          bindtap={() => setEditing(true)}
        >
          <view className="file-editor-preview__content">
            {contents.split("\n").map((line, index) => (
              <view key={`${index}:${line}`} className="file-editor-line">
                <text className="file-editor-line__number">{index + 1}</text>
                <text className="file-editor-line__content">
                  {projectFileLineTokens(path, line).map((token, tokenIndex) => (
                    <text
                      key={`${tokenIndex}:${token.tone}:${token.text}`}
                      className={`file-editor-token file-editor-token--${token.tone}`}
                    >
                      {token.text}
                    </text>
                  ))}
                </text>
              </view>
            ))}
          </view>
        </scroll-view>
      )}
      {saveStatus !== "saved" || saveError ? (
        <view
          className="file-panel__statusbar"
          data-file-save-error={saveStatus === "error" ? "true" : "false"}
        >
          <text
            className={`files-panel__preview-status${
              saveStatus === "error" ? " files-panel__preview-status--error" : ""
            }`}
          >
            {saveError ?? (saveStatus === "pending" ? "Unsaved changes" : "Save failed")}
          </text>
          <view
            className="files-panel__save"
            data-file-save-retry={saveStatus === "error" ? "true" : "false"}
            bindtap={flush}
          >
            <text className="files-panel__save-label">
              {saveStatus === "error" ? "Retry save" : "Save now"}
            </text>
          </view>
        </view>
      ) : null}
    </view>
  );
}

function renderTreeNode(
  node: ProjectEntryTreeNode,
  depth: number,
  hasDirectoryNodes: boolean,
  expandedDirectories: Readonly<Record<string, boolean>>,
  selectedPath: string | null,
  onToggleDirectory: (path: string) => void,
  onSelectFile: (path: string) => void,
): ReactNode {
  if (node.kind === "directory") {
    const expanded = expandedDirectories[node.path] ?? depth === 0;
    return (
      <view key={`directory:${node.path}`}>
        <FileTreeDirectoryRowSurface
          name={node.name}
          depth={depth}
          expanded={expanded}
          chevron={<text className="file-tree__chevron-glyph">▸</text>}
          folderIcon={<Icon name="folder" size={14} color="#71717a" />}
          onToggle={() => onToggleDirectory(node.path)}
        />
        {expanded ? (
          <FileTreeChildrenSurface>
            {node.children.map((child) =>
              renderTreeNode(
                child,
                depth + 1,
                hasDirectoryNodes,
                expandedDirectories,
                selectedPath,
                onToggleDirectory,
                onSelectFile,
              ),
            )}
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
      selected={node.path === selectedPath}
      fileIcon={<Icon name="file-json" size={14} color="#71717a" />}
      onSelect={() => onSelectFile(node.path)}
    />
  );
}

export function FilesPanel({
  selectedPath = null,
}: { readonly selectedPath?: string | null } = {}) {
  const { activeThreadId, draftThread, projects, threads } = useT3ClientState();
  const [listing, setListing] = useState<ListingState>(EMPTY_LISTING);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [expandedDirectories, setExpandedDirectories] = useState<Record<string, boolean>>({});

  const project = useMemo(() => {
    const activeThread =
      threads.find((thread) => thread.id === activeThreadId) ??
      (draftThread?.id === activeThreadId ? draftThread : undefined);
    return (
      projects.find((candidate) => candidate.id === activeThread?.projectId) ?? projects[0] ?? null
    );
  }, [activeThreadId, draftThread, projects, threads]);
  const activeThread =
    threads.find((thread) => thread.id === activeThreadId) ??
    (draftThread?.id === activeThreadId ? draftThread : undefined);
  const cwd = activeThread?.worktreePath ?? project?.workspaceRoot ?? null;

  useEffect(() => {
    if (!cwd) {
      setListing(EMPTY_LISTING);
      return;
    }

    let cancelled = false;
    setListing((current) => ({
      cwd,
      entries: current.cwd === cwd ? current.entries : [],
      truncated: current.cwd === cwd && current.truncated,
      pending: true,
      error: null,
    }));
    void t3ClientActions
      .listProjectEntries(cwd)
      .then((result) => {
        if (cancelled) return;
        setListing({
          cwd,
          entries: result.entries,
          truncated: result.truncated,
          pending: false,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setListing({
          cwd,
          entries: [],
          truncated: false,
          pending: false,
          error: errorMessage(error),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [cwd, refreshVersion]);

  const visibleEntries = useMemo<ReadonlyArray<ProjectEntry>>(() => {
    if (!search.trim()) return listing.entries;
    return getProjectFilePickerMatches(listing.entries, search, listing.entries.length).map(
      (entry) => ({ kind: "file", path: entry.path }),
    );
  }, [listing.entries, search]);
  const tree = useMemo(() => buildProjectEntryTree(visibleEntries), [visibleEntries]);
  const hasDirectoryNodes = useMemo(() => tree.some((node) => node.kind === "directory"), [tree]);

  const toggleDirectory = useCallback((path: string) => {
    setExpandedDirectories((current) => ({
      ...current,
      [path]: !(current[path] ?? true),
    }));
  }, []);

  const selectFile = useCallback((path: string) => uiActions.openFileSurface(path), []);

  return (
    <view className="files-panel">
      {cwd && project ? (
        <>
          <view className="files-panel__toolbar" data-surface-subheader>
            <view
              className={`files-panel__refresh${listing.pending ? " files-panel__refresh--pending" : ""}`}
              aria-label="Refresh workspace files"
              bindtap={() => setRefreshVersion((version) => version + 1)}
            >
              <Icon name="refresh-cw" size={14} color="#71717a" />
            </view>
            <view
              className={`files-panel__search${searchFocused ? " files-panel__search--focused" : ""}`}
            >
              <Icon name="search" size={14} color="#71717a" />
              <input
                className="files-panel__search-input"
                aria-label={`Search ${project.title} files`}
                placeholder="Search files"
                {...({ value: search } as object)}
                bindfocus={() => setSearchFocused(true)}
                bindblur={() => setSearchFocused(false)}
                bindinput={(event: { detail: { value: string } }) => setSearch(event.detail.value)}
              />
            </view>
          </view>
          <scroll-view className="files-panel__browser" scroll-orientation="vertical">
            <view className="files-panel__inner">
              {listing.error ? (
                <view className="files-panel__error">
                  <text className="files-panel__error-title">Unable to list workspace</text>
                  <text className="files-panel__error-copy">{listing.error}</text>
                </view>
              ) : tree.length > 0 ? (
                <view className="files-panel__tree">
                  <FileTreeChildrenSurface>
                    {tree.map((node) =>
                      renderTreeNode(
                        node,
                        0,
                        hasDirectoryNodes,
                        expandedDirectories,
                        selectedPath,
                        toggleDirectory,
                        selectFile,
                      ),
                    )}
                  </FileTreeChildrenSurface>
                </view>
              ) : listing.pending ? null : (
                <view className="files-panel__empty">
                  <text className="files-panel__empty-title">
                    {search.trim() ? "No matching files" : "Workspace is empty"}
                  </text>
                  <text className="files-panel__empty-desc">
                    {search.trim() ? "Try a different search." : "No indexed files were returned."}
                  </text>
                </view>
              )}
            </view>
          </scroll-view>
        </>
      ) : (
        <view className="files-panel__empty">
          <text className="files-panel__empty-title">No project open</text>
          <text className="files-panel__empty-desc">Open a project to browse workspace files.</text>
        </view>
      )}
    </view>
  );
}

export function FilePanel({ path }: { readonly path: string }) {
  const { activeThreadId, draftThread, projects, threads } = useT3ClientState();
  const [panelWidth, setPanelWidth] = useState<number | null>(null);
  const [preview, setPreview] = useState<PreviewState>({
    path,
    result: null,
    pending: true,
    error: null,
  });
  const activeThread =
    threads.find((thread) => thread.id === activeThreadId) ??
    (draftThread?.id === activeThreadId ? draftThread : undefined);
  const project =
    projects.find((candidate) => candidate.id === activeThread?.projectId) ?? projects[0] ?? null;
  const cwd = activeThread?.worktreePath ?? project?.workspaceRoot ?? null;
  const pathParts = path.split("/").filter(Boolean);
  const fileName = pathParts.at(-1) ?? path;
  const directoryParts = pathParts.slice(0, -1);
  const detailLayout = projectFileDetailLayout(panelWidth);

  useEffect(() => {
    if (!cwd) {
      setPreview({ path, result: null, pending: false, error: "No project open." });
      return;
    }
    let cancelled = false;
    setPreview({ path, result: null, pending: true, error: null });
    void t3ClientActions
      .readProjectFile(cwd, path)
      .then((result) => {
        if (!cancelled) setPreview({ path, result, pending: false, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setPreview({ path, result: null, pending: false, error: errorMessage(error) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [cwd, path]);

  return (
    <view
      className="file-panel"
      data-file-detail-layout={detailLayout.showExplorer ? "split" : "editor"}
      bindlayoutchange={(event: { detail?: { width?: unknown } }) => {
        const width = event.detail?.width;
        if (typeof width === "number" && Number.isFinite(width) && width > 0) {
          setPanelWidth((current) => (current === width ? current : width));
        }
      }}
    >
      <view className="file-panel__toolbar" data-surface-subheader>
        {detailLayout.showBackToFiles ? (
          <view
            className="file-panel__back"
            aria-label="Back to workspace files"
            bindtap={uiActions.returnToFilesSurface}
          >
            <Icon name="arrow-left" size={14} color="#71717a" />
          </view>
        ) : null}
        <scroll-view className="file-panel__breadcrumbs" scroll-orientation="horizontal">
          <view className="file-panel__breadcrumb-list">
            <text className="file-panel__breadcrumb file-panel__breadcrumb--project">
              {project?.title ?? "Files"}
            </text>
            {directoryParts.map((part, index) => (
              <view key={`${part}:${index}`} className="file-panel__breadcrumb-part">
                <Icon name="chevron-right" size={12} color="#818181" />
                <text className="file-panel__breadcrumb">{part}</text>
              </view>
            ))}
            <view className="file-panel__breadcrumb-part">
              <Icon name="chevron-right" size={12} color="#818181" />
              <text className="file-panel__breadcrumb file-panel__breadcrumb--current">
                {fileName}
              </text>
            </view>
          </view>
        </scroll-view>
      </view>
      <view className="file-panel__content">
        <view className="file-panel__editor-column">
          {preview.pending ? (
            <view className="file-panel__message">
              <text className="files-panel__preview-status">Loading file…</text>
            </view>
          ) : preview.error ? (
            <view className="file-panel__message">
              <text className="files-panel__preview-error">{preview.error}</text>
            </view>
          ) : preview.result && cwd ? (
            <EditableFilePreview
              key={`${cwd}:${path}`}
              cwd={cwd}
              path={path}
              result={preview.result}
            />
          ) : null}
        </view>
        {detailLayout.showExplorer ? (
          <view className="file-panel__explorer">
            <FilesPanel selectedPath={path} />
          </view>
        ) : null}
      </view>
    </view>
  );
}
