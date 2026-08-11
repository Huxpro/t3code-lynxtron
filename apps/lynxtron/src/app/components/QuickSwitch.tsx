import { useCallback, useEffect, useMemo, useState } from "@lynx-js/react";
import type { ProjectEntry } from "@t3tools/contracts";
import type { SearchOverlayMode } from "@t3tools/client-runtime/presentation/search-overlay";
import {
  getProjectFilePickerMatches,
  PROJECT_FILE_PICKER_RESULT_LIMIT,
} from "@t3tools/client-runtime/presentation/file-picker";
import { resolvePathLinkTarget } from "@t3tools/client-runtime/presentation/paths";
import { formatRelativeTimeLabel } from "@t3tools/client-runtime/presentation/time";
import {
  parseCommandPaletteSearchQuery,
  rankCommandPaletteSearchItems,
} from "@t3tools/client-runtime/presentation/command-palette";
import {
  PaletteEmptySurface,
  PaletteFooterSurface,
  PaletteRowSurface,
  PaletteResultsSurface,
  PaletteSearchSurface,
  PaletteSectionSurface,
} from "../../../../web/src/components/CommandPaletteSurface";
import { Kbd, KbdGroup } from "../../../../web/src/components/ui/kbd";
import type { ProjectSummary, ThreadSummary } from "../bridge";
import { navigate } from "../router";
import { t3ClientActions } from "../state/t3Client";
import { uiActions } from "../state/uiState";
import { clientCapabilities } from "../platform/clientCapabilities";
import { Icon, type IconName } from "./Icon";

// Quick switch palette — consumes the same physical palette composition as
// apps/web CommandPalette. It can be opened through the sidebar or the host's
// certified discrete menu command.

interface QuickSwitchProps {
  mode?: SearchOverlayMode;
  projects: ReadonlyArray<ProjectSummary>;
  threads: ReadonlyArray<ThreadSummary>;
  activeThreadId?: string;
}

interface FilePickerState {
  readonly cwd: string | null;
  readonly entries: ReadonlyArray<ProjectEntry>;
  readonly pending: boolean;
  readonly error: string | null;
}

const EMPTY_FILE_PICKER_STATE: FilePickerState = {
  cwd: null,
  entries: [],
  pending: false,
  error: null,
};

interface ActionItem {
  id: string;
  icon: IconName;
  label: string;
  searchTerms: ReadonlyArray<string>;
  run: () => void;
}

