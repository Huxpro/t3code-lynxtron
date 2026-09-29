import { HostText, HostView } from "../ui/hostElements";

export function ComposerPlanFollowUpSurface({ planTitle }: { readonly planTitle: string | null }) {
  return (
    <HostView className="composer-plan-follow-up px-4 py-3.5 sm:px-5 sm:py-4">
      <HostView className="composer-plan-follow-up-heading flex flex-wrap items-center gap-2">
        <HostText className="composer-plan-follow-up-badge">Plan Ready</HostText>
        {planTitle ? (
          <HostText className="composer-plan-follow-up-title min-w-0 flex-1 truncate text-sm font-medium">
            {planTitle}
          </HostText>
        ) : null}
      </HostView>
    </HostView>
  );
}
