import { PrimaryConnectionTarget } from "@t3tools/client-runtime/connection";
import type { EnvironmentCatalogState } from "@t3tools/client-runtime/state/connections";
import {
  ClientOrchestrationCommand,
  EnvironmentId,
  type ModelSelection,
  ORCHESTRATION_WS_METHODS,
  ProjectId,
  ProviderInstanceId,
  WS_METHODS,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { AsyncResult } from "effect/unstable/reactivity";
import { assert, describe, it } from "vite-plus/test";

import type { T3ConnectorCommandBridge } from "../bridge.ts";
import { EMPTY_GIT_ACTION_OUTCOME } from "../../shared/gitActionOutcome.ts";
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
const codex = ProviderInstanceId.make("codex");
const snapshot = shellSnapshot([{ id: "thread-1" }]);

interface Sent {
  readonly dispatched: Array<ClientOrchestrationCommand>;
  readonly requests: Array<{ readonly tag: string; readonly input: unknown }>;
  readonly selected: Array<string>;
  readonly remembered: Array<ModelSelection>;
}

function harness(
  options: {
    readonly replies?: Readonly<Record<string, unknown>>;
    readonly failDispatch?: Error;
    readonly context?: Partial<UpstreamCommandContext>;
  } = {},
) {
  const sent: Sent = { dispatched: [], requests: [], selected: [], remembered: [] };
  const pendingModelSelections = new Map<string, ModelSelection>();
  let nextId = 0;
  const port: UpstreamCommandPort = {
    request: (tag, input) => {
      sent.requests.push({ tag, input });
      return Promise.resolve(options.replies?.[tag] as never);
    },
    dispatch: (command) => {
      sent.dispatched.push(command);
      return options.failDispatch
        ? Promise.reject(options.failDispatch)
        : Promise.resolve({ sequence: 8 });
    },
    gitAction: () => Promise.resolve(EMPTY_GIT_ACTION_OUTCOME),
  };
  const bridge = createUpstreamCommandBridge(port, {
    threads: () => snapshot.threads,
    config: () => serverConfig(),
    httpBaseUrl: () => "ws://127.0.0.1:4100",
    pendingModelSelections,
    connector: {
      selectThread: (threadId) => {
        sent.selected.push(threadId);
        return Promise.resolve();
      },
      setModelSelection: (input) => {
        sent.remembered.push(input.selection);
        return Promise.resolve();
      },
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
      [...UPSTREAM_COMMAND_NAMES, "reconnect", "createProject", "selectThread"].map((name) => [
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

  it("keeps the commands only the main process can carry out on the connector", async () => {
    const calls: Array<string> = [];
    const bridge = routeCommandBridge({
      connector: record(calls, "connector"),
      upstream: record(calls, "upstream"),
      useUpstream: () => true,
    });
    await bridge.reconnect?.();
    await bridge.createProject?.({ workspaceRoot: "~/work" });
    await bridge.selectThread?.("thread-1");
    assert.deepEqual(
      calls.map((call) => call.split(":").slice(0, 2).join(":")),
      ["connector:reconnect", "connector:createProject", "connector:selectThread"],
    );
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
    assert.equal(new Set(sent.dispatched.map((command) => command.commandId)).size, 19);
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
    assert.deepEqual(sent.selected, []);
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
    // The connector follows the new thread so it can take over if upstream drops.
    assert.deepEqual(sent.selected, ["thread-draft"]);
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
    assert.deepEqual(sent.remembered, [selection]);
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

  it("only tells the connector when no thread is named", async () => {
    const { bridge, sent, pendingModelSelections } = harness();
    await bridge.setModelSelection({ selection });
    assert.deepEqual(sent.dispatched, []);
    assert.deepEqual(sent.remembered, [selection]);
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
