import { assert, describe, it } from "vite-plus/test";

import {
  MainConnectorHost,
  dispatchConnectorCommand,
  settleMainConnectorHandler,
  type ConnectorEventCallbacks,
  type ConnectorLike,
  type MainConnectorHostOptions,
} from "./mainConnectorHost.ts";
import {
  T3_CONNECTOR_EVENT,
  T3_CONNECTOR_METHODS,
  type ConnectorEventEnvelope,
} from "../../shared/connectorProtocol.ts";

async function assertRejects(promise: unknown, pattern: RegExp): Promise<void> {
  try {
    await promise;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert.match(message, pattern);
    return;
  }
  assert.fail(`Expected rejection matching ${pattern}, but the promise resolved`);
}

interface Harness {
  host: MainConnectorHost;
  connector: ConnectorLike & { calls: Array<{ method: string; input: unknown }> };
  handlers: Map<string, (params: unknown) => unknown>;
  pushed: ConnectorEventEnvelope[];
  logs: string[];
}

function createHarness(overrides: Partial<MainConnectorHostOptions> = {}): Harness {
  const pushed: ConnectorEventEnvelope[] = [];
  const handlers = new Map<string, (params: unknown) => unknown>();
  const logs: string[] = [];
  const calls: Array<{ method: string; input: unknown }> = [];
  const connector: ConnectorLike & { calls: Array<{ method: string; input: unknown }> } = {
    calls,
    connect: () => Promise.resolve({ status: "ready" }),
    dispose: () => {
      calls.push({ method: "dispose", input: undefined });
    },
    sendPrompt: (input: unknown) => {
      calls.push({ method: "sendPrompt", input });
      return Promise.resolve();
    },
    interrupt: (input: unknown) => {
      calls.push({ method: "interrupt", input });
      return Promise.resolve();
    },
    respondToApproval: (input: unknown) => {
      calls.push({ method: "respondToApproval", input });
      return Promise.resolve();
    },
    settleThread: (input: unknown) => {
      calls.push({ method: "settleThread", input });
      return Promise.resolve();
    },
    unsettleThread: (input: unknown) => {
      calls.push({ method: "unsettleThread", input });
      return Promise.resolve();
    },
    readProjectBranch: (input: unknown) => {
      calls.push({ method: "readProjectBranch", input });
      return Promise.resolve("main");
    },
    selectThread: (input: unknown) => {
      calls.push({ method: "selectThread", input });
    },
    revokePairingLink: (input: unknown) => {
      calls.push({ method: "revokePairingLink", input });
      return Promise.resolve(true);
    },
  };
  const host = new MainConnectorHost({
    window: {
      sendGlobalEvent: (_name, envelope) => {
        pushed.push(envelope as ConnectorEventEnvelope);
        return true;
      },
    },
    registerHandler: (method, handler) => {
      handlers.set(method, handler as (params: unknown) => unknown);
    },
    createConnector: (events) => Object.assign(connector, events),
    onLog: (line) => logs.push(line),
    ...overrides,
  });
  return { host, connector, handlers, pushed, logs };
}

