import type { CSSProperties, ReactNode } from "react";

import { AppShellSurface } from "./AppShellSurface";
import ThreadSidebar from "./Sidebar";
import ThreadSidebarV2 from "./SidebarV2";
import { SidebarProvider, SidebarRail } from "./ui/sidebar";

export function AppSidebarComposition({
  globalControl,
  main,
  providerClassName,
  providerStyle,
  renderSidebar,
  sidebarContent,
  useFlatSidebar,
}: {
  readonly globalControl: ReactNode;
  readonly main: ReactNode;
  readonly providerClassName: string;
  readonly providerStyle: CSSProperties | Readonly<Record<string, string | number>>;
  readonly renderSidebar: (content: ReactNode) => ReactNode;
  readonly sidebarContent?: ReactNode;
  readonly useFlatSidebar: boolean;
}) {
  const sidebar = renderSidebar(
    <>
      {sidebarContent ?? (useFlatSidebar ? <ThreadSidebarV2 /> : <ThreadSidebar />)}
      <SidebarRail />
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
