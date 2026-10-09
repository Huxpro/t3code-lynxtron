import { useCallback, useEffect, useMemo, useRef, useState } from "@lynx-js/react";
import type { NodesRef } from "@lynx-js/types";
import type {
  FilesystemBrowseResult,
  ProjectEntry,
  SourceControlDiscoveryResult,
  SourceControlRepositoryInfo,
} from "@t3tools/contracts";
import {
  addProjectRemoteSourceLabel,
  addProjectRemoteSourcePathHint,
  buildAddProjectRemoteSourceReadiness,
  getAddProjectInitialQuery,
  sortAddProjectProviderSources,
  type AddProjectRemoteSource,
} from "@t3tools/client-runtime/operations/projects";
import type { SearchOverlayMode, SearchOverlayOpenIntent } from "@t3tools/lynx-logic/searchOverlay";
import {
  getProjectFilePickerMatches,
  PROJECT_FILE_PICKER_RESULT_LIMIT,
} from "@t3tools/lynx-logic/filePicker";
import { formatRelativeTimeLabel } from "@t3tools/lynx-logic/time";
import {
  parseCommandPaletteSearchQuery,
  projectCommandPaletteThread,
  rankCommandPaletteSearchItems,
} from "@t3tools/lynx-logic/commandPalette";
import {
  PaletteEmptySurface,
  PaletteFooterSurface,
  PaletteRowSurface,
  PaletteResultsSurface,
  PaletteSearchSurface,
  PaletteSectionSurface,
} from "../../../../web/src/components/CommandPaletteSurface";
import { sortProjectsForSidebar } from "../../../../web/src/components/Sidebar.logic";
import { shortcutLabelForCommand } from "../../../../web/src/keybindings";
import { useViewportSnapshot } from "../../../../web/src/hooks/useViewportSnapshot";
import { Kbd, KbdGroup } from "../../../../web/src/components/ui/kbd";
import { HostText, HostView } from "../../../../web/src/components/ui/hostElements";
import type { ProjectSummary, ThreadSummary } from "../bridge";
import { navigate } from "../router";
import { t3ClientActions, useT3ClientState } from "../state/t3Client";
import { searchOverlayReturnController } from "../state/searchOverlayKeyboard";
import { uiActions } from "../state/uiState";
import { environmentPathsResolveLocally } from "../platform/clientCapabilities.lynx";
import { LYNX_PRIMARY_ENVIRONMENT_ID } from "../state/environment";
import { Icon, type IconName } from "./Icon";
import { useOpenProjectSettings } from "./ProjectSettingsPage";
import { ProjectFileIcon } from "./ProjectFileIcon";
import {
  initialQuickSwitchActiveIndex,
  moveQuickSwitchActiveIndex,
  runActiveQuickSwitchItem,
  type QuickSwitchNavigationItem,
  type QuickSwitchView,
} from "./quickSwitchNavigation";

// Quick switch palette — consumes the same physical palette composition as
// apps/web CommandPalette. It can be opened through the sidebar or the host's
// certified discrete menu command.

interface QuickSwitchProps {
  mode?: SearchOverlayMode;
  openIntent?: SearchOverlayOpenIntent | null;
  projects: ReadonlyArray<ProjectSummary>;
  threads: ReadonlyArray<ThreadSummary>;
  activeThreadId?: string;
  projectScopeKey?: string | null;
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
  shortcutCommand?: "chat.new" | "filePicker.toggle" | "projectSearch.toggle";
  run: () => void;
}

interface PaletteNavigationItem extends QuickSwitchNavigationItem {
  readonly icon: IconName;
  readonly title: string;
  readonly description?: string;
  readonly setupRequired?: boolean;
}

interface RemoteProjectFlow {
  readonly source: AddProjectRemoteSource;
  readonly repositoryInput: string;
  readonly repository: SourceControlRepositoryInfo | null;
  readonly remoteUrl: string;
}

