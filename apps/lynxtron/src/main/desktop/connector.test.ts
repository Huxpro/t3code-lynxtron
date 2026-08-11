import { assert, describe, it } from "vite-plus/test";

import { materializeTurnBootstrap } from "./connector";

describe("materializeTurnBootstrap", () => {
  it("adds a unique temporary branch for a worktree bootstrap", () => {
    const bootstrap = materializeTurnBootstrap(
      {
        prepareWorktree: {
          projectCwd: "/repo",
          baseBranch: "main",
          startFromOrigin: true,
        },
        runSetupScript: true,
      },
      () => "f4ae4e0e-f971-4d48-b4f2-9cf0aa54ab12",
    );

    assert.deepEqual(bootstrap, {
      prepareWorktree: {
        projectCwd: "/repo",
        baseBranch: "main",
        branch: "t3code/f4ae4e0e",
        startFromOrigin: true,
      },
      runSetupScript: true,
    });
  });

  it("preserves explicit branches and non-worktree bootstraps", () => {
    const explicit = {
      prepareWorktree: {
        projectCwd: "/repo",
        baseBranch: "main",
        branch: "feature/review",
      },
    } as const;
    assert.deepEqual(materializeTurnBootstrap(explicit), explicit);
    assert.equal(materializeTurnBootstrap(undefined), undefined);
  });
});
