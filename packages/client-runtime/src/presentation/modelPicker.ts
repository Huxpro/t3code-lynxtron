import type {
  ModelSelection,
  ProviderDriverKind,
  ProviderInstanceId,
  ModelCapabilities,
  ServerProvider,
  ServerSettings,
} from "@t3tools/contracts";
import { normalizeSearchQuery, scoreQueryMatch } from "@t3tools/shared/searchRanking";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  isProviderInstancePickerReady,
  isProviderInstancePickerSelectable,
  isProviderInstancePickerVisible,
  resolveSelectableProviderInstanceEntry,
  sortProviderInstanceEntries,
  type ProviderInstanceEntry,
} from "./provider.ts";

export interface ModelSlugItem {
  readonly slug: string;
}

export interface ProviderModelItem extends ModelSlugItem {
  readonly instanceId: ProviderInstanceId;
}

export interface ModelPickerSearchableModel {
  /** Driver kind, indexed so a driver query also finds custom instances. */
  readonly driverKind: string;
  readonly providerDisplayName: string;
  readonly name: string;
  readonly shortName?: string | undefined;
  readonly subProvider?: string | undefined;
  readonly isFavorite?: boolean | undefined;
}

/**
 * Renderer-neutral model picker row derived from canonical provider snapshots.
 * Platform clients share this projection instead of independently flattening
 * `ServerProvider.models`.
 */
export interface ModelPickerModel extends ProviderModelItem, ModelPickerSearchableModel {
  readonly driverKind: ProviderDriverKind;
  readonly isCustom: boolean;
  readonly capabilities: ModelCapabilities | null;
  readonly isDefault?: boolean | undefined;
}

export type ModelPickerPresentationModel = ProviderModelItem &
  ModelPickerSearchableModel & { readonly driverKind: ProviderDriverKind };

export interface ModelPickerProviderPresentation {
  readonly entry: ProviderInstanceEntry;
  readonly disabledReason: string | null;
}

export interface ModelPickerRowPresentation<
  T extends ModelPickerPresentationModel = ModelPickerModel,
