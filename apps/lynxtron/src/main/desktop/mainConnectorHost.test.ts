import { assert, describe, it } from "vite-plus/test";

import {
  MainConnectorHost,
  dispatchConnectorCommand,
  projectRendererServerConfig,
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
  it("bounds renderer config to native menu keybindings and provider presentation data", () => {
    const config = {
      keybindings: [
        {
          command: "sidebar.toggle",
          shortcut: {
            key: "b",
            metaKey: false,
            ctrlKey: false,
            shiftKey: false,
            altKey: false,
            modKey: true,
          },
        },
        {
          command: "commandPalette.toggle",
          shortcut: {
            key: "k",
            metaKey: false,
            ctrlKey: false,
            shiftKey: false,
            altKey: false,
            modKey: true,
          },
        },
        {
          command: "settings.open",
          shortcut: {
            key: ",",
            metaKey: false,
            ctrlKey: false,
            shiftKey: false,
            altKey: false,
            modKey: true,
          },
        },
        {
          command: "chat.new",
          shortcut: {
            key: "n",
            metaKey: false,
            ctrlKey: false,
            shiftKey: false,
            altKey: false,
            modKey: true,
          },
        },
      ],
      providers: [
        {
          instanceId: "codex",
          models: [
            {
              slug: "gpt-5",
              capabilities: {
                optionDescriptors: [
                  {
                    id: "effort",
                    label: "Effort",
                    description: "Long provider help copy",
                    type: "select",
                    options: [{ id: "high", label: "High", description: "Long option help copy" }],
                  },
                ],
              },
            },
          ],
          slashCommands: [{ name: "review", description: "large" }],
          skills: [{ name: "audit", path: "/skill", enabled: true }],
        },
      ],
      settings: { theme: "dark" },
    } as unknown as Parameters<typeof projectRendererServerConfig>[0];
    const projected = projectRendererServerConfig(config);
    assert.deepEqual(
      projected.keybindings.map((binding) => binding.command),
      ["commandPalette.toggle", "settings.open", "chat.new"],
    );
    assert.deepEqual(projected.providers[0]?.slashCommands, []);
    assert.deepEqual(projected.providers[0]?.skills, []);
    assert.deepEqual(projected.providers[0]?.models[0]?.capabilities, {
      optionDescriptors: [
        {
          id: "effort",
          label: "Effort",
          type: "select",
          options: [{ id: "high", label: "High" }],
        },
      ],
    });
    assert.deepEqual(projected.settings, config.settings);
  });

  it("registers subscribe, sync, recovery, and command handlers on attach", () => {
    const { host, handlers } = createHarness();
    host.attach();
    assert.deepEqual(
      [...handlers.keys()].sort(),
      [
        T3_CONNECTOR_METHODS.command,
        T3_CONNECTOR_METHODS.ready,
        T3_CONNECTOR_METHODS.reconnect,
        T3_CONNECTOR_METHODS.resync,
        T3_CONNECTOR_METHODS.subscribe,
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

  it("pushes the current snapshot when the renderer subscribes", async () => {
    const { host, connector, handlers, pushed } = createHarness();
    host.attach();
    await host.connect();
    (connector.onShell as unknown as (payload: unknown) => void)({
      projects: [{ id: "p1" }],
      threads: [{ id: "t1" }],
    });

    const result = await handlers.get(T3_CONNECTOR_METHODS.subscribe)!({ lastSeq: 0 });
    assert.isNull(result);
    const snapshot = pushed.at(-1);
    assert.equal(snapshot?.kind, "snapshot");
    if (snapshot?.kind !== "snapshot") assert.fail("expected snapshot event");
    assert.equal(snapshot.payload.shell.projects[0]?.id, "p1");
  });

  it("represents pre-ready events in the ready snapshot", async () => {
    const { host, connector, handlers, pushed } = createHarness();
    host.attach();
    await host.connect();
    (connector.onConfig as unknown as (config: unknown) => void)({
      providers: [],
      keybindings: [],
      settings: {},
    });
    pushed.length = 0; // renderer was not listening yet; the snapshot must cover it

    const ready = handlers.get(T3_CONNECTOR_METHODS.ready)!({}) as {
      seq: number;
      snapshot: { config: unknown };
    };
    assert.equal(ready.seq, 1);
    assert.deepEqual(ready.snapshot.config, { providers: [], keybindings: [], settings: {} });
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

    connector.refreshVcsStatus = (input: unknown) => {
      connector.calls.push({ method: "refreshVcsStatus", input });
      return Promise.resolve({ refName: "feature/composer" });
    };
    await command({ method: "refreshVcsStatus", params: { cwd: "/repo" } });
    assert.deepEqual(connector.calls[3], {
      method: "refreshVcsStatus",
      input: { cwd: "/repo" },
    });

    connector.respondToApproval = (input: unknown) => {
      connector.calls.push({ method: "respondToApproval", input });
      return Promise.resolve();
    };
    await command({
      method: "respondToApproval",
      params: { threadId: "t1", requestId: "approval-1", decision: "accept" },
    });
    assert.deepEqual(connector.calls[4], {
      method: "respondToApproval",
      input: { threadId: "t1", requestId: "approval-1", decision: "accept" },
    });

    connector.respondToUserInput = (input: unknown) => {
      connector.calls.push({ method: "respondToUserInput", input });
      return Promise.resolve();
    };
    await command({
      method: "respondToUserInput",
      params: { threadId: "t1", requestId: "input-1", answers: { scope: "Web" } },
    });
    assert.deepEqual(connector.calls[5], {
      method: "respondToUserInput",
      input: { threadId: "t1", requestId: "input-1", answers: { scope: "Web" } },
    });

    connector.implementProposedPlan = (input: unknown) => {
      connector.calls.push({ method: "implementProposedPlan", input });
      return Promise.resolve();
    };
    await command({
      method: "implementProposedPlan",
      params: { threadId: "t1", planId: "plan-1", prompt: "PLEASE IMPLEMENT THIS PLAN:\nShip it" },
    });
    assert.deepEqual(connector.calls[6], {
      method: "implementProposedPlan",
      input: { threadId: "t1", planId: "plan-1", prompt: "PLEASE IMPLEMENT THIS PLAN:\nShip it" },
    });

    connector.implementProposedPlanInNewThread = (input: unknown) => {
      connector.calls.push({ method: "implementProposedPlanInNewThread", input });
      return Promise.resolve({ threadId: "t2" });
    };
    const created = await command({
      method: "implementProposedPlanInNewThread",
      params: {
        sourceThreadId: "t1",
        planId: "plan-1",
        prompt: "Implement",
        title: "Implement plan",
      },
    });
    assert.deepEqual(created, { threadId: "t2" });
    assert.equal(connector.calls[7]?.method, "implementProposedPlanInNewThread");

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

  it("replaces the connector and ignores late events from the disposed generation", async () => {
    const connectors: Array<
      ConnectorLike & { emitStatus: (status: string) => void; disposed: boolean }
    > = [];
    const { host, handlers, pushed } = createHarness({
      createConnector: (events) => {
        const connector = {
          disposed: false,
          connect: () => Promise.resolve(),
          dispose() {
            this.disposed = true;
          },
          emitStatus: (status: string) => events.onStatus(status),
        };
        connectors.push(connector);
        return connector;
      },
    });
    host.attach();
    await host.connect();
    connectors[0].emitStatus("ready");

    await handlers.get(T3_CONNECTOR_METHODS.reconnect)!({});
    assert.isTrue(connectors[0].disposed);
    assert.lengthOf(connectors, 2);
    connectors[0].emitStatus("error");
    connectors[1].emitStatus("ready");

    assert.deepEqual(
      pushed.filter((event) => event.kind === "status").map((event) => event.payload.status),
      ["ready", "ready"],
    );
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

    assert.equal(removed.length, 5);
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
