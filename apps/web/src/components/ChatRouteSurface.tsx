/**
 * Renderer-neutral chat route composition (AR5.5).
 *
 * One physical module owns the chat route's outer anatomy for Web's ChatView
 * and the Lynx chat view: the root surface, the main column (header slot,
 * banner slot, body row with the relative chat column), and the full-height
 * right panel as a root-level sibling. Behavior hosts keep title-bar inset
 * logic, terminal drawers, dialogs, and overlay mounting; panel content
 * enters through slots. The Web's maximized-right-panel mode collapses the
 * chat column via `chatColumnHidden`.
 */
import type { ReactNode } from "react";

import { cn } from "../lib/cn";
import { HostView } from "./ui/hostElements";

export function ChatRouteSurface({
  layoutControls,
  header,
  banner,
  chatColumnHidden = false,
  children,
  afterChatColumn,
  rightPanel,
  overlays,
}: {
  /** Layout controls rendered ahead of the column (Web: inline right-panel mode). */
  readonly layoutControls?: ReactNode;
  /** Route header (Web: workspace topbar; Lynx: chat topbar). */
  readonly header: ReactNode;
  /** Optional banner below the header (Web: thread error banner). */
  readonly banner?: ReactNode;
  /** Collapse the chat column when the right panel is maximized (Web). */
  readonly chatColumnHidden?: boolean;
  /** Chat column content (timeline, composer overlay, dialogs). */
  readonly children: ReactNode;
  /** Column-level extras after the body row (Web: persistent terminal drawers). */
  readonly afterChatColumn?: ReactNode;
  /** Full-height right panel (Web: inline tabs or sheet; Lynx: right panel host). */
  readonly rightPanel?: ReactNode;
  /** Root-level overlays (Web: expanded image dialog; Lynx: root overlay host). */
  readonly overlays?: ReactNode;
}) {
  return (
    <HostView className="chat-view-surface-reference relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
      {layoutControls}
      <HostView
        className={cn(
          "lynx-chat-route-column flex min-h-0 min-w-0 flex-col overflow-x-hidden",
          chatColumnHidden ? "w-0 flex-none" : "flex-1",
        )}
        data-chat-route-column=""
        data-chat-column-maximized-away={chatColumnHidden ? "true" : "false"}
      >
        {header}
        {banner}
        <HostView
          className="lynx-chat-route-body flex min-h-0 min-w-0 flex-1"
          data-chat-route-body=""
        >
          <HostView
            className="lynx-chat-route-content relative flex min-h-0 min-w-0 flex-1 flex-col"
            data-chat-route-content=""
          >
            {children}
          </HostView>
        </HostView>
        {afterChatColumn}
      </HostView>
      {rightPanel}
      {overlays}
    </HostView>
  );
}
