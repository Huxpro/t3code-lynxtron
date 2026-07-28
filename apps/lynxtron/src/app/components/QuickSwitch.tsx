import { useCallback, useMemo, useState } from "@lynx-js/react";
import { formatRelativeTimeLabel } from "@t3tools/client-runtime/presentation/time";
import {
  parseCommandPaletteSearchQuery,
  rankCommandPaletteSearchItems,
} from "@t3tools/client-runtime/presentation/command-palette";
import type { ProjectSummary, ThreadSummary } from "../bridge";
import { navigate } from "../router";
import { t3ClientActions } from "../state/t3Client";
import { uiActions } from "../state/uiState";
import { Icon, type IconName } from "./Icon";

// Quick switch palette — mirrors apps/web CommandPalette (⌘K).
// NOTE: opened via the sidebar Search row; global keybindings are not
// available on Lynxtron 0.0.5 desktop (no key-event API in the runtime).

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
  hint?: string;
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
        hint: "⇧⌘O",
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
              <text className="qs-section__label">Actions</text>
              {filteredActions.map((a) => (
                <view key={a.id} className="qs-row" bindtap={a.run}>
                  <Icon name={a.icon} size={16} color="#a1a1aa" className="qs-row__icon-img" />
                  <text className="qs-row__label" text-maxline="1">
                    {a.label}
                  </text>
                  {a.hint ? <text className="qs-row__hint">{a.hint}</text> : null}
                </view>
              ))}
            </view>
          ) : null}

          {/* Recent threads */}
          {filteredThreads.length > 0 ? (
            <view className="qs-section">
              <text className="qs-section__label">Recent Threads</text>
              {filteredThreads.map((t) => {
                const isCurrent = t.id === activeThreadId;
                const threadProjectName = projectTitleById.get(t.projectId) ?? projectName;
                return (
                  <view key={t.id} className="qs-row" bindtap={() => handleThreadTap(t.id)}>
                    <Icon
                      name="message-square"
                      size={16}
                      color="#a1a1aa"
                      className="qs-row__icon-img"
                    />
                    <view className="qs-row__text">
                      <text className="qs-row__label" text-maxline="1">
                        {t.title || "Untitled thread"}
                      </text>
                      <text className="qs-row__sub" text-maxline="1">
                        {threadProjectName} · {t.branch ? `#${t.branch}` : "No branch"}
                        {isCurrent ? " · Current thread" : ""}
                      </text>
                    </view>
                    <text className="qs-row__hint">
                      {formatRelativeTimeLabel(t.updatedAt, Date.now())}
                    </text>
                  </view>
                );
              })}
            </view>
          ) : null}

          {filteredActions.length === 0 && filteredThreads.length === 0 ? (
            <view className="qs-empty">
              <text className="qs-empty__text">No results for “{query}”</text>
            </view>
          ) : null}
        </scroll-view>

        {/* Footer hints */}
        <view className="qs-footer">
          <text className="qs-footer__hint">↑↓ Navigate</text>
          <text className="qs-footer__hint">Enter Select</text>
          <text className="qs-footer__hint">Esc Close</text>
        </view>
      </view>
    </view>
  );
}
