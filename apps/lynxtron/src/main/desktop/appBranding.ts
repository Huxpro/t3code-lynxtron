import type { DesktopAppBranding, DesktopAppStageLabel } from "@t3tools/contracts";

const APP_BASE_NAME = "T3 Code";

/**
 * Resolve Lynxtron branding from explicit build-channel metadata. A local
 * monorepo artifact is a Dev preview even though its optimized host bundle is
 * built with NODE_ENV=production; NODE_ENV describes compilation, not the
 * product release channel.
 */
export function resolveLynxtronAppBranding(
  configuredStage: string | null | undefined,
): DesktopAppBranding {
  const normalized = configuredStage?.trim().toLowerCase();
  const stageLabel: DesktopAppStageLabel =
    normalized === "alpha"
      ? "Alpha"
      : normalized === "latest"
        ? "Latest"
        : normalized === "nightly"
          ? "Nightly"
          : "Dev";
  return {
    baseName: APP_BASE_NAME,
    stageLabel,
    displayName: stageLabel === "Latest" ? APP_BASE_NAME : `${APP_BASE_NAME} (${stageLabel})`,
  };
}
