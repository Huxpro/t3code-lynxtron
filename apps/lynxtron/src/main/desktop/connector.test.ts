import { assert, describe, it } from "vite-plus/test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  dispatchWithTransportRecovery,
  materializeTurnBootstrap,
  retryRpcTransportOpen,
} from "./connector";

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

describe("Diff preview connector surface", () => {
  it("routes the renderer command through the canonical review RPC", () => {
    const source = readFileSync(path.join(import.meta.dirname, "connector.ts"), "utf8");

    assert.include(source, "async getDiffPreview(input: ReviewDiffPreviewInput)");
    assert.include(source, "this.client[WS_METHODS.reviewGetDiffPreview](input)");
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

describe("dispatchWithTransportRecovery", () => {
  it("recovers once and retries the exact same command after a transport failure", async () => {
    const command = { type: "thread.turn.start", commandId: "command-1" };
    const dispatched: unknown[] = [];
    const retries: string[] = [];
    let recovered = 0;

    const result = await dispatchWithTransportRecovery({
      command,
      dispatch: async (currentCommand) => {
        dispatched.push(currentCommand);
        if (dispatched.length === 1) {
          throw new Error('SocketOpenError: timeout waiting for "open"');
        }
        return "accepted";
      },
      recover: async () => {
        recovered += 1;
      },
      onRetry: (error) => retries.push(error.message),
    });

    assert.equal(result, "accepted");
    assert.equal(recovered, 1);
    assert.deepEqual(dispatched, [command, command]);
    assert.deepEqual(retries, ['SocketOpenError: timeout waiting for "open"']);
  });

  it("does not recover or retry business-logic failures", async () => {
    const command = { type: "thread.turn.start", commandId: "command-2" };
    let dispatchCount = 0;
    let recovered = 0;
    let error: unknown;

    try {
      await dispatchWithTransportRecovery({
        command,
        dispatch: async () => {
          dispatchCount += 1;
          throw new Error("Provider is unauthenticated");
        },
        recover: async () => {
          recovered += 1;
        },
      });
    } catch (cause) {
      error = cause;
    }

    assert.equal(
      error instanceof Error ? error.message : String(error),
      "Provider is unauthenticated",
    );
    assert.equal(dispatchCount, 1);
    assert.equal(recovered, 0);
  });
});
