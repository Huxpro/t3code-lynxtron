import type { ProjectScript } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { EMPTY_PROJECT_SCRIPT_INPUT } from "../../../../web/src/components/projectScriptEditor.logic";
import {
  countThreadsByProjectMember,
  findProjectGroupKey,
  importableProjectFileScripts,
  isProjectGroupingSelection,
  nextProjectGroupingOverrides,
  nextProjectScriptsForSubmit,
  projectFileScriptInput,
  projectGroupingOptionLabel,
  projectGroupingTriggerLabel,
  projectRemovalConfirmationLines,
  projectRemovalRowCopy,
  projectSettingsUnavailableMessage,
  projectThreadCountLabel,
  resolveProjectRename,
  resolveRegroupedProjectKey,
  sortProjectSettingsGroups,
} from "./projectSettingsPanel";

const script = (id: string, overrides: Partial<ProjectScript> = {}): ProjectScript => ({
  id,
  name: id,
  command: `run ${id}`,
  icon: "play",
  runOnWorktreeCreate: false,
  ...overrides,
});

describe("project grouping presentation", () => {
  it("labels the inherited default by the mode it resolves to", () => {
    expect(projectGroupingTriggerLabel("inherit", "repository")).toBe(
      "Default (Group by repository)",
    );
    expect(projectGroupingTriggerLabel("separate", "repository")).toBe("Keep separate");
    expect(projectGroupingOptionLabel("inherit")).toBe("Use global default");
    expect(projectGroupingOptionLabel("repository_path")).toBe("Group by repository path");
  });

  it("accepts only grouping selections", () => {
    expect(isProjectGroupingSelection("inherit")).toBe(true);
    expect(isProjectGroupingSelection("separate")).toBe(true);
    expect(isProjectGroupingSelection("other")).toBe(false);
    expect(isProjectGroupingSelection(null)).toBe(false);
  });

  it("sets and clears a checkout's override without touching others", () => {
    const overrides = { "env:/a": "separate" as const };
    expect(nextProjectGroupingOverrides(overrides, "env:/b", "repository")).toEqual({
      "env:/a": "separate",
      "env:/b": "repository",
    });
    expect(nextProjectGroupingOverrides(overrides, "env:/a", "inherit")).toEqual({});
    expect(overrides).toEqual({ "env:/a": "separate" });
  });
});

describe("project rename", () => {
  const group = {
    displayName: "T3 Code",
    memberProjects: [{ title: "T3 Code" }, { title: "t3code" }],
  };

  it("rejects an empty name and ignores an unchanged one", () => {
    expect(resolveProjectRename("   ", group)).toEqual({ kind: "empty" });
    expect(resolveProjectRename(" T3 Code ", group)).toEqual({ kind: "unchanged" });
  });

  it("renames every member to the trimmed title", () => {
    expect(resolveProjectRename("  Renamed ", group)).toEqual({ kind: "rename", title: "Renamed" });
  });
});

describe("project scripts", () => {
  it("adds a script with a unique id and keeps a single setup script", () => {
    const scripts = [script("test", { runOnWorktreeCreate: true }), script("lint")];
    const next = nextProjectScriptsForSubmit(scripts, null, {
      ...EMPTY_PROJECT_SCRIPT_INPUT,
      name: "Test",
      command: "bun test",
      runOnWorktreeCreate: true,
    });
    expect(next.scriptId).toBe("test-2");
    expect(next.scripts.map((entry) => [entry.id, entry.runOnWorktreeCreate])).toEqual([
      ["test", false],
      ["lint", false],
      ["test-2", true],
    ]);
  });

  it("edits a script in place", () => {
    const scripts = [script("test"), script("lint", { runOnWorktreeCreate: true })];
    const next = nextProjectScriptsForSubmit(scripts, "test", {
      ...EMPTY_PROJECT_SCRIPT_INPUT,
      name: "Unit",
      command: "vp test",
      previewUrl: "http://localhost:5173",
      autoOpenPreview: true,
    });
    expect(next.scriptId).toBe("test");
    expect(next.scripts[0]).toEqual({
      id: "test",
      name: "Unit",
      command: "vp test",
      icon: "play",
      runOnWorktreeCreate: false,
      previewUrl: "http://localhost:5173",
      autoOpenPreview: true,
    });
    expect(next.scripts[1]?.runOnWorktreeCreate).toBe(true);
  });

  it("offers only t3.json scripts not saved under the same command or name", () => {
    const fileScripts = [
      { name: "test", command: "other" },
      { name: "Build", command: "run lint" },
      { name: "Dev", command: "bun dev", previewUrl: "http://localhost:3000" },
    ];
    expect(importableProjectFileScripts([script("test"), script("lint")], fileScripts)).toEqual([
      fileScripts[2],
    ]);
    expect(projectFileScriptInput(fileScripts[2]!)).toEqual({
      name: "Dev",
      command: "bun dev",
      icon: "play",
      runOnWorktreeCreate: false,
      keybinding: null,
      previewUrl: "http://localhost:3000",
      autoOpenPreview: false,
    });
  });
});

