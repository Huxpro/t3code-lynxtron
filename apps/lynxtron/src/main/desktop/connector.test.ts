import { assert, describe, it } from "vite-plus/test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  dispatchWithTransportRecovery,
  materializeTurnBootstrap,
  resolveConnectorLaunchTarget,
  retryRpcTransportOpen,
} from "./connector";

describe("connector launch target", () => {
  it("keeps the existing owned local-server mode by default", () => {
    assert.deepEqual(resolveConnectorLaunchTarget({ T3_LYNXTRON_BASE_DIR: " /tmp/t3-owned " }), {
      kind: "owned-local",
      baseDir: "/tmp/t3-owned",
    });
  });

  it("attaches to a direct pairing URL instead of owning another server", () => {
    assert.deepEqual(
      resolveConnectorLaunchTarget({
        T3_LYNXTRON_BASE_DIR: "/tmp/ignored-owned-state",
        T3_LYNXTRON_PAIRING_URL: "http://127.0.0.1:45679/pair#token=pairing-secret",
      }),
      {
        kind: "existing-environment",
        source: "explicit-pairing-url",
        httpBaseUrl: "http://127.0.0.1:45679/",
        wsBaseUrl: "ws://127.0.0.1:45679/",
        credential: "pairing-secret",
      },
    );
  });

  it("resolves hosted pairing links through the shared remote contract", () => {
    assert.deepEqual(
      resolveConnectorLaunchTarget({
        T3_LYNXTRON_PAIRING_URL:
          "https://app.t3.codes/pair?host=https%3A%2F%2Fdesktop.example%3A44342%2F#token=pairing-secret",
      }),
      {
        kind: "existing-environment",
        source: "explicit-pairing-url",
        httpBaseUrl: "https://desktop.example:44342/",
        wsBaseUrl: "wss://desktop.example:44342/",
        credential: "pairing-secret",
      },
    );
  });

  it("keeps an explicit isolated base directory ahead of desktop auto-discovery", () => {
    assert.deepEqual(
      resolveConnectorLaunchTarget({ T3_LYNXTRON_BASE_DIR: "/tmp/isolated" }, () => ({
        version: 1,
        ownerPid: 101,
        environmentId: "desktop",
        httpBaseUrl: "http://127.0.0.1:45679/",
        wsBaseUrl: "ws://127.0.0.1:45679/",
        bootstrapCredential: "desktop-secret",
        publishedAt: "2026-08-24T01:00:00Z",
      })),
      { kind: "owned-local", baseDir: "/tmp/isolated" },
    );
  });

  it("attaches to the newest live desktop environment by default", () => {
    assert.deepEqual(
      resolveConnectorLaunchTarget({}, () => ({
        version: 1,
        ownerPid: 101,
        environmentId: "desktop-environment",
        httpBaseUrl: "http://127.0.0.1:45679/",
        wsBaseUrl: "ws://127.0.0.1:45679/",
        bootstrapCredential: "desktop-secret",
        publishedAt: "2026-08-24T01:00:00Z",
      })),
      {
        kind: "existing-environment",
        source: "desktop-rendezvous",
        httpBaseUrl: "http://127.0.0.1:45679/",
        wsBaseUrl: "ws://127.0.0.1:45679/",
        credential: "desktop-secret",
        expectedEnvironmentId: "desktop-environment",
      },
    );
  });

  it("keeps an explicit pairing URL ahead of desktop auto-discovery", () => {
    const target = resolveConnectorLaunchTarget(
      { T3_LYNXTRON_PAIRING_URL: "http://127.0.0.1:4777/pair#token=explicit" },
      () => {
        throw new Error("desktop discovery must not run");
      },
    );
    assert.deepEqual(target, {
      kind: "existing-environment",
      source: "explicit-pairing-url",
      httpBaseUrl: "http://127.0.0.1:4777/",
      wsBaseUrl: "ws://127.0.0.1:4777/",
      credential: "explicit",
    });
  });

  it("keeps external-environment ownership out of the connector lifecycle", () => {
    const source = readFileSync(path.join(import.meta.dirname, "connector.ts"), "utf8");
    const existingConnect = source.slice(
      source.indexOf("private async connectExistingEnvironment"),
      source.indexOf("  private async finishConnection"),
    );
    const dispose = source.slice(source.indexOf("dispose(): void"));

    assert.notInclude(existingConnect, "spawn(");
    assert.include(existingConnect, "this.ownsServer = false;");
    assert.include(existingConnect, "target.expectedEnvironmentId");
    assert.include(existingConnect, "return this.finishConnection({ ensureProject: false });");
    assert.include(dispose, 'this.child?.kill("SIGKILL")');
  });
});

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

describe("disposable empty-thread recovery", () => {
  it("reconciles legacy empty shells after every material shell update", () => {
    const source = readFileSync(path.join(import.meta.dirname, "connector.ts"), "utf8");
    const handleShellItem = source.slice(
      source.indexOf("private handleShellItem"),
      source.indexOf("  private emitShell"),
    );

    assert.include(
      handleShellItem,
      'if (item.kind !== "synchronized" && this.shellSnapshot) {\n      this.scheduleDisposableThreadCleanup();',
    );
    assert.notInclude(
      handleShellItem,
      'if (item.kind === "snapshot") {\n      this.scheduleDisposableThreadCleanup();\n    }',
    );
  });

  it("rechecks a queued deletion against the latest shell before dispatching it", () => {
    const source = readFileSync(path.join(import.meta.dirname, "connector.ts"), "utf8");
    const cleanup = source.slice(
      source.indexOf("private scheduleDisposableThreadCleanup"),
      source.indexOf("  private threadSnapshots"),
    );

    assert.include(cleanup, "const currentThread = this.shellSnapshot?.threads.find(");
    assert.include(
      cleanup,
      "selectRecoverableDisposableThreadIds([currentThread]).includes(threadId)",
    );
    assert.include(cleanup, "this.attemptedDisposableThreadDeletes.delete(threadId);");
    assert.include(cleanup, "await this.deleteThread({ threadId });");
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
