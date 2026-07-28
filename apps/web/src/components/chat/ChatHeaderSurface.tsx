import type { ReactNode } from "react";

import { HostText, HostView } from "../ui/hostElements";
import { ChatHeaderTitle } from "./ChatHeaderTitle";

export interface ChatHeaderSurfaceProps {
  readonly activeThreadTitle: string;
  readonly activeProjectName: string | undefined;
  readonly projectIcon?: ReactNode;
  readonly actions?: ReactNode;
  readonly rightPanelOpen: boolean;
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
  actions,
  rightPanelOpen,
}: ChatHeaderSurfaceProps) {
  return (
    <HostView className="@container/header-actions topbar__content flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
      <HostView className="topbar__crumb flex min-w-0 flex-1 items-center gap-2 overflow-hidden sm:gap-3">
        {activeProjectName ? (
          <HostView className="chat-header-project-group inline-flex shrink-0 items-center gap-2">
            <HostView className="chat-header-project-main inline-flex min-w-0 items-center gap-1.5">
              {projectIcon}
              <HostText className="chat-header-project-name-reference topbar__proj-name max-w-40 truncate text-sm font-medium text-muted-foreground">
                {activeProjectName}
              </HostText>
            </HostView>
            <HostText aria-hidden className="topbar__slash text-muted-foreground/40">
              /
            </HostText>
          </HostView>
        ) : null}
        <ChatHeaderTitle
          className="chat-header-thread-title-reference topbar__thread min-w-0 flex-1 truncate text-sm font-medium text-foreground"
          title={activeThreadTitle}
        />
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
