import type { ModelSelection, OrchestrationProjectShell } from "@t3tools/contracts";

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
  if (fallback.selectedModel && fallback.selection) {
    return {
      selectedModel: fallback.selectedModel,
      selection: fallback.selection,
    };
  }
  return { selectedModel: undefined, selection: threadSelection };
}
