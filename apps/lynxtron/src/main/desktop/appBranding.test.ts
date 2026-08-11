import { assert, describe, it } from "vite-plus/test";

import { resolveLynxtronAppBranding } from "./appBranding.ts";

describe("Lynxtron app branding", () => {
  it("treats a local optimized build as the Dev product channel", () => {
    assert.deepEqual(resolveLynxtronAppBranding(undefined), {
      baseName: "T3 Code",
      stageLabel: "Dev",
      displayName: "T3 Code (Dev)",
    });
  });

  it("honors explicit distribution channels", () => {
    assert.equal(resolveLynxtronAppBranding("DEV").stageLabel, "Dev");
    assert.equal(resolveLynxtronAppBranding(" Alpha ").stageLabel, "Alpha");
    assert.deepEqual(resolveLynxtronAppBranding("latest"), {
      baseName: "T3 Code",
      stageLabel: "Latest",
      displayName: "T3 Code",
    });
    assert.equal(resolveLynxtronAppBranding("nightly").stageLabel, "Nightly");
  });

  it("fails closed to the local Dev channel for unknown metadata", () => {
    assert.equal(resolveLynxtronAppBranding("preview").stageLabel, "Dev");
  });
});
