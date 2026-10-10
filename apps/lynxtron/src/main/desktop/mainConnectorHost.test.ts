import { assert, describe, it } from "vite-plus/test";

import {
  MainConnectorHost,
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

type FakeConnector = ConnectorLike & ConnectorEventCallbacks & { disposeCount: number };

interface Harness {
  host: MainConnectorHost;
  /** Every connector the host made, the latest last. */
  connectors: FakeConnector[];
  handlers: Map<string, (params: unknown) => unknown>;
  pushed: ConnectorEventEnvelope[];
  logs: string[];
}

function createHarness(
  overrides: Partial<MainConnectorHostOptions> = {},
  connectorOverrides: (index: number) => Partial<ConnectorLike> = () => ({}),
): Harness {
  const pushed: ConnectorEventEnvelope[] = [];
  const handlers = new Map<string, (params: unknown) => unknown>();
  const logs: string[] = [];
  const connectors: FakeConnector[] = [];
  const host = new MainConnectorHost({
    window: {
      sendGlobalEvent: (name, envelope) => {
        assert.equal(name, T3_CONNECTOR_EVENT);
        pushed.push(envelope as ConnectorEventEnvelope);
        return true;
      },
    },
    registerHandler: (method, handler) => {
      handlers.set(method, handler as (params: unknown) => unknown);
    },
    createConnector: (events) => {
      const connector: FakeConnector = {
        ...events,
        disposeCount: 0,
        connect: () => Promise.resolve({ status: "ready" }),
        dispose() {
          connector.disposeCount += 1;
        },
        ...connectorOverrides(connectors.length),
      };
      connectors.push(connector);
      return connector;
    },
    onLog: (line) => logs.push(line),
    ...overrides,
  });
  return { host, connectors, handlers, pushed, logs };
}

const statuses = (pushed: ReadonlyArray<ConnectorEventEnvelope>) =>
  pushed.flatMap((event) => (event.kind === "status" ? [event.payload] : []));

describe("main connector host", () => {
  it("settles rejected commands into the renderer bridge error envelope", async () => {
    assert.deepEqual(
      await settleMainConnectorHandler(() => Promise.reject(new Error("Server exited")), {}),
      { __t3BridgeError: "Server exited" },
    );
    assert.deepEqual(
      await settleMainConnectorHandler(() => {
        throw new Error("Malformed command");
      }, {}),
      { __t3BridgeError: "Malformed command" },
    );
  });

  it("registers the ready, resync, command and primary connection handlers on attach", () => {
    const { host, handlers } = createHarness();
    host.attach();
    assert.deepEqual([...handlers.keys()].sort(), Object.values(T3_CONNECTOR_METHODS).sort());
  });

  it("pushes the status and the log in sequence and answers a sync with the latest status", async () => {
    const { host, connectors, handlers, pushed, logs } = createHarness(
      {},
      () => ({ connectionKind: "owned-local", pathsResolveLocally: true }) as const,
    );
    host.attach();
    assert.deepEqual(handlers.get(T3_CONNECTOR_METHODS.ready)!({}), {
      seq: 0,
      snapshot: { status: { status: "idle" } },
    });
    await host.connect();

    connectors[0]!.onStatus("starting-server", "Launching");
    connectors[0]!.onLog("[srv] line");
    connectors[0]!.onStatus("connecting");

    assert.deepEqual(
      pushed.map((event) => [event.seq, event.kind]),
      [
        [1, "status"],
        [2, "log"],
        [3, "status"],
      ],
    );
    assert.deepEqual(logs, ["[srv] line"]);
    // A renderer that was not listening yet gets the same from the snapshot.
    for (const method of [T3_CONNECTOR_METHODS.ready, T3_CONNECTOR_METHODS.resync]) {
      assert.deepEqual(handlers.get(method)!({}), {
        seq: 3,
        snapshot: {
          status: {
            status: "connecting",
            connectionKind: "owned-local",
            pathsResolveLocally: true,
          },
        },
      });
    }
  });

  it("hands over the server's address and bearer once the connector has them", async () => {
    const connection = {
      httpBaseUrl: "http://127.0.0.1:4100/",
      wsBaseUrl: "ws://127.0.0.1:4100/",
      bearer: "bearer-4100",
    };
    const { host, handlers } = createHarness({}, () => ({ primaryConnection: () => connection }));
    host.attach();
    const read = handlers.get(T3_CONNECTOR_METHODS.primaryConnection)!;
    assert.isNull(read({}));
    await host.connect();
    assert.strictEqual(read({}), connection);
  });

  it("reports a connection that failed without having said so as an error", async () => {
    const { host, pushed } = createHarness({}, () => ({
      connect: () => Promise.reject(new Error("t3 server did not become ready")),
    }));
    host.attach();
    await assertRejects(host.connect(), /did not become ready/);
    assert.deepEqual(statuses(pushed), [
      { status: "error", detail: "t3 server did not become ready" },
    ]);
  });

  it("takes reconnect and no other command", async () => {
    const { host, connectors, handlers } = createHarness();
    host.attach();
    await host.connect();
    const command = handlers.get(T3_CONNECTOR_METHODS.command)!;

    await assertRejects(
      command({ method: "sendPrompt", params: {} }),
      /Rejected connector command/,
    );
    await assertRejects(command(null), /Rejected connector command/);
    assert.equal(connectors.length, 1);

    await command({ method: "reconnect" });
    assert.equal(connectors.length, 2);
  });

  it("replaces the connector, projects restart phases, and ignores stale events", async () => {
    const { host, connectors, handlers, pushed, logs } = createHarness();
    host.attach();
    await host.connect();
    connectors[0]!.onStatus("ready");
    pushed.length = 0;

    await handlers.get(T3_CONNECTOR_METHODS.command)!({ method: "reconnect" });
    assert.equal(connectors.length, 2);
    assert.equal(connectors[0]!.disposeCount, 1);

    connectors[0]!.onStatus("error", "stale process exit");
    connectors[0]!.onLog("[srv] stale line");
    connectors[1]!.onStatus("starting-server", "Launching replacement");
    connectors[1]!.onStatus("connecting", "Waiting for replacement");
    connectors[1]!.onStatus("ready");

    assert.deepEqual(
      statuses(pushed).map((status) => status.status),
      ["reconnecting", "reconnecting", "reconnecting", "ready"],
    );
    assert.isFalse(statuses(pushed).some((status) => status.detail === "stale process exit"));
    assert.deepEqual(logs, []);
  });

  it("names the server each ready status is about, which a reconnect replaces", async () => {
    const { host, connectors, handlers, pushed } = createHarness({}, (index) => ({
      primaryConnection: () => ({
        httpBaseUrl: `http://127.0.0.1:${4100 + index}/`,
        wsBaseUrl: `ws://127.0.0.1:${4100 + index}/`,
        bearer: `bearer-${4100 + index}`,
      }),
    }));
    host.attach();
    await host.connect();
    connectors[0]!.onStatus("connecting");
    connectors[0]!.onStatus("ready");
    await handlers.get(T3_CONNECTOR_METHODS.command)!({ method: "reconnect" });
    connectors[1]!.onStatus("ready");

    assert.deepEqual(statuses(pushed), [
      { status: "connecting" },
      { status: "ready", httpBaseUrl: "http://127.0.0.1:4100/" },
      { status: "reconnecting" },
      { status: "ready", httpBaseUrl: "http://127.0.0.1:4101/" },
    ]);
  });

  it("starts one replacement for reconnects that overlap", async () => {
    let release = () => {};
    const { host, connectors, handlers } = createHarness({}, (index) =>
      index === 0
        ? {}
        : {
            connect: () =>
              new Promise((resolve) => {
                release = () => resolve({ status: "ready" });
              }),
          },
    );
    host.attach();
    await host.connect();
    const command = handlers.get(T3_CONNECTOR_METHODS.command)!;
    const first = command({ method: "reconnect" });
    const second = command({ method: "reconnect" });
    release();
    await Promise.all([first, second]);
    assert.equal(connectors.length, 2);
  });

  it("forwards undelivered push failures to the log without throwing", async () => {
    const { host, connectors, logs } = createHarness({
      window: { sendGlobalEvent: () => false },
    });
    host.attach();
    await host.connect();
    connectors[0]!.onStatus("connecting");
    assert.isTrue(logs.some((line) => line.includes("seq=1") && line.includes("not delivered")));
  });

  it("disposes handlers and connector resources exactly once", async () => {
    const removed: string[] = [];
    const { host, connectors, handlers } = createHarness({
      removeHandler: (method) => removed.push(method),
    });
    host.attach();
    await host.connect();
    host.dispose();
    host.dispose();

    assert.equal(removed.length, Object.keys(T3_CONNECTOR_METHODS).length);
    assert.equal(connectors[0]!.disposeCount, 1);
    const command = handlers.get(T3_CONNECTOR_METHODS.command)!;
    await assertRejects(command({ method: "reconnect" }), /disposed/);
  });
});