describe("project checkouts", () => {
  it("counts threads per physical project", () => {
    const counts = countThreadsByProjectMember([
      { environmentId: "a", projectId: "p" },
      { environmentId: "a", projectId: "p" },
      { environmentId: "b", projectId: "p" },
    ]);
    expect(counts.get("a:p")).toBe(2);
    expect(counts.get("b:p")).toBe(1);
    expect(projectThreadCountLabel(1)).toBe("1 thread");
    expect(projectThreadCountLabel(0)).toBe("0 threads");
  });

  it("describes a single-checkout removal with its path and history", () => {
    expect(
      projectRemovalConfirmationLines({
        groupDisplayName: "T3 Code",
        groupMemberCount: 1,
        members: [{ title: "T3 Code", workspaceRoot: "/repo", environmentLabel: "Laptop" }],
        threadCount: 2,
      }),
    ).toEqual([
      'Remove project "T3 Code" and delete its 2 threads?',
      "Path: /repo",
      "Environment: Laptop",
      "This permanently clears conversation history for those threads.",
      "This removes only the project entries, not the files on disk.",
      "This action cannot be undone.",
    ]);
  });

  it("describes a partial group removal", () => {
    expect(
      projectRemovalConfirmationLines({
        groupDisplayName: "T3 Code",
        groupMemberCount: 3,
        members: [
          { title: "a", workspaceRoot: "/a", environmentLabel: null },
          { title: "b", workspaceRoot: "/b", environmentLabel: null },
        ],
        threadCount: 0,
      }),
    ).toEqual([
      'Remove project "T3 Code"?',
      "This removes 2 grouped project entries.",
      "Other entries in this grouped project are unaffected.",
      "This action cannot be undone.",
    ]);
    expect(projectRemovalRowCopy(1).actionLabel).toBe("Remove project");
    expect(projectRemovalRowCopy(2).title).toBe("Remove this project everywhere");
  });
});

describe("project settings navigation", () => {
  const groups = [
    {
      projectKey: "repo",
      displayName: "b",
      memberProjects: [
        { environmentId: "e", id: "p1", physicalProjectKey: "e:/a" },
        { environmentId: "e", id: "p2", physicalProjectKey: "e:/b" },
      ],
    },
    {
      projectKey: "e:/c",
      displayName: "a",
      memberProjects: [{ environmentId: "e", id: "p3", physicalProjectKey: "e:/c" }],
    },
  ];

  it("finds the group of a physical project", () => {
    expect(findProjectGroupKey(groups, { environmentId: "e", id: "p2" })).toBe("repo");
    expect(findProjectGroupKey(groups, { environmentId: "x", id: "p2" })).toBeNull();
    expect(sortProjectSettingsGroups(groups).map((group) => group.displayName)).toEqual(["a", "b"]);
  });

  it("follows a regrouped project to its new key", () => {
    expect(
      resolveRegroupedProjectKey({
        groups,
        projectKey: "e:/a",
        last: { key: "e:/a", memberKeys: ["e:/a"] },
      }),
    ).toBe("repo");
    expect(
      resolveRegroupedProjectKey({
        groups,
        projectKey: "repo",
        last: { key: "repo", memberKeys: ["e:/a"] },
      }),
    ).toBeNull();
    expect(resolveRegroupedProjectKey({ groups, projectKey: "gone", last: null })).toBeNull();
    expect(projectSettingsUnavailableMessage(0)).toBe(
      "Add a project from the sidebar to configure it here.",
    );
  });
});
