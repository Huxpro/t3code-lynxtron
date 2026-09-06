import { describe, expect, it } from "vite-plus/test";

import { vi } from "vite-plus/test";
import {
  importableProjectScripts,
  importedProjectScript,
  runProjectScriptInTerminal,
} from "./projectActionImports.logic";

describe("project action imports", () => {
  it("filters file actions already represented by name or command", () => {
    const current = [
      { id: "test", name: "Test", command: "vp test", icon: "test", runOnWorktreeCreate: false },
    ];
    const candidates = [
      { name: "Test", command: "other" },
      { name: "Checks", command: "vp test" },
      { name: "Dev", command: "vp dev", previewUrl: "http://localhost:5173" },
    ];
    expect(importableProjectScripts(current as never, candidates)).toEqual([candidates[2]]);
  });

  it("builds a canonical project action with defaults", () => {
    expect(importedProjectScript([], { name: "Setup Worktree", command: "vp i" })).toEqual({
      id: "setup-worktree",
      name: "Setup Worktree",
      command: "vp i",
      icon: "play",
      runOnWorktreeCreate: false,
    });
  });

  it("opens the canonical terminal before writing the project command", async () => {
    const calls: string[] = [];
    const openTerminal = vi.fn(async (input) => {
      calls.push(`open:${input.terminalId}`);
    });
    const writeTerminal = vi.fn(async (input) => {
      calls.push(`write:${input.data}`);
    });
    const openPanel = vi.fn(() => calls.push("panel"));
    await runProjectScriptInTerminal({
      script: {
        id: "test",
        name: "Test",
        command: "vp test",
        icon: "test",
        runOnWorktreeCreate: false,
      },
      threadId: "thread-1",
      projectCwd: "/project",
      cwd: "/project/worktree",
      worktreePath: "/project/worktree",
      openTerminal,
      writeTerminal,
      openPanel,
    });
    expect(calls).toEqual(["open:term-1", "write:vp test\n", "panel"]);
    expect(openTerminal).toHaveBeenCalledWith({
      threadId: "thread-1",
      terminalId: "term-1",
      cwd: "/project/worktree",
      worktreePath: "/project/worktree",
      env: { T3CODE_PROJECT_ROOT: "/project", T3CODE_WORKTREE_PATH: "/project/worktree" },
    });
  });
});