describe("main connector host", () => {
  it("settles rejected commands into the renderer bridge error envelope", async () => {
    assert.deepEqual(
      await settleMainConnectorHandler(
        () => Promise.reject(new Error("Failed to load turn diff")),
        {},
      ),
      { __t3BridgeError: "Failed to load turn diff" },
    );
    assert.deepEqual(
      await settleMainConnectorHandler(() => {
        throw new Error("Malformed command");
      }, {}),
      { __t3BridgeError: "Malformed command" },
    );
  });

  it("registers ready, resync, and command handlers on attach", () => {
    const { host, handlers } = createHarness();
    host.attach();
    assert.deepEqual(
      [...handlers.keys()].sort(),
      [
        T3_CONNECTOR_METHODS.command,
        T3_CONNECTOR_METHODS.ready,
        T3_CONNECTOR_METHODS.resync,
      ].sort(),
    );
  });

  it("streams sequenced events and mirrors them into the snapshot", async () => {
    const { host, connector, handlers, pushed } = createHarness();
    host.attach();
    await host.connect();

    (connector.onStatus as unknown as (status: string, detail?: string) => void)("starting-server");
    (connector.onShell as unknown as (payload: unknown) => void)({
      projects: [{ id: "p1" }],
      threads: [{ id: "t1" }],
    });
    (connector.onThread as unknown as (threadId: string, payload: unknown) => void)("t1", {
      threadId: "t1",
      messages: [{ id: "m1" }],
      checkpoints: [],
      sessionStatus: "working",
      sessionError: "fixture error",
    });

    assert.deepEqual(
      pushed.map((event) => [event.seq, event.kind]),
      [
        [1, "status"],
        [2, "shell"],
        [3, "thread"],
      ],
    );

    const ready = handlers.get(T3_CONNECTOR_METHODS.ready)!({}) as {
      seq: number;
      snapshot: {
        status: { status: string };
        shell: { projects: unknown[]; threads: unknown[] };
        threads: Record<string, { sessionStatus: string; sessionError?: string | null }>;
      };
    };
    assert.equal(ready.seq, 3);
    assert.equal(ready.snapshot.status.status, "starting-server");
    assert.equal(ready.snapshot.shell.projects.length, 1);
    assert.equal(ready.snapshot.threads["t1"]?.sessionStatus, "working");
    assert.equal(ready.snapshot.threads["t1"]?.sessionError, "fixture error");
  });

  it("represents pre-ready events in the ready snapshot", async () => {
    const { host, connector, handlers, pushed } = createHarness();
    host.attach();
    await host.connect();
    (connector.onConfig as unknown as (config: unknown) => void)({
      providers: [],
      settings: {},
    });
    pushed.length = 0; // renderer was not listening yet; the snapshot must cover it

    const ready = handlers.get(T3_CONNECTOR_METHODS.ready)!({}) as {
      seq: number;
      snapshot: { config: unknown };
    };
    assert.equal(ready.seq, 1);
    assert.deepEqual(ready.snapshot.config, { providers: [], settings: {} });
  });

  it("dispatches allowlisted commands and rejects unknown ones", async () => {
    const { host, connector, handlers } = createHarness();
    host.attach();
    await host.connect();
    const command = handlers.get(T3_CONNECTOR_METHODS.command)!;

    await command({ method: "sendPrompt", params: { threadId: "t1", text: "hello" } });
    assert.deepEqual(connector.calls[0], {
      method: "sendPrompt",
      input: { threadId: "t1", text: "hello" },
    });

    await command({ method: "selectThread", params: "t1" });
    assert.deepEqual(connector.calls[1], { method: "selectThread", input: "t1" });

    await command({ method: "interrupt", params: { threadId: "t1", turnId: "turn-1" } });
    assert.deepEqual(connector.calls[2], {
      method: "interrupt",
      input: { threadId: "t1", turnId: "turn-1" },
    });

    await command({
      method: "respondToApproval",
      params: { threadId: "t1", requestId: "approval-1", decision: "accept" },
    });
    assert.deepEqual(connector.calls[3], {
      method: "respondToApproval",
      input: { threadId: "t1", requestId: "approval-1", decision: "accept" },
    });

    await command({ method: "readProjectBranch", params: { cwd: "/repo" } });
    assert.deepEqual(connector.calls[4], {
      method: "readProjectBranch",
      input: { cwd: "/repo" },
    });

    await command({ method: "settleThread", params: { threadId: "t1" } });
    assert.deepEqual(connector.calls[5], {
      method: "settleThread",
      input: { threadId: "t1" },
    });

    await command({ method: "unsettleThread", params: { threadId: "t1" } });
    assert.deepEqual(connector.calls[6], {
      method: "unsettleThread",
      input: { threadId: "t1" },
    });

    await command({ method: "revokePairingLink", params: { id: "link-1" } });
    assert.deepEqual(connector.calls[7], { method: "revokePairingLink", input: "link-1" });

    await assertRejects(command({ method: "dispose" }), /Rejected connector command/);
    await assertRejects(command({ method: "connect" }), /Rejected connector command/);
    await assertRejects(command({}), /Rejected connector command/);
  });

  it("replaces the connector, projects restart phases, and ignores stale events", async () => {
    const pushed: ConnectorEventEnvelope[] = [];
    const handlers = new Map<string, (params: unknown) => unknown>();
    const connectors: Array<
      ConnectorLike &
        ConnectorEventCallbacks & {
          disposeCount: number;
        }
    > = [];
    const host = new MainConnectorHost({
      window: {
        sendGlobalEvent: (_name, envelope) => {
          pushed.push(envelope as ConnectorEventEnvelope);
          return true;
        },
      },
      registerHandler: (method, handler) => {
        handlers.set(method, handler as (params: unknown) => unknown);
      },
      createConnector: (events) => {
        const connector = {
          ...events,
          disposeCount: 0,
          connect: () => Promise.resolve({ status: "ready" }),
          dispose() {
            connector.disposeCount += 1;
          },
        };
        connectors.push(connector);
        return connector;
      },
    });
    host.attach();
    await host.connect();
    connectors[0]!.onStatus("ready");
    pushed.length = 0;

    const command = handlers.get(T3_CONNECTOR_METHODS.command)!;
    await command({ method: "reconnect" });
    assert.equal(connectors.length, 2);
    assert.equal(connectors[0]!.disposeCount, 1);

    connectors[0]!.onStatus("error", "stale process exit");
    connectors[1]!.onStatus("starting-server", "Launching replacement");
    connectors[1]!.onStatus("connecting", "Waiting for replacement");
    connectors[1]!.onStatus("ready");

    assert.deepEqual(
      pushed.filter((event) => event.kind === "status").map((event) => event.payload.status),
      ["reconnecting", "reconnecting", "reconnecting", "ready"],
    );
    assert.isFalse(
      pushed.some(
        (event) =>
          event.kind === "status" &&
          event.payload.status === "error" &&
          event.payload.detail === "stale process exit",
      ),
    );
  });

  it("forwards undelivered push failures to the log without throwing", async () => {
    const { host, connector, logs } = createHarness({
      window: { sendGlobalEvent: () => false },
    });
    host.attach();
    await host.connect();
    (connector.onStatus as unknown as (status: string) => void)("connecting");
    assert.isTrue(logs.some((line) => line.includes("seq=1") && line.includes("not delivered")));
  });

  it("disposes handlers and connector resources exactly once", async () => {
    const removed: string[] = [];
    const { host, connector, handlers } = createHarness({
      removeHandler: (method) => removed.push(method),
    });
    host.attach();
    await host.connect();
    host.dispose();
    host.dispose();

    assert.equal(removed.length, 3);
    assert.deepEqual(
      connector.calls.map((call) => call.method),
      ["dispose"],
    );
    const command = handlers.get(T3_CONNECTOR_METHODS.command)!;
    await assertRejects(command({ method: "sendPrompt", params: {} }), /disposed/);
  });
});

