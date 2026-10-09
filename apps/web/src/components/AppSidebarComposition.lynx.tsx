import type { CSSProperties, ReactNode } from "react";

import { AppShellSurface } from "./AppShellSurface";
import { SidebarProvider, SidebarRail } from "./ui/sidebar";

/**
 * Shared provider + shell composition for Web and Lynx. Each platform layout
 * decides which sidebar content to mount (the Web and Lynx sidebar modules
 * differ), so this module stays free of sidebar imports.
 */
export function AppSidebarComposition({
  globalControl,
  main,
  onRailDoubleClick,
  providerClassName,
  providerStyle,
  renderSidebar,
  sidebarContent,
}: {
  readonly globalControl: ReactNode;
  readonly main: ReactNode;
  readonly onRailDoubleClick?: () => void;
  readonly providerClassName: string;
  readonly providerStyle: CSSProperties | Readonly<Record<string, string | number>>;
  readonly renderSidebar: (content: ReactNode) => ReactNode;
  readonly sidebarContent: ReactNode;
}) {
  const sidebar = renderSidebar(
    <>
      {sidebarContent}
      <SidebarRail {...(onRailDoubleClick ? { onDoubleClick: onRailDoubleClick } : {})} />
    </>,
  );

  return (
    <SidebarProvider
      className={providerClassName}
      defaultOpen
      style={providerStyle as CSSProperties}
    >
      <AppShellSurface sidebar={sidebar} main={main} globalControl={globalControl} />
    </SidebarProvider>
  );
}
