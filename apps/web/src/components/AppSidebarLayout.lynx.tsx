import type { ReactNode } from "@lynx-js/react";

import { AppShellSurface } from "./AppShellSurface";
import ThreadSidebar from "./Sidebar";
import ThreadSidebarV2 from "./SidebarV2";
import { useLocation } from "../lib/router";
import { Sidebar, SidebarProvider, SidebarTrigger } from "./ui/sidebar";

/**
 * Lynx keeps only the window/resizing host shell platform-specific. The full
 * Sidebar composition and its canonical state/actions remain the Web modules.
 */
export function AppSidebarLayout({ children }: { children: ReactNode }) {
  const pathname = useLocation({ select: (location) => location.pathname });
  const isOnSettings = pathname === "/settings" || pathname.startsWith("/settings/");

  return (
    <SidebarProvider
      className="app-root h-full min-h-0"
      defaultOpen
      style={{ "--sidebar-width": "16rem" }}
    >
      <AppShellSurface
        sidebar={
          <Sidebar
            side="left"
            collapsible="offcanvas"
            data-app-sidebar=""
            data-sidebar-version="v2"
            className="sidebar border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
          >
            {isOnSettings ? <ThreadSidebar /> : <ThreadSidebarV2 />}
          </Sidebar>
        }
        main={children}
        globalControl={
          <view className="lynx-sidebar-global-control">
            <SidebarTrigger aria-label="Toggle main sidebar" className="sidebar-global-toggle" />
          </view>
        }
      />
    </SidebarProvider>
  );
}
