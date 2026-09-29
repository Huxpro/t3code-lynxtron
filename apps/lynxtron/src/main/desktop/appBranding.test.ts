import { describe, expect, it } from "vite-plus/test";

import { resolveLynxtronAppBranding, resolveLynxtronAppStageLabel } from "./appBranding.ts";

describe("Lynxtron app branding", () => {
  it("defaults an unadorned repository build to Dev", () => {
    expect(resolveLynxtronAppStageLabel({ NODE_ENV: "production" })).toBe("Dev");
    expect(resolveLynxtronAppBranding({})).toEqual({
      baseName: "T3 Code",
      stageLabel: "Dev",
      displayName: "T3 Code (Dev)",
    });
  });

  it.each(["Dev", "Nightly", "Alpha"] as const)("honors the explicit %s stage", (stageLabel) => {
    expect(resolveLynxtronAppBranding({ T3_LYNXTRON_APP_STAGE_LABEL: stageLabel })).toEqual({
      baseName: "T3 Code",
      stageLabel,
      displayName: `T3 Code (${stageLabel})`,
    });
  });

  it("uses the canonical unadorned display name for Latest", () => {
    expect(resolveLynxtronAppBranding({ T3_LYNXTRON_APP_STAGE_LABEL: "Latest" })).toEqual({
      baseName: "T3 Code",
      stageLabel: "Latest",
      displayName: "T3 Code",
    });
  });

  it("falls back to Dev for unknown stage input", () => {
    expect(resolveLynxtronAppStageLabel({ T3_LYNXTRON_APP_STAGE_LABEL: "Canary" })).toBe("Dev");
  });
});
