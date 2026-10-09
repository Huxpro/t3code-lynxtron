import type { ReactNode } from "react";

import { HostText, HostView } from "../ui/hostElements";

export function ThreadErrorBannerSurface({
  action,
  description,
  icon,
  title,
}: {
  readonly action?: ReactNode;
  readonly description: ReactNode;
  readonly icon: ReactNode;
  readonly title?: ReactNode;
}) {
  return (
    <HostView className="thread-error-banner mx-auto w-fit max-w-[min(48rem,calc(100%-2rem))] pt-3">
      <HostView className="thread-error-alert relative flex items-center gap-2 rounded-xl border border-destructive/32 bg-destructive/4 px-3.5 py-3 text-sm text-destructive-foreground">
        <HostView className="thread-error-icon flex size-4 shrink-0 items-center justify-center">
          {icon}
        </HostView>
        <HostView className="thread-error-copy min-w-0 flex flex-1 flex-col gap-1">
          {title ? (
            <HostText className="thread-error-title font-medium text-destructive-foreground">
              {title}
            </HostText>
          ) : null}
          <HostText className="thread-error-description text-destructive-foreground/80">
            {description}
          </HostText>
        </HostView>
        {action ? (
          <HostView className="thread-error-action flex shrink-0 items-center self-center">
            {action}
          </HostView>
        ) : null}
      </HostView>
    </HostView>
  );
}