describe("dispatchConnectorCommand", () => {
  it("forwards canonical file search inputs without reshaping the payload", async () => {
    const calls: unknown[] = [];
    const connector = {
      connect: () => Promise.resolve(),
      dispose: () => {},
      searchProjectEntries: (input: unknown) => {
        calls.push(input);
        return Promise.resolve({ entries: [], truncated: false });
      },
    } as ConnectorLike;
    const params = { cwd: "/tmp/project", query: "", limit: 200, kind: "file" };

    await dispatchConnectorCommand(connector, {
      method: "searchProjectEntries",
      params,
    });

    assert.deepEqual(calls, [params]);
  });

  it("forwards canonical editor launch inputs without reshaping the payload", async () => {
    const calls: unknown[] = [];
    const connector = {
      connect: () => Promise.resolve(),
      dispose: () => {},
      openInEditor: (input: unknown) => {
        calls.push(input);
        return Promise.resolve();
      },
    } as ConnectorLike;
    const params = { cwd: "/tmp/project", editor: "cursor" };

    await dispatchConnectorCommand(connector, {
      method: "openInEditor",
      params,
    });

    assert.deepEqual(calls, [params]);
  });

  it("forwards canonical project script updates without reshaping the payload", async () => {
    const calls: unknown[] = [];
    const connector = {
      connect: () => Promise.resolve(),
      dispose: () => {},
      updateProjectScripts: (input: unknown) => {
        calls.push(input);
        return Promise.resolve();
      },
    } as ConnectorLike;
    const params = {
      projectId: "project-1",
      scripts: [
        {
          id: "test",
          name: "Test",
          command: "pnpm test",
          icon: "play",
          runOnWorktreeCreate: false,
        },
      ],
    };

    await dispatchConnectorCommand(connector, {
      method: "updateProjectScripts",
      params,
    });

    assert.deepEqual(calls, [params]);
  });

  it("throws a clear error for missing connector methods", () => {
    const connector = { connect: () => Promise.resolve(), dispose: () => {} } as ConnectorLike;
    assert.throws(
      () => dispatchConnectorCommand(connector, { method: "sendPrompt", params: {} }),
      /does not implement command "sendPrompt"/,
    );
  });
});