> {
  readonly model: T;
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

export interface ProviderModelCatalog {
  readonly entries: ReadonlyArray<ProviderInstanceEntry>;
  readonly models: ReadonlyArray<ModelPickerModel>;
}

export interface ProviderModelCatalogInput {
  readonly providers: ReadonlyArray<ServerProvider>;
  readonly settings: Pick<ServerSettings, "providerInstances" | "providers">;
}

export interface ProviderModelSelectionProjection extends ProviderModelCatalog {
  readonly selectedEntry: ProviderInstanceEntry | undefined;
  readonly selectedModel: ModelPickerModel | undefined;
  readonly selection: ModelSelection | undefined;
}

export function deriveModelPickerModels(
  entries: ReadonlyArray<ProviderInstanceEntry>,
  options?: { readonly includeDisabled?: boolean },
): ReadonlyArray<ModelPickerModel> {
  return entries.flatMap((entry) => {
    if (
      options?.includeDisabled !== true &&
      (!isProviderInstancePickerVisible(entry) || !isProviderInstancePickerSelectable(entry))
    ) {
      return [];
    }
    return entry.models.map(
      (model): ModelPickerModel => ({
        instanceId: entry.instanceId,
        driverKind: entry.driverKind,
        slug: model.slug,
        name: model.name,
        ...(model.shortName ? { shortName: model.shortName } : {}),
        ...(model.subProvider ? { subProvider: model.subProvider } : {}),
        providerDisplayName: entry.displayName,
        isCustom: model.isCustom,
        capabilities: model.capabilities,
        ...(model.isDefault ? { isDefault: true } : {}),
      }),
    );
  });
}

/**
 * Build the canonical provider/model catalog shared by every client. Settings
 * are overlaid before sorting so a just-disabled or removed instance stops
 * contributing selectable models without waiting for the next provider probe.
 */
export function deriveProviderModelCatalog(input: ProviderModelCatalogInput): ProviderModelCatalog {
  const entries = sortProviderInstanceEntries(
    applyProviderInstanceSettings(deriveProviderInstanceEntries(input.providers), input.settings),
  );
  return {
    entries,
    models: deriveModelPickerModels(entries),
  };
}

function resolveModelForEntry(
  models: ReadonlyArray<ModelPickerModel>,
  entry: ProviderInstanceEntry,
  requestedModel?: string,
): ModelPickerModel | undefined {
  const instanceModels = models.filter((model) => model.instanceId === entry.instanceId);
  return (
    (requestedModel ? instanceModels.find((model) => model.slug === requestedModel) : undefined) ??
    instanceModels.find((model) => model.isDefault) ??
    instanceModels[0]
  );
}

/**
 * Project a canonical config into picker rows plus one valid selection.
 *
 * Candidate order is significant: initial hydration can prefer a saved local
 * selection, while later config updates can prefer the active selection. A
 * candidate whose instance still exists keeps that instance even while it is
 * disabled or unavailable, allowing clients to present the real provider
 * status instead of silently switching providers. If only its model
 * disappeared, the projection uses that instance's own default. Only a
 * missing instance falls through to the deterministic ready/non-error
 * provider fallback, and its stale model slug never leaks into that fallback.
 */
export function deriveProviderModelSelectionProjection(
  input: ProviderModelCatalogInput,
  selectionCandidates: ReadonlyArray<ModelSelection | null | undefined> = [],
): ProviderModelSelectionProjection {
  const catalog = deriveProviderModelCatalog(input);
  const displayModels = deriveModelPickerModels(catalog.entries, { includeDisabled: true });

  for (const candidate of selectionCandidates) {
    if (!candidate) continue;
    const entry = catalog.entries.find((item) => item.instanceId === candidate.instanceId);
    if (!entry) continue;
    const selectedModel = resolveModelForEntry(displayModels, entry, candidate.model);
    return {
      ...catalog,
      selectedEntry: entry,
      selectedModel,
      selection: selectedModel
        ? {
            instanceId: selectedModel.instanceId,
            model: selectedModel.slug,
            ...(candidate.model === selectedModel.slug && candidate.options
              ? { options: candidate.options }
              : {}),
          }
        : candidate,
    };
  }

  const entriesWithModels = catalog.entries.filter((entry) =>
    catalog.models.some((model) => model.instanceId === entry.instanceId),
  );
  const selectedEntry = resolveSelectableProviderInstanceEntry(entriesWithModels, undefined);
  const selectedModel = selectedEntry
    ? resolveModelForEntry(catalog.models, selectedEntry)
    : undefined;

  return {
    ...catalog,
    selectedEntry,
    selectedModel,
    selection: selectedModel
      ? {
          instanceId: selectedModel.instanceId,
          model: selectedModel.slug,
        }
      : undefined,
  };
}

const MODEL_PICKER_FAVORITE_SCORE_BOOST = 24;

export function providerModelKey(instanceId: string, slug: string): string {
  return `${instanceId}:${slug}`;
}

export function describeUnavailableProviderInstance(entry: ProviderInstanceEntry): string | null {
  if (!entry.enabled || entry.status === "disabled") {
    return `${entry.displayName} — Disabled in settings.`;
  }
  if (entry.status === "ready" && entry.isAvailable) {
    return null;
  }
  const kind =
    entry.status === "error" ? "Unavailable" : entry.status === "warning" ? "Limited" : "Not ready";
  const message = entry.snapshot.message?.trim();
  return message ? `${entry.displayName} — ${kind}. ${message}` : `${entry.displayName} — ${kind}.`;
}

export function providerInstanceSelectionBlockedReason(
  entry: ProviderInstanceEntry,
): string | null {
  return isProviderInstancePickerSelectable(entry)
    ? null
    : describeUnavailableProviderInstance(entry);
}

export function providerInstanceLockedReason(
  entry: Pick<ProviderInstanceEntry, "displayName" | "driverKind" | "continuationGroupKey">,
  lock: {
    readonly driverKind: ProviderDriverKind | null;
    readonly continuationGroupKey?: string | null | undefined;
  },
): string | null {
  if (lock.driverKind === null) return null;
  if (
    entry.driverKind === lock.driverKind &&
    (!lock.continuationGroupKey || entry.continuationGroupKey === lock.continuationGroupKey)
  ) {
    return null;
  }
  return `${entry.displayName} is unavailable in this thread. Start a new thread to switch providers.`;
}

export function startedThreadModelChangeReason(input: {
  readonly providers: ReadonlyArray<
    Pick<ServerProvider, "instanceId" | "requiresNewThreadForModelChange">
  >;
  readonly hasStartedSession: boolean;
  readonly currentModelSelection: ModelSelection;
  readonly currentProviderInstanceId?: ModelSelection["instanceId"] | null | undefined;
  readonly nextModelSelection: ModelSelection;
}): { readonly title: string; readonly description: string } | null {
  if (!input.hasStartedSession) {
    return null;
  }
  const currentModelSelection = {
    ...input.currentModelSelection,
    instanceId: input.currentProviderInstanceId ?? input.currentModelSelection.instanceId,
  };
  if (
    currentModelSelection.instanceId === input.nextModelSelection.instanceId &&
    currentModelSelection.model === input.nextModelSelection.model
  ) {
    return null;
  }
  const currentProvider = input.providers.find(
    (snapshot) => snapshot.instanceId === currentModelSelection.instanceId,
  );
  const nextProvider = input.providers.find(
    (snapshot) => snapshot.instanceId === input.nextModelSelection.instanceId,
  );
  if (
    currentProvider?.requiresNewThreadForModelChange !== true &&
    nextProvider?.requiresNewThreadForModelChange !== true
  ) {
    return null;
  }
  return {
    title: "Start a new chat to change models",
    description: "This provider does not allow switching models after a conversation has started.",
  };
}

function rankByValue(values: ReadonlyArray<string>): ReadonlyMap<string, number> {
  return new Map(values.map((value, index) => [value, index] as const));
}

function toSet(
  values: ReadonlySet<string> | ReadonlyArray<string> | undefined,
): ReadonlySet<string> {
  return values instanceof Set ? values : new Set(values ?? []);
}

function compareOptionalRank<T>(left: T, right: T, rank: (item: T) => number | undefined): number {
  return (rank(left) ?? Number.POSITIVE_INFINITY) - (rank(right) ?? Number.POSITIVE_INFINITY);
}

export function sortModelsForProviderInstance<T extends ModelSlugItem>(
  models: ReadonlyArray<T>,
  options?: {
    readonly modelOrder?: ReadonlyArray<string>;
    readonly favoriteModels?: ReadonlySet<string> | ReadonlyArray<string>;
    readonly groupFavorites?: boolean;
  },
): T[] {
  const modelOrder = options?.modelOrder ?? [];
  const favoriteModels = toSet(options?.favoriteModels);
  const orderBySlug = rankByValue(modelOrder);
  const originalOrder = rankByValue(models.map((model) => model.slug));

  return [...models].sort((left, right) => {
    if (options?.groupFavorites === true) {
      const favoriteDelta =
        Number(favoriteModels.has(right.slug)) - Number(favoriteModels.has(left.slug));
      if (favoriteDelta !== 0) return favoriteDelta;
    }
    const configuredDelta = compareOptionalRank(left, right, (model) =>
      orderBySlug.get(model.slug),
    );
    if (configuredDelta !== 0) return configuredDelta;
    return compareOptionalRank(left, right, (model) => originalOrder.get(model.slug));
  });
}

export function sortModelPickerItems<T>(
  items: ReadonlyArray<T>,
  input: {
    readonly getInstanceId: (item: T) => string;
    readonly getModelSlug: (item: T) => string;
    readonly favoriteModelKeys?: ReadonlySet<string> | ReadonlyArray<string>;
    readonly groupFavorites?: boolean;
    readonly instanceOrder?: ReadonlyArray<string>;
  },
): T[] {
  const favoriteModelKeys = toSet(input.favoriteModelKeys);
  const instanceOrder = rankByValue(input.instanceOrder ?? []);
  const itemKey = (item: T) =>
    providerModelKey(input.getInstanceId(item), input.getModelSlug(item));
  const originalOrder = rankByValue(items.map(itemKey));

  return [...items].sort((left, right) => {
    if (input.groupFavorites === true) {
      const favoriteDelta =
        Number(favoriteModelKeys.has(itemKey(right))) -
        Number(favoriteModelKeys.has(itemKey(left)));
      if (favoriteDelta !== 0) return favoriteDelta;
    }
    const instanceDelta = compareOptionalRank(left, right, (item) =>
      instanceOrder.get(input.getInstanceId(item)),
    );
    if (instanceDelta !== 0) return instanceDelta;
    return compareOptionalRank(left, right, (item) => originalOrder.get(itemKey(item)));
  });
}

export function sortProviderModelItems<T extends ProviderModelItem>(
  items: ReadonlyArray<T>,
  options?: {
    readonly favoriteModelKeys?: ReadonlySet<string> | ReadonlyArray<string>;
    readonly groupFavorites?: boolean;
    readonly instanceOrder?: ReadonlyArray<ProviderInstanceId>;
  },
): T[] {
  return sortModelPickerItems(items, {
    getInstanceId: (item) => item.instanceId,
    getModelSlug: (item) => item.slug,
    ...(options?.favoriteModelKeys !== undefined
      ? { favoriteModelKeys: options.favoriteModelKeys }
      : {}),
    ...(options?.groupFavorites !== undefined ? { groupFavorites: options.groupFavorites } : {}),
    ...(options?.instanceOrder !== undefined ? { instanceOrder: options.instanceOrder } : {}),
  });
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
  const presentations = entries
    .filter((entry) => entry.enabled)
    .map((entry) => ({
      entry,
      disabledReason:
        providerInstanceSelectionBlockedReason(entry) ??
        providerInstanceLockedReason(entry, {
          driverKind: context.lockedProvider,
          continuationGroupKey: context.lockedContinuationGroupKey,
        }),
    }));
  if (context.lockedProvider === null) return presentations;
  const available: ModelPickerProviderPresentation[] = [];
  const disabled: ModelPickerProviderPresentation[] = [];
  for (const presentation of presentations) {
    if (presentation.disabledReason === null) available.push(presentation);
    else disabled.push(presentation);
  }
  return [...available, ...disabled];
}

export function modelPickerRowDisabledReason(
  model: ModelPickerPresentationModel,
  context: ModelPickerContext,
): string | null {
  const providerEntry = context.providerEntries.find(
    (entry) => entry.instanceId === model.instanceId,
  );
  if (providerEntry) {
    const unavailableReason = providerInstanceSelectionBlockedReason(providerEntry);
    if (unavailableReason) return unavailableReason;
  }
  const entry = context.providers.find((provider) => provider.instanceId === model.instanceId);
  if (!entry) return `${model.providerDisplayName} is no longer configured.`;
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
    nextModelSelection: { instanceId: model.instanceId, model: model.slug },
  });
  return block ? `${block.description} Start a new thread to use this model.` : null;
}

