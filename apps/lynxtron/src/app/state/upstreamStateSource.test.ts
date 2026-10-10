import { PrimaryConnectionTarget } from "@t3tools/client-runtime/connection";
import type { EnvironmentCatalogState } from "@t3tools/client-runtime/state/connections";
import { AuthAccessSnapshot, EnvironmentId, ProviderInstanceId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { AsyncResult } from "effect/unstable/reactivity";
import { assert, describe, it } from "vite-plus/test";

import { authAccessSnapshot } from "./upstreamPrimary.ts";
import type { ConnectorStatusPayload } from "../../shared/connectorProtocol.ts";
import {
  createUpstreamStateRouter,
  createUpstreamStatusReader,
  ownedShellThreads,
  resolveClientStatus,
  terminalDomain,
  threadWasReset,
  type UpstreamStatusView,
  upstreamAccessPayload,
  upstreamStatePayloads,
  upstreamTerminalPayloads,
  upstreamThreadPayload,
  upstreamVcsPayload,
  vcsStatusDiverged,
} from "./upstreamStateSource.ts";
import {
  clientMessages,
  connection,
  serverConfig,
  shellSnapshot,
  shellState,
  terminal,
  threadDetail,
  threadState,
  vcsStatus,
} from "./upstreamState.fixtures.ts";

const live = shellSnapshot([
  { id: "thread-old", latestUserMessageAt: "2026-10-02T00:00:00.000Z" },
  { id: "thread-new", latestUserMessageAt: "2026-10-08T00:00:00.000Z" },
  { id: "thread-gone", archivedAt: "2026-10-05T00:00:00.000Z" },
]);
const archived = shellSnapshot([
  { id: "archived-early", archivedAt: "2026-10-03T00:00:00.000Z" },
  { id: "archived-late", archivedAt: "2026-10-07T00:00:00.000Z" },
]);

describe("upstreamStatePayloads", () => {
  it("builds the connector's shell payload from the live shell and the archived snapshot", () => {
    const { shell } = upstreamStatePayloads({
      connection: connection("connected"),
      shell: shellState("live", live),
      config: null,
      archived,
    });
    assert.deepEqual(shell?.projects, live.projects);
    // Most recent first, and a thread archived in the live shell is not listed.
    assert.deepEqual(
      shell?.threads.map((thread) => thread.id),
      ["thread-new", "thread-old"],
    );
    assert.deepEqual(
      shell?.archivedThreads?.map((thread) => thread.id),
      ["archived-late", "archived-early"],
    );
    assert.strictEqual(shell?.threads[0], live.threads[1]);
  });

  it("passes the server config through unchanged", () => {
    const config = serverConfig();
    const payloads = upstreamStatePayloads({
      connection: connection("connected"),
      shell: null,
      config,
      archived: null,
    });
    assert.strictEqual(payloads.config, config);
    assert.equal(payloads.shell, null);
  });

  it("supplies nothing while the connection is not up", () => {
    assert.deepEqual(
      upstreamStatePayloads({
        connection: connection("backoff"),
        shell: shellState("live", live),
        config: serverConfig(),
        archived,
      }),
      { config: null, shell: null },
    );
    assert.deepEqual(
      upstreamStatePayloads({ connection: null, shell: null, config: serverConfig(), archived }),
      { config: null, shell: null },
    );
  });

  it("supplies no shell until it is live and the archived threads have loaded", () => {
    const base = { connection: connection("connected"), config: null };
    assert.equal(
      upstreamStatePayloads({ ...base, shell: shellState("live", live), archived: null }).shell,
      null,
    );
    assert.equal(
      upstreamStatePayloads({ ...base, shell: shellState("cached", live), archived }).shell,
      null,
    );
    assert.equal(
      upstreamStatePayloads({ ...base, shell: shellState("synchronizing", null), archived }).shell,
      null,
    );
  });

  it("shows a pending model selection until the server reports it", () => {
    const state = {
      connection: connection("connected"),
      shell: shellState("live", live),
      config: null,
      archived,
    };
    const selection = { instanceId: ProviderInstanceId.make("claudeAgent"), model: "opus" };
    const { shell } = upstreamStatePayloads(state, new Map([["thread-old", selection]]));
    assert.deepEqual(
      shell?.threads.map((thread) => [thread.id, thread.modelSelection.model]),
      [
        ["thread-new", "gpt-5"],
        ["thread-old", "opus"],
      ],
    );
    // Nothing else about the thread is replaced, and the others are untouched.
    assert.deepEqual(shell?.threads[1], { ...live.threads[0]!, modelSelection: selection });
    assert.strictEqual(shell?.threads[0], live.threads[1]);
  });

  it("leaves out an empty disposable thread, which the cleanup is deleting", () => {
    const snapshot = shellSnapshot([
      { id: "thread-kept", latestUserMessageAt: "2026-10-08T00:00:00.000Z" },
      { id: "thread-empty", title: "New thread", latestUserMessageAt: null },
      { id: "thread-named", title: "Plans", latestUserMessageAt: null },
    ]);
    const { shell } = upstreamStatePayloads({
      connection: connection("connected"),
      shell: shellState("live", snapshot),
      config: null,
      archived,
    });
    assert.deepEqual(shell?.threads.map((thread) => thread.id).toSorted(), [
      "thread-kept",
      "thread-named",
    ]);
  });
});

describe("the shell the cleanup acts on", () => {
  const snapshot = shellSnapshot([
    { id: "thread-kept", latestUserMessageAt: "2026-10-08T00:00:00.000Z" },
    { id: "thread-empty", title: "New thread", latestUserMessageAt: null },
    { id: "thread-failed", title: "New thread", latestUserMessageAt: null },
  ]);
  const state = {
    connection: connection("connected"),
    shell: shellState("live", snapshot),
    config: null,
    archived,
  };

  it("leaves out only the threads the cleanup hides", () => {
    const { shell } = upstreamStatePayloads(
      state,
      new Map(),
      (threadId) => threadId === "thread-empty",
    );
    assert.deepEqual(shell?.threads.map((thread) => thread.id).toSorted(), [
      "thread-failed",
      "thread-kept",
    ]);
  });

  it("is upstream's only while upstream supplies the shell", () => {
    assert.strictEqual(ownedShellThreads(state), snapshot.threads);
    assert.isNull(ownedShellThreads({ ...state, archived: null }));
    assert.isNull(ownedShellThreads({ ...state, connection: connection("backoff") }));
    assert.isNull(ownedShellThreads({ ...state, shell: shellState("cached", snapshot) }));
  });
});

const FIRST_SERVER = "http://127.0.0.1:4100/";
const SECOND_SERVER = "http://127.0.0.1:4207/";

function catalogAt(httpBaseUrl: string) {
  const environmentId = EnvironmentId.make("environment-local");
  const catalog: EnvironmentCatalogState = {
    isReady: true,
    entries: new Map([
      [
        environmentId,
        {
          target: new PrimaryConnectionTarget({
            environmentId,
            label: "Local",
            httpBaseUrl,
            wsBaseUrl: httpBaseUrl.replace("http", "ws"),
          }),
          profile: Option.none(),
          enabled: true,
        },
      ],
    ]),
  };
  return AsyncResult.success(catalog);
}

function primaryState(
  httpBaseUrl: string,
  phase: Parameters<typeof connection>[0] | null,
  shell = shellState("live", live),
) {
  return {
    catalog: catalogAt(httpBaseUrl),
    connection: phase === null ? null : connection(phase),
    shell,
    config: serverConfig(),
    archived,
  };
}

describe("createUpstreamStatusReader", () => {
  it("is ready once upstream is connected with what the commands read", () => {
    const read = createUpstreamStatusReader();
    assert.deepEqual(read(primaryState(FIRST_SERVER, null)), {
      ready: false,
      failed: false,
      httpBaseUrl: FIRST_SERVER,
    });
    assert.deepEqual(read(primaryState(FIRST_SERVER, "connecting")), {
      ready: false,
      failed: false,
      httpBaseUrl: FIRST_SERVER,
    });
    assert.isFalse(read(primaryState(FIRST_SERVER, "connected", shellState("cached", live))).ready);
    assert.deepEqual(read(primaryState(FIRST_SERVER, "connected")), {
      ready: true,
      failed: false,
      httpBaseUrl: FIRST_SERVER,
    });
  });

  it("has failed once an attempt at the registered server ended without a connection", () => {
    for (const phase of ["backoff", "blocked", "offline"] as const) {
      const read = createUpstreamStatusReader();
      read(primaryState(FIRST_SERVER, null));
      assert.isTrue(read(primaryState(FIRST_SERVER, phase)).failed, phase);
    }
    const read = createUpstreamStatusReader();
    read(primaryState(FIRST_SERVER, null));
    assert.isFalse(read(primaryState(FIRST_SERVER, "available")).failed);
  });

  it("counts nothing the old connection said once the server is registered elsewhere", () => {
    for (const phase of ["backoff", "connected"] as const) {
      const read = createUpstreamStatusReader();
      const before = primaryState(FIRST_SERVER, phase);
      read(primaryState(FIRST_SERVER, null));
      read(before);
      // The catalog names the new address while the state is still the old connection's.
      const moved = { ...before, catalog: catalogAt(SECOND_SERVER) };
      assert.deepEqual(read(moved), { ready: false, failed: false, httpBaseUrl: SECOND_SERVER });
      assert.deepEqual(read({ ...moved, connection: connection("connecting") }), {
        ready: false,
        failed: false,
        httpBaseUrl: SECOND_SERVER,
      });
      assert.isTrue(read({ ...moved, connection: connection("connected") }).ready);
    }
  });
});

describe("resolveClientStatus", () => {
  const upstream = (view: Partial<UpstreamStatusView> = {}): UpstreamStatusView => ({
    ready: false,
    failed: false,
    httpBaseUrl: FIRST_SERVER,
    ...view,
  });
  const connectorReady = { status: "ready", httpBaseUrl: FIRST_SERVER } as const;

  it("shows the connector's status as it is while the upstream source is off", () => {
    assert.strictEqual(resolveClientStatus(connectorReady, null), connectorReady);
  });

  it("shows a failure the main process reports even while upstream reads as ready", () => {
    for (const status of ["error", "reconnecting"] as const) {
      const failure = { status, detail: "Server exited" };
      assert.strictEqual(resolveClientStatus(failure, upstream({ ready: true })), failure);
    }
  });

  it("holds the connector's ready while upstream is still on its way to that server", () => {
    assert.isNull(resolveClientStatus(connectorReady, upstream()));
    // Upstream is registered at the server that was replaced, whatever it says.
    const replaced = { status: "ready", httpBaseUrl: SECOND_SERVER } as const;
    assert.isNull(resolveClientStatus(replaced, upstream({ ready: true })));
    assert.isNull(resolveClientStatus(replaced, upstream({ failed: true })));
  });

  it("shows ready once upstream takes the commands for that server", () => {
    assert.strictEqual(
      resolveClientStatus(connectorReady, upstream({ ready: true })),
      connectorReady,
    );
    assert.deepEqual(resolveClientStatus({ status: "connecting" }, upstream({ ready: true })), {
      status: "ready",
    });
  });

  it("shows the connector's ready when upstream could not reach that server", () => {
    assert.strictEqual(
      resolveClientStatus(connectorReady, upstream({ failed: true })),
      connectorReady,
    );
  });

  it("shows the connector's own progress until either path is ready", () => {
    const connecting = { status: "connecting", detail: "Waiting" } as const;
    assert.strictEqual(resolveClientStatus(connecting, upstream()), connecting);
  });

  it("is ready after a server restart only once upstream has reached the new server", () => {
    const read = createUpstreamStatusReader();
    const shown: Array<string | null> = [];
    let connector: ConnectorStatusPayload = { status: "connecting" };
    let view = read(primaryState(FIRST_SERVER, null));
    const fromConnector = (status: ConnectorStatusPayload) => {
      connector = status;
      shown.push(resolveClientStatus(connector, view)?.status ?? null);
    };
    const fromUpstream = (state: ReturnType<typeof primaryState>) => {
      view = read(state);
      shown.push(resolveClientStatus(connector, view)?.status ?? null);
    };

    fromConnector({ status: "ready", httpBaseUrl: FIRST_SERVER });
    fromUpstream(primaryState(FIRST_SERVER, "connected"));
    assert.deepEqual(shown, [null, "ready"]);

    // The server is killed: main says so first, upstream notices later.
    shown.length = 0;
    fromConnector({ status: "error", detail: "Server exited" });
    fromConnector({ status: "reconnecting" });
    const dropped = primaryState(FIRST_SERVER, "backoff");
    fromUpstream(dropped);
    assert.deepEqual(shown, ["error", "reconnecting", "reconnecting"]);

    // The new server is up for the connector; upstream follows it there.
    shown.length = 0;
    fromConnector({ status: "ready", httpBaseUrl: SECOND_SERVER });
    const moved = { ...dropped, catalog: catalogAt(SECOND_SERVER) };
    fromUpstream(moved);
    fromUpstream({ ...moved, connection: connection("connecting") });
    fromUpstream({ ...moved, connection: connection("connected") });
    assert.deepEqual(shown, [null, null, null, "ready"]);
  });
});

describe("upstreamAccessPayload", () => {
  const access = Schema.decodeUnknownSync(Schema.toCodecJson(AuthAccessSnapshot))({
    pairingLinks: [
      {
        id: "link-1",
        scopes: ["orchestration:read"],
        subject: "one-time-token",
        label: "Phone",
        createdAt: "2026-10-09T10:00:00.000Z",
        expiresAt: "2026-10-09T10:05:00.000Z",
      },
    ],
    clientSessions: [],
  });

  it("presents the access snapshot the way the Lynx settings read it", () => {
    const payload = upstreamAccessPayload({ connection: connection("connected"), access });
    assert.deepInclude(payload?.pairingLinks[0], { id: "link-1", label: "Phone", scopeCount: 1 });
    assert.deepInclude(payload, { pairingLinkCount: 1, clientSessionCount: 0, hasEntries: true });
  });

  it("supplies nothing before the stream has delivered or while disconnected", () => {
    assert.isNull(upstreamAccessPayload({ connection: connection("connected"), access: null }));
    assert.isNull(upstreamAccessPayload({ connection: connection("backoff"), access }));
  });

  it("reads the snapshot upstream's access stream holds", () => {
    assert.strictEqual(
      authAccessSnapshot(
        AsyncResult.success({ version: 1, revision: 3, type: "snapshot", payload: access }),
      ),
      access,
    );
    assert.isNull(authAccessSnapshot(AsyncResult.initial()));
  });
});

describe("upstreamThreadPayload", () => {
  const thread = threadDetail({
    messages: [{ id: "message-1", role: "user" }, { id: "message-2" }],
    session: { status: "running", activeTurnId: "turn-1" },
  });
  const selected = { connection: connection("connected"), threadId: "thread-1" };

  it("builds the connector's thread payload from a live, whole thread", () => {
    const payload = upstreamThreadPayload({ ...selected, thread: threadState("live", thread) });
    assert.equal(payload?.threadId, "thread-1");
    assert.strictEqual(payload?.messages, thread.messages);
    assert.equal(payload?.sessionStatus, "running");
    assert.equal(payload?.activeTurnId, "turn-1");

    const paged = threadState("live", thread, { hasMore: false });
    assert.strictEqual(
      upstreamThreadPayload({ ...selected, thread: paged })?.messages,
      thread.messages,
    );
  });

  it("supplies nothing while older turns are still to be loaded", () => {
    const windowed = threadState("live", thread, { hasMore: true });
    assert.equal(upstreamThreadPayload({ ...selected, thread: windowed }), null);
  });

  it("supplies nothing until the thread is live on a connected environment", () => {
    for (const status of ["empty", "cached", "synchronizing", "deleted"] as const) {
      assert.equal(
        upstreamThreadPayload({ ...selected, thread: threadState(status, thread) }),
        null,
      );
    }
    assert.equal(upstreamThreadPayload({ ...selected, thread: null }), null);
    assert.equal(
      upstreamThreadPayload({
        connection: connection("backoff"),
        threadId: "thread-1",
        thread: threadState("live", thread),
      }),
      null,
    );
  });

  it("supplies nothing for a thread other than the selected one", () => {
    assert.equal(
      upstreamThreadPayload({
        ...selected,
        threadId: "thread-2",
        thread: threadState("live", thread),
      }),
      null,
    );
  });
});

describe("threadWasReset", () => {
  const payload = upstreamThreadPayload({
    connection: connection("connected"),
    threadId: "thread-1",
    thread: threadState("live", threadDetail({ messages: [{ id: "message-1" }] })),
  });

  it("sees the client empty the thread upstream supplies", () => {
    assert.ok(payload);
    assert.equal(threadWasReset(payload, { activeThreadId: "thread-1", messages: [] }), true);
  });

  it("leaves a client that shows the thread, or another thread, alone", () => {
    assert.ok(payload);
    const messages = clientMessages(threadDetail({ messages: [{ id: "message-1" }] }));
    assert.equal(threadWasReset(payload, { activeThreadId: "thread-1", messages }), false);
    assert.equal(threadWasReset(payload, { activeThreadId: "thread-2", messages: [] }), false);
  });
});

describe("upstreamTerminalPayloads", () => {
  it("builds a connector session for each terminal whose stream has delivered", () => {
    const sessions = upstreamTerminalPayloads({
      connection: connection("connected"),
      terminals: [
        terminal({ terminalId: "term-1", cwd: "/work/a", history: "one\n", output: ["two\n"] }),
        terminal({ terminalId: "term-2" }, false),
      ],
    });
    assert.deepEqual(sessions, [
      {
        threadId: "thread-1",
        terminalId: "term-1",
        cwd: "/work/a",
        status: "running",
        history: "one\ntwo\n",
        error: null,
        updatedAt: "2026-10-09T00:00:00.000Z",
      },
    ]);
  });

  it("supplies an empty list for a thread the server lists no terminals for", () => {
    assert.deepEqual(
      upstreamTerminalPayloads({ connection: connection("connected"), terminals: [] }),
      [],
    );
  });

  it("supplies nothing before the server has listed terminals or while disconnected", () => {
    assert.equal(
      upstreamTerminalPayloads({ connection: connection("connected"), terminals: null }),
      null,
    );
    assert.equal(
      upstreamTerminalPayloads({
        connection: connection("backoff"),
        terminals: [terminal({ terminalId: "term-1" })],
      }),
      null,
    );
  });
});

describe("upstreamVcsPayload", () => {
  const status = vcsStatus({ refName: "feature", files: ["a.ts"] });

  it("pairs the stream's status with the directory it is for", () => {
    const payload = upstreamVcsPayload({
      connection: connection("connected"),
      vcsCwd: "/work/project-1",
      vcs: status,
    });
    assert.equal(payload?.cwd, "/work/project-1");
    assert.strictEqual(payload?.status, status);
  });

  it("supplies nothing before the first status, without a directory or while disconnected", () => {
    const connected = connection("connected");
    assert.equal(upstreamVcsPayload({ connection: connected, vcsCwd: "/work", vcs: null }), null);
    assert.equal(upstreamVcsPayload({ connection: connected, vcsCwd: null, vcs: status }), null);
    assert.equal(
      upstreamVcsPayload({ connection: connection("backoff"), vcsCwd: "/work", vcs: status }),
      null,
    );
  });
});

describe("vcsStatusDiverged", () => {
  const status = vcsStatus();
  const payload = { cwd: "/work/project-1", status };
  const shown = { vcsStatus: status, vcsStatusCwd: "/work/project-1", vcsStatusPending: false };

  it("leaves a client that shows upstream's status alone", () => {
    assert.equal(vcsStatusDiverged(payload, shown), false);
  });

  it("sees a client that asked for a refresh, or shows another value", () => {
    assert.equal(vcsStatusDiverged(payload, { ...shown, vcsStatusPending: true }), true);
    assert.equal(vcsStatusDiverged(payload, { ...shown, vcsStatus: null }), true);
    assert.equal(vcsStatusDiverged(payload, { ...shown, vcsStatus: vcsStatus() }), true);
  });

  it("leaves a client that moved to another directory alone", () => {
    assert.equal(
      vcsStatusDiverged(payload, { ...shown, vcsStatusCwd: "/work/other", vcsStatusPending: true }),
      false,
    );
  });
});

describe("createUpstreamStateRouter", () => {
  it("applies connector payloads while upstream does not own the domain", () => {
    const router = createUpstreamStateRouter();
    const applied: string[] = [];
    router.fromConnector("shell", () => applied.push("connector-1"));
    router.fromUpstream<string>("shell", null, (payload) => applied.push(payload));
    router.fromConnector("shell", () => applied.push("connector-2"));
    assert.deepEqual(applied, ["connector-1", "connector-2"]);
  });

  it("holds connector payloads for a domain upstream owns, and only that domain", () => {
    const router = createUpstreamStateRouter();
    const applied: string[] = [];
    router.fromUpstream("shell", "upstream-1", (payload) => applied.push(payload));
    router.fromConnector("shell", () => applied.push("connector-shell"));
    router.fromConnector("config", () => applied.push("connector-config"));
    router.fromUpstream("shell", "upstream-2", (payload) => applied.push(payload));
    assert.deepEqual(applied, ["upstream-1", "connector-config", "upstream-2"]);
  });

  it("applies the latest held connector payload when upstream gives the domain back", () => {
    const router = createUpstreamStateRouter();
    const applied: string[] = [];
    const fromUpstream = (payload: string | null) =>
      router.fromUpstream("config", payload, (value) => applied.push(value));
    fromUpstream("upstream-1");
    router.fromConnector("config", () => applied.push("connector-1"));
    router.fromConnector("config", () => applied.push("connector-2"));
    fromUpstream(null);
    assert.deepEqual(applied, ["upstream-1", "connector-2"]);

    // Handed back: the connector applies directly again and nothing replays twice.
    fromUpstream(null);
    router.fromConnector("config", () => applied.push("connector-3"));
    assert.deepEqual(applied, ["upstream-1", "connector-2", "connector-3"]);
  });
});

describe("createUpstreamStateRouter with terminals", () => {
  it("holds and hands back each terminal session on its own", () => {
    const router = createUpstreamStateRouter();
    const applied: string[] = [];
    const one = terminalDomain({ threadId: "thread-1", terminalId: "term-1" });
    const two = terminalDomain({ threadId: "thread-1", terminalId: "term-2" });
    router.fromUpstream(one, "upstream-1", (payload) => applied.push(payload));
    router.fromConnector(one, () => applied.push("connector-1 closed"));
    router.fromConnector(two, () => applied.push("connector-2"));
    assert.deepEqual(applied, ["upstream-1", "connector-2"]);

    // The server stopped listing the first terminal: the connector's last word on it applies.
    router.fromUpstream<string>(one, null, (payload) => applied.push(payload));
    assert.deepEqual(applied, ["upstream-1", "connector-2", "connector-1 closed"]);
  });
});
