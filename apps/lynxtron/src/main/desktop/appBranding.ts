import type { DesktopAppBranding, DesktopAppStageLabel } from "@t3tools/contracts";

const APP_BASE_NAME = "T3 Code";
const STAGES = new Set<DesktopAppStageLabel>(["Alpha", "Dev", "Latest", "Nightly"]);

export function resolveLynxtronAppStageLabel(
  env: Readonly<Record<string, string | undefined>> = process.env,
): DesktopAppStageLabel {
  const configured = env.T3_LYNXTRON_APP_STAGE_LABEL?.trim();
  return configured && STAGES.has(configured as DesktopAppStageLabel)
    ? (configured as DesktopAppStageLabel)
    : "Dev";
}

export function resolveLynxtronAppBranding(
  env: Readonly<Record<string, string | undefined>> = process.env,
): DesktopAppBranding {
  const stageLabel = resolveLynxtronAppStageLabel(env);
  return {
    baseName: APP_BASE_NAME,
    stageLabel,
    displayName: stageLabel === "Latest" ? APP_BASE_NAME : `${APP_BASE_NAME} (${stageLabel})`,
  };
}
