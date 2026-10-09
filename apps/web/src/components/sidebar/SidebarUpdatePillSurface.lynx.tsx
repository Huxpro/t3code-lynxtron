import type { CSSProperties, ReactNode } from "react";

import { HostButton, HostText, HostView } from "../ui/hostElements";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export type SidebarUpdatePillTone = "loading" | "warning" | "error" | "success";

const TONE_CLASSES = {
  loading: "bg-primary/15 text-primary",
  success: "bg-success/12 text-success",
  warning: "bg-warning/12 text-warning",
  error: "bg-destructive/12 text-destructive",
} as const;

const PROGRESS_CLASSES = {
  loading: "bg-primary/18",
  success: "bg-success/18",
  warning: "bg-warning/14",
  error: "bg-destructive/14",
} as const;

export function SidebarUpdatePillSurface({
  title,
  description,
  tone,
  icon,
  dismissIcon,
  dismissLabel,
  dismissTooltip,
  onActivate,
  onDismiss,
  progressDurationMs,
}: {
  readonly title: string;
  readonly description: string;
  readonly tone: SidebarUpdatePillTone;
  readonly icon: ReactNode;
  readonly dismissIcon?: ReactNode;
  readonly dismissLabel?: string;
  readonly dismissTooltip?: string;
  readonly onActivate: () => void;
  readonly onDismiss?: () => void;
  readonly progressDurationMs?: number;
}) {
  return (
    <HostView
      className={`sidebar-update-pill-surface relative flex h-7 w-full items-center overflow-hidden rounded-lg text-xs font-medium ${TONE_CLASSES[tone]}`}
      data-has-progress={progressDurationMs !== undefined ? "true" : "false"}
      data-update-title={title}
      data-update-tone={tone}
    >
      {progressDurationMs !== undefined ? (
        <HostView
          aria-hidden
          className={`sidebar-update-pill-surface__progress provider-update-pill-progress pointer-events-none absolute inset-y-0 left-0 w-full origin-left border-r border-current/15 ${PROGRESS_CLASSES[tone]}`}
          style={
            {
              "--provider-update-pill-dismiss-ms": `${progressDurationMs}ms`,
            } as CSSProperties
          }
        />
      ) : null}
      <Tooltip>
        <TooltipTrigger
          render={
            <HostButton
              aria-label={description}
              className="sidebar-update-pill-surface__main relative z-[1] flex h-full flex-1 items-center gap-2 px-2 text-left"
              onClick={onActivate}
            >
              {icon}
              <HostText>{title}</HostText>
            </HostButton>
          }
        />
        <TooltipPopup side="top">{description}</TooltipPopup>
      </Tooltip>
      {onDismiss ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <HostButton
                aria-label={dismissLabel ?? "Dismiss update notice"}
                className="sidebar-update-pill-surface__dismiss relative z-[1] mr-1 inline-flex size-5 items-center justify-center rounded-md opacity-70"
                onClick={onDismiss}
              >
                {dismissIcon}
              </HostButton>
            }
          />
          <TooltipPopup side="top">{dismissTooltip ?? "Dismiss update notice"}</TooltipPopup>
        </Tooltip>
      ) : null}
    </HostView>
  );
}
