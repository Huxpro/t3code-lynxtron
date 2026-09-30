import type {
  ProjectScript,
  SidebarProjectGroupingMode,
  T3ProjectFileScript,
} from "@t3tools/contracts";

import { buildProjectScript, nextProjectScriptId } from "../../projectScripts";
import type { NewProjectScriptInput } from "../projectScriptEditor.logic";

export const PROJECT_GROUPING_MODE_LABELS: Record<SidebarProjectGroupingMode, string> = {
  repository: "Group by repository",
  repository_path: "Group by repository path",
  separate: "Keep separate",
};

export type ProjectGroupingSelection = SidebarProjectGroupingMode | "inherit";

/** Grouping choices in menu order; "inherit" follows the global default. */
export const PROJECT_GROUPING_SELECTIONS: ReadonlyArray<ProjectGroupingSelection> = [
  "inherit",
  "repository",
  "repository_path",
  "separate",
];

export function isProjectGroupingSelection(value: unknown): value is ProjectGroupingSelection {
  return PROJECT_GROUPING_SELECTIONS.includes(value as ProjectGroupingSelection);
}

/** Label for one grouping option inside the menu. */
export function projectGroupingOptionLabel(selection: ProjectGroupingSelection): string {
  return selection === "inherit" ? "Use global default" : PROJECT_GROUPING_MODE_LABELS[selection];
}

/** Label for the grouping trigger, naming what "inherit" resolves to. */
export function projectGroupingTriggerLabel(
  selection: ProjectGroupingSelection,
  defaultMode: SidebarProjectGroupingMode,
): string {
  return selection === "inherit"
    ? `Default (${PROJECT_GROUPING_MODE_LABELS[defaultMode]})`
    : PROJECT_GROUPING_MODE_LABELS[selection];
}

export function nextProjectGroupingOverrides(
  overrides: Readonly<Record<string, SidebarProjectGroupingMode>> | undefined,
  overrideKey: string,
  selection: ProjectGroupingSelection,
): Record<string, SidebarProjectGroupingMode> {
  const next = { ...overrides };
  if (selection === "inherit") delete next[overrideKey];
  else next[overrideKey] = selection;
  return next;
}

export function projectMemberKey(member: {
  readonly environmentId: string;
  readonly id: string;
}): string {
  return `${member.environmentId}:${member.id}`;
}