export function QuickSwitch({
  mode = "command",
  openIntent = null,
  projects,
  threads,
  activeThreadId,
  projectScopeKey = null,
}: QuickSwitchProps) {
  const viewport = useViewportSnapshot();
  const searchInputRef = useRef<NodesRef>(null);
  const [query, setQuery] = useState("");
  const [filePicker, setFilePicker] = useState<FilePickerState>(EMPTY_FILE_PICKER_STATE);
  const [view, setView] = useState<QuickSwitchView>(
    openIntent?.kind === "add-project"
      ? "add-project-sources"
      : openIntent?.kind === "new-thread-in"
        ? "new-thread-projects"
        : "root",
  );
  const [activeIndex, setActiveIndex] = useState(mode === "files" ? -1 : 0);
  const submitActiveItemRef = useRef<() => boolean>(() => false);
  const [sourceControlDiscovery, setSourceControlDiscovery] =
    useState<SourceControlDiscoveryResult | null>(null);
  const [sourceControlPending, setSourceControlPending] = useState(false);
  const [sourceControlError, setSourceControlError] = useState<string | null>(null);
  const [filesystemBrowse, setFilesystemBrowse] = useState<FilesystemBrowseResult | null>(null);
  const [filesystemPending, setFilesystemPending] = useState(false);
  const [filesystemError, setFilesystemError] = useState<string | null>(null);
  const [remoteProjectFlow, setRemoteProjectFlow] = useState<RemoteProjectFlow | null>(null);
  const [remoteProjectPending, setRemoteProjectPending] = useState(false);
  const [remoteProjectError, setRemoteProjectError] = useState<string | null>(null);
  const { createThread, selectThread } = t3ClientActions;
  const { connectionKind, draftThread, serverConfig } = useT3ClientState();

  const close = uiActions.closeQuickSwitch;

  const handleInput = useCallback((e: { detail: { value: string } }) => {
    setQuery(e.detail.value.replace(/[\r\n]+/gu, ""));
  }, []);

  const activeThread =
    threads.find((thread) => thread.id === activeThreadId) ??
    (draftThread?.id === activeThreadId ? draftThread : undefined);
  const orderedProjects = useMemo(
    () => sortProjectsForSidebar(projects, threads, "updated_at"),
    [projects, threads],
  );
  const activeProject =
    orderedProjects.find((project) => project.id === activeThread?.projectId) ??
    orderedProjects.find((project) => project.id === projectScopeKey) ??
    projects[0] ??
    null;
  const projectName = activeProject?.title ?? "workspace";
  const openProjectSettings = useOpenProjectSettings();
  const cwd = activeThread?.worktreePath ?? activeProject?.workspaceRoot ?? null;
  const openLocalFolderView = useCallback(() => {
    setView("add-project-local");
    setQuery(getAddProjectInitialQuery(null));
    setActiveIndex(0);
  }, []);
  const openNewThreadProjects = useCallback(() => {
    setView("new-thread-projects");
    setQuery("");
    setActiveIndex(0);
  }, []);
  const returnToRoot = useCallback(() => {
    setView("root");
    setQuery("");
    setActiveIndex(0);
  }, []);
  const returnToSources = useCallback(() => {
    setView("add-project-sources");
    setQuery("");
    setActiveIndex(0);
  }, []);
  const addLocalProject = useCallback(
    (workspaceRoot: string) => {
      const trimmed = workspaceRoot.trim();
      if (!trimmed) return;
      void t3ClientActions
        .createProject(trimmed)
        .then(close)
        .catch((error: unknown) => {
          setFilesystemError(error instanceof Error ? error.message : String(error));
        });
    },
    [close],
  );
  const createThreadInProject = useCallback(
    (projectId: string) => {
      void t3ClientActions.createThread(projectId).then(close);
    },
    [close],
  );
  const openRemoteProjectView = useCallback((source: AddProjectRemoteSource) => {
    setRemoteProjectFlow(null);
    setRemoteProjectError(null);
    setRemoteProjectPending(false);
    setView("add-project-remote");
    setQuery("");
    setActiveIndex(0);
    setRemoteProjectFlow({ source, repositoryInput: "", repository: null, remoteUrl: "" });
  }, []);
  const navigateBack = useCallback(() => {
    if (view === "add-project-local" || view === "add-project-remote") {
      returnToSources();
      return;
    }
    if (view === "add-project-destination") {
      openRemoteProjectView(remoteProjectFlow?.source ?? "url");
      return;
    }
    returnToRoot();
  }, [openRemoteProjectView, remoteProjectFlow?.source, returnToRoot, returnToSources, view]);
  const submitRemoteRepository = useCallback(() => {
    const source = remoteProjectFlow?.source;
    const repositoryInput = query.trim();
    if (!source || !repositoryInput || remoteProjectPending) return;
    setRemoteProjectPending(true);
    setRemoteProjectError(null);
    const lookup =
      source === "url"
        ? Promise.resolve({
            source,
            repositoryInput,
            repository: null,
            remoteUrl: repositoryInput,
          } satisfies RemoteProjectFlow)
        : t3ClientActions
            .lookupRepository({
              provider: source,
              repository: repositoryInput,
              ...(cwd ? { cwd } : {}),
            })
            .then(
              (repository) =>
                ({
                  source,
                  repositoryInput,
                  repository,
                  remoteUrl: repository.url,
                }) satisfies RemoteProjectFlow,
            );
    void lookup
      .then((flow) => {
        setRemoteProjectFlow(flow);
        setView("add-project-destination");
        setQuery(getAddProjectInitialQuery(null));
        setActiveIndex(0);
      })
      .catch((error: unknown) => {
        setRemoteProjectError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => setRemoteProjectPending(false));
  }, [cwd, query, remoteProjectFlow?.source, remoteProjectPending]);
  const cloneAndAddProject = useCallback(
    (destinationPath: string) => {
      if (!remoteProjectFlow || remoteProjectPending) return;
      const trimmed = destinationPath.trim();
      if (!trimmed) return;
      setRemoteProjectPending(true);
      setRemoteProjectError(null);
      void t3ClientActions
        .cloneRepository({
          ...(remoteProjectFlow.source === "url"
            ? { remoteUrl: remoteProjectFlow.remoteUrl }
            : {
                provider: remoteProjectFlow.source,
                repository: remoteProjectFlow.repositoryInput,
              }),
          destinationPath: trimmed,
          protocol: "auto",
        })
        .then((result) => t3ClientActions.createProject(result.cwd))
        .then(close)
        .catch((error: unknown) => {
          setRemoteProjectError(error instanceof Error ? error.message : String(error));
        })
        .finally(() => setRemoteProjectPending(false));
    },
    [close, remoteProjectFlow, remoteProjectPending],
  );

  useEffect(() => {
    setQuery("");
    setActiveIndex(0);
  }, [mode]);

  useEffect(() => {
    searchInputRef.current
      ?.invoke({
        method: "focus",
        fail: (result) => {
          console.error("[lynx-quick-switch] input focus failed", result);
        },
      })
      .exec();
  }, []);

  useEffect(() => {
    if (!openIntent) return;
    setView(openIntent.kind === "add-project" ? "add-project-sources" : "new-thread-projects");
    setQuery("");
    setActiveIndex(0);
  }, [openIntent]);

  useEffect(() => {
    if (view !== "add-project-sources") return;
    let cancelled = false;
    setSourceControlPending(true);
    setSourceControlError(null);
    void t3ClientActions
      .discoverSourceControl()
      .then((result) => {
        if (!cancelled) setSourceControlDiscovery(result);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setSourceControlDiscovery(null);
          setSourceControlError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!cancelled) setSourceControlPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view]);

  useEffect(() => {
    if (view !== "add-project-local" && view !== "add-project-destination") return;
    const partialPath = query.trim();
    if (!partialPath) {
      setFilesystemBrowse(null);
      setFilesystemError(null);
      setFilesystemPending(false);
      return;
    }
    let cancelled = false;
    setFilesystemPending(true);
    setFilesystemError(null);
    void t3ClientActions
      .browseFilesystem({ partialPath, ...(cwd ? { cwd } : {}) })
      .then((result) => {
        if (!cancelled) setFilesystemBrowse(result);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setFilesystemBrowse(null);
          setFilesystemError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!cancelled) setFilesystemPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cwd, query, view]);

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
        shortcutCommand: "chat.new",
        searchTerms: ["new thread", "chat", "create", projectName],
        run: () => {
          if (activeProject) createThread(activeProject.id);
          close();
        },
      },
      {
        id: "new-thread-in",
        icon: "square-pen",
        label: "New thread in...",
        searchTerms: ["new thread in", "project"],
        run: openNewThreadProjects,
      },
      {
        id: "go-to-file",
        icon: "file-json",
        label: "Go to file",
        shortcutCommand: "filePicker.toggle",
        searchTerms: ["go to file", "files", "open file"],
        run: () => {
          uiActions.openRightPanelSurface("files");
          close();
        },
      },
      {
        id: "search-project-contents",
        icon: "text-search",
        label: "Search project contents",
        shortcutCommand: "projectSearch.toggle",
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
        run: uiActions.openAddProject,
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
      // There is no projects listing page; the action targets the contextual
      // project, as Web's command palette does.
      ...(activeProject
        ? [
            {
              id: "project-settings",
              icon: "folder" as const,
              label: "Project settings",
              searchTerms: ["project", "settings", "scripts", "grouping", "checkout"],
              run: () => {
                openProjectSettings({
                  environmentId: LYNX_PRIMARY_ENVIRONMENT_ID,
                  id: activeProject.id,
                });
                close();
              },
            },
          ]
        : []),
    ],
    [activeProject, close, createThread, openNewThreadProjects, openProjectSettings, projectName],
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
  useEffect(() => {
    if (!viewport.testResize) return;
    const target = globalThis as {
      __T3_LYNXTRON_QUICK_SWITCH_QUERY__?: (value: string) => void;
      __T3_LYNXTRON_QUICK_SWITCH_STATE__?: () => string;
    };
    target.__T3_LYNXTRON_QUICK_SWITCH_QUERY__ = setQuery;
    target.__T3_LYNXTRON_QUICK_SWITCH_STATE__ = () =>
      JSON.stringify({
        actionLabels: filteredActions.map((action) => action.label),
        actionsOnly,
        empty: isEmpty,
        fileError: filePicker.error,
        filePaths: filteredFiles.map((entry) => entry.path),
        filePending: filePicker.pending,
        mode,
        normalizedQuery,
        query,
        threadLabels: filteredThreads.map((thread) => thread.title || "Untitled thread"),
        view,
      });
    return () => {
      delete target.__T3_LYNXTRON_QUICK_SWITCH_QUERY__;
      delete target.__T3_LYNXTRON_QUICK_SWITCH_STATE__;
    };
  }, [
    actionsOnly,
    filteredActions,
    filteredFiles,
    filteredThreads,
    filePicker.error,
    filePicker.pending,
    isEmpty,
    mode,
    normalizedQuery,
    query,
    view,
    viewport.testResize,
  ]);
  const sourceReadiness = useMemo(
    () => buildAddProjectRemoteSourceReadiness(sourceControlDiscovery),
    [sourceControlDiscovery],
  );
  const currentBrowsePath = filesystemBrowse?.parentPath ?? query.trim();
  const sourceItems = useMemo<ReadonlyArray<PaletteNavigationItem>>(() => {
    const items: PaletteNavigationItem[] = [
      {
        id: "source:local",
        icon: "folder-plus",
        title: "Local folder",
        description: "Browse a folder on disk",
        run: openLocalFolderView,
      },
      {
        id: "source:url",
        icon: "link-2",
        title: "Git URL",
        description: "Clone from a remote URL",
        run: () => openRemoteProjectView("url"),
      },
    ];
    for (const source of sortAddProjectProviderSources(sourceReadiness)) {
      const readiness = sourceReadiness[source];
      const label = addProjectRemoteSourceLabel(source);
      items.push({
        id: `source:${source}`,
        icon: source,
        title: `${label} repository`,
        description: `Clone ${label} ${addProjectRemoteSourcePathHint(source)}`,
        setupRequired: !readiness.ready,
        disabled: !readiness.ready,
        run: () => openRemoteProjectView(source),
      });
    }
    return items;
  }, [openLocalFolderView, openRemoteProjectView, sourceReadiness]);
  const localFolderItems = useMemo<ReadonlyArray<PaletteNavigationItem>>(() => {
    const items: PaletteNavigationItem[] = [
      {
        id: view === "add-project-destination" ? "browse:clone-here" : "browse:add-current",
        icon: view === "add-project-destination" ? "git-branch-plus" : "folder-plus",
        title: view === "add-project-destination" ? "Clone here" : "Add this folder",
        description: currentBrowsePath,
        run: () =>
          view === "add-project-destination"
            ? cloneAndAddProject(currentBrowsePath)
            : addLocalProject(currentBrowsePath),
      },
    ];
    for (const entry of filesystemBrowse?.entries ?? []) {
      items.push({
        id: `browse:${entry.fullPath}`,
        icon: "folder",
        title: entry.name,
        description: entry.fullPath,
        run: () => {
          setQuery(getAddProjectInitialQuery(entry.fullPath));
          setActiveIndex(0);
        },
      });
    }
    return items;
  }, [addLocalProject, cloneAndAddProject, currentBrowsePath, filesystemBrowse?.entries, view]);
  // Matches Web's new-thread picker: "Local" for this machine's own server,
  // "<label> (Local)" for another local server, and the label for a remote one.
  const projectLocation =
    connectionKind !== "existing-environment"
      ? "Local"
      : environmentPathsResolveLocally()
        ? `${serverConfig?.environment.label ?? "Environment"} (Local)`
        : (serverConfig?.environment.label ?? "Remote");
  const projectItems = useMemo<ReadonlyArray<PaletteNavigationItem>>(() => {
    const preferredProjects =
      activeProject === null
        ? orderedProjects
        : [activeProject, ...orderedProjects.filter((project) => project.id !== activeProject.id)];
    return preferredProjects.map((project) => ({
      id: `project:${project.id}`,
      icon: "folder",
      title: project.title,
      description: `${projectLocation} · ${project.workspaceRoot}`,
      run: () => createThreadInProject(project.id),
    }));
  }, [activeProject, createThreadInProject, orderedProjects, projectLocation]);

  const handleThreadTap = useCallback(
    (threadId: string) => {
      selectThread(threadId);
      close();
    },
    [selectThread],
  );
  const handleFileTap = useCallback(
    (path: string) => {
      uiActions.openFileSurface(path);
      close();
    },
    [close],
  );
  const fileMode = mode === "files";
  const rootNavigationItems = useMemo<ReadonlyArray<PaletteNavigationItem>>(
    () => [
      ...filteredActions.map((action) => ({
        id: `action:${action.id}`,
        icon: action.icon,
        title: action.label,
        run: action.run,
      })),
      ...filteredThreads.map((thread) => ({
        id: `thread:${thread.id}`,
        icon: "message-square" as const,
        title: thread.title || "Untitled thread",
        description: `${projectTitleById.get(thread.projectId) ?? projectName} · ${
          thread.branch ? `#${thread.branch}` : "No branch"
        }`,
        run: () => handleThreadTap(thread.id),
      })),
    ],
    [filteredActions, filteredThreads, handleThreadTap, projectName, projectTitleById],
  );
  const navigationItems = useMemo<ReadonlyArray<PaletteNavigationItem>>(() => {
    if (fileMode) {
      return filteredFiles.map((entry) => ({
        id: `file:${entry.path}`,
        icon: "file-json",
        title: entry.name,
        description: entry.path,
        run: () => handleFileTap(entry.path),
      }));
    }
    if (view === "new-thread-projects") return projectItems;
    if (view === "add-project-sources") return sourceItems;
    if (view === "add-project-local" || view === "add-project-destination") {
      return localFolderItems;
    }
    return rootNavigationItems;
  }, [
    fileMode,
    filteredFiles,
    handleFileTap,
    localFolderItems,
    projectItems,
    rootNavigationItems,
    sourceItems,
    view,
  ]);
  const navigationItemIds = navigationItems.map((item) => item.id).join("\u0000");
  useEffect(() => {
    if (!viewport.testResize) return;
    const emitter = lynx.getJSModule?.("GlobalEventEmitter") as
      | { addListener?: (eventName: string, listener: (value: unknown) => void) => void }
      | undefined;
    emitter?.addListener?.("t3:quick-switch-active-test", (value: unknown) => {
      const label =
        typeof value === "object" && value !== null && "label" in value ? value.label : null;
      if (typeof label !== "string") return;
      const index = navigationItems.findIndex((item) => item.title === label);
      if (index >= 0) setActiveIndex(index);
    });
  }, [navigationItems, viewport.testResize]);
  useEffect(() => {
    setActiveIndex(initialQuickSwitchActiveIndex(navigationItems, { fileMode, query }));
  }, [fileMode, navigationItemIds, query]);
  const handlePaletteKeyDown = useCallback(
    (event: unknown) => {
      const key =
        typeof event === "object" &&
        event !== null &&
        "key" in event &&
        typeof event.key === "string"
          ? event.key
          : "";
      if (key === "ArrowDown" || key === "ArrowUp") {
        setActiveIndex((current) =>
          moveQuickSwitchActiveIndex(current, key === "ArrowDown" ? 1 : -1, navigationItems),
        );
        return;
      }
      if (key === "Enter") {
        if (view === "add-project-remote") {
          submitRemoteRepository();
          return;
        }
        runActiveQuickSwitchItem(activeIndex, navigationItems);
        return;
      }
      if (key === "Backspace" && query.length === 0 && view !== "root") {
        navigateBack();
        return;
      }
      if (key === "Escape") close();
    },
    [
      activeIndex,
      addLocalProject,
      cloneAndAddProject,
      close,
      navigationItems,
      navigateBack,
      openRemoteProjectView,
      query,
      remoteProjectFlow?.source,
      returnToSources,
      submitRemoteRepository,
      view,
    ],
  );
  submitActiveItemRef.current = () => {
    if (view === "add-project-remote") {
      submitRemoteRepository();
      return true;
    }
    return runActiveQuickSwitchItem(activeIndex, navigationItems);
  };
  useEffect(() => searchOverlayReturnController.mount(() => submitActiveItemRef.current()), []);
  const inputPlaceholder =
    view === "add-project-sources" || view === "new-thread-projects"
      ? "Search..."
      : view === "add-project-local"
        ? "Enter project path (e.g. ~/projects/my-app)"
        : view === "add-project-remote"
          ? remoteProjectFlow?.source === "url"
            ? "Enter Git clone URL"
            : `Enter ${addProjectRemoteSourceLabel(remoteProjectFlow?.source ?? "url")} repository`
          : view === "add-project-destination"
            ? "Choose destination path"
            : fileMode
              ? "Search files…"
              : "Search commands, projects, and threads…";
  return (
    <>
      <view className="palette-backdrop" bindtap={close} />
      <HostView
        className={
          fileMode
            ? "palette-panel palette-panel--files"
            : view === "new-thread-projects"
              ? "palette-panel palette-panel--new-thread-projects"
              : "palette-panel"
        }
        data-search-overlay-mode={mode}
        data-quick-switch-view={view}
        onKeyDown={handlePaletteKeyDown}
        onClick={(event: unknown) => {
          if (typeof event === "object" && event !== null && "stopPropagation" in event) {
            (event as { stopPropagation?: () => void }).stopPropagation?.();
          }
        }}
      >
        {/* Search input */}
        <PaletteSearchSurface
          icon={
            view === "root" ? (
              <Icon name="search" size={16} color="#a1a1aa" className="qs-search__icon-img" />
            ) : (
              <view className="qs-search__back" aria-label="Back" bindtap={navigateBack}>
                <Icon name="arrow-left" size={16} color="#a1a1aa" />
              </view>
            )
          }
          input={
            <input
              id="quick-switch-search-input"
              ref={searchInputRef}
              className="qs-search__input"
              {...({ value: query } as object)}
              placeholder={inputPlaceholder}
              bindinput={handleInput}
            />
          }
        />

        <scroll-view
          scroll-orientation="vertical"
          className={fileMode ? "qs-results qs-results--files" : "qs-results"}
        >
          <PaletteResultsSurface
            empty={
              view === "add-project-remote"
                ? true
                : view === "add-project-sources"
                  ? sourceItems.length === 0
                  : navigationItems.length === 0
            }
          >
            {view === "add-project-sources" ? (
              <view className="qs-section" data-quick-switch-mode="add-project-sources">
                <PaletteSectionSurface label="Sources" />
                {sourceItems.map((item, index) => (
                  <PaletteRowSurface
                    key={item.id}
                    active={index === activeIndex}
                    disabled={item.disabled}
                    semanticClassName="quick-switch-source-row"
                    icon={
                      <Icon
                        name={item.icon}
                        size={16}
                        color="#a1a1aa"
                        className="qs-row__icon-img"
                      />
                    }
                    title={item.title}
                    description={item.description}
                    titleTrailing={
                      item.setupRequired ? (
                        <HostText className="quick-switch-setup-badge">Setup Required</HostText>
                      ) : null
                    }
                    onHoverStart={() => setActiveIndex(index)}
                    onSelect={item.run}
                  />
                ))}
                {sourceControlPending ? (
                  <PaletteEmptySurface message="Checking source control providers…" />
                ) : sourceControlError ? (
                  <PaletteEmptySurface message="Provider status is unavailable." />
                ) : null}
              </view>
            ) : view === "new-thread-projects" ? (
              <view className="qs-section" data-quick-switch-mode="new-thread-projects">
                <PaletteSectionSurface label="Projects" />
                {projectItems.map((item, index) => (
                  <PaletteRowSurface
                    key={item.id}
                    active={index === activeIndex}
                    semanticClassName="quick-switch-project-row"
                    icon={
                      <Icon
                        name={item.icon}
                        size={16}
                        color="#a1a1aa"
                        className="qs-row__icon-img"
                      />
                    }
                    title={item.title}
                    description={item.description}
                    onHoverStart={() => setActiveIndex(index)}
                    onSelect={item.run}
                  />
                ))}
                {projectItems.length === 0 ? (
                  <PaletteEmptySurface message="No projects available." />
                ) : null}
              </view>
            ) : view === "add-project-local" || view === "add-project-destination" ? (
              <view className="qs-section" data-quick-switch-mode={view}>
                <PaletteSectionSurface
                  label={view === "add-project-destination" ? "Destination" : "Local folder"}
                />
                {localFolderItems.map((item, index) => (
                  <PaletteRowSurface
                    key={item.id}
                    active={index === activeIndex}
                    semanticClassName="quick-switch-folder-row"
                    icon={
                      <Icon
                        name={item.icon}
                        size={16}
                        color="#a1a1aa"
                        className="qs-row__icon-img"
                      />
                    }
                    title={item.title}
                    description={item.description}
                    onHoverStart={() => setActiveIndex(index)}
                    onSelect={item.run}
                  />
                ))}
                {filesystemPending ? (
                  <PaletteEmptySurface message="Loading folders…" />
                ) : filesystemError ? (
                  <PaletteEmptySurface message={filesystemError} />
                ) : localFolderItems.length === 0 ? (
                  <PaletteEmptySurface
                    message={
                      view === "add-project-destination"
                        ? "Press Enter to clone into this path."
                        : "Press Enter to add this path as a project."
                    }
                  />
                ) : null}
              </view>
            ) : view === "add-project-remote" ? (
              <view className="qs-section" data-quick-switch-mode="add-project-remote">
                <PaletteSectionSurface label="Repository" />
                <PaletteEmptySurface
                  message={
                    remoteProjectPending
                      ? "Looking up repository…"
                      : (remoteProjectError ??
                        (remoteProjectFlow?.source === "url"
                          ? "Enter a Git clone URL and press Enter."
                          : "Enter a repository path and press Enter."))
                  }
                />
              </view>
            ) : fileMode ? (
              <view className="qs-section" data-quick-switch-mode="files">
                <PaletteSectionSurface label={activeProject?.title ?? "Files"} />
                {filteredFiles.map((entry, index) => (
                  <PaletteRowSurface
                    key={entry.path}
                    active={index === activeIndex}
                    semanticClassName="quick-switch-file-row quick-switch-file-row--detailed"
                    icon={<ProjectFileIcon path={entry.path} />}
                    title={entry.name}
                    description={entry.path}
                    onHoverStart={() => setActiveIndex(index)}
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
                    {filteredActions.map((a, index) => (
                      <PaletteRowSurface
                        key={a.id}
                        active={index === activeIndex}
                        semanticClassName="quick-switch-action-row"
                        icon={
                          <Icon
                            name={a.icon}
                            size={16}
                            color="#a1a1aa"
                            className="qs-row__icon-img"
                          />
                        }
                        title={a.label}
                        shortcut={
                          a.shortcutCommand && serverConfig ? (
                            <Kbd className="h-4 min-w-0 rounded-sm px-1.5 text-[10px]">
                              {shortcutLabelForCommand(
                                serverConfig.keybindings,
                                a.shortcutCommand,
                                "MacIntel",
                              )}
                            </Kbd>
                          ) : null
                        }
                        onHoverStart={() => setActiveIndex(index)}
                        onSelect={a.run}
                      />
                    ))}
                  </view>
                ) : null}

                {/* Recent threads */}
                {filteredThreads.length > 0 ? (
                  <view className="qs-section">
                    <PaletteSectionSurface label="Recent Threads" />
                    {filteredThreads.map((t, threadIndex) => {
                      const isCurrent = t.id === activeThreadId;
                      const threadProjectName = projectTitleById.get(t.projectId) ?? projectName;
                      const presentation = projectCommandPaletteThread({
                        thread: t,
                        projectTitle: threadProjectName,
                        activeThreadId,
                        formatTimestamp: formatRelativeTimeLabel,
                      });
                      const itemIndex = filteredActions.length + threadIndex;
                      return (
                        <PaletteRowSurface
                          key={t.id}
                          active={itemIndex === activeIndex}
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
                          title={presentation.title}
                          description={presentation.description}
                          timestamp={presentation.timestamp}
                          onHoverStart={() => setActiveIndex(itemIndex)}
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
            <Kbd>Enter</Kbd>
            <text>
              {view === "add-project-local"
                ? "Add"
                : view === "add-project-destination"
                  ? "Clone"
                  : fileMode
                    ? "Open file"
                    : "Select"}
            </text>
          </KbdGroup>
          {view !== "root" ? (
            <KbdGroup className="quick-switch-footer-group">
              <Kbd>Backspace</Kbd>
              <text>Back</text>
            </KbdGroup>
          ) : null}
          <KbdGroup className="quick-switch-footer-group">
            <Kbd>Esc</Kbd>
            <text>{fileMode ? "Back" : "Close"}</text>
          </KbdGroup>
        </PaletteFooterSurface>
      </HostView>
    </>
  );
}
