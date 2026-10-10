import {
  buildProposedPlanMarkdownFilename,
  normalizePlanMarkdownForExport,
} from "../../../../web/src/proposedPlan";

export type PlanSaveResult =
  | { readonly status: "saved"; readonly relativePath: string }
  | { readonly status: "failed"; readonly message: string };

export async function savePlanToDefaultWorkspacePath(
  writeFile: (cwd: string, relativePath: string, contents: string) => Promise<unknown>,
  cwd: string,
  planMarkdown: string,
): Promise<PlanSaveResult> {
  const relativePath = buildProposedPlanMarkdownFilename(planMarkdown);
  try {
    await writeFile(cwd, relativePath, normalizePlanMarkdownForExport(planMarkdown));
    return { status: "saved", relativePath };
  } catch (cause) {
    return {
      status: "failed",
      message: cause instanceof Error ? cause.message : "Could not save plan",
    };
  }
}
