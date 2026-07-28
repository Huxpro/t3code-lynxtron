import type { DesktopEnvironmentBootstrap } from "@t3tools/contracts";

const NO_DESKTOP_LOCAL_BOOTSTRAPS: ReadonlyArray<DesktopEnvironmentBootstrap> = [];

export function useDesktopLocalBootstraps(): ReadonlyArray<DesktopEnvironmentBootstrap> {
  return NO_DESKTOP_LOCAL_BOOTSTRAPS;
}
