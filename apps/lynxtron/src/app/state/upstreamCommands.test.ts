import {
  AVAILABLE_CONNECTION_STATE,
  EnvironmentSupervisor,
  type PreparedConnection,
  PrimaryConnectionTarget,
  type SupervisorConnectionState,
} from "@t3tools/client-runtime/connection";
import type { RpcSession, WsRpcProtocolClient } from "@t3tools/client-runtime/rpc";
import type { EnvironmentCatalogState } from "@t3tools/client-runtime/state/connections";
import {
  type AuthPairingCredentialResult,
  ClientOrchestrationCommand,
  EnvironmentId,
  type ModelSelection,
  TerminalSessionSnapshot,
  ORCHESTRATION_WS_METHODS,
  ProjectId,
  ProviderInstanceId,
  WS_METHODS,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { AsyncResult } from "effect/unstable/reactivity";
import { assert, describe, it } from "vite-plus/test";

import type { T3ConnectorCommandBridge } from "../bridge.ts";
import { CONNECTOR_COMMAND_NAMES } from "../../shared/connectorProtocol.ts";
import { EMPTY_GIT_ACTION_OUTCOME } from "../../shared/gitActionOutcome.ts";
import { makeHostCrypto } from "../platform/hostCrypto.ts";
import { upstreamOperation } from "./upstreamOperations.ts";
import { primaryHttpBaseUrl, upstreamCommandsReady } from "./upstreamCommandPort.ts";
import {
  createUpstreamCommandBridge,
  routeCommandBridge,
  UPSTREAM_COMMAND_NAMES,
  type UpstreamCommandContext,
  type UpstreamCommandPort,
} from "./upstreamCommands.ts";
import {
  connection,
  provider,
  serverConfig,
  shellSnapshot,
  shellState,
} from "./upstreamState.fixtures.ts";

const isClientCommand = Schema.is(ClientOrchestrationCommand);
const decodeTerminalSnapshot = Schema.decodeUnknownSync(TerminalSessionSnapshot);
const codex = ProviderInstanceId.make("codex");
const snapshot = shellSnapshot([{ id: "thread-1" }]);
const PRIMARY_TARGET = new PrimaryConnectionTarget({
  environmentId: EnvironmentId.make("environment-1"),
  label: "Local",
  httpBaseUrl: "http://127.0.0.1:4100",
  wsBaseUrl: "ws://127.0.0.1:4100",
});

interface Sent {
  readonly dispatched: Array<ClientOrchestrationCommand>;
  readonly requests: Array<{ readonly tag: string; readonly input: unknown }>;
  readonly terminal: Array<Record<string, unknown>>;
  readonly closedTerminals: Array<{ readonly threadId: string; readonly terminalId: string }>;
  readonly auth: Array<Record<string, unknown>>;
}

function harness(
  options: {
    readonly replies?: Readonly<Record<string, unknown>>;
    readonly failDispatch?: Error;
    readonly failTerminalClose?: Error;
    readonly context?: Partial<UpstreamCommandContext>;
  } = {},
) {
  const sent: Sent = {
    dispatched: [],
    requests: [],
    terminal: [],
    closedTerminals: [],
    auth: [],
  };
  const pendingModelSelections = new Map<string, ModelSelection>();
  let nextId = 0;
  // Upstream's own operations run against a session that records what they
  // send, with the command ids the host's `Crypto` hands out.
  const client = {
    [ORCHESTRATION_WS_METHODS.dispatchCommand]: (command: ClientOrchestrationCommand) =>
      Effect.suspend(() => {
        sent.dispatched.push(command);
        return options.failDispatch
          ? Effect.fail(options.failDispatch)
          : Effect.succeed({ sequence: 8 });
      }),
  } as unknown as WsRpcProtocolClient;
  const session: RpcSession = {
    client,
    initialConfig: Effect.succeed(serverConfig()),
    subscribeServerConfig: (input) => client.subscribeServerConfig(input),
    ready: Effect.void,
    probe: Effect.void,
    closed: Effect.never,
  };
  const supervisor = Effect.runSync(
    Effect.gen(function* () {
      return EnvironmentSupervisor.of({
        target: PRIMARY_TARGET,
        state: yield* SubscriptionRef.make<SupervisorConnectionState>({
          ...AVAILABLE_CONNECTION_STATE,
          phase: "connected",
        }),
        session: yield* SubscriptionRef.make(Option.some(session)),
        prepared: yield* SubscriptionRef.make(Option.none<PreparedConnection>()),
        connect: Effect.void,
        disconnect: Effect.void,
        retryNow: Effect.void,
      });
    }),
  );
  let nextCommandId = 0;
  const crypto = makeHostCrypto(() => `command-${++nextCommandId}`);
  const port: UpstreamCommandPort = {
    request: (tag, input) => {
      sent.requests.push({ tag, input });
      return Promise.resolve(options.replies?.[tag] as never);
    },
    operation: async (name, input) => {
      const exit = await Effect.runPromiseExit(
        upstreamOperation(name, input).pipe(
          Effect.provideService(EnvironmentSupervisor, supervisor),
          Effect.provideService(Crypto.Crypto, crypto),
        ),
      );
      if (Exit.isSuccess(exit)) return exit.value;
      throw Cause.squash(exit.cause);
    },
    gitAction: () => Promise.resolve(EMPTY_GIT_ACTION_OUTCOME),
    terminal: {
      open: (input) => {
        sent.terminal.push({ open: input });
        return Promise.resolve(
          decodeTerminalSnapshot({
            threadId: input.threadId,
            terminalId: input.terminalId,
            cwd: input.cwd,
            worktreePath: null,
            status: "running",
            pid: 4321,
            history: "",
            exitCode: null,
            exitSignal: null,
            label: "zsh",
            updatedAt: "2026-10-10T00:00:00.000Z",
          }),
        );
      },
      close: (input) => {
        sent.terminal.push({ close: input });
        return options.failTerminalClose
          ? Promise.reject(options.failTerminalClose)
          : Promise.resolve();
      },
    },
    auth: {
      createPairingCredential: (input) => {
        sent.auth.push({ createPairingCredential: input });
        return Promise.resolve({
          id: "link-1",
          credential: "ABCD-1234",
          ...(input.label === undefined ? {} : { label: input.label }),
          expiresAt: DateTime.makeUnsafe("2026-10-10T00:05:00.000Z"),
        } satisfies AuthPairingCredentialResult);
      },
      revokePairingLink: (input) => {
        sent.auth.push({ revokePairingLink: input });
        return Promise.resolve({ revoked: true });
      },
      revokeClient: (input) => {
        sent.auth.push({ revokeClient: input });
        return Promise.resolve({ revoked: false });
      },
      revokeOtherClients: () => {
        sent.auth.push({ revokeOtherClients: null });
        return Promise.resolve({ revokedCount: 2 });
      },
    },
  };
  const bridge = createUpstreamCommandBridge(port, {
    threads: () => snapshot.threads,
    projects: () => snapshot.projects,
    config: () => serverConfig(),
    httpBaseUrl: () => "ws://127.0.0.1:4100",
    pendingModelSelections,
    modelSelection: () => ({ instanceId: codex, model: "gpt-5" }),
    // What the host answers for a home-relative path.
    resolveWorkspacePath: (workspaceRoot) =>
      workspaceRoot.startsWith("~/") ? `/Users/tester/${workspaceRoot.slice(2)}` : workspaceRoot,
    terminalClosed: (terminal) => {
      sent.closedTerminals.push(terminal);
    },
    newId: () => `id-${++nextId}`,
    randomHex: () => "0a1b2c3d",
    now: () => "2026-10-10T00:00:00.000Z",
    ...options.context,
  });
  return { bridge, sent, pendingModelSelections };
}

describe("routeCommandBridge", () => {
  const record = (calls: Array<string>, source: string) =>
    Object.fromEntries(
      [...UPSTREAM_COMMAND_NAMES, "reconnect"].map((name) => [
        name,
        (input?: unknown) => {
          calls.push(`${source}:${name}:${JSON.stringify(input)}`);
          return Promise.resolve(source);
        },
      ]),
    );

  it("asks at each call whether upstream takes the command", async () => {
    const calls: Array<string> = [];
    let connected = false;
    const bridge = routeCommandBridge({
      connector: record(calls, "connector"),
      upstream: record(calls, "upstream"),
      useUpstream: () => connected,
    });
    assert.equal(await bridge.interrupt?.({ threadId: "thread-1" }), "connector");
    connected = true;
    assert.equal(await bridge.interrupt?.({ threadId: "thread-1" }), "upstream");
    connected = false;
    assert.equal(await bridge.interrupt?.({ threadId: "thread-1" }), "connector");
    assert.deepEqual(calls, [
      'connector:interrupt:{"threadId":"thread-1"}',
      'upstream:interrupt:{"threadId":"thread-1"}',
      'connector:interrupt:{"threadId":"thread-1"}',
    ]);
  });

  it("leaves only restarting the server with the connector while upstream is connected", async () => {
    const calls: Array<string> = [];
    const bridge: Record<string, ((input?: unknown) => Promise<unknown>) | undefined> =
      routeCommandBridge({
        connector: record(calls, "connector"),
        upstream: record(calls, "upstream"),
        useUpstream: () => true,
      });
    for (const name of CONNECTOR_COMMAND_NAMES) await bridge[name]?.();
    assert.deepEqual(
      calls.filter((call) => call.startsWith("connector:")),
      ["connector:reconnect:undefined"],
    );
    assert.equal(calls.length, CONNECTOR_COMMAND_NAMES.length);
  });

  it("leaves a command the connector does not offer unavailable", () => {
    const bridge = routeCommandBridge({
      connector: {} as Partial<T3ConnectorCommandBridge>,
      upstream: record([], "upstream"),
      useUpstream: () => true,
    });
    assert.equal(bridge.interrupt, undefined);
  });
});

describe("upstreamCommandsReady", () => {
  const environmentId = EnvironmentId.make("environment-1");
  const catalog: EnvironmentCatalogState = {
    isReady: true,
    entries: new Map([
      [
        environmentId,
        {
          target: new PrimaryConnectionTarget({
            environmentId,
            label: "Local",
            httpBaseUrl: "http://127.0.0.1:4100",
            wsBaseUrl: "ws://127.0.0.1:4100",
          }),
          profile: Option.none(),
          enabled: true,
        },
      ],
    ]),
  };
  const ready = {
    catalog: AsyncResult.success(catalog),
    connection: connection("connected"),
    shell: shellState("live", snapshot),
    config: serverConfig(),
    archived: null,
  };

  it("holds once upstream is connected with a live shell and the config", () => {
    assert.equal(upstreamCommandsReady(ready), true);
    assert.equal(primaryHttpBaseUrl(ready), "http://127.0.0.1:4100");
  });

  it("does not hold before that, or after the connection drops", () => {
    assert.equal(upstreamCommandsReady(null), false);
    assert.equal(upstreamCommandsReady({ ...ready, connection: null }), false);
    assert.equal(upstreamCommandsReady({ ...ready, connection: connection("backoff") }), false);
    assert.equal(upstreamCommandsReady({ ...ready, catalog: AsyncResult.initial() }), false);
    assert.equal(upstreamCommandsReady({ ...ready, shell: shellState("cached", snapshot) }), false);
    assert.equal(upstreamCommandsReady({ ...ready, config: null }), false);
    assert.equal(primaryHttpBaseUrl({ catalog: AsyncResult.initial() }), null);
  });
});

describe("thread and project commands", () => {
  it("sends every one as a command the server's contract accepts", async () => {
    const { bridge, sent } = harness();
    const threadId = "thread-1";
    await bridge.interrupt({ threadId });
    await bridge.revertCheckpoint({ threadId, turnCount: 2 });
    await bridge.setThreadRuntimeMode({ threadId, runtimeMode: "approval-required" });
    await bridge.setThreadInteractionMode({ threadId, interactionMode: "plan" });
    await bridge.deleteThread({ threadId });
    await bridge.archiveThread({ threadId });
    await bridge.archiveThread({ threadId, unarchive: true });
    await bridge.settleThread({ threadId });
    await bridge.unsettleThread({ threadId });
    await bridge.pinThread({ threadId, orderKey: "a0" });
    await bridge.pinThread({ threadId });
    await bridge.unpinThread({ threadId });
    await bridge.renameThread({ threadId, title: "  Plans  " });
    await bridge.regenerateThreadTitle({ threadId });
    await bridge.snoozeThread({ threadId, snoozedUntil: "2026-10-11T00:00:00.000Z" });
    await bridge.unsnoozeThread({ threadId });
    await bridge.updateProject({ projectId: "project-1", title: " Renamed " });
    await bridge.deleteProject({ projectId: "project-1", force: true });
    await bridge.updateProjectScripts({ projectId: "project-1", scripts: [] });
    for (const command of sent.dispatched) {
      assert.isTrue(isClientCommand(command), `${command.type} is not a contract command`);
    }
    assert.deepEqual(
      sent.dispatched.map((command) => command.type),
      [
        "thread.turn.interrupt",
        "thread.checkpoint.revert",
        "thread.runtime-mode.set",
        "thread.interaction-mode.set",
        "thread.delete",
        "thread.archive",
        "thread.unarchive",
        "thread.settle",
        "thread.unsettle",
        "thread.pin",
        "thread.pin",
        "thread.unpin",
        "thread.meta.update",
        "thread.meta.update",
        "thread.snooze",
        "thread.unsnooze",
        "project.meta.update",
        "project.delete",
        "project.meta.update",
      ],
    );
    // Each id is one upstream's builder asked the host's `Crypto` for.
    assert.deepEqual(
      sent.dispatched.map((command) => command.commandId),
      sent.dispatched.map((_, index) => `command-${index + 1}`),
    );
    assert.deepInclude(sent.dispatched[12], { title: "Plans" });
    assert.deepInclude(sent.dispatched[16], { title: "Renamed" });
  });

  it("interrupts the running turn when it is named and the thread's turn when it is not", async () => {
    const { bridge, sent } = harness();
    await bridge.interrupt({ threadId: "thread-1" });
    assert.notProperty(sent.dispatched[0], "turnId");
  });

  it("sends nothing for a rename to an empty title", async () => {
    const { bridge, sent } = harness();
    await bridge.renameThread({ threadId: "thread-1", title: "   " });
    await bridge.updateProject({ projectId: "project-1", title: "" });
    assert.deepEqual(sent.dispatched, []);
  });
});

describe("a command the transport drops", () => {
  it("fails once and is not sent again", async () => {
    const { bridge, sent } = harness({ failDispatch: new Error("Local disconnected.") });
    let message = "";
    await bridge.archiveThread({ threadId: "thread-1" }).catch((error: Error) => {
      message = error.message;
    });
    assert.equal(message, "Local disconnected.");
    assert.equal(sent.dispatched.length, 1);
  });
});

describe("createProject", () => {
  it("creates a project at the path the host resolved, as upstream's clients do", async () => {
    const { bridge, sent } = harness();
    const { projectId } = await bridge.createProject({ workspaceRoot: "~/work/site" });
    const [command] = sent.dispatched;
    assert.isTrue(isClientCommand(command));
    assert.deepInclude<Record<string, unknown>>(command ?? {}, {
      type: "project.create",
      projectId,
      title: "site",
      workspaceRoot: "/Users/tester/work/site",
      createWorkspaceRootIfMissing: true,
      defaultModelSelection: null,
    });
  });

  it("returns the project that already has the resolved path and sends nothing", async () => {
    const { bridge, sent } = harness({
      context: { resolveWorkspacePath: () => "/work/project-1" },
    });
    assert.deepEqual(await bridge.createProject({ workspaceRoot: "~/project-1/" }), {
      projectId: "project-1",
    });
    assert.deepEqual(sent.dispatched, []);
  });
});

describe("createThread and selectThread", () => {
  it("creates a thread in the first project with the client's model", async () => {
    const { bridge, sent } = harness();
    const { threadId } = await bridge.createThread({});
    const [command] = sent.dispatched;
    assert.isTrue(isClientCommand(command));
    assert.deepInclude<Record<string, unknown>>(command ?? {}, {
      type: "thread.create",
      threadId,
      projectId: "project-1",
      title: "New thread",
      modelSelection: { instanceId: codex, model: "gpt-5" },
    });
  });

  it("refuses to create a thread without a project or a model", async () => {
    const messages: Array<string> = [];
    const note = (error: Error) => void messages.push(error.message);
    await harness({ context: { projects: () => [] } })
      .bridge.createThread({})
      .catch(note);
    await harness({ context: { modelSelection: () => undefined } })
      .bridge.createThread({})
      .catch(note);
    assert.deepEqual(messages, ["no project available", "no model available"]);
  });

  it("asks nobody to follow a selected thread", async () => {
    const { bridge, sent } = harness();
    await bridge.selectThread("thread-1");
    assert.deepEqual([sent.dispatched, sent.requests], [[], []]);
  });
});

describe("terminals", () => {
  it("opens through upstream's command and returns the server's session", async () => {
    const { bridge, sent } = harness();
    const input = { threadId: "thread-1", terminalId: "default", cwd: "/work/project-1" };
    const session = await bridge.openTerminal(input);
    assert.deepInclude(session, { terminalId: "default", status: "running", pid: 4321 });
    assert.deepEqual(sent.terminal, [{ open: input }]);
  });

  it("ends the client's session once the server has closed a terminal", async () => {
    const { bridge, sent } = harness();
    const input = { threadId: "thread-1", terminalId: "split-1", deleteHistory: true };
    await bridge.closeTerminal(input);
    assert.deepEqual(sent.terminal, [{ close: input }]);
    assert.deepEqual(sent.closedTerminals, [{ threadId: "thread-1", terminalId: "split-1" }]);
  });

  it("leaves the sessions alone when a close fails or names a whole thread", async () => {
    const failing = harness({ failTerminalClose: new Error("terminal is busy") });
    let message = "";
    await failing.bridge
      .closeTerminal({ threadId: "thread-1", terminalId: "split-1" })
      .catch((error: Error) => {
        message = error.message;
      });
    assert.equal(message, "terminal is busy");
    assert.deepEqual(failing.sent.closedTerminals, []);

    const wholeThread = harness();
    await wholeThread.bridge.closeTerminal({ threadId: "thread-1", deleteHistory: true });
    assert.deepEqual(wholeThread.sent.closedTerminals, []);
  });
});

describe("pairing and client sessions", () => {
  it("creates a pairing credential and reports when it expires as text", async () => {
    const { bridge, sent } = harness();
    assert.deepEqual(await bridge.createPairingCredential({ label: "  Phone " }), {
      id: "link-1",
      credential: "ABCD-1234",
      label: "Phone",
      expiresAt: "2026-10-10T00:05:00.000Z",
    });
    await bridge.createPairingCredential();
    assert.deepEqual(sent.auth, [
      { createPairingCredential: { label: "Phone" } },
      { createPairingCredential: {} },
    ]);
  });

  it("answers a revocation with what the server did", async () => {
    const { bridge, sent } = harness();
    assert.equal(await bridge.revokePairingLink({ id: "link-1" }), true);
    assert.equal(await bridge.revokeClientSession({ sessionId: "session-1" }), false);
    assert.equal(await bridge.revokeOtherClientSessions(), 2);
    assert.deepEqual(sent.auth, [
      { revokePairingLink: { id: "link-1" } },
      { revokeClient: { sessionId: "session-1" } },
      { revokeOtherClients: null },
    ]);
  });
});

describe("sendPrompt", () => {
  it("starts a turn on a known thread with its modes and the pending selection", async () => {
    const { bridge, sent, pendingModelSelections } = harness();
    pendingModelSelections.set("thread-1", { instanceId: codex, model: "gpt-5-mini" });
    await bridge.sendPrompt({ threadId: "thread-1", text: "hello", planModeEnabled: false });
    const [command] = sent.dispatched;
    assert.isTrue(isClientCommand(command));
    assert.deepInclude<Record<string, unknown>>(command ?? {}, {
      type: "thread.turn.start",
      threadId: "thread-1",
      modelSelection: { instanceId: codex, model: "gpt-5-mini" },
      runtimeMode: "full-access",
      createdAt: "2026-10-10T00:00:00.000Z",
    });
  });

  it("creates a draft's thread with the turn and names its temporary worktree branch", async () => {
    const { bridge, sent } = harness();
    await bridge.sendPrompt({
      threadId: "thread-draft",
      text: "hello",
      planModeEnabled: false,
      bootstrap: {
        // A draft's unset branch and worktree do not survive the bridge; the
        // contract wants them as null.
        createThread: {
          projectId: ProjectId.make("project-1"),
          title: "hello",
          modelSelection: { instanceId: codex, model: "gpt-5" },
          runtimeMode: "full-access",
          interactionMode: "default",
          createdAt: "2026-10-10T00:00:00.000Z",
        } as never,
        prepareWorktree: { projectCwd: "/work/project-1", baseBranch: "main" },
      },
    });
    const [command] = sent.dispatched;
    assert.isTrue(isClientCommand(command));
    if (command?.type !== "thread.turn.start") throw new Error("expected a turn start");
    assert.deepInclude(command.bootstrap?.createThread, { branch: null, worktreePath: null });
    assert.equal(command.bootstrap?.prepareWorktree?.branch, "t3code/0a1b2c3d");
    assert.equal(command.titleSeed, "hello");
  });

  it("refuses a thread the server does not have and sends nothing", async () => {
    const { bridge, sent } = harness();
    let message = "";
    await bridge
      .sendPrompt({ threadId: "thread-unknown", text: "hello", planModeEnabled: false })
      .catch((error: Error) => {
        message = error.message;
      });
    assert.match(message, /thread-unknown is not present/);
    assert.deepEqual(sent.dispatched, []);
  });
});

describe("setModelSelection", () => {
  const selection = { instanceId: codex, model: "gpt-5-mini" };

  it("keeps a thread's selection pending after the server accepts the command", async () => {
    const { bridge, sent, pendingModelSelections } = harness();
    await bridge.setModelSelection({ threadId: "thread-1", selection });
    assert.isTrue(isClientCommand(sent.dispatched[0]));
    assert.deepInclude(sent.dispatched[0], {
      type: "thread.meta.update",
      modelSelection: selection,
    });
    assert.deepEqual([...pendingModelSelections], [["thread-1", selection]]);
  });

  it("drops the pending selection when the command fails", async () => {
    const { bridge, pendingModelSelections } = harness({ failDispatch: new Error("rejected") });
    let message = "";
    await bridge.setModelSelection({ threadId: "thread-1", selection }).catch((error: Error) => {
      message = error.message;
    });
    assert.equal(message, "rejected");
    assert.equal(pendingModelSelections.size, 0);
  });

  it("sends nothing when no thread is named", async () => {
    const { bridge, sent, pendingModelSelections } = harness();
    await bridge.setModelSelection({ selection });
    assert.deepEqual(sent.dispatched, []);
    assert.equal(pendingModelSelections.size, 0);
  });

  it("forgets a deleted thread's pending selection", async () => {
    const { bridge, pendingModelSelections } = harness();
    await bridge.setModelSelection({ threadId: "thread-1", selection });
    await bridge.deleteThread({ threadId: "thread-1" });
    assert.equal(pendingModelSelections.size, 0);
  });
});

describe("server commands", () => {
  it("returns the config with the refreshed providers", async () => {
    const providers = [provider("codex", { status: "error" })];
    const { bridge, sent } = harness({
      replies: { [WS_METHODS.serverRefreshProviders]: { providers } },
    });
    const config = await bridge.refreshProviders({ instanceId: codex });
    assert.strictEqual(config.providers, providers);
    assert.equal(config.cwd, "/work");
    assert.deepEqual(sent.requests, [
      { tag: WS_METHODS.serverRefreshProviders, input: { instanceId: codex } },
    ]);
  });

  it("returns the server's config with the settings the update produced", async () => {
    const settings = { ...serverConfig().settings, enableAssistantStreaming: true };
    const refreshed = serverConfig({ cwd: "/work/refreshed" });
    const { bridge, sent } = harness({
      replies: {
        [WS_METHODS.serverUpdateSettings]: settings,
        [WS_METHODS.serverGetConfig]: refreshed,
      },
    });
    const config = await bridge.updateServerSettings({ patch: {} });
    assert.equal(config.cwd, "/work/refreshed");
    assert.strictEqual(config.settings, settings);
    assert.deepEqual(
      sent.requests.map((request) => request.tag),
      [WS_METHODS.serverUpdateSettings, WS_METHODS.serverGetConfig],
    );
  });

  it("refuses to change a provider the config does not list", async () => {
    const { bridge, sent } = harness();
    let message = "";
    await bridge
      .setProviderEnabled({ instanceId: ProviderInstanceId.make("missing"), enabled: false })
      .catch((error: Error) => {
        message = error.message;
      });
    assert.match(message, /provider instance not found: missing/);
    assert.deepEqual(sent.requests, []);
  });

  it("fails as not connected when upstream has no config yet", async () => {
    const { bridge } = harness({ context: { config: () => null } });
    let message = "";
    await bridge.refreshProviders().catch((error: Error) => {
      message = error.message;
    });
    assert.equal(message, "not connected");
  });
});

describe("pass-through requests", () => {
  it("resolves an asset URL against the environment's HTTP address", async () => {
    const { bridge } = harness({
      replies: {
        [WS_METHODS.assetsCreateUrl]: { relativeUrl: "/api/assets/abc", expiresAt: 42 },
      },
    });
    const result = await bridge.createAssetUrl({
      resource: { _tag: "workspace-file", threadId: "thread-1", path: "a.png" },
    } as never);
    assert.deepEqual(result, { url: "http://127.0.0.1:4100/api/assets/abc", expiresAt: 42 });
  });

  it("reads a directory's branch from its refreshed VCS status", async () => {
    const { bridge, sent } = harness({
      replies: { [WS_METHODS.vcsRefreshStatus]: { isRepo: true, refName: "main" } },
    });
    assert.deepEqual(await bridge.readProjectBranch({ cwd: "/work/project-1" }), {
      isRepo: true,
      branch: "main",
    });
    assert.deepEqual(sent.requests, [
      { tag: WS_METHODS.vcsRefreshStatus, input: { cwd: "/work/project-1" } },
    ]);
  });

  it("names the RPC each request goes to", async () => {
    const { bridge, sent } = harness();
    await bridge.writeTerminal({ threadId: "thread-1", terminalId: "default", data: "ls\r" });
    await bridge.resizeTerminal({
      threadId: "thread-1",
      terminalId: "default",
      cols: 80,
      rows: 24,
    });
    await bridge.getTurnDiff({ threadId: "thread-1", fromTurnCount: 0, toTurnCount: 1 } as never);
    await bridge.discoverSourceControl();
    await bridge.listProjectEntries({ cwd: "/work/project-1" });
    assert.deepEqual(
      sent.requests.map((request) => request.tag),
      [
        WS_METHODS.terminalWrite,
        WS_METHODS.terminalResize,
        ORCHESTRATION_WS_METHODS.getTurnDiff,
        WS_METHODS.serverDiscoverSourceControl,
        WS_METHODS.projectsListEntries,
      ],
    );
  });

  it("fails a git action whose stream ended without a result", async () => {
    const { bridge } = harness();
    let message = "";
    await bridge
      .runGitAction({ actionId: "action-1", cwd: "/work/project-1", action: "commit" })
      .catch((error: Error) => {
        message = error.message;
      });
    assert.match(message, /without a result/);
  });
});
