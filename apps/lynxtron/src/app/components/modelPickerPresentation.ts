import type {
  ModelSelection,
  ProviderDriverKind,
  ProviderInstanceId,
  ServerProvider,
} from "@t3tools/contracts";
import {
  describeUnavailableProviderInstance,
  providerInstanceLockedReason,
  providerModelKey,
  rankModelPickerSearchResults,
  sortModelPickerItems,
  startedThreadModelChangeReason,
  type ModelPickerModel,
} from "@t3tools/client-runtime/presentation/model-picker";
import type { ProviderInstanceEntry } from "@t3tools/client-runtime/presentation/provider";

export interface ModelPickerProviderPresentation {
  readonly entry: ProviderInstanceEntry;
  readonly disabledReason: string | null;
}

export interface ModelPickerRowPresentation {
  readonly model: ModelPickerModel;
  readonly favorite: boolean;
  readonly disabledReason: string | null;
}

export interface ModelPickerContext {
  readonly providers: ReadonlyArray<ServerProvider>;
  readonly providerEntries: ReadonlyArray<ProviderInstanceEntry>;
  readonly currentModelSelection: ModelSelection | undefined;
  readonly currentProviderInstanceId: ProviderInstanceId | null;
  readonly hasStartedSession: boolean;
  readonly lockedProvider: ProviderDriverKind | null;
  readonly lockedContinuationGroupKey: string | null;
}

export function resolveModelPickerSelectedKey(
  currentSelection: ModelSelection | undefined,
  selectedModel: Pick<ModelPickerModel, "instanceId" | "slug"> | undefined,
): string | undefined {
  if (currentSelection) {
    return providerModelKey(currentSelection.instanceId, currentSelection.model);
  }
  return selectedModel ? providerModelKey(selectedModel.instanceId, selectedModel.slug) : undefined;
}

export function projectModelPickerProviders(
  entries: ReadonlyArray<ProviderInstanceEntry>,
  context: Pick<ModelPickerContext, "lockedProvider" | "lockedContinuationGroupKey">,
): ReadonlyArray<ModelPickerProviderPresentation> {
  return entries
    .filter((entry) => entry.enabled)
    .map((entry) => ({
      entry,
      disabledReason:
        describeUnavailableProviderInstance(entry) ??
        providerInstanceLockedReason(entry, {
          driverKind: context.lockedProvider,
          continuationGroupKey: context.lockedContinuationGroupKey,
        }),
    }));
}

export function modelPickerRowDisabledReason(
  model: ModelPickerModel,
  context: ModelPickerContext,
): string | null {
  const providerEntry = context.providerEntries.find(
    (entry) => entry.instanceId === model.instanceId,
  );
  if (providerEntry) {
    const unavailableReason = describeUnavailableProviderInstance(providerEntry);
    if (unavailableReason) return unavailableReason;
  }
  const entry = context.providers.find((provider) => provider.instanceId === model.instanceId);
  if (!entry) {
    return `${model.providerDisplayName} is no longer configured.`;
  }
  const providerLockedReason = providerInstanceLockedReason(
    {
      displayName: model.providerDisplayName,
      driverKind: model.driverKind,
      continuationGroupKey: entry.continuation?.groupKey,
    },
    {
      driverKind: context.lockedProvider,
      continuationGroupKey: context.lockedContinuationGroupKey,
    },
  );
  if (providerLockedReason) return providerLockedReason;
  if (!context.currentModelSelection) return null;
  const block = startedThreadModelChangeReason({
    providers: context.providers,
    hasStartedSession: context.hasStartedSession,
    currentModelSelection: context.currentModelSelection,
    currentProviderInstanceId: context.currentProviderInstanceId,
    nextModelSelection: {
      instanceId: model.instanceId,
      model: model.slug,
    },
  });
  return block ? `${block.description} Start a new thread to use this model.` : null;
}

export function projectModelPickerRows(input: {
  readonly models: ReadonlyArray<ModelPickerModel>;
  readonly selectedProviderId: ProviderInstanceId | "favorites";
  readonly search: string;
  readonly favoriteModelKeys: ReadonlySet<string>;
  readonly instanceOrder: ReadonlyArray<ProviderInstanceId>;
  readonly context: ModelPickerContext;
}): ReadonlyArray<ModelPickerRowPresentation> {
  const search = input.search.trim();
  let models = [...input.models];
  if (search) {
    models = rankModelPickerSearchResults(models, search, (model) => ({
      name: model.name,
      ...(model.shortName ? { shortName: model.shortName } : {}),
      ...(model.subProvider ? { subProvider: model.subProvider } : {}),
      driverKind: model.driverKind,
      providerDisplayName: model.providerDisplayName,
      isFavorite: input.favoriteModelKeys.has(providerModelKey(model.instanceId, model.slug)),
    }));
  } else if (input.selectedProviderId === "favorites") {
    models = models.filter((model) =>
      input.favoriteModelKeys.has(providerModelKey(model.instanceId, model.slug)),
    );
  } else {
    models = models.filter((model) => model.instanceId === input.selectedProviderId);
  }

  if (!search) {
    models = sortModelPickerItems(models, {
      getInstanceId: (model) => model.instanceId,
      getModelSlug: (model) => model.slug,
      favoriteModelKeys: input.favoriteModelKeys,
      groupFavorites: input.selectedProviderId !== "favorites",
      instanceOrder: input.instanceOrder,
    });
  }

  return models.map((model) => ({
    model,
    favorite: input.favoriteModelKeys.has(providerModelKey(model.instanceId, model.slug)),
    disabledReason: modelPickerRowDisabledReason(model, input.context),
  }));
}