export function projectModelPickerRows<T extends ModelPickerPresentationModel>(input: {
  readonly models: ReadonlyArray<T>;
  readonly selectedProviderId: ProviderInstanceId | "favorites";
  readonly search: string;
  readonly favoriteModelKeys: ReadonlySet<string>;
  readonly instanceOrder: ReadonlyArray<ProviderInstanceId>;
  readonly context: ModelPickerContext;
  readonly getDisabledReason?: (model: T) => string | null;
}): ReadonlyArray<ModelPickerRowPresentation<T>> {
  const search = input.search.trim();
  let models = [...input.models];
  const matchesLockedProvider = (model: T): boolean => {
    if (input.context.lockedProvider === null) return true;
    const entry = input.context.providerEntries.find(
      (candidate) => candidate.instanceId === model.instanceId,
    );
    return (
      entry?.driverKind === input.context.lockedProvider &&
      (!input.context.lockedContinuationGroupKey ||
        entry.continuationGroupKey === input.context.lockedContinuationGroupKey)
    );
  };
  if (search) {
    models = rankModelPickerSearchResults(models, search, (model) => ({
      name: model.name,
      ...(model.shortName ? { shortName: model.shortName } : {}),
      ...(model.subProvider ? { subProvider: model.subProvider } : {}),
      driverKind: model.driverKind,
      providerDisplayName: model.providerDisplayName,
      isFavorite: input.favoriteModelKeys.has(providerModelKey(model.instanceId, model.slug)),
    }));
    if (input.context.lockedProvider !== null) models = models.filter(matchesLockedProvider);
  } else if (input.context.lockedProvider !== null) {
    models = models.filter(matchesLockedProvider);
    if (input.selectedProviderId === "favorites") {
      models = models.filter((model) =>
        input.favoriteModelKeys.has(providerModelKey(model.instanceId, model.slug)),
      );
    } else {
      models = models.filter((model) => model.instanceId === input.selectedProviderId);
    }
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
    disabledReason: input.getDisabledReason
      ? input.getDisabledReason(model)
      : modelPickerRowDisabledReason(model, input.context),
  }));
}

