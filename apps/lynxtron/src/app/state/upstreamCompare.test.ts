import { assert, describe, it } from "vite-plus/test";

import { projectConnectorShell } from "../../shared/connectorShell.ts";
import { terminalSessionKey } from "../../shared/connectorTerminal.ts";
import { projectConnectorThread } from "../../shared/connectorThread.ts";
import {
  compareServerConfig,
  compareShell,
  compareTerminals,
  compareThread,
  MAX_DIFFERENCES,
  textDigest,
} from "./upstreamCompare.ts";
import { upstreamTerminalPayloads } from "./upstreamStateSource.ts";
import {
  clientMessages,
  connection,
  provider,
  serverConfig,
  shellSnapshot,
  terminal,
  threadDetail,
  type WireThread,
  type WireThreadDetail,
} from "./upstreamState.fixtures.ts";

function clientConfig(config: ReturnType<typeof serverConfig>) {
  return { serverConfig: config, providers: config.providers, settings: config.settings };
}

function shell(
  threads: ReadonlyArray<WireThread>,
  archivedThreads: ReadonlyArray<WireThread> = [],
  projects?: Parameters<typeof shellSnapshot>[1],
) {
  const snapshot = shellSnapshot(threads, projects);
  return projectConnectorShell({
    projects: snapshot.projects,
    threads: snapshot.threads,
    archivedThreads: shellSnapshot(archivedThreads).threads,
  });
}

function clientShell(payload: ReturnType<typeof shell>) {
  return {
    status: "ready" as const,
    projects: payload.projects,
    threads: payload.threads,
    archivedThreads: payload.archivedThreads ?? [],
  };
}

const threadA = { id: "thread-a", latestUserMessageAt: "2026-10-08T00:00:00.000Z" };
const threadB = { id: "thread-b", latestUserMessageAt: "2026-10-07T00:00:00.000Z" };
const threadC = { id: "thread-c", latestUserMessageAt: "2026-10-06T00:00:00.000Z" };
const threads = [threadA, threadB, threadC];

describe("compareServerConfig", () => {
  it("is not ready until both sides have a config", () => {
    const config = serverConfig();
    assert.deepEqual(compareServerConfig(null, clientConfig(config)), {
      ready: false,
      equal: false,
      differences: [],
    });
    assert.equal(
      compareServerConfig(config, { serverConfig: undefined, providers: [], settings: undefined })
        .ready,
      false,
    );
  });

  it("reads equal when both sides hold the same config in separate objects", () => {
    const result = compareServerConfig(serverConfig(), clientConfig(serverConfig()));
    assert.deepEqual(result, { ready: true, equal: true, differences: [] });
  });

  it("names provider, settings, keybinding and editor differences by path", () => {
    const settings = serverConfig().settings;
    const upstream = serverConfig({
      providers: [provider("codex"), provider("claudeAgent", { status: "error" })],
      settings: { ...settings, enableProviderUpdateChecks: true },
      availableEditors: ["cursor", "zed"],
    });
    const client = serverConfig({
      providers: [provider("claudeAgent"), provider("cursor", { enabled: false })],
      settings: { ...settings, enableProviderUpdateChecks: false },
      keybindings: [
        {
          command: "terminal.toggle",
          shortcut: {
            key: "j",
            metaKey: false,
            ctrlKey: false,
            shiftKey: false,
            altKey: false,
            modKey: true,
          },
        },
      ],
    });
    const result = compareServerConfig(upstream, clientConfig(client));
    assert.equal(result.equal, false);
    assert.deepEqual(result.differences, [
      "provider codex: only upstream",
      "provider cursor: only client",
      'provider claudeAgent.status: upstream "error", client "ready"',
      "settings.enableProviderUpdateChecks: upstream true, client false",
      "keybindings.count: upstream 0, client 1",
      'availableEditors: upstream ["cursor","zed"], client ["cursor","vscode"]',
    ]);
  });

  it("compares the client's own providers, which it may have changed locally", () => {
    const config = serverConfig();
    const result = compareServerConfig(config, {
      serverConfig: config,
      providers: [provider("codex", { enabled: false }), provider("claudeAgent")],
      settings: config.settings,
    });
    assert.deepEqual(result.differences, ["provider codex.enabled: upstream true, client false"]);
  });
});

