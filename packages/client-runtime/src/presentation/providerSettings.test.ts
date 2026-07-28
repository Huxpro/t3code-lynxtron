import {
  DEFAULT_SERVER_SETTINGS,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { deriveProviderInstanceEntries } from "./provider.ts";
import { buildProviderInstanceEnabledPatch } from "./providerSettings.ts";

function provider(instanceId: string, driver = "codex"): ServerProvider {
  return {
    instanceId: ProviderInstanceId.make(instanceId),
    driver: ProviderDriverKind.make(driver),
    enabled: true,
    installed: true,
    version: null,
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-01-01T00:00:00.000Z",
    models: [],
    slashCommands: [],
    skills: [],
  };
}

describe("buildProviderInstanceEnabledPatch", () => {
  it("promotes a default instance while preserving its effective legacy config", () => {
    const [entry] = deriveProviderInstanceEntries([provider("codex")]);
    const settings = {
      ...DEFAULT_SERVER_SETTINGS,
      providers: {
        ...DEFAULT_SERVER_SETTINGS.providers,
        codex: {
          ...DEFAULT_SERVER_SETTINGS.providers.codex,
          binaryPath: "/opt/codex",
        },
      },
    };

    const patch = buildProviderInstanceEnabledPatch({
      settings,
      entry: entry!,
      enabled: false,
    });

    expect(patch.providerInstances?.[ProviderInstanceId.make("codex")]).toEqual({
      driver: "codex",
      config: settings.providers.codex,
      enabled: false,
    });
    expect(patch.providers?.codex).toEqual(DEFAULT_SERVER_SETTINGS.providers.codex);
  });

  it("updates an explicit custom instance without dropping opaque config", () => {
    const [entry] = deriveProviderInstanceEntries([provider("claude_work", "claudeAgent")]);
    const instanceId = ProviderInstanceId.make("claude_work");
    const settings = {
      ...DEFAULT_SERVER_SETTINGS,
      providerInstances: {
        [instanceId]: {
          driver: ProviderDriverKind.make("claudeAgent"),
          displayName: "Work Claude",
          config: { homePath: "/work/claude" },
        },
      },
    };

    const patch = buildProviderInstanceEnabledPatch({
      settings,
      entry: entry!,
      enabled: false,
    });

    expect(patch.providers).toBeUndefined();
    expect(patch.providerInstances?.[instanceId]).toEqual({
      ...settings.providerInstances[instanceId],
      enabled: false,
    });
  });
});
