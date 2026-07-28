import type { ReactNode } from "react";

import { HostView } from "../ui/hostElements";

export function SidebarChromeHeaderSurface({
  isElectron,
  backdrop,
  trigger,
  brand,
}: {
  readonly isElectron: boolean;
  readonly backdrop?: ReactNode;
  readonly trigger: ReactNode;
  readonly brand: ReactNode;
}) {
  return (
    <HostView
      className={[
        "sidebar-header flex flex-col gap-2 p-2",
        "lynx-sidebar-chrome-header @container/sidebar-header relative h-[var(--workspace-topbar-height)] shrink-0 flex-row items-center px-3 py-0 md:px-0",
        isElectron ? "drag-region" : undefined,
      ]
        .filter(Boolean)
        .join(" ")}
      data-sidebar="header"
      data-slot="sidebar-header"
    >
      {backdrop}
      {trigger}
      {brand}
    </HostView>
  );
}

export function SidebarChromeFooterSurface({ children }: { readonly children: ReactNode }) {
  return (
    <HostView
      className="sidebar-footer flex flex-col gap-2 p-2"
      data-sidebar="footer"
      data-slot="sidebar-footer"
    >
      {children}
    </HostView>
  );
}
