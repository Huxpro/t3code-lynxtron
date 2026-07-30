import { assert, describe, it } from "vite-plus/test";

import {
  MainConnectorHost,
  dispatchConnectorCommand,
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
        threads: Record<string, { sessionStatus: string }>;
      };
    };
    assert.equal(ready.seq, 3);
    assert.equal(ready.snapshot.status.status, "starting-server");
    assert.equal(ready.snapshot.shell.projects.length, 1);
    assert.equal(ready.snapshot.threads["t1"]?.sessionStatus, "working");
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

    await command({ method: "revokePairingLink", params: { id: "link-1" } });
    assert.deepEqual(connector.calls[2], { method: "revokePairingLink", input: "link-1" });

    await assertRejects(command({ method: "dispose" }), /Rejected connector command/);
    await assertRejects(command({ method: "connect" }), /Rejected connector command/);
    await assertRejects(command({}), /Rejected connector command/);
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
  it("throws a clear error for missing connector methods", () => {
    const connector = { connect: () => Promise.resolve(), dispose: () => {} } as ConnectorLike;
    assert.throws(
      () => dispatchConnectorCommand(connector, { method: "sendPrompt", params: {} }),
      /does not implement command "sendPrompt"/,
    );
  });
});
