import { deriveModelPickerModels } from "@t3tools/client-runtime/presentation/model-picker";
import type { ProviderInstanceEntry } from "@t3tools/client-runtime/presentation/provider";
import type { ModelSelection, OrchestrationProjectShell } from "@t3tools/contracts";
import type { ModelInfo } from "../bridge";

type ProjectModelSelectionSource = Pick<OrchestrationProjectShell, "id" | "defaultModelSelection">;
export function projectModelSelectionCandidates({
  currentSelection,
  projects,
}: {
  readonly currentSelection: ModelSelection | undefined;
  readonly projects: ReadonlyArray<ProjectModelSelectionSource>;
}): ReadonlyArray<ModelSelection | null | undefined> {
  return [projects[0]?.defaultModelSelection, currentSelection];
}

export function availableThreadModels(options: {
  readonly models: ReadonlyArray<ModelInfo>;
  readonly providerEntries: ReadonlyArray<ProviderInstanceEntry>;
}) {
  return options.providerEntries.length > 0
    ? deriveModelPickerModels(options.providerEntries, { includeDisabled: true })
    : options.models;
}

export function findExactModelForSelection<
  TModel extends { readonly instanceId: string; readonly slug: string },
>(models: ReadonlyArray<TModel>, selection: ModelSelection): TModel | undefined {
  return models.find(
    (model) => model.instanceId === selection.instanceId && model.slug === selection.model,
  );
}

export function resolveActiveThreadModelSelection<
  TModel extends { readonly instanceId: string; readonly slug: string },
>(
  models: ReadonlyArray<TModel>,
  threadSelection: ModelSelection,
  fallback: {
    readonly selectedModel: TModel | undefined;
    readonly selection: ModelSelection | undefined;
  },
): {
  readonly selectedModel: TModel | undefined;
  readonly selection: ModelSelection;
} {
  const exact = findExactModelForSelection(models, threadSelection);
  if (exact) {
    return { selectedModel: exact, selection: threadSelection };
  }
  const sameInstanceFallback = models.find(
    (model) => model.instanceId === threadSelection.instanceId,
  );
  if (sameInstanceFallback) {
    return {
      selectedModel: sameInstanceFallback,
      selection: {
        instanceId: threadSelection.instanceId,
        model: sameInstanceFallback.slug,
      },
    };
  }
  return { selectedModel: undefined, selection: threadSelection };
}
