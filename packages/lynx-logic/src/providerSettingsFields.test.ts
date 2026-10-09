import { CodexSettings, OpenCodeSettings } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  deriveProviderSettingsFields,
  nextProviderConfigWithFieldValue,
  readProviderConfigStringArray,
} from "./providerSettingsFields.ts";

describe("provider settings fields", () => {
  it("derives connection-critical Codex fields in schema order", () => {
    expect(deriveProviderSettingsFields(CodexSettings).map((field) => field.key)).toEqual([
      "binaryPath",
      "homePath",
      "shadowHomePath",
      "launchArgs",
    ]);
  });

  it("preserves opaque config while updating annotated fields", () => {
    const serverUrl = deriveProviderSettingsFields(OpenCodeSettings).find(
      (field) => field.key === "serverUrl",
    );
    expect(serverUrl).toBeDefined();
    expect(
      nextProviderConfigWithFieldValue(
        { forkOwned: true, serverUrl: "http://old" },
        serverUrl!,
        "http://new",
      ),
    ).toEqual({ forkOwned: true, serverUrl: "http://new" });
  });

  it("reads only string entries from opaque config arrays", () => {
    expect(
      readProviderConfigStringArray(
        { customModels: ["codex-1", 42, null, "codex-2"] },
        "customModels",
      ),
    ).toEqual(["codex-1", "codex-2"]);
    expect(readProviderConfigStringArray({ customModels: "codex-1" }, "customModels")).toEqual([]);
    expect(readProviderConfigStringArray(undefined, "customModels")).toEqual([]);
  });
});
