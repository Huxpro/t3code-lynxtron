import { type ServerProvider } from "@t3tools/contracts";
import { memo } from "react";
import { InfoIcon, XIcon } from "lucide-react";
import { cn } from "~/lib/utils";
import {
  formatProviderDriverKindLabel,
  projectProviderStatusNotice,
} from "@t3tools/client-runtime/presentation/provider";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export function getProviderStatusBannerKey(status: ServerProvider | null): string | null {
  return projectProviderStatusNotice(status)?.key ?? null;
}

export function shouldShowProviderStatusBanner(
  status: ServerProvider | null,
  dismissedBannerKey: string | null,
): boolean {
  const bannerKey = getProviderStatusBannerKey(status);
  return bannerKey !== null && bannerKey !== dismissedBannerKey;
}

export const ProviderStatusBanner = memo(function ProviderStatusBanner({
  onDismiss,
  status,
}: {
  onDismiss: () => void;
  status: ServerProvider | null;
}) {
  if (!status || status.status === "ready" || status.status === "disabled") {
    return null;
  }

  const notice = projectProviderStatusNotice(status);
  if (!notice) return null;
  const providerName = status.displayName?.trim() || formatProviderDriverKindLabel(status.driver);

  return (
    <div
      className="pointer-events-auto mx-auto w-fit max-w-[calc(100%-2rem)] pt-3"
      data-provider-status-banner
    >
      <div
        className={cn(
          "relative inline-flex items-center gap-3 rounded-xl border py-3 ps-3.5 pe-10 text-card-foreground text-sm",
          notice.tone === "warning"
            ? "border-warning/32 bg-warning/4 [&_svg]:text-warning"
            : "border-destructive/32 bg-destructive/4 text-destructive-foreground [&_svg]:text-destructive",
        )}
        role="alert"
      >
        <InfoIcon className="size-4 shrink-0" aria-hidden />
        <div className="flex min-w-0 flex-col gap-1">
          <div className="font-medium">{notice.title}</div>
          <Tooltip>
            <TooltipTrigger
              render={<div className="line-clamp-3 text-muted-foreground">{notice.message}</div>}
            />
            <TooltipPopup side="top" className="max-w-96 whitespace-pre-wrap">
              {notice.message}
            </TooltipPopup>
          </Tooltip>
        </div>
        <button
          type="button"
          aria-label={`Dismiss ${providerName} provider ${status.status}`}
          className="absolute top-2 right-2 inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-foreground/8 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onDismiss}
        >
          <XIcon aria-hidden className="size-3.5" />
        </button>
      </div>
    </div>
  );
});
