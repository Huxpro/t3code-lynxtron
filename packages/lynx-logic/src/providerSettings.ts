import type {
  ProviderDriverKind,
  ProviderInstanceConfig,
  ProviderInstanceId,
  ServerSettings,
  UnifiedSettings,
} from "@t3tools/contracts";
import { DEFAULT_SERVER_SETTINGS } from "@t3tools/contracts/settings";

import type { ProviderInstanceEntry } from "./provider.ts";

function withoutProviderInstanceKey<V>(
  record: Readonly<Partial<Record<ProviderInstanceId, V>>>,
  instanceId: ProviderInstanceId,
): Partial<Record<ProviderInstanceId, V>> {
  const next = { ...record };
  delete next[instanceId];
  return next;
}

export function buildProviderInstanceCreatePatch(input: {
  readonly settings: Pick<ServerSettings, "providerInstances">;
  readonly instanceId: ProviderInstanceId;
  readonly instance: ProviderInstanceConfig;
}): Partial<UnifiedSettings> {
  return {
    providerInstances: {
      ...input.settings.providerInstances,
      [input.instanceId]: input.instance,
    },
  };
}

export function buildProviderInstanceDeletePatch(input: {
  readonly settings: Pick<ServerSettings, "providerInstances">;
  readonly instanceId: ProviderInstanceId;
}): Partial<UnifiedSettings> {
  return {
    providerInstances: withoutProviderInstanceKey(
      input.settings.providerInstances,
      input.instanceId,
    ) as ServerSettings["providerInstances"],
  };
}

export function withProviderCustomModels(
  instance: ProviderInstanceConfig,
  customModels: ReadonlyArray<string>,
): ProviderInstanceConfig {
  const normalized = [
    ...new Set(customModels.map((model) => model.trim()).filter((model) => model.length > 0)),
  ];
  const config =
    instance.config !== null && typeof instance.config === "object"
      ? { ...(instance.config as Record<string, unknown>) }
      : {};
  if (normalized.length === 0) delete config.customModels;
  else config.customModels = normalized;
  const { config: _config, ...rest } = instance;
  return Object.keys(config).length > 0 ? { ...rest, config } : rest;
}

export function buildProviderInstanceUpdatePatch(input: {
  readonly settings: Pick<ServerSettings, "providers" | "providerInstances">;
  readonly instanceId: ProviderInstanceId;
  readonly instance: ProviderInstanceConfig;
  readonly driver: ProviderDriverKind;
  readonly isDefault: boolean;
  readonly textGenerationModelSelection?:
    | ServerSettings["textGenerationModelSelection"]
    | undefined;
}): Partial<UnifiedSettings> {
  type LegacyProviderSettings = ServerSettings["providers"][keyof ServerSettings["providers"]];
  const legacyProviderDefaults = DEFAULT_SERVER_SETTINGS.providers as Record<
    string,
    LegacyProviderSettings | undefined
  >;
  const legacyProviderDefault = input.isDefault ? legacyProviderDefaults[input.driver] : undefined;
  return {
    ...(legacyProviderDefault !== undefined
      ? {
          providers: {
            ...input.settings.providers,
            [input.driver]: legacyProviderDefault,
          } as ServerSettings["providers"],
        }
      : {}),
    providerInstances: {
      ...input.settings.providerInstances,
      [input.instanceId]: input.instance,
    },
    ...(input.textGenerationModelSelection !== undefined
      ? { textGenerationModelSelection: input.textGenerationModelSelection }
      : {}),
  };
}

export function buildProviderInstanceEnabledPatch(input: {
  readonly settings: Pick<ServerSettings, "providers" | "providerInstances">;
  readonly entry: ProviderInstanceEntry;
  readonly enabled: boolean;
}): Partial<UnifiedSettings> {
  type LegacyProviderSettings = ServerSettings["providers"][keyof ServerSettings["providers"]];
  const legacyProviders = input.settings.providers as Readonly<
    Record<string, LegacyProviderSettings | undefined>
  >;
  const explicitInstance = input.settings.providerInstances[input.entry.instanceId];
  const legacyConfig = input.entry.isDefault ? legacyProviders[input.entry.driverKind] : undefined;
  const instance: ProviderInstanceConfig = {
    ...(explicitInstance ?? {
      driver: input.entry.driverKind,
      ...(input.entry.snapshot.displayName
        ? { displayName: input.entry.snapshot.displayName }
        : {}),
      ...(input.entry.snapshot.accentColor
        ? { accentColor: input.entry.snapshot.accentColor }
        : {}),
      ...(legacyConfig !== undefined ? { config: legacyConfig } : {}),
    }),
    enabled: input.enabled,
  };

  return buildProviderInstanceUpdatePatch({
    settings: input.settings,
    instanceId: input.entry.instanceId,
    instance,
    driver: input.entry.driverKind,
    isDefault: input.entry.isDefault,
  });
}