describe("compareShell", () => {
  it("is not ready until upstream has a shell and the client is connected", () => {
    const payload = shell(threads);
    assert.equal(compareShell(null, clientShell(payload)).ready, false);
    assert.equal(
      compareShell(payload, { ...clientShell(payload), status: "connecting" }).ready,
      false,
    );
  });

  it("reads equal for the same shell decoded twice", () => {
    assert.deepEqual(compareShell(shell(threads), clientShell(shell(threads))), {
      ready: true,
      equal: true,
      differences: [],
    });
  });

  it("names project and thread differences by id and field", () => {
    const upstream = shell(
      [
        { ...threadA, title: "Renamed" },
        {
          ...threadB,
          settledOverride: "settled",
          settledAt: "2026-10-09T00:00:00.000Z",
          updatedAt: "2026-10-09T00:00:00.000Z",
        },
        { id: "thread-new", latestUserMessageAt: "2026-10-01T00:00:00.000Z" },
      ],
      [],
      [
        { id: "project-1", title: "T3 Code (fork)" },
        { id: "project-2", title: "Other" },
      ],
    );
    const client = clientShell(shell([threadA, threadB]));
    assert.deepEqual(compareShell(upstream, client).differences, [
      "project project-2: only upstream",
      'project project-1.title: upstream "T3 Code (fork)", client "T3 Code"',
      "thread thread-new: only upstream",
      'thread thread-a.title: upstream "Renamed", client "Thread thread-a"',
      'thread thread-b.settledOverride: upstream "settled", client null',
      'thread thread-b.settledAt: upstream "2026-10-09T00:00:00.000Z", client null',
      'thread thread-b.updatedAt: upstream "2026-10-09T00:00:00.000Z", client "2026-10-01T00:00:00.000Z"',
    ]);
  });

  it("reports a thread only one side has archived once, not as missing and extra", () => {
    const upstream = shell(
      [threadA, threadC],
      [{ ...threadB, archivedAt: "2026-10-08T12:00:00.000Z" }],
    );
    const result = compareShell(upstream, clientShell(shell(threads)));
    assert.deepEqual(result.differences, ["thread thread-b.archived: upstream true, client false"]);
  });

  it("reports a different sidebar order in one line", () => {
    const payload = shell(threads);
    const client = { ...clientShell(payload), threads: payload.threads.toReversed() };
    assert.deepEqual(compareShell(payload, client).differences, [
      "thread order: differs from position 0 (upstream thread-a, client thread-c)",
    ]);
  });

  it("does not call a thread the client hides a reorder of the rest", () => {
    const payload = shell(threads);
    const client = clientShell(shell([threadA, threadC]));
    assert.deepEqual(compareShell(payload, client).differences, ["thread thread-b: only upstream"]);
  });

  it("caps the list and says how many differences it left out", () => {
    const many = Array.from({ length: 30 }, (_, index) => ({ id: `thread-${index}` }));
    const result = compareShell(shell(many), clientShell(shell([])));
    assert.equal(result.differences.length, MAX_DIFFERENCES);
    assert.equal(result.differences.at(-1), "and 11 more");
  });
});

function terminalSessions(...wires: ReadonlyArray<Parameters<typeof terminal>[0]>) {
  return (
    upstreamTerminalPayloads({
      connection: connection("connected"),
      terminals: wires.map((wire) => terminal(wire)),
    }) ?? []
  );
}

function clientTerminals(
  sessions: ReturnType<typeof terminalSessions>,
  activeThreadId = "thread-1",
) {
  return {
    activeThreadId,
    terminalSessions: Object.fromEntries(
      sessions.map((session) => [
        terminalSessionKey(session.threadId, session.terminalId),
        session,
      ]),
    ),
  };
}

describe("compareTerminals", () => {
  const first = { terminalId: "term-1", history: "$ ls\n", output: ["a.ts\n"] };

  it("is not ready before upstream lists terminals or for another thread", () => {
    const client = clientTerminals(terminalSessions(first));
    assert.equal(compareTerminals(null, "thread-1", client).ready, false);
    assert.equal(compareTerminals(terminalSessions(first), "thread-2", client).ready, false);
    assert.equal(compareTerminals(terminalSessions(first), null, client).ready, false);
  });

  it("reads equal when both sides hold the same sessions, or none", () => {
    const sessions = terminalSessions(first, { terminalId: "term-2" });
    assert.deepEqual(compareTerminals(sessions, "thread-1", clientTerminals(sessions)), {
      ready: true,
      equal: true,
      differences: [],
    });
    assert.equal(compareTerminals([], "thread-1", clientTerminals([])).equal, true);
  });

  it("reports history by terminal id, length and hash, never the output", () => {
    const upstream = terminalSessions({ ...first, output: ["a.ts\n", "b.ts\n"] });
    const client = clientTerminals(terminalSessions(first));
    assert.deepEqual(compareTerminals(upstream, "thread-1", client).differences, [
      `terminal term-1.history: upstream ${textDigest("$ ls\na.ts\nb.ts\n")}, client ${textDigest("$ ls\na.ts\n")}`,
    ]);
  });

  it("reports status and terminals only one side has", () => {
    const upstream = terminalSessions({ ...first, then: ["exited"] }, { terminalId: "term-2" });
    const client = clientTerminals(terminalSessions(first, { terminalId: "term-3" }));
    assert.deepEqual(compareTerminals(upstream, "thread-1", client).differences, [
      "terminal term-2: only upstream",
      "terminal term-3: only client",
      'terminal term-1.status: upstream "exited", client "running"',
    ]);
  });

  it("ignores other threads' terminals and ones the client closed that the server dropped", () => {
    const sessions = terminalSessions(first);
    const client = clientTerminals([
      ...sessions,
      ...terminalSessions({ terminalId: "term-9", threadId: "thread-2" }),
      ...terminalSessions({ terminalId: "term-closed", then: ["closed"] }),
    ]);
    assert.equal(compareTerminals(sessions, "thread-1", client).equal, true);
  });
});

