import type { ReactNode } from "react";

import { HostView } from "../ui/hostElements";

export function SidebarChromeHeaderSurface({
  isElectron,
  backdrop,
  authorityVisual,
  trigger,
  brand,
  environmentPill,
}: {
  readonly isElectron: boolean;
  readonly backdrop?: ReactNode;
  readonly authorityVisual?: ReactNode;
  readonly trigger?: ReactNode;
  readonly brand: ReactNode;
  readonly environmentPill?: ReactNode;
}) {
  return (
    <HostView
      className={[
        "sidebar-header flex flex-col gap-2 p-2",
        "lynx-sidebar-chrome-header lynx-titlebar-drag-region @container/sidebar-header relative h-[var(--workspace-topbar-height)] shrink-0 flex-row items-center px-3 py-0 md:px-0",
        authorityVisual ? "lynx-sidebar-chrome-header--authority" : undefined,
        isElectron ? "drag-region" : undefined,
      ]
        .filter(Boolean)
        .join(" ")}
      data-sidebar="header"
      data-slot="sidebar-header"
    >
      {backdrop}
      {authorityVisual}
      {trigger ? (
        <HostView className="sidebar-trigger-host lynx-titlebar-no-drag">{trigger}</HostView>
      ) : null}
      <HostView className="sidebar-brand-host lynx-titlebar-no-drag">{brand}</HostView>
      {environmentPill ? (
        <HostView className="lynx-titlebar-no-drag">{environmentPill}</HostView>
      ) : null}
    </HostView>
  );
}

export function SidebarChromeFooterSurface({
  children,
  authorityVisual,
}: {
  readonly children: ReactNode;
  readonly authorityVisual?: ReactNode;
}) {
  return (
    <HostView
      className={[
        "sidebar-footer flex flex-col gap-2 p-[var(--sidebar-content-inset)]",
        authorityVisual ? "sidebar-footer--authority" : undefined,
      ]
        .filter(Boolean)
        .join(" ")}
      data-sidebar="footer"
      data-slot="sidebar-footer"
    >
      {authorityVisual}
      {children}
    </HostView>
  );
}
