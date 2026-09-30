import { type ServerProvider } from "@t3tools/contracts";
import { memo } from "react";
import { InfoIcon, XIcon } from "lucide-react";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
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
          "alert-glass relative inline-flex items-center gap-3 rounded-xl border py-3 ps-3.5 pe-10 text-card-foreground text-sm",
          notice.tone === "warning"
            ? "border-warning/32 [&_svg]:text-warning"
            : "border-destructive/32 text-destructive-foreground [&_svg]:text-destructive",
        )}
        data-variant={status.status === "warning" ? "warning" : "error"}
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
        <Button
          aria-label={`Dismiss ${providerName} provider ${status.status}`}
          className="absolute top-2 right-2 size-6 text-muted-foreground hover:text-foreground"
          onClick={onDismiss}
          size="icon-xs"
          variant="ghost"
        >
          <XIcon aria-hidden className="size-3.5" />
        </Button>
      </div>
    </div>
  );
});
