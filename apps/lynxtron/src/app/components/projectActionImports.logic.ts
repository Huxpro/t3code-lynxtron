import type { ProjectScript, T3ProjectFileScript } from "@t3tools/contracts";
import { buildProjectScript, nextProjectScriptId } from "../../../../web/src/projectScripts";
import { projectScriptRuntimeEnv } from "@t3tools/shared/projectScripts";

export function importableProjectScripts(
  scripts: ReadonlyArray<ProjectScript>,
  fileScripts: ReadonlyArray<T3ProjectFileScript>,
): ReadonlyArray<T3ProjectFileScript> {
  return fileScripts.filter(
    (fileScript) =>
      !scripts.some(
        (script) =>
          script.command === fileScript.command ||
          script.name.toLowerCase() === fileScript.name.toLowerCase(),
      ),
  );
}

export function importedProjectScript(
  scripts: ReadonlyArray<ProjectScript>,
  fileScript: T3ProjectFileScript,
): ProjectScript {
  return buildProjectScript(
    nextProjectScriptId(
      fileScript.name,
      scripts.map((script) => script.id),
    ),
    {
      name: fileScript.name,
      command: fileScript.command,
      icon: fileScript.icon ?? "play",
      runOnWorktreeCreate: fileScript.runOnWorktreeCreate ?? false,
      previewUrl: fileScript.previewUrl ?? null,
      autoOpenPreview: fileScript.previewUrl ? (fileScript.autoOpenPreview ?? false) : false,
    },
  );
}

export async function runProjectScriptInTerminal(input: {
  readonly script: ProjectScript;
  readonly threadId: string;
  readonly projectCwd: string;
  readonly cwd: string;
  readonly worktreePath: string | null;
  readonly terminalId?: string;
  readonly openTerminal: (input: {
    readonly threadId: string;
    readonly terminalId: string;
    readonly cwd: string;
    readonly worktreePath: string | null;
    readonly env: Record<string, string>;
  }) => Promise<unknown>;
  readonly writeTerminal: (input: {
    readonly threadId: string;
    readonly terminalId: string;
    readonly data: string;
  }) => Promise<unknown>;
  readonly openPanel: () => void;
}): Promise<void> {
  const terminalId = input.terminalId ?? "term-1";
  await input.openTerminal({
    threadId: input.threadId,
    terminalId,
    cwd: input.cwd,
    worktreePath: input.worktreePath,
    env: projectScriptRuntimeEnv({
      project: { cwd: input.projectCwd },
      worktreePath: input.worktreePath,
    }),
  });
  await input.writeTerminal({
    threadId: input.threadId,
    terminalId,
    data: `${input.script.command}\n`,
  });
  input.openPanel();
}
