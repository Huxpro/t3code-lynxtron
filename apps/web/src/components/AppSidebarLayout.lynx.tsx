import type { ReactNode } from "@lynx-js/react";

import { ICON_PNGS } from "../../../lynxtron/src/app/components/iconData";
import { Icon } from "../../../lynxtron/src/app/components/Icon";
import { AppSidebarComposition } from "./AppSidebarComposition";
import ThreadSidebar from "./Sidebar";
import ThreadSidebarV2 from "./SidebarV2";
import { useLocation } from "../lib/router";
import { useEnvironmentIdentificationMode, useLegacySidebarEnabled } from "../hooks/useSettings";
import { useSidebarStageBackdropVariant } from "./SidebarStageBackdrop";
import { Sidebar, SidebarTrigger, useSidebarVisibility } from "./ui/sidebar";

function SidebarGlobalControl() {
  const open = useSidebarVisibility();
  const identificationMode = useEnvironmentIdentificationMode();
  const stageBackdropVariant = useSidebarStageBackdropVariant(identificationMode === "artwork");
  const onBackdrop = open && stageBackdropVariant !== null;
  return (
    <view
      className={`lynx-sidebar-global-control${
        onBackdrop ? " lynx-sidebar-global-control--on-backdrop" : ""
      }`}
    >
      <SidebarTrigger aria-label="Toggle main sidebar" className="sidebar-global-toggle">
        <Icon
          name={open ? "panel-left-close" : "panel-left"}
          size={16}
          color={onBackdrop ? "#ffffff" : "#818181"}
          className="sidebar-global-toggle-icon"
        />
      </SidebarTrigger>
    </view>
  );
}

/**
 * Lynx keeps only the window/resizing host shell platform-specific. The full
 * Sidebar composition and its canonical state/actions remain the Web modules.
 */
export function AppSidebarLayout({ children }: { children: ReactNode }) {
  const pathname = useLocation({ select: (location) => location.pathname });
  const legacySidebarEnabled = useLegacySidebarEnabled();
  const isOnSettings = pathname === "/settings" || pathname.startsWith("/settings/");
  const useFlatSidebar = !legacySidebarEnabled && !isOnSettings;
  const useFlatSidebarTheme = useFlatSidebar || isOnSettings;

  return (
    <AppSidebarComposition
      providerClassName="app-root h-full min-h-0"
      providerStyle={{ "--sidebar-width": "16rem" }}
      sidebarContent={useFlatSidebar ? <ThreadSidebarV2 /> : <ThreadSidebar />}
      renderSidebar={(content) => (
        <Sidebar
          side="left"
          collapsible="offcanvas"
          data-app-sidebar=""
          data-sidebar-version={useFlatSidebarTheme ? "flat" : "legacy"}
          className={`sidebar border-r border-sidebar-border bg-sidebar text-sidebar-foreground${useFlatSidebarTheme ? " sidebar--flat" : ""}`}
        >
          <view className="sidebar-grain" aria-hidden>
            {[0, 1, 2, 3].map((tile) => (
              <image
                key={tile}
                className="sidebar-grain__tile"
                style={{ top: `${tile * 256}px` }}
                src={
                  ICON_PNGS[
                    useFlatSidebarTheme ? "sidebar-grain-flat@fill" : "sidebar-grain@fill"
                  ] ?? ""
                }
              />
            ))}
          </view>
          {content}
        </Sidebar>
      )}
      main={children}
      globalControl={<SidebarGlobalControl />}
    />
  );
}
