import {
  buildProposedPlanMarkdownFilename,
  normalizePlanMarkdownForExport,
} from "@t3tools/client-runtime/presentation/proposed-plan";

export type PlanSaveStatus = "saved" | "failed";

export async function savePlanToDefaultWorkspacePath(
  writeFile: (cwd: string, relativePath: string, contents: string) => Promise<unknown>,
  cwd: string,
  planMarkdown: string,
): Promise<PlanSaveStatus> {
  try {
    await writeFile(
      cwd,
      buildProposedPlanMarkdownFilename(planMarkdown),
      normalizePlanMarkdownForExport(planMarkdown),
    );
    return "saved";
  } catch {
    return "failed";
  }
}
