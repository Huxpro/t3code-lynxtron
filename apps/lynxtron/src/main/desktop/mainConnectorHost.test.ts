import { assert, describe, it } from "vite-plus/test";
import { DEFAULT_SERVER_SETTINGS, EnvironmentId, type ServerConfig } from "@t3tools/contracts";
import * as Duration from "effect/Duration";

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
  encodeConnectorCommandParams,
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

function serverConfig(settings = DEFAULT_SERVER_SETTINGS): ServerConfig {
  return {
    environment: {
      environmentId: EnvironmentId.make("main-connector-host-test"),
      label: "Main Connector Host Test",
      platform: { os: "darwin", arch: "arm64" },
      serverVersion: "0.0.0-test",
      capabilities: { repositoryIdentity: true },
    },
    auth: {
      policy: "loopback-browser",
      bootstrapMethods: ["one-time-token"],
      sessionMethods: ["browser-session-cookie"],
      sessionCookieName: "t3_test_session",
    },
    cwd: "/tmp/main-connector-host-test",
    keybindingsConfigPath: "/tmp/main-connector-host-test/keybindings.json",
    keybindings: [],
    issues: [],
    providers: [],
    availableEditors: [],
    observability: {
      logsDirectoryPath: "/tmp/main-connector-host-test/logs",
      localTracingEnabled: false,
      otlpTracesEnabled: false,
      otlpMetricsEnabled: false,
    },
    settings,
  };
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
    respondToUserInput: (input: unknown) => {
      calls.push({ method: "respondToUserInput", input });
      return Promise.resolve();
    },
    refreshProviders: (input: unknown) => {
      calls.push({ method: "refreshProviders", input });
      return Promise.resolve(serverConfig());
    },
    updateProvider: (input: unknown) => {
      calls.push({ method: "updateProvider", input });
      return Promise.resolve(serverConfig());
    },
    updateServerSettings: (input: unknown) => {
      calls.push({ method: "updateServerSettings", input });
      return Promise.resolve(serverConfig());
    },
    createAssetUrl: (input: unknown) => {
      calls.push({ method: "createAssetUrl", input });
      return Promise.resolve({ url: "http://127.0.0.1/favicon.png", expiresAt: 1 });
    },
    settleThread: (input: unknown) => {
      calls.push({ method: "settleThread", input });
      return Promise.resolve();
    },
    unsettleThread: (input: unknown) => {
      calls.push({ method: "unsettleThread", input });
      return Promise.resolve();
    },
    regenerateThreadTitle: (input: unknown) => {
      calls.push({ method: "regenerateThreadTitle", input });
      return Promise.resolve();
    },
    snoozeThread: (input: unknown) => {
      calls.push({ method: "snoozeThread", input });
      return Promise.resolve();
    },
    unsnoozeThread: (input: unknown) => {
      calls.push({ method: "unsnoozeThread", input });
      return Promise.resolve();
    },
    readProjectBranch: (input: unknown) => {
      calls.push({ method: "readProjectBranch", input });
      return Promise.resolve("main");
    },
    readVcsStatus: (input: unknown) => {
      calls.push({ method: "readVcsStatus", input });
      return Promise.resolve({ isRepo: true, refName: "main" });
    },
    getDiffPreview: (input: unknown) => {
      calls.push({ method: "getDiffPreview", input });
      return Promise.resolve({ sources: [] });
    },
    initializeRepository: (input: unknown) => {
      calls.push({ method: "initializeRepository", input });
      return Promise.resolve();
    },
    publishRepository: (input: unknown) => {
      calls.push({ method: "publishRepository", input });
      return Promise.resolve({ status: "pushed" });
    },
    selectThread: (input: unknown) => {
      calls.push({ method: "selectThread", input });
    },
    revokePairingLink: (input: unknown) => {
      calls.push({ method: "revokePairingLink", input });
      return Promise.resolve(true);
    },
    openTerminal: (input: unknown) => {
      calls.push({ method: "openTerminal", input });
      return Promise.resolve({ status: "running" });
    },
    writeTerminal: (input: unknown) => {
      calls.push({ method: "writeTerminal", input });
      return Promise.resolve();
    },
    resizeTerminal: (input: unknown) => {
      calls.push({ method: "resizeTerminal", input });
      return Promise.resolve();
    },
    closeTerminal: (input: unknown) => {
      calls.push({ method: "closeTerminal", input });
      return Promise.resolve();
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
    (connector.onConfig as unknown as (config: ServerConfig) => void)(serverConfig());
    pushed.length = 0; // renderer was not listening yet; the snapshot must cover it

    const ready = handlers.get(T3_CONNECTOR_METHODS.ready)!({}) as {
      seq: number;
      snapshot: { config: unknown };
    };
    assert.equal(ready.seq, 1);
    assert.equal(
      (ready.snapshot.config as { settings: { automaticGitFetchInterval: number } }).settings
        .automaticGitFetchInterval,
      30_000,
    );
  });

  it("streams terminal state and retains it in resync snapshots", async () => {
    const { host, connector, handlers, pushed } = createHarness();
    host.attach();
    await host.connect();
    (
      connector.onTerminal as unknown as (
        threadId: string,
        terminalId: string,
        payload: unknown,
      ) => void
    )("t1", "term-1", {
      threadId: "t1",
      terminalId: "term-1",
      cwd: "/repo",
      status: "running",
      history: "ready\n",
      error: null,
      updatedAt: "2026-08-25T00:00:00.000Z",
    });

    assert.equal(pushed.at(-1)?.kind, "terminal");
    const ready = handlers.get(T3_CONNECTOR_METHODS.ready)!({}) as {
      snapshot: { terminals: Record<string, { history: string }> };
    };
    assert.equal(ready.snapshot.terminals["t1\u0000term-1"]?.history, "ready\n");
  });

  it("dispatches allowlisted commands and rejects unknown ones", async () => {
    const { host, connector, handlers } = createHarness();
    host.attach();
    await host.connect();
    const command = handlers.get(T3_CONNECTOR_METHODS.command)!;

    const attachments = [
      {
        type: "image",
        name: "diagram.png",
        mimeType: "image/png",
        sizeBytes: 3,
        dataUrl: "data:image/png;base64,AQID",
      },
    ];
    await command({
      method: "sendPrompt",
      params: { threadId: "t1", text: "hello", attachments },
    });
    assert.deepEqual(connector.calls[0], {
      method: "sendPrompt",
      input: { threadId: "t1", text: "hello", attachments },
    });

    await command({ method: "selectThread", params: "t1" });
    assert.deepEqual(connector.calls[1], { method: "selectThread", input: "t1" });

    await command({
      method: "createAssetUrl",
      params: { resource: { _tag: "project-favicon", cwd: "/repo" } },
    });
    assert.deepEqual(connector.calls[2], {
      method: "createAssetUrl",
      input: { resource: { _tag: "project-favicon", cwd: "/repo" } },
    });

    await command({ method: "interrupt", params: { threadId: "t1", turnId: "turn-1" } });
    assert.deepEqual(connector.calls[3], {
      method: "interrupt",
      input: { threadId: "t1", turnId: "turn-1" },
    });

    await command({
      method: "respondToApproval",
      params: { threadId: "t1", requestId: "approval-1", decision: "accept" },
    });
    assert.deepEqual(connector.calls[4], {
      method: "respondToApproval",
      input: { threadId: "t1", requestId: "approval-1", decision: "accept" },
    });

    await command({
      method: "respondToUserInput",
      params: {
        threadId: "t1",
        requestId: "question-1",
        answers: { deployment: "Safe" },
      },
    });
    assert.deepEqual(connector.calls[5], {
      method: "respondToUserInput",
      input: {
        threadId: "t1",
        requestId: "question-1",
        answers: { deployment: "Safe" },
      },
    });

    await command({ method: "refreshProviders", params: { instanceId: "claudeAgent" } });
    assert.deepEqual(connector.calls[6], {
      method: "refreshProviders",
      input: { instanceId: "claudeAgent" },
    });

    await command({
      method: "updateProvider",
      params: { provider: "claudeAgent", instanceId: "claudeAgent" },
    });
    assert.deepEqual(connector.calls[7], {
      method: "updateProvider",
      input: { provider: "claudeAgent", instanceId: "claudeAgent" },
    });

    await command({ method: "readProjectBranch", params: { cwd: "/repo" } });
    assert.deepEqual(connector.calls[8], {
      method: "readProjectBranch",
      input: { cwd: "/repo" },
    });

    await command({ method: "readVcsStatus", params: { cwd: "/repo" } });
    assert.deepEqual(connector.calls[9], {
      method: "readVcsStatus",
      input: { cwd: "/repo" },
    });

    await command({
      method: "getDiffPreview",
      params: { cwd: "/repo", ignoreWhitespace: true },
    });
    assert.deepEqual(connector.calls[10], {
      method: "getDiffPreview",
      input: { cwd: "/repo", ignoreWhitespace: true },
    });

    await command({ method: "initializeRepository", params: { cwd: "/repo" } });
    assert.deepEqual(connector.calls[11], {
      method: "initializeRepository",
      input: { cwd: "/repo" },
    });

    await command({
      method: "publishRepository",
      params: {
        cwd: "/repo",
        provider: "github",
        repository: "owner/repo",
        visibility: "private",
      },
    });
    assert.deepEqual(connector.calls[12], {
      method: "publishRepository",
      input: {
        cwd: "/repo",
        provider: "github",
        repository: "owner/repo",
        visibility: "private",
      },
    });

    await command({ method: "settleThread", params: { threadId: "t1" } });
    assert.deepEqual(connector.calls[13], {
      method: "settleThread",
      input: { threadId: "t1" },
    });

    await command({ method: "unsettleThread", params: { threadId: "t1" } });
    assert.deepEqual(connector.calls[14], {
      method: "unsettleThread",
      input: { threadId: "t1" },
    });

    await command({ method: "regenerateThreadTitle", params: { threadId: "t1" } });
    assert.deepEqual(connector.calls[15], {
      method: "regenerateThreadTitle",
      input: { threadId: "t1" },
    });

    await command({
      method: "snoozeThread",
      params: { threadId: "t1", snoozedUntil: "2026-09-01T09:00:00.000Z" },
    });
    assert.deepEqual(connector.calls[16], {
      method: "snoozeThread",
      input: { threadId: "t1", snoozedUntil: "2026-09-01T09:00:00.000Z" },
    });

    await command({ method: "unsnoozeThread", params: { threadId: "t1" } });
    assert.deepEqual(connector.calls[17], {
      method: "unsnoozeThread",
      input: { threadId: "t1" },
    });

    await command({ method: "revokePairingLink", params: { id: "link-1" } });
    assert.deepEqual(connector.calls[18], { method: "revokePairingLink", input: "link-1" });

    await command({
      method: "openTerminal",
      params: { threadId: "t1", terminalId: "term-1", cwd: "/repo" },
    });
    assert.deepEqual(connector.calls[19], {
      method: "openTerminal",
      input: { threadId: "t1", terminalId: "term-1", cwd: "/repo" },
    });

    await command({
      method: "writeTerminal",
      params: { threadId: "t1", terminalId: "term-1", data: "pwd\n" },
    });
    assert.deepEqual(connector.calls[20], {
      method: "writeTerminal",
      input: { threadId: "t1", terminalId: "term-1", data: "pwd\n" },
    });

    await command({
      method: "closeTerminal",
      params: { threadId: "t1", terminalId: "term-1", deleteHistory: true },
    });
    assert.deepEqual(connector.calls[21], {
      method: "closeTerminal",
      input: { threadId: "t1", terminalId: "term-1", deleteHistory: true },
    });

    await assertRejects(command({ method: "dispose" }), /Rejected connector command/);
    await assertRejects(command({ method: "connect" }), /Rejected connector command/);
    await assertRejects(command({}), /Rejected connector command/);
  });

  it("decodes duration settings before dispatch and encodes the config result", async () => {
    const { host, connector, handlers } = createHarness();
    host.attach();
    await host.connect();
    const command = handlers.get(T3_CONNECTOR_METHODS.command)!;
    const params = encodeConnectorCommandParams("updateServerSettings", {
      patch: {
        backgroundActivity: {
          overrides: {
            providerHealthRefreshInterval: Duration.seconds(90),
          },
        },
      },
    });

    const result = (await command({
      method: "updateServerSettings",
      params,
    })) as {
      settings: {
        automaticGitFetchInterval: number;
      };
    };
    const call = connector.calls.find((entry) => entry.method === "updateServerSettings");
    const interval = (
      call?.input as {
        patch: {
          backgroundActivity?: {
            overrides?: { providerHealthRefreshInterval?: Duration.Duration };
          };
        };
      }
    ).patch.backgroundActivity?.overrides?.providerHealthRefreshInterval;

    assert.isTrue(Duration.isDuration(interval));
    assert.equal(Duration.toMillis(interval!), 90_000);
    assert.equal(result.settings.automaticGitFetchInterval, 30_000);
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

  it("reconnects once and retries idempotent metadata commands after stale transport errors", async () => {
    const handlers = new Map<string, (params: unknown) => unknown>();
    const logs: string[] = [];
    const calls: Array<{ generation: number; method: string; input: unknown }> = [];
    let generation = 0;
    const host = new MainConnectorHost({
      window: { sendGlobalEvent: () => true },
      registerHandler: (method, handler) => {
        handlers.set(method, handler as (params: unknown) => unknown);
      },
      createConnector: (events) => {
        const currentGeneration = ++generation;
        return {
          ...events,
          connect: () => Promise.resolve({ status: "ready" }),
          dispose: () => {},
          setModelSelection: (input: unknown) => {
            calls.push({
              generation: currentGeneration,
              method: "setModelSelection",
              input,
            });
            return currentGeneration === 1
              ? Promise.reject(new Error('SocketOpenError: timeout waiting for "open"'))
              : Promise.resolve();
          },
          sendPrompt: (input: unknown) => {
            calls.push({ generation: currentGeneration, method: "sendPrompt", input });
            return Promise.reject(new Error('SocketOpenError: timeout waiting for "open"'));
          },
        };
      },
      onLog: (line) => logs.push(line),
    });
    host.attach();
    await host.connect();
    const command = handlers.get(T3_CONNECTOR_METHODS.command)!;
    const selection = {
      threadId: "t1",
      selection: { instanceId: "codex", model: "gpt-5.6-sol" },
    };

    await command({ method: "setModelSelection", params: selection });

    assert.equal(generation, 2);
    assert.deepEqual(
      calls.filter((call) => call.method === "setModelSelection"),
      [
        { generation: 1, method: "setModelSelection", input: selection },
        { generation: 2, method: "setModelSelection", input: selection },
      ],
    );
    assert.isTrue(logs.some((line) => line.includes("reconnecting once")));

    await assertRejects(
      command({ method: "sendPrompt", params: { threadId: "t1", text: "hello" } }),
      /SocketOpenError/,
    );
    assert.equal(generation, 2);
    assert.equal(calls.filter((call) => call.method === "sendPrompt").length, 1);
  });

  it("recovers the owned RPC transport without restarting its connector server", async () => {
    const handlers = new Map<string, (params: unknown) => unknown>();
    const calls: string[] = [];
    let recovered = false;
    let connectorCount = 0;
    const host = new MainConnectorHost({
      window: { sendGlobalEvent: () => true },
      registerHandler: (method, handler) => {
        handlers.set(method, handler as (params: unknown) => unknown);
      },
      createConnector: (events) => {
        connectorCount += 1;
        return {
          ...events,
          connect: () => Promise.resolve({ status: "ready" }),
          dispose: () => calls.push("dispose"),
          recoverTransport: async () => {
            calls.push("recoverTransport");
            recovered = true;
          },
          setModelSelection: () => {
            calls.push("setModelSelection");
            return recovered
              ? Promise.resolve()
              : Promise.reject(new Error('SocketOpenError: timeout waiting for "open"'));
          },
        };
      },
    });
    host.attach();
    await host.connect();

    await handlers.get(T3_CONNECTOR_METHODS.command)!({
      method: "setModelSelection",
      params: {
        threadId: "t1",
        selection: { instanceId: "codex", model: "gpt-5.6-sol" },
      },
    });

    assert.equal(connectorCount, 1);
    assert.deepEqual(calls, ["setModelSelection", "recoverTransport", "setModelSelection"]);
  });

  it("injects the SocketOpenError only for the first thread model mutation", async () => {
    const handlers = new Map<string, (params: unknown) => unknown>();
    const logs: string[] = [];
    const calls: Array<{ generation: number; input: unknown }> = [];
    let generation = 0;
    const host = new MainConnectorHost({
      window: { sendGlobalEvent: () => true },
      registerHandler: (method, handler) => {
        handlers.set(method, handler as (params: unknown) => unknown);
      },
      createConnector: (events) => {
        const currentGeneration = ++generation;
        return {
          ...events,
          connect: () => Promise.resolve({ status: "ready" }),
          dispose: () => {},
          setModelSelection: (input: unknown) => {
            calls.push({ generation: currentGeneration, input });
            return Promise.resolve();
          },
        };
      },
      onLog: (line) => logs.push(line),
      testSocketOpenErrorForThreadModelSelectionOnce: true,
    });
    host.attach();
    await host.connect();
    const command = handlers.get(T3_CONNECTOR_METHODS.command)!;
    const projectSelection = {
      selection: { instanceId: "claudeAgent", model: "claude-fable-5" },
    };
    const threadSelection = {
      threadId: "t1",
      selection: { instanceId: "claudeAgent", model: "claude-opus-5" },
    };

    await command({ method: "setModelSelection", params: projectSelection });
    await command({ method: "setModelSelection", params: threadSelection });

    assert.equal(generation, 2);
    assert.deepEqual(calls, [
      { generation: 1, input: projectSelection },
      { generation: 2, input: threadSelection },
    ]);
    assert.isTrue(logs.some((line) => line.includes("reconnecting once")));
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

  it("forwards canonical project metadata and removal inputs without reshaping payloads", async () => {
    const calls: Array<{ method: string; input: unknown }> = [];
    const connector = {
      connect: () => Promise.resolve(),
      dispose: () => {},
      updateProject: (input: unknown) => {
        calls.push({ method: "updateProject", input });
        return Promise.resolve();
      },
      deleteProject: (input: unknown) => {
        calls.push({ method: "deleteProject", input });
        return Promise.resolve();
      },
    } as ConnectorLike;
    const update = { projectId: "project-1", title: "Renamed project" };
    const remove = { projectId: "project-1", force: true };

    await dispatchConnectorCommand(connector, {
      method: "updateProject",
      params: update,
    });
    await dispatchConnectorCommand(connector, {
      method: "deleteProject",
      params: remove,
    });

    assert.deepEqual(calls, [
      { method: "updateProject", input: update },
      { method: "deleteProject", input: remove },
    ]);
  });

  it("forwards canonical keybinding mutations without reshaping payloads", async () => {
    const calls: Array<{ method: string; input: unknown }> = [];
    const connector = {
      connect: () => Promise.resolve(),
      dispose: () => {},
      upsertKeybinding: (input: unknown) => {
        calls.push({ method: "upsertKeybinding", input });
        return Promise.resolve({ keybindings: [], issues: [] });
      },
      removeKeybinding: (input: unknown) => {
        calls.push({ method: "removeKeybinding", input });
        return Promise.resolve({ keybindings: [], issues: [] });
      },
    } as ConnectorLike;
    const params = {
      key: "mod+shift+y",
      command: "script.fidelity-kb-action.run",
    };

    await dispatchConnectorCommand(connector, {
      method: "upsertKeybinding",
      params,
    });
    await dispatchConnectorCommand(connector, {
      method: "removeKeybinding",
      params,
    });

    assert.deepEqual(calls, [
      { method: "upsertKeybinding", input: params },
      { method: "removeKeybinding", input: params },
    ]);
  });

  it("throws a clear error for missing connector methods", () => {
    const connector = { connect: () => Promise.resolve(), dispose: () => {} } as ConnectorLike;
    assert.throws(
      () => dispatchConnectorCommand(connector, { method: "sendPrompt", params: {} }),
      /does not implement command "sendPrompt"/,
    );
  });
});
