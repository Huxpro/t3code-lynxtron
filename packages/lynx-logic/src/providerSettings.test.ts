import {
  DEFAULT_SERVER_SETTINGS,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { deriveProviderInstanceEntries } from "./provider.ts";
import {
  buildProviderInstanceCreatePatch,
  buildProviderInstanceDeletePatch,
  buildProviderInstanceEnabledPatch,
  withProviderCustomModels,
} from "./providerSettings.ts";

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
  it("writes an entry for a default instance that had none", () => {
    const [entry] = deriveProviderInstanceEntries([provider("codex")]);

    const patch = buildProviderInstanceEnabledPatch({
      settings: DEFAULT_SERVER_SETTINGS,
      entry: entry!,
      enabled: false,
    });

    expect(patch.providerInstances?.[ProviderInstanceId.make("codex")]).toEqual({
      driver: "codex",
      enabled: false,
    });
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

    expect(patch.providerInstances?.[instanceId]).toEqual({
      ...settings.providerInstances[instanceId],
      enabled: false,
    });
  });
});

describe("provider instance lifecycle patches", () => {
  it("creates and deletes a custom server provider instance", () => {
    const instanceId = ProviderInstanceId.make("claude_work");
    const instance = {
      driver: ProviderDriverKind.make("claudeAgent"),
      displayName: "Work Claude",
    };
    const created = buildProviderInstanceCreatePatch({
      settings: DEFAULT_SERVER_SETTINGS,
      instanceId,
      instance,
    });
    expect(created.providerInstances?.[instanceId]).toEqual(instance);

    const deleted = buildProviderInstanceDeletePatch({
      settings: {
        ...DEFAULT_SERVER_SETTINGS,
        providerInstances: { [instanceId]: instance },
      },
      instanceId,
    });
    expect(deleted.providerInstances).toEqual({});
  });

  it("updates custom models while preserving opaque provider config", () => {
    expect(
      withProviderCustomModels(
        {
          driver: ProviderDriverKind.make("codex"),
          config: { binaryPath: "/opt/codex", forkOwned: true },
        },
        [" custom-model ", "custom-model"],
      ),
    ).toEqual({
      driver: "codex",
      config: {
        binaryPath: "/opt/codex",
        forkOwned: true,
        customModels: ["custom-model"],
      },
    });
  });
});
