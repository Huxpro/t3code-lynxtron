import { SettingsIcon } from "lucide-react";
import { memo, useCallback, type ReactNode } from "react";
import { Link, useNavigate } from "../../lib/router";

import { useEnvironmentIdentificationMode } from "../../hooks/useSettings";
import { cn } from "../../lib/utils";
import {
  resolveEnvironmentIdentificationPillLabel,
  resolveSidebarStageBackdropVariant,
  SidebarStageBackdrop,
  useEnvironmentStageLabel,
} from "../SidebarStageBackdrop";
import { Badge } from "../ui/badge";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "../ui/sidebar";
import { HostText } from "../ui/hostElements";
import { SidebarProviderUpdatePill } from "./SidebarProviderUpdatePill";
import { SidebarChromeFooterSurface, SidebarChromeHeaderSurface } from "./SidebarChromeSurface";
import { SidebarUpdatePill } from "./SidebarUpdatePill";
import { T3Wordmark } from "./T3Wordmark";

export const SidebarChromeHeader = memo(function SidebarChromeHeader({
  isElectron,
  authorityVisual,
  showTrigger = true,
  leadingControl,
}: {
  isElectron: boolean;
  readonly authorityVisual?: ReactNode;
  readonly showTrigger?: boolean;
  readonly leadingControl?: ReactNode;
}) {
  const stageLabel = useEnvironmentStageLabel();
  const environmentIdentificationMode = useEnvironmentIdentificationMode();
  const backdropVariant = resolveSidebarStageBackdropVariant(
    stageLabel,
    environmentIdentificationMode === "artwork",
  );
  const pillLabel =
    environmentIdentificationMode === "pill"
      ? resolveEnvironmentIdentificationPillLabel(stageLabel)
      : null;

  return (
    <SidebarChromeHeaderSurface
      isElectron={isElectron}
      backdrop={backdropVariant ? <SidebarStageBackdrop variant={backdropVariant} /> : undefined}
      authorityVisual={authorityVisual}
      trigger={
        leadingControl ??
        (showTrigger ? (
          <SidebarTrigger
            className={cn(
              "sidebar-header-toggle relative z-10 md:hidden",
              backdropVariant &&
                "[:hover,[data-pressed]]:bg-white/15 focus-visible:ring-white/90 focus-visible:ring-offset-blue-700 [&_svg]:stroke-white/90! [&_svg]:opacity-100! [&_svg]:hover:stroke-white!",
            )}
          />
        ) : null)
      }
      brand={<SidebarBrand onBackdrop={backdropVariant !== null} />}
      environmentPill={
        pillLabel ? (
          <Badge
            className="relative z-10 ml-1 rounded-full px-1.5 text-muted-foreground"
            data-environment-identification="pill"
            size="sm"
            variant="secondary"
          >
            {pillLabel}
          </Badge>
        ) : undefined
      }
    />
  );
});

function SidebarBrand({ onBackdrop }: { onBackdrop: boolean }) {
  return (
    <Link
      aria-label="Go to threads"
      className={cn(
        "sidebar-brand relative z-10 ml-[var(--workspace-titlebar-content-left)] h-7 w-fit min-w-0 shrink-0 items-center gap-1 overflow-hidden rounded-md outline-hidden ring-ring focus-visible:ring-2",
        onBackdrop && "sidebar-brand--on-backdrop",
        onBackdrop ? "text-white" : "text-foreground",
      )}
      to="/"
    >
      <T3Wordmark onBackdrop={onBackdrop} />
      <HostText
        className={cn(
          "sidebar-brand-code-label truncate text-sm font-medium tracking-tight",
          onBackdrop ? "text-white/70" : "text-muted-foreground",
        )}
      >
        Code
      </HostText>
    </Link>
  );
}

export const SidebarChromeFooter = memo(function SidebarChromeFooter({
  authorityVisual,
}: {
  readonly authorityVisual?: ReactNode;
}) {
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  const handleSettingsClick = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
    void navigate({ to: "/settings" });
  }, [isMobile, navigate, setOpenMobile]);

  return (
    <SidebarChromeFooterSurface authorityVisual={authorityVisual}>
      <SidebarProviderUpdatePill />
      <SidebarUpdatePill />
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            size="sm"
            className="sidebar-settings-row h-8 items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-sidebar-muted-foreground/80 hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
            onClick={handleSettingsClick}
          >
            <SettingsIcon className="sidebar-settings-icon size-4.5 shrink-0" />
            <HostText className="sidebar-settings-label">Settings</HostText>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarChromeFooterSurface>
  );
});
