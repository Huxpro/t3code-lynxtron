import type { ReactNode } from "react";

import { HostButton, HostText, HostView } from "../ui/hostElements";
import { ChatHeaderTitle } from "./ChatHeaderTitle";

export interface ChatHeaderSurfaceProps {
  readonly activeThreadTitle: string;
  readonly activeProjectName: string | undefined;
  readonly projectIcon?: ReactNode;
  readonly onNewThreadInProject?: (() => void) | undefined;
  readonly actions?: ReactNode;
  readonly rightPanelOpen: boolean;
  readonly contentProps?: Record<string, unknown>;
  /** Host title leaf (Lynx: a tappable title or an inline rename field). */
  readonly titleElement?: ReactNode;
}

/**
 * Shared Header composition. Platform leaves own the project icon, title
 * primitive, and action implementations; ordering, copy, truncation, spacing,
 * and responsive action placement stay physical shared source.
 */
export function ChatHeaderSurface({
  activeThreadTitle,
  activeProjectName,
  projectIcon,
  onNewThreadInProject,
  actions,
  rightPanelOpen,
  contentProps,
  titleElement,
}: ChatHeaderSurfaceProps) {
  return (
    <HostView
      className="@container/header-actions topbar__content flex min-w-0 flex-1 items-center gap-2 sm:gap-3"
      {...contentProps}
    >
      <HostView className="topbar__crumb flex min-w-0 flex-1 items-center gap-2 overflow-hidden sm:gap-3">
        {activeProjectName ? (
          <HostView className="chat-header-project-group inline-flex shrink-0 items-center gap-2">
            <HostButton
              type="button"
              aria-label={`New thread in ${activeProjectName}`}
              title={`New thread in ${activeProjectName}`}
              onClick={onNewThreadInProject}
              className="chat-header-project-main inline-flex min-w-0 cursor-pointer items-center gap-1.5 rounded-sm bg-transparent p-0 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            >
              {projectIcon}
              <HostText className="chat-header-project-name-reference topbar__proj-name max-w-40 truncate text-sm font-medium text-muted-foreground">
                {activeProjectName}
              </HostText>
            </HostButton>
            <HostText aria-hidden className="topbar__slash text-muted-foreground/40">
              /
            </HostText>
          </HostView>
        ) : null}
        {titleElement ?? (
          <ChatHeaderTitle
            className="chat-header-thread-title-reference topbar__thread min-w-0 flex-1 truncate text-sm font-medium text-foreground"
            title={activeThreadTitle}
          />
        )}
      </HostView>
      <HostView
        data-chat-header-actions
        className={`topbar__actions flex shrink-0 items-center justify-end gap-2 @3xl/header-actions:gap-3 ${
          rightPanelOpen ? "pr-0" : "pr-16"
        }`}
      >
        {actions}
      </HostView>
    </HostView>
  );
}
