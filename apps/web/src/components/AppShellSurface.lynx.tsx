import type { ReactNode } from "react";

export interface AppShellSurfaceProps {
  readonly sidebar: ReactNode;
  readonly main: ReactNode;
  readonly globalControl: ReactNode;
}

/**
 * Shared physical ordering for the desktop application shell. Platform
 * providers retain their host behavior while the reachable product surface
 * composes the same sidebar, main content, and global control on Web and Lynx.
 */
export function AppShellSurface({ sidebar, main, globalControl }: AppShellSurfaceProps) {
  return (
    <>
      {sidebar}
      {main}
      {globalControl}
    </>
  );
}
