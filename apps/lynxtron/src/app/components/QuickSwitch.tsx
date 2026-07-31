import { useCallback, useMemo, useState } from "@lynx-js/react";
import { formatRelativeTimeLabel } from "@t3tools/client-runtime/presentation/time";
import {
  parseCommandPaletteSearchQuery,
  rankCommandPaletteSearchItems,
} from "@t3tools/client-runtime/presentation/command-palette";
import {
  PaletteEmptySurface,
  PaletteRowSurface,
  PaletteSectionSurface,
} from "../../../../web/src/components/CommandPaletteSurface";
import type { ProjectSummary, ThreadSummary } from "../bridge";
import { navigate } from "../router";
import { t3ClientActions } from "../state/t3Client";
import { uiActions } from "../state/uiState";
import { Icon, type IconName } from "./Icon";

// Quick switch palette — consumes the same physical palette composition as
// apps/web CommandPalette. It can be opened through the sidebar or the host's
// certified discrete menu command.

interface QuickSwitchProps {
  projects: ReadonlyArray<ProjectSummary>;
  threads: ReadonlyArray<ThreadSummary>;
  activeThreadId?: string;
}

interface ActionItem {
  id: string;
  icon: IconName;
  label: string;
  searchTerms: ReadonlyArray<string>;
  run: () => void;
}

export function QuickSwitch({ projects, threads, activeThreadId }: QuickSwitchProps) {
  const [query, setQuery] = useState("");
  const { createThread, selectThread } = t3ClientActions;

  const close = uiActions.closeQuickSwitch;

  const handleInput = useCallback((e: { detail: { value: string } }) => {
    setQuery(e.detail.value);
  }, []);

  const projectName = projects.length > 0 ? projects[0].title : "workspace";

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

  const handleThreadTap = useCallback(
    (threadId: string) => {
      selectThread(threadId);
      close();
    },
    [selectThread],
  );

  return (
    <view className="qs-backdrop" bindtap={close}>
      <view
        className="qs-panel"
        bindtap={(e: unknown) => {
          // Swallow taps inside the panel so backdrop close still works.
          void e;
        }}
      >
        {/* Search input */}
        <view className="qs-search">
          <Icon name="search" size={16} color="#a1a1aa" className="qs-search__icon-img" />
          <input
            className="qs-search__input"
            {...({ value: query } as object)}
            placeholder="Search commands, projects, and threads…"
            bindinput={handleInput}
          />
        </view>

        <scroll-view scroll-orientation="vertical" className="qs-results">
          {/* Actions */}
          {filteredActions.length > 0 ? (
            <view className="qs-section">
              <PaletteSectionSurface label="Actions" />
              {filteredActions.map((a) => (
                <PaletteRowSurface
                  key={a.id}
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

          {filteredActions.length === 0 && filteredThreads.length === 0 ? (
            <PaletteEmptySurface message={`No results for “${query}”`} />
          ) : null}
        </scroll-view>
      </view>
    </view>
  );
}