export function countThreadsByProjectMember(
  threads: ReadonlyArray<{ readonly environmentId: string; readonly projectId: string }>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const thread of threads) {
    const key = projectMemberKey({ environmentId: thread.environmentId, id: thread.projectId });
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function projectThreadCountLabel(count: number): string {
  return count === 1 ? "1 thread" : `${count} threads`;
}

export function projectCheckoutLabel(member: { readonly environmentLabel: string | null }): string {
  return member.environmentLabel ?? "This machine";
}

export type ProjectRenameResolution =
  | { readonly kind: "empty" }
  | { readonly kind: "unchanged" }
  | { readonly kind: "rename"; readonly title: string };

/** Decides whether a committed name field renames every member of the group. */
export function resolveProjectRename(
  nextTitle: string,
  group: {
    readonly displayName: string;
    readonly memberProjects: ReadonlyArray<{ readonly title: string }>;
  },
): ProjectRenameResolution {
  const title = nextTitle.trim();
  if (!title) return { kind: "empty" };
  if (title === group.displayName) return { kind: "unchanged" };
  if (group.memberProjects.every((member) => member.title === title)) return { kind: "unchanged" };
  return { kind: "rename", title };
}

/**
 * The whole scripts array an add (`scriptId: null`) or edit writes. Only one
 * script may run on worktree creation, so enabling it clears the others.
 */
export function nextProjectScriptsForSubmit(
  scripts: ReadonlyArray<ProjectScript>,
  scriptId: string | null,
  input: NewProjectScriptInput,
): { readonly scriptId: string; readonly scripts: ReadonlyArray<ProjectScript> } {
  const clearSetup = (script: ProjectScript): ProjectScript =>
    input.runOnWorktreeCreate && script.runOnWorktreeCreate
      ? { ...script, runOnWorktreeCreate: false }
      : script;
  if (scriptId === null) {
    const nextId = nextProjectScriptId(
      input.name,
      scripts.map((script) => script.id),
    );
    return {
      scriptId: nextId,
      scripts: [...scripts.map(clearSetup), buildProjectScript(nextId, input)],
    };
  }
  const updated = buildProjectScript(scriptId, input);
  return {
    scriptId,
    scripts: scripts.map((script) => (script.id === scriptId ? updated : clearSetup(script))),
  };
}

/** t3.json scripts not already saved under the same command or name. */
export function importableProjectFileScripts(
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

export function projectFileScriptInput(fileScript: T3ProjectFileScript): NewProjectScriptInput {
  return {
    name: fileScript.name,
    command: fileScript.command,
    icon: fileScript.icon ?? "play",
    runOnWorktreeCreate: fileScript.runOnWorktreeCreate ?? false,
    keybinding: null,
    previewUrl: fileScript.previewUrl ?? null,
    autoOpenPreview: fileScript.previewUrl ? (fileScript.autoOpenPreview ?? false) : false,
  };
}

/** Lines of the destructive confirmation shown before removing checkouts. */
export function projectRemovalConfirmationLines(input: {
  readonly groupDisplayName: string;
  readonly groupMemberCount: number;
  readonly members: ReadonlyArray<{
    readonly title: string;
    readonly workspaceRoot: string;
    readonly environmentLabel: string | null;
  }>;
  readonly threadCount: number;
}): ReadonlyArray<string> {
  const singleMember = input.members.length === 1 ? input.members[0]! : null;
  const targetLabel = singleMember?.title ?? input.groupDisplayName;
  const isWholeGroup = input.members.length === input.groupMemberCount;
  return [
    input.threadCount > 0
      ? `Remove project "${targetLabel}" and delete its ${input.threadCount} thread${input.threadCount === 1 ? "" : "s"}?`
      : `Remove project "${targetLabel}"?`,
    ...(singleMember
      ? [
          `Path: ${singleMember.workspaceRoot}`,
          ...(singleMember.environmentLabel
            ? [`Environment: ${singleMember.environmentLabel}`]
            : []),
        ]
      : [`This removes ${input.members.length} grouped project entries.`]),
    ...(input.threadCount > 0
      ? ["This permanently clears conversation history for those threads."]
      : []),
    isWholeGroup
      ? "This removes only the project entries, not the files on disk."
      : "Other entries in this grouped project are unaffected.",
    "This action cannot be undone.",
  ];
}

/** Copy for the Danger section's remove-project row. */
export function projectRemovalRowCopy(memberCount: number): {
  readonly title: string;
  readonly description: string;
  readonly actionLabel: string;
} {
  return memberCount > 1
    ? {
        title: "Remove this project everywhere",
        description: `Deletes all ${memberCount} checkout entries and their threads on every machine. Files on disk are not touched.`,
        actionLabel: "Remove all entries",
      }
    : {
        title: "Remove project",
        description: "Deletes the project entry and its threads. Files on disk are not touched.",
        actionLabel: "Remove project",
      };
}

export function projectSettingsUnavailableMessage(groupCount: number): string {
  return groupCount === 0
    ? "Add a project from the sidebar to configure it here."
    : "This project is no longer available.";
}

export function sortProjectSettingsGroups<T extends { readonly displayName: string }>(
  groups: ReadonlyArray<T>,
): T[] {
  return [...groups].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** The logical project group (settings page key) a physical project belongs to. */
export function findProjectGroupKey(
  groups: ReadonlyArray<{
    readonly projectKey: string;
    readonly memberProjects: ReadonlyArray<{
      readonly environmentId: string;
      readonly id: string;
    }>;
  }>,
  project: { readonly environmentId: string; readonly id: string },
): string | null {
  const group = groups.find((candidate) =>
    candidate.memberProjects.some(
      (member) => member.environmentId === project.environmentId && member.id === project.id,
    ),
  );
  return group?.projectKey ?? null;
}

/**
 * A grouping-rule change replaces the group key mid-visit. Given the members
 * last rendered under `projectKey`, finds the group they moved to.
 */
export function resolveRegroupedProjectKey(input: {
  readonly groups: ReadonlyArray<{
    readonly projectKey: string;
    readonly memberProjects: ReadonlyArray<{ readonly physicalProjectKey: string }>;
  }>;
  readonly projectKey: string;
  readonly last: { readonly key: string; readonly memberKeys: ReadonlyArray<string> } | null;
}): string | null {
  if (input.groups.some((group) => group.projectKey === input.projectKey)) return null;
  const last = input.last;
  if (last?.key !== input.projectKey) return null;
  const successor = input.groups.find((group) =>
    group.memberProjects.some((member) => last.memberKeys.includes(member.physicalProjectKey)),
  );
  return successor?.projectKey ?? null;
}