function getModelPickerSearchFields(model: ModelPickerSearchableModel): string[] {
  return [
    normalizeSearchQuery(model.name),
    ...(model.shortName ? [normalizeSearchQuery(model.shortName)] : []),
    ...(model.subProvider ? [normalizeSearchQuery(model.subProvider)] : []),
    normalizeSearchQuery(model.driverKind),
    normalizeSearchQuery(model.providerDisplayName),
    buildModelPickerSearchText(model),
  ];
}

function scoreModelPickerSearchToken(
  field: string,
  token: string,
  fieldBase: number,
): number | null {
  return scoreQueryMatch({
    value: field,
    query: token,
    exactBase: fieldBase,
    prefixBase: fieldBase + 2,
    boundaryBase: fieldBase + 4,
    includesBase: fieldBase + 6,
    ...(token.length >= 3 ? { fuzzyBase: fieldBase + 100 } : {}),
  });
}

export function buildModelPickerSearchText(model: ModelPickerSearchableModel): string {
  return normalizeSearchQuery(
    [model.name, model.shortName, model.subProvider, model.driverKind, model.providerDisplayName]
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .join(" "),
  );
}

export function scoreModelPickerSearch(
  model: ModelPickerSearchableModel,
  query: string,
): number | null {
  const tokens = normalizeSearchQuery(query)
    .split(/\s+/u)
    .filter((token) => token.length > 0);

  if (tokens.length === 0) return 0;

  const fields = getModelPickerSearchFields(model);
  let score = 0;
  for (const token of tokens) {
    const tokenScores: Array<number> = [];
    for (let index = 0; index < fields.length; index += 1) {
      const fieldScore = scoreModelPickerSearchToken(fields[index]!, token, index * 10);
      if (fieldScore !== null) tokenScores.push(fieldScore);
    }
    if (tokenScores.length === 0) return null;
    score += Math.min(...tokenScores);
  }

  return model.isFavorite ? score - MODEL_PICKER_FAVORITE_SCORE_BOOST : score;
}

export function rankModelPickerSearchResults<T>(
  models: ReadonlyArray<T>,
  query: string,
  toSearchable: (model: T) => ModelPickerSearchableModel,
): T[] {
  return models
    .map((model) => {
      const searchable = toSearchable(model);
      return {
        model,
        score: scoreModelPickerSearch(searchable, query),
        isFavorite: searchable.isFavorite === true,
        tieBreaker: buildModelPickerSearchText(searchable),
      };
    })
    .filter(
      (
        ranked,
      ): ranked is {
        model: T;
        score: number;
        isFavorite: boolean;
        tieBreaker: string;
      } => ranked.score !== null,
    )
    .sort((left, right) => {
      const scoreDelta = left.score - right.score;
      if (scoreDelta !== 0) return scoreDelta;
      if (left.isFavorite !== right.isFavorite) return left.isFavorite ? -1 : 1;
      return left.tieBreaker.localeCompare(right.tieBreaker);
    })
    .map((ranked) => ranked.model);
}
