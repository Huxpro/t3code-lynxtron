import type { ConnectorLifecyclePresentation } from "@t3tools/client-runtime/presentation/connector-lifecycle";
import type { ReactNode } from "react";

import { cn } from "../../lib/cn";
import { HostButton, HostText, HostView } from "../ui/hostElements";

export function ConnectorLifecycleBannerSurface({
  presentation,
  icon,
  onAction,
}: {
  readonly presentation: ConnectorLifecyclePresentation;
  readonly icon?: ReactNode;
  readonly onAction?: () => void;
}) {
  if (!presentation.visible) return null;

  return (
    <HostView
      className={cn(
        "lynx-connector-lifecycle mx-3 mt-2 flex shrink-0 items-start gap-2.5 rounded-lg border px-3 py-2.5",
        `lynx-connector-lifecycle--${presentation.tone}`,
        presentation.tone === "error"
          ? "border-destructive/35 bg-destructive/8 text-foreground"
          : presentation.tone === "warning"
            ? "border-amber-500/25 bg-amber-500/8 text-foreground"
            : "border-border/70 bg-muted/55 text-foreground",
      )}
      data-connector-lifecycle={presentation.tone}
      role={presentation.tone === "error" ? "alert" : "status"}
    >
      <HostView className="lynx-connector-lifecycle__marker-slot mt-1 flex size-2 shrink-0 items-center justify-center">
        {icon ?? (
          <HostView
            aria-hidden
            className={cn(
              "lynx-connector-lifecycle__marker size-1.5 rounded-full",
              presentation.tone === "error"
                ? "bg-destructive"
                : presentation.tone === "warning"
                  ? "bg-amber-500"
                  : "bg-muted-foreground",
            )}
          />
        )}
      </HostView>
      <HostView className="lynx-connector-lifecycle__body min-w-0 flex-1">
        <HostText className="lynx-connector-lifecycle__title block text-xs font-semibold">
          {presentation.title}
        </HostText>
        {presentation.description ? (
          <HostText
            className={cn(
              "lynx-connector-lifecycle__description mt-0.5 block text-[11px] leading-4",
              presentation.tone === "error"
                ? "text-destructive-foreground/80"
                : "text-muted-foreground",
            )}
          >
            {presentation.description}
          </HostText>
        ) : null}
      </HostView>
      {presentation.actionLabel && onAction ? (
        <HostButton
          type="button"
          className={cn(
            "lynx-connector-lifecycle__action shrink-0 rounded-md border px-2.5 py-1 text-[11px] font-medium",
            presentation.tone === "error"
              ? "border-destructive/30 bg-background/70 text-foreground"
              : "border-border/70 text-foreground",
          )}
          onClick={onAction}
        >
          <HostText>{presentation.actionLabel}</HostText>
        </HostButton>
      ) : null}
    </HostView>
  );
}