function threadPayload(detail: WireThreadDetail) {
  return projectConnectorThread(threadDetail(detail));
}

/** The client state the reducer leaves after applying a thread payload. */
function clientThread(detail: WireThreadDetail) {
  const thread = threadDetail(detail);
  const payload = projectConnectorThread(thread);
  return {
    activeThreadId: payload.threadId,
    messages: clientMessages(thread),
    checkpoints: payload.checkpoints,
    sessionStatus: payload.sessionStatus,
    sessionError: payload.sessionError ?? null,
    activities: payload.activities ?? [],
    latestTurn: payload.latestTurn ?? null,
    proposedPlans: payload.proposedPlans ?? [],
    activeTurnId: payload.activeTurnId ?? null,
  };
}

describe("compareThread", () => {
  const detail: WireThreadDetail = {
    messages: [{ id: "message-1", role: "user" }, { id: "message-2" }],
    activities: [{ id: "activity-1", payload: { command: "ls" } }],
    session: { status: "running", activeTurnId: "turn-1" },
  };

  it("is not ready without upstream's thread or while the client shows another", () => {
    assert.equal(compareThread(null, clientThread(detail)).ready, false);
    assert.equal(
      compareThread(threadPayload(detail), clientThread({ ...detail, id: "thread-2" })).ready,
      false,
    );
  });

  it("reads equal when both sides reduced the same thread", () => {
    assert.deepEqual(compareThread(threadPayload(detail), clientThread(detail)), {
      ready: true,
      equal: true,
      differences: [],
    });
  });

  it("reports message text by id, length and hash, never the text", () => {
    const upstream = threadPayload({
      ...detail,
      messages: [
        { id: "message-1", role: "user" },
        { id: "message-2", text: "streamed so far" },
      ],
    });
    const client = clientThread({
      ...detail,
      messages: [
        { id: "message-1", role: "user" },
        { id: "message-2", text: "streamed so" },
      ],
    });
    const { differences } = compareThread(upstream, client);
    assert.deepEqual(differences, [
      `message message-2.text: upstream ${textDigest("streamed so far")}, client ${textDigest("streamed so")}`,
    ]);
    assert.match(differences[0] ?? "", /upstream 15 chars #[0-9a-f]{8}, client 11 chars #/);
  });

  it("tells same-length texts apart", () => {
    const { differences } = compareThread(
      threadPayload({ messages: [{ id: "message-1", text: "abcd" }] }),
      clientThread({ messages: [{ id: "message-1", text: "abce" }] }),
    );
    assert.equal(differences.length, 1);
    assert.notEqual(textDigest("abcd"), textDigest("abce"));
  });

  it("reports rows one side lacks, session fields and activity payloads", () => {
    const upstream = threadPayload({
      messages: [{ id: "message-1" }, { id: "message-2" }],
      activities: [{ id: "activity-1", payload: { command: "ls -la" } }],
      session: { status: "running", activeTurnId: "turn-1" },
    });
    const client = clientThread({
      messages: [{ id: "message-1" }],
      activities: [{ id: "activity-1", payload: { command: "ls" } }, { id: "activity-2" }],
      session: { status: "ready" },
    });
    const { equal, differences } = compareThread(upstream, client);
    assert.equal(equal, false);
    assert.deepEqual(differences, [
      'sessionStatus: upstream "running", client "ready"',
      'activeTurnId: upstream "turn-1", client null',
      "message message-2: only upstream",
      "activity activity-2: only client",
      `activity activity-1.payload: upstream ${textDigest('{"command":"ls -la"}')}, client ${textDigest('{"command":"ls"}')}`,
    ]);
  });

  it("reports rows both sides have in a different order", () => {
    const { differences } = compareThread(
      threadPayload({ messages: [{ id: "message-1" }, { id: "message-2" }] }),
      clientThread({ messages: [{ id: "message-2" }, { id: "message-1" }] }),
    );
    assert.deepEqual(differences, [
      "message order: differs from position 0 (upstream message-1, client message-2)",
    ]);
  });
});