export function QuickSwitch({ mode = "command", projects, threads, activeThreadId }: QuickSwitchProps) {
  const [query, setQuery] = useState("");
  const [filePicker, setFilePicker] = useState<FilePickerState>(EMPTY_FILE_PICKER_STATE);
  const { createThread, selectThread } = t3ClientActions;

  const close = uiActions.closeQuickSwitch;

  const handleInput = useCallback((e: { detail: { value: string } }) => {
    setQuery(e.detail.value);
  }, []);

  const projectName = projects.length > 0 ? projects[0].title : "workspace";
  const activeThread = threads.find((thread) => thread.id === activeThreadId);
  const activeProject =
    projects.find((project) => project.id === activeThread?.projectId) ?? projects[0] ?? null;
  const cwd = activeThread?.worktreePath ?? activeProject?.workspaceRoot ?? null;

  useEffect(() => {
    setQuery("");
  }, [mode]);

  useEffect(() => {
    if (mode !== "files" || !cwd) {
      setFilePicker(EMPTY_FILE_PICKER_STATE);
      return;
    }
    let cancelled = false;
    setFilePicker({ cwd, entries: [], pending: true, error: null });
    void t3ClientActions
      .searchProjectEntries(cwd, query.trim(), PROJECT_FILE_PICKER_RESULT_LIMIT)
      .then((result) => {
        if (!cancelled) {
          setFilePicker({
            cwd,
            entries: result.entries.filter((entry) => entry.kind === "file"),
            pending: false,
            error: null,
          });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setFilePicker({
            cwd,
            entries: [],
            pending: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [cwd, mode, query]);

  const actions = useMemo<ReadonlyArray<ActionItem>>(
    () => [
      {
        id: "new-thread",
        icon: "square-pen",
        label: `New thread in ${projectName}`,
        searchTerms: ["new thread", "chat", "create", projectName],
        run: () => {
          createThread();
          close();
        },
      },
      {
        id: "new-thread-in",
        icon: "message-square-plus",
        label: "New thread in...",
        searchTerms: ["new thread in", "project"],
        run: () => close(),
      },
      {
        id: "go-to-file",
        icon: "file-json",
        label: "Go to file",
        searchTerms: ["go to file", "files", "open file"],
        run: () => {
          uiActions.openRightPanelSurface("files");
          close();
        },
      },
      {
        id: "search-project-contents",
        icon: "search",
        label: "Search project contents",
        searchTerms: ["search project contents", "content search"],
        run: () => {
          uiActions.openRightPanelSurface("files");
          close();
        },
      },
      {
        id: "add-project",
        icon: "folder",
        label: "Add project",
        searchTerms: ["add project", "folder", "workspace"],
        run: () => close(),
      },
      {
        id: "open-settings",
        icon: "settings",
        label: "Open settings",
        searchTerms: ["open settings", "preferences"],
        run: () => {
          navigate("/settings");
          close();
        },
      },
    ],
    [projectName, createThread],
  );

  const projectTitleById = useMemo(
    () => new Map(projects.map((project) => [project.id, project.title] as const)),
    [projects],
  );
  const { actionsOnly, normalizedQuery } = parseCommandPaletteSearchQuery(query);
  const filteredActions = rankCommandPaletteSearchItems(
    actions,
    normalizedQuery,
    (action) => action.searchTerms,
  );
  const filteredThreads = actionsOnly
    ? []
    : normalizedQuery
      ? rankCommandPaletteSearchItems(threads, normalizedQuery, (thread) => [
          thread.title ?? "",
          projectTitleById.get(thread.projectId) ?? "",
          thread.branch ?? "",
        ])
      : threads.slice(0, 6);
  const isEmpty = filteredActions.length === 0 && filteredThreads.length === 0;
  const filteredFiles = useMemo(() => {
    return getProjectFilePickerMatches(filePicker.entries, query);
  }, [filePicker.entries, query]);

  const handleThreadTap = useCallback(
    (threadId: string) => {
      selectThread(threadId);
      close();
    },
    [selectThread],
  );
  const handleFileTap = useCallback(
    (path: string) => {
      if (!cwd || !clientCapabilities.navigation.canOpenPath()) return;
      void clientCapabilities.navigation
        .openPath(resolvePathLinkTarget(path, cwd))
        .then(close)
        .catch((cause) => {
          console.error("[quick-switch] failed to open file", { path, cause });
        });
    },
    [cwd],
  );
  const fileMode = mode === "files";
  return (
    <>
      <view className="palette-backdrop" bindtap={close} />
      <view
        className="palette-panel"
        data-search-overlay-mode={mode}
        bindtap={(event: unknown) => {
          if (typeof event === "object" && event !== null && "stopPropagation" in event) {
            (event as { stopPropagation?: () => void }).stopPropagation?.();
          }
        }}
      >
        {/* Search input */}
        <PaletteSearchSurface
          icon={<Icon name="search" size={16} color="#a1a1aa" className="qs-search__icon-img" />}
          input={
            <input
              className="qs-search__input"
              {...({ value: query } as object)}
              placeholder={fileMode ? "Search files…" : "Search commands, projects, and threads…"}
              bindinput={handleInput}
            />
          }
        />

        <scroll-view scroll-orientation="vertical" className="qs-results">
          <PaletteResultsSurface empty={fileMode ? filteredFiles.length === 0 : isEmpty}>
          {fileMode ? (
            <view className="qs-section" data-quick-switch-mode="files">
              <PaletteSectionSurface label={activeProject?.title ?? "Files"} />
              {filteredFiles.map((entry) => (
                <PaletteRowSurface
                  key={entry.path}
                  semanticClassName="quick-switch-file-row quick-switch-file-row--detailed"
                  icon={<Icon name="file-json" size={16} color="#a1a1aa" className="qs-row__icon-img" />}
                  title={entry.name}
                  description={entry.path}
                  onSelect={() => handleFileTap(entry.path)}
                />
              ))}
              {filteredFiles.length === 0 ? (
                <PaletteEmptySurface
                  message={
                    filePicker.pending
                      ? "Indexing workspace files…"
                      : filePicker.error
                        ? "Unable to load workspace files."
                        : query.trim()
                          ? "No matching files."
                          : "No files found."
                  }
                />
              ) : null}
            </view>
          ) : (
            <>
          {/* Actions */}
          {filteredActions.length > 0 ? (
            <view className="qs-section">
              <PaletteSectionSurface label="Actions" />
              {filteredActions.map((a) => (
                <PaletteRowSurface
                  key={a.id}
                  semanticClassName="quick-switch-action-row"
                  icon={
                    <Icon name={a.icon} size={16} color="#a1a1aa" className="qs-row__icon-img" />
                  }
                  title={a.label}
                  onSelect={a.run}
                />
              ))}
            </view>
          ) : null}

          {/* Recent threads */}
          {filteredThreads.length > 0 ? (
            <view className="qs-section">
              <PaletteSectionSurface label="Recent Threads" />
              {filteredThreads.map((t) => {
                const isCurrent = t.id === activeThreadId;
                const threadProjectName = projectTitleById.get(t.projectId) ?? projectName;
                return (
                  <PaletteRowSurface
                    key={t.id}
                    semanticClassName={
                      isCurrent
                        ? "quick-switch-thread-row quick-switch-thread-row--current"
                        : "quick-switch-thread-row quick-switch-thread-row--other"
                    }
                    icon={
                      <Icon
                        name="message-square"
                        size={16}
                        color="#a1a1aa"
                        className="qs-row__icon-img"
                      />
                    }
                    title={t.title || "Untitled thread"}
                    description={`${threadProjectName} · ${t.branch ? `#${t.branch}` : "No branch"}${isCurrent ? " · Current thread" : ""}`}
                    timestamp={formatRelativeTimeLabel(t.updatedAt, Date.now())}
                    onSelect={() => handleThreadTap(t.id)}
                  />
                );
              })}
            </view>
          ) : null}

          {isEmpty ? (
            <PaletteEmptySurface
              message={
                actionsOnly
                  ? "No matching actions."
                  : "No matching commands, projects, or threads."
              }
            />
          ) : null}
            </>
          )}
          </PaletteResultsSurface>
        </scroll-view>
        <PaletteFooterSurface>
          <KbdGroup className="quick-switch-footer-group">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            <text>Navigate</text>
          </KbdGroup>
          <KbdGroup className="quick-switch-footer-group">
            <Kbd>{fileMode ? "⌘K" : "⌘P"}</Kbd>
            <text>{fileMode ? "Commands" : "Files"}</text>
          </KbdGroup>
          <KbdGroup className="quick-switch-footer-group">
            <Kbd>Esc</Kbd>
            <text>Close</text>
          </KbdGroup>
        </PaletteFooterSurface>
      </view>
    </>
  );
}
