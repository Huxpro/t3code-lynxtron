import { assert, describe, it } from "vite-plus/test";

import { projectConnectorShell } from "../../shared/connectorShell.ts";
import { compareServerConfig, compareShell, MAX_DIFFERENCES } from "./upstreamCompare.ts";
import {
  provider,
  serverConfig,
  shellSnapshot,
  type WireThread,
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
