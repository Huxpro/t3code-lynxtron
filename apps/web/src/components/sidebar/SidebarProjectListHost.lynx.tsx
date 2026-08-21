import { useCallback, useState } from "@lynx-js/react";
import type { ScopedThreadRef } from "@t3tools/contracts";

import { t3ClientActions, useT3ClientState } from "../../../../lynxtron/src/app/state/t3Client";
import { Icon } from "../../../../lynxtron/src/app/components/Icon";
import { ThreadStatusLabel } from "../ThreadStatusIndicators";
import type {
  SidebarProjectHostRow,
  SidebarProjectListHostProps,
} from "./SidebarProjectListHost.types";

export type {
  SidebarProjectHostRow,
  SidebarProjectHostThread,
  SidebarProjectListHostProps,
} from "./SidebarProjectListHost.types";

type ThreadMenuState = {
  readonly threadRef: ScopedThreadRef;
  readonly threadKey: string;
  readonly title: string;
} | null;

function stopTapPropagation(event: { stopPropagation?: () => void }): void {
  event.stopPropagation?.();
}

export function SidebarProjectListHost({
  rows,
  onToggleProject,
  onCreateThread,
  onSelectThread,
  onRenameThread,
  onArchiveThread,
  onDeleteThread,
}: SidebarProjectListHostProps) {
  const { activeThreadId } = useT3ClientState();
  const [threadMenu, setThreadMenu] = useState<ThreadMenuState>(null);
  const [renamingThreadKey, setRenamingThreadKey] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const closeThreadMenu = useCallback(() => {
    setThreadMenu(null);
    setRenamingThreadKey(null);
  }, []);

  if (rows.length === 0) {
    return (
      <view className="lynx-sidebar-project-list lynx-sidebar-project-list--empty flex flex-col">
        <text className="lynx-sidebar-empty-projects">No projects yet</text>
      </view>
    );
  }

  return (
    <view className="lynx-sidebar-project-list flex flex-col">
      {rows.map((row) => (
        <view key={row.key} className="lynx-sidebar-project flex flex-col">
          <view
            className="sidebar-project-row-reference lynx-sidebar-project-row flex flex-row"
            bindtap={() => {
              onToggleProject(row);
            }}
          >
            <view className="lynx-sidebar-project-chevron">
              <Icon
                name={row.expanded ? "chevron-down" : "chevron-right"}
                size={14}
                color="#71717a"
                className="lynx-sidebar-project-chevron-icon"
              />
            </view>
            <view className="lynx-sidebar-project-favicon">
              <Icon
                name="folder"
                size={14}
                color="#818181"
                className="lynx-sidebar-project-favicon-icon"
              />
            </view>
            <text
              className="sidebar-project-title-reference lynx-sidebar-project-title"
              text-maxline="1"
            >
              {row.title}
            </text>
            {row.groupedProjectCount > 1 ? (
              <text className="lynx-sidebar-project-count">{row.groupedProjectCount} projects</text>
            ) : null}
            <view
              className="lynx-sidebar-project-new"
              accessibility-label={`Create new thread in ${row.title}`}
              bindtap={(event: { stopPropagation?: () => void }) => {
                stopTapPropagation(event);
                onCreateThread(row.projectRef);
              }}
            >
              <text className="lynx-sidebar-project-new-label">＋</text>
            </view>
          </view>

          {row.expanded || row.threads.length > 0 ? (
            <view className="lynx-sidebar-thread-list flex flex-col">
              {row.showEmptyThreadState ? (
                <view className="lynx-sidebar-thread-empty">
                  <text className="lynx-sidebar-thread-empty-label">No threads yet</text>
                </view>
              ) : (
                row.threads.map((thread) => (
                  <view key={thread.key} className="lynx-sidebar-thread-shell flex flex-col">
                    {renamingThreadKey === thread.key ? (
                      <view className="lynx-sidebar-thread-rename">
                        <input
                          className="lynx-sidebar-thread-rename-input"
                          {...({ value: renameDraft } as object)}
                          bindinput={(event: { detail?: { value?: string } }) => {
                            setRenameDraft(event.detail?.value ?? "");
                          }}
                          confirm-type="done"
                          bindconfirm={() => {
                            const title = renameDraft.trim();
                            if (title) {
                              onRenameThread(thread.ref, title);
                            }
                            closeThreadMenu();
                          }}
                        />
                        <view
                          className="lynx-sidebar-thread-rename-action"
                          bindtap={() => {
                            const title = renameDraft.trim();
                            if (title) {
                              onRenameThread(thread.ref, title);
                            }
                            closeThreadMenu();
                          }}
                        >
                          <text className="lynx-sidebar-thread-rename-action-label">Save</text>
                        </view>
                      </view>
                    ) : (
                      <view
                        className={
                          thread.active || thread.ref.threadId === activeThreadId
                            ? "sidebar-thread-row-reference lynx-sidebar-thread-row lynx-sidebar-thread-row--active"
                            : "sidebar-thread-row-reference lynx-sidebar-thread-row"
                        }
                        bindtap={() => {
                          t3ClientActions.selectThread(thread.ref.threadId);
                          onSelectThread(thread.ref);
                        }}
                      >
                        {thread.status ? (
                          <view className="lynx-sidebar-thread-status">
                            <ThreadStatusLabel status={thread.status} />
                          </view>
                        ) : null}
                        <text
                          className="sidebar-thread-title-reference lynx-sidebar-thread-title"
                          text-maxline="1"
                        >
                          {thread.title || "Untitled thread"}
                        </text>
                        <text
                          className={
                            thread.statusLabel
                              ? "lynx-sidebar-thread-meta lynx-sidebar-thread-meta--time"
                              : "lynx-sidebar-thread-meta"
                          }
                          text-maxline="1"
                          accessibility-label={`Thread actions for ${thread.title}`}
                          bindtap={(event: { stopPropagation?: () => void }) => {
                            stopTapPropagation(event);
                            setThreadMenu({
                              threadRef: thread.ref,
                              threadKey: thread.key,
                              title: thread.title,
                            });
                          }}
                        >
                          {thread.metadataLabel.replaceAll(" ", "\u00a0")}
                        </text>
                      </view>
                    )}
                  </view>
                ))
              )}
            </view>
          ) : null}
        </view>
      ))}

      {threadMenu ? (
        <>
          <view className="lynx-sidebar-thread-menu-backdrop" bindtap={closeThreadMenu} />
          <view
            className="lynx-sidebar-thread-menu"
            bindtap={(event: { stopPropagation?: () => void }) => {
              stopTapPropagation(event);
            }}
          >
            <view
              className="lynx-sidebar-thread-menu-item"
              bindtap={() => {
                setRenameDraft(threadMenu.title);
                setRenamingThreadKey(threadMenu.threadKey);
                setThreadMenu(null);
              }}
            >
              <text className="lynx-sidebar-thread-menu-label">Rename</text>
            </view>
            <view
              className="lynx-sidebar-thread-menu-item"
              bindtap={() => {
                onArchiveThread(threadMenu.threadRef);
                closeThreadMenu();
              }}
            >
              <text className="lynx-sidebar-thread-menu-label">Archive</text>
            </view>
            <view
              className="lynx-sidebar-thread-menu-item"
              bindtap={() => {
                onDeleteThread(threadMenu.threadRef);
                closeThreadMenu();
              }}
            >
              <text className="lynx-sidebar-thread-menu-label lynx-sidebar-thread-menu-label--danger">
                Delete
              </text>
            </view>
          </view>
        </>
      ) : null}
    </view>
  );
}
