import {
  ArrowLeftIcon,
  ChartNoAxesColumnIcon,
  GitPullRequestIcon,
  SettingsIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { memo, useCallback } from "react";
import { Link, useCanGoBack, useLocation, useNavigate } from "../../lib/router";

import { useEnvironmentIdentificationMode } from "../../hooks/useSettings";
import { cn } from "../../lib/utils";
import { useEnvironments } from "../../state/environments";
import {
  resolveEnvironmentIdentificationPillLabel,
  resolveSidebarStageBackdropVariant,
  resolveSidebarStageFocusRingOffsetClass,
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
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { SidebarChromeFooterSurface, SidebarChromeHeaderSurface } from "./SidebarChromeSurface";
import { USAGE_PAGE_AVAILABLE } from "./sidebarPages";
import { SidebarProviderUpdatePill } from "./SidebarProviderUpdatePill";
import { SidebarUpdateArchitectureWarning, SidebarUpdatePill } from "./SidebarUpdatePill";
import { T3Wordmark } from "./T3Wordmark";

export const SidebarChromeHeader = memo(function SidebarChromeHeader({
  isElectron,
  showTrigger = true,
  leadingControl,
}: {
  isElectron: boolean;
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
      trigger={
        leadingControl ??
        (showTrigger ? (
          <SidebarTrigger
            className={cn(
              "sidebar-header-toggle relative z-10 md:hidden",
              backdropVariant &&
                "focus-visible:ring-white/90 [&_svg]:stroke-white/90! [&_svg]:opacity-100! [&_svg]:hover:stroke-white! [:hover,[data-pressed]]:bg-white/15",
              backdropVariant && resolveSidebarStageFocusRingOffsetClass(backdropVariant),
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
        "sidebar-brand relative z-10 ml-[var(--workspace-titlebar-content-left)] hidden h-7 w-fit min-w-0 shrink-0 items-center gap-1 overflow-hidden rounded-md outline-hidden ring-ring focus-visible:ring-2 md:flex",
        onBackdrop && "sidebar-brand--on-backdrop",
        onBackdrop ? "text-white" : "text-foreground",
      )}
      to="/"
    >
      <T3Wordmark onBackdrop={onBackdrop} />
      <HostText
        className={cn(
          "sidebar-brand-code-label -translate-y-px truncate text-sm font-medium tracking-tight",
          onBackdrop ? "text-white/70" : "text-muted-foreground",
        )}
      >
        Code
      </HostText>
    </Link>
  );
}

function SidebarUtilityItem({
  className,
  icon,
  label,
  onClick,
}: {
  className?: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <SidebarMenuItem className="shrink-0">
      <Tooltip>
        <TooltipTrigger
          render={
            <SidebarMenuButton
              aria-label={label}
              className={className}
              onClick={onClick}
              size="icon"
            >
              {icon}
            </SidebarMenuButton>
          }
        />
        <TooltipPopup side="top">{label}</TooltipPopup>
      </Tooltip>
    </SidebarMenuItem>
  );
}

export const SidebarUtilityMenu = memo(function SidebarUtilityMenu() {
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();
  const { isMobile, setOpenMobile } = useSidebar();
  const currentFooterPage = useLocation({
    select: (location) =>
      /^\/settings(?:\/|$)/.test(location.pathname)
        ? "settings"
        : location.pathname === "/usage"
          ? "usage"
          : location.pathname === "/pull-requests"
            ? "pull-requests"
            : null,
  });
  const { environments } = useEnvironments();
  // The page reads every connected server, so one of them offering pull requests is enough for
  // the link to lead somewhere.
  const pullRequestsSupported = environments.some(
    (environment) => environment.serverConfig?.environment.capabilities.pullRequests === true,
  );
  const closeMobileSidebar = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [isMobile, setOpenMobile]);
  const handlePullRequestsClick = useCallback(() => {
    closeMobileSidebar();
    void navigate({ to: "/pull-requests", search: { involvement: "all", state: "open" } });
  }, [closeMobileSidebar, navigate]);
  const handleSettingsClick = useCallback(() => {
    closeMobileSidebar();
    void navigate({ to: "/settings" });
  }, [closeMobileSidebar, navigate]);

  const handleUsageClick = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
    void navigate({ to: "/usage" });
  }, [isMobile, navigate, setOpenMobile]);

  const handleBackClick = useCallback(() => {
    closeMobileSidebar();
    if (canGoBack) {
      window.history.back();
      return;
    }
    void navigate({ to: "/" });
  }, [canGoBack, closeMobileSidebar, navigate]);

  return (
    <SidebarMenu className="flex-row items-center">
      {currentFooterPage ? (
        <SidebarMenuItem className="min-w-0 flex-1">
          <SidebarMenuButton onClick={handleBackClick}>
            <ArrowLeftIcon />
            <HostText>Back</HostText>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ) : (
        <>
          <SidebarUtilityItem
            className="sidebar-settings-row"
            icon={<SettingsIcon />}
            label="Settings"
            onClick={handleSettingsClick}
          />
          {pullRequestsSupported ? (
            <SidebarUtilityItem
              icon={<GitPullRequestIcon />}
              label="Pull Requests"
              onClick={handlePullRequestsClick}
            />
          ) : null}
          {USAGE_PAGE_AVAILABLE ? (
            <SidebarUtilityItem
              icon={<ChartNoAxesColumnIcon />}
              label="Usage"
              onClick={handleUsageClick}
            />
          ) : null}
        </>
      )}
      <SidebarUpdatePill />
    </SidebarMenu>
  );
});

export const SidebarChromeFooter = memo(function SidebarChromeFooter() {
  return (
    <SidebarChromeFooterSurface>
      <SidebarProviderUpdatePill />
      <SidebarUpdateArchitectureWarning />
      <SidebarUtilityMenu />
    </SidebarChromeFooterSurface>
  );
});
