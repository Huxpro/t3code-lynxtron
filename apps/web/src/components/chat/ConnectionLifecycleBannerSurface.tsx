import type { ConnectionLifecyclePresentation } from "@t3tools/client-runtime/connection/presentation";
import type { ReactNode } from "react";

import { cn } from "../../lib/cn";
import { HostButton, HostText, HostView } from "../ui/hostElements";

export function ConnectionLifecycleBannerSurface({
  presentation,
  icon,
  onReconnect,
  onOpenConnections,
}: {
  readonly presentation: ConnectionLifecyclePresentation;
  readonly icon?: ReactNode;
  readonly onReconnect: () => void;
  readonly onOpenConnections: () => void;
}) {
  if (!presentation.visible) return null;

  const recovery = presentation.recovery;
  return (
    <HostView
      className={cn(
        "connection-lifecycle-banner-reference mx-3 mt-2 flex min-w-0 items-center gap-3 rounded-md border px-3 py-2",
        `connection-lifecycle-banner-reference--${presentation.tone}`,
        presentation.tone === "error"
          ? "border-destructive/40 bg-destructive/10"
          : presentation.tone === "warning"
            ? "border-border bg-muted/70"
            : "border-border bg-muted/40",
      )}
      data-connection-lifecycle-phase={presentation.phase}
      role={presentation.tone === "error" ? "alert" : "status"}
    >
      {icon ? <HostView className="connection-lifecycle-icon">{icon}</HostView> : null}
      <HostView className="min-w-0 flex-1" data-connection-lifecycle-copy>
        <HostText
          className="connection-lifecycle-title block truncate text-xs font-medium text-foreground"
          data-connection-lifecycle-title
        >
          {presentation.title}
        </HostText>
        {presentation.description ? (
          <HostText
            className="connection-lifecycle-description mt-0.5 block text-[11px] leading-snug text-muted-foreground"
            data-connection-lifecycle-description
          >
            {presentation.description}
          </HostText>
        ) : null}
      </HostView>
      {recovery ? (
        <HostView
          className="connection-lifecycle-actions flex shrink-0 items-center gap-1.5"
          data-connection-lifecycle-actions
        >
          <HostButton
            type="button"
            className={cn(
              "connection-lifecycle-reconnect rounded border border-border px-2 py-1 text-[11px] font-medium text-foreground",
              recovery.primaryDisabled ? "opacity-50" : "active:bg-accent",
            )}
            aria-disabled={recovery.primaryDisabled}
            data-connection-lifecycle-reconnect
            onClick={recovery.primaryDisabled ? undefined : onReconnect}
          >
            <HostText>{recovery.primaryLabel}</HostText>
          </HostButton>
          <HostButton
            type="button"
            className="connection-lifecycle-connections rounded px-2 py-1 text-[11px] font-medium text-muted-foreground active:bg-accent"
            data-connection-lifecycle-connections
            onClick={onOpenConnections}
          >
            <HostText>{recovery.secondaryLabel}</HostText>
          </HostButton>
        </HostView>
      ) : null}
    </HostView>
  );
}
