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
  bodyOverlay,
  chatColumnHidden = false,
  children,
  afterChatColumn,
  rightPanel,
  overlays,
  onClick,
  activeThreadKind,
  activeThreadId,
  connectionStatus,
  connectionStatusDetail,
}: {
  /** Layout controls rendered ahead of the column (Web: inline right-panel mode). */
  readonly layoutControls?: ReactNode | undefined;
  /** Route header (Web: workspace topbar; Lynx: chat topbar). */
  readonly header: ReactNode;
  /** Optional banner below the header (Web: thread error banner). */
  readonly banner?: ReactNode | undefined;
  /** Body overlay below the header without affecting timeline or Composer layout. */
  readonly bodyOverlay?: ReactNode | undefined;
  /** Collapse the chat column when the right panel is maximized (Web). */
  readonly chatColumnHidden?: boolean | undefined;
  /** Chat column content (timeline, composer overlay, dialogs). */
  readonly children: ReactNode;
  /** Column-level extras after the body row (Web: persistent terminal drawers). */
  readonly afterChatColumn?: ReactNode | undefined;
  /** Full-height right panel (Web: inline tabs or sheet; Lynx: right panel host). */
  readonly rightPanel?: ReactNode | undefined;
  /** Root-level overlays (Web: expanded image dialog; Lynx: root overlay host). */
  readonly overlays?: ReactNode | undefined;
  /** Optional renderer-owned route tap handler (Lynx: outside-overlay dismissal). */
  readonly onClick?: (() => void) | undefined;
  /** Semantic lifecycle marker used by cross-renderer verification. */
  readonly activeThreadKind?: "draft" | "server" | "none" | undefined;
  readonly activeThreadId?: string | undefined;
  readonly connectionStatus?: string | undefined;
  readonly connectionStatusDetail?: string | undefined;
}) {
  return (
    <HostView
      className="chat-view-surface-reference relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-background"
      data-active-thread-kind={activeThreadKind}
      data-active-thread-id={activeThreadId}
      data-connection-status={connectionStatus}
      data-connection-status-detail={connectionStatusDetail}
      onClick={onClick}
    >
      {layoutControls}
      <HostView
        className={cn(
          "flex min-h-0 min-w-0 flex-col overflow-x-hidden",
          chatColumnHidden ? "w-0 flex-none" : "flex-1",
        )}
        data-chat-column-maximized-away={chatColumnHidden ? "true" : "false"}
      >
        {header}
        {banner}
        <HostView className="chat-body-reference relative flex min-h-0 min-w-0 flex-1">
          <HostView className="relative flex min-h-0 min-w-0 flex-1 flex-col">{children}</HostView>
          {bodyOverlay}
        </HostView>
        {afterChatColumn}
      </HostView>
      {rightPanel}
      {overlays}
    </HostView>
  );
}
