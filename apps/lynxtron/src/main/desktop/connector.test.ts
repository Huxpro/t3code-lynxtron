import { assert, describe, it } from "vite-plus/test";

import { materializeTurnBootstrap, retryRpcTransportOpen } from "./connector";

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

describe("retryRpcTransportOpen", () => {
  it("opens with a fresh attempt after transient failures", async () => {
    const attempts: number[] = [];
    const failures: Array<{ attempt: number; message: string }> = [];
    const waits: number[] = [];

    const result = await retryRpcTransportOpen({
      open: async () => {
        const attempt = attempts.length + 1;
        attempts.push(attempt);
        if (attempt < 3) throw new Error(`open-${attempt}`);
        return "ready";
      },
      onFailure: (attempt, error) => {
        failures.push({
          attempt,
          message: error instanceof Error ? error.message : String(error),
        });
      },
      wait: async (milliseconds) => {
        waits.push(milliseconds);
      },
    });

    assert.equal(result, "ready");
    assert.deepEqual(attempts, [1, 2, 3]);
    assert.deepEqual(failures, [
      { attempt: 1, message: "open-1" },
      { attempt: 2, message: "open-2" },
    ]);
    assert.deepEqual(waits, [250, 500]);
  });

  it("throws the final error after the bounded attempt count", async () => {
    const waits: number[] = [];
    let error: unknown;
    try {
      await retryRpcTransportOpen({
        attempts: 2,
        open: () => Promise.reject(new Error("still-offline")),
        onFailure: () => {},
        wait: async (milliseconds) => {
          waits.push(milliseconds);
        },
      });
    } catch (cause) {
      error = cause;
    }

    assert.match(error instanceof Error ? error.message : String(error), /still-offline/);
    assert.deepEqual(waits, [250]);
  });
});
