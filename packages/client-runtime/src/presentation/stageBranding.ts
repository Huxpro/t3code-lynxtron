import type { EnvironmentIdentificationMode } from "@t3tools/contracts";

export type SidebarStageBackdropVariant = "nightly" | "dev";
export type EnvironmentIdentificationPillLabel = "Dev" | "Nightly";

export interface EnvironmentIdentificationPresentation {
  readonly backdropVariant: SidebarStageBackdropVariant | null;
  readonly pillLabel: EnvironmentIdentificationPillLabel | null;
}

export function projectEnvironmentIdentification(input: {
  readonly stageLabel: string;
  readonly mode: EnvironmentIdentificationMode;
}): EnvironmentIdentificationPresentation {
  const stage = input.stageLabel.trim().toLowerCase();
  const backdropVariant = stage === "dev" ? "dev" : stage === "nightly" ? "nightly" : null;
  const pillLabel = stage === "dev" ? "Dev" : stage === "nightly" ? "Nightly" : null;
  return {
    backdropVariant: input.mode === "artwork" ? backdropVariant : null,
    pillLabel: input.mode === "pill" ? pillLabel : null,
  };
}

export function resolveSidebarStageBackdropVariant(
  stageLabel: string,
  enabled = true,
): SidebarStageBackdropVariant | null {
  return projectEnvironmentIdentification({
    stageLabel,
    mode: enabled ? "artwork" : "none",
  }).backdropVariant;
}

export function resolveEnvironmentIdentificationPillLabel(
  stageLabel: string,
): EnvironmentIdentificationPillLabel | null {
  return projectEnvironmentIdentification({ stageLabel, mode: "pill" }).pillLabel;
}
