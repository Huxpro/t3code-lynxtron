import type {
  ModelSelection,
  OrchestrationProjectShell,
} from "@t3tools/contracts";

type ProjectModelSelectionSource = Pick<
  OrchestrationProjectShell,
  "id" | "defaultModelSelection"
>;
export function projectModelSelectionCandidates({
  currentSelection,
  projects,
}: {
  readonly currentSelection: ModelSelection | undefined;
  readonly projects: ReadonlyArray<ProjectModelSelectionSource>;
}): ReadonlyArray<ModelSelection | null | undefined> {
  return [
    projects[0]?.defaultModelSelection,
    currentSelection,
  ];
}

export function findExactModelForSelection<
  TModel extends { readonly instanceId: string; readonly slug: string },
>(
  models: ReadonlyArray<TModel>,
  selection: ModelSelection,
): TModel | undefined {
  return models.find(
    (model) =>
      model.instanceId === selection.instanceId && model.slug === selection.model,
  );
}
