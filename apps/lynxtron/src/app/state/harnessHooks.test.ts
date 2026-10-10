import { assert, describe, it } from "vite-plus/test";

import { ThreadId } from "@t3tools/contracts";

import {
  changesState,
  createHarnessCommand,
  failOperationOnce,
  resolveClientReadiness,
} from "./harnessHooks.ts";
import { routeCommandBridge, type UpstreamCommandPort } from "./upstreamCommands.ts";
import type { UpstreamOperationInputs } from "./upstreamOperations.ts";

describe("resolveClientReadiness", () => {
  it("is ready only when the shown status is ready and commands have a bridge", () => {
    assert.isTrue(
      resolveClientReadiness({ status: "ready", commandsReady: true, revision: 4 }).ready,
    );
    assert.isFalse(
      resolveClientReadiness({ status: "ready", commandsReady: false, revision: 4 }).ready,
    );
  });

  it("is not ready in any status the lifecycle banner shows", () => {
    for (const status of ["idle", "connecting", "reconnecting", "error"] as const) {
      const readiness = resolveClientReadiness({ status, commandsReady: true, revision: 1 });
      assert.isFalse(readiness.ready, status);
      assert.equal(readiness.status, status);
    }
  });

  it("carries the revision it was given", () => {
    assert.equal(
      resolveClientReadiness({ status: "ready", commandsReady: true, revision: 9 }).revision,
      9,
    );
  });
});

describe("changesState", () => {
  const threads = [{ id: "thread-1" }];
  const state = { status: "ready", threads, activeThreadId: undefined as string | undefined };

  it("sees a field that takes another value", () => {
    assert.isTrue(changesState(state, { status: "error" }));
    assert.isTrue(changesState(state, { threads: [{ id: "thread-1" }] }));
    assert.isTrue(changesState(state, { activeThreadId: "thread-1" }));
  });

  it("sees nothing when every field keeps its value", () => {
    assert.isFalse(changesState(state, {}));
    assert.isFalse(changesState(state, { status: "ready", threads }));
    assert.isFalse(changesState(state, { activeThreadId: undefined }));
  });
});

describe("failOperationOnce", () => {
  it("fails the first call of the named operation and sends every other one", async () => {
    const sent: Array<string> = [];
    const port = failOperationOnce(
      {
        operation: (name: string) => {
          sent.push(name);
          return Promise.resolve({ sequence: sent.length });
        },
      } as unknown as UpstreamCommandPort,
      "startThreadTurn",
      "Injected failure",
    );
    const archive = { threadId: ThreadId.make("thread-1") };
    const turn = {} as UpstreamOperationInputs["startThreadTurn"];

    assert.deepEqual(await port.operation("archiveThread", archive), { sequence: 1 });
    assert.equal(
      await port.operation("startThreadTurn", turn).catch((error: Error) => error.message),
      "Injected failure",
    );
    assert.deepEqual(await port.operation("startThreadTurn", turn), { sequence: 2 });
    assert.deepEqual(sent, ["archiveThread", "startThreadTurn"]);
  });
});

describe("createHarnessCommand", () => {
  const names = ["reconnect", "archiveThread"];

  it("takes the path the bridge takes at the moment of the call", async () => {
    let upstreamUp = false;
    const answering = (source: string, commands: ReadonlyArray<string>) =>
      Object.fromEntries(
        commands.map((name) => [name, (input?: unknown) => Promise.resolve({ source, input })]),
      );
    const bridge = routeCommandBridge({
      connector: answering("connector", names),
      upstream: answering("upstream", ["archiveThread"]),
      useUpstream: () => upstreamUp,
    });
    const command = createHarnessCommand(() => bridge, names);

    assert.deepEqual(await command("archiveThread", { threadId: "thread-1" }), {
      source: "connector",
      input: { threadId: "thread-1" },
    });
    upstreamUp = true;
    assert.deepEqual(await command("archiveThread", { threadId: "thread-1" }), {
      source: "upstream",
      input: { threadId: "thread-1" },
    });
    assert.deepEqual(await command("reconnect"), { source: "connector", input: undefined });
  });

  it("rejects with the command's own failure, thrown or returned", async () => {
    const command = createHarnessCommand(
      () => ({
        reconnect: () => {
          throw new Error("thrown");
        },
        archiveThread: () => Promise.reject(new Error("rejected")),
      }),
      names,
    );
    assert.equal(await command("reconnect").catch((error: Error) => error.message), "thrown");
    assert.equal(await command("archiveThread").catch((error: Error) => error.message), "rejected");
  });

  it("refuses what is not a command or has no bridge yet", async () => {
    const bridge: { current: object | undefined } = { current: undefined };
    const command = createHarnessCommand(() => bridge.current, names);
    assert.equal(
      await command("reconnect").catch((error: Error) => error.message),
      "Command reconnect is unavailable.",
    );
    bridge.current = { reconnect: () => Promise.resolve(), setPrefs: () => true };
    assert.equal(
      await command("setPrefs").catch((error: Error) => error.message),
      "setPrefs is not a command.",
    );
  });
});
