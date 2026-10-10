import { assert, describe, it } from "vite-plus/test";

import { createUpstreamStateRouter, upstreamStatePayloads } from "./upstreamStateSource.ts";
import { connection, serverConfig, shellSnapshot, shellState } from "./upstreamState.fixtures.ts";

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
