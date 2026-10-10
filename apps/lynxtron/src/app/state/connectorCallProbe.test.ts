import { assert, describe, it } from "vite-plus/test";

import {
  createConnectorCallProbe,
  publishConnectorCalls,
  recordConnectorCalls,
} from "./connectorCallProbe.ts";
import { routeCommandBridge } from "./upstreamCommands.ts";

function bridges() {
  const probe = createConnectorCallProbe();
  const answering = (source: string, names: ReadonlyArray<string>) =>
    Object.fromEntries(names.map((name) => [name, () => Promise.resolve(source)]));
  let upstreamUp = false;
  const bridge: Record<string, ((input?: unknown) => Promise<unknown>) | undefined> =
    routeCommandBridge({
      connector: recordConnectorCalls(
        answering("connector", ["reconnect", "selectThread", "archiveThread"]),
        probe.record,
      ),
      upstream: answering("upstream", ["selectThread", "archiveThread"]),
      useUpstream: () => upstreamUp,
    });
  return {
    probe,
    send: (name: string, input?: unknown) => {
      const command = bridge[name];
      if (!command) throw new Error(`the bridge has no ${name}`);
      return command(input);
    },
    setUpstream: (up: boolean) => {
      upstreamUp = up;
      if (up) probe.arm();
    },
  };
}

describe("the connector call probe", () => {
  it("does not count what the connector is sent before upstream is ready", async () => {
    const { probe, send } = bridges();
    assert.equal(await send("selectThread", "thread-1"), "connector");
    assert.equal(await send("archiveThread", { threadId: "thread-1" }), "connector");
    assert.deepEqual(probe.calls, {});
  });

  it("stays empty while upstream takes every command it is asked", async () => {
    const { probe, send, setUpstream } = bridges();
    setUpstream(true);
    assert.equal(await send("selectThread", "thread-1"), "upstream");
    assert.equal(await send("archiveThread", { threadId: "thread-1" }), "upstream");
    assert.deepEqual(probe.calls, {});
  });

  it("names and counts what reaches the connector after upstream was ready", async () => {
    const { probe, send, setUpstream } = bridges();
    setUpstream(true);
    await send("reconnect");
    setUpstream(false);
    await send("selectThread", "thread-1");
    await send("selectThread", "thread-2");
    assert.deepEqual(probe.calls, { reconnect: 1, selectThread: 2 });
  });

  it("passes the command's input and result through unchanged", async () => {
    const seen: Array<unknown> = [];
    const recorded = recordConnectorCalls(
      {
        renameThread: (input: { readonly threadId: string; readonly title: string }) => {
          seen.push(input);
          return Promise.resolve("renamed");
        },
      },
      () => undefined,
    );
    const input = { threadId: "thread-1", title: "Plans" };
    assert.equal(await recorded.renameThread(input), "renamed");
    assert.deepEqual(seen, [input]);
  });

  it("publishes its counts next to what the shadow already published", () => {
    const target = globalThis as { __T3_UPSTREAM_SHADOW__?: Record<string, unknown> };
    const before = target.__T3_UPSTREAM_SHADOW__;
    try {
      target.__T3_UPSTREAM_SHADOW__ = { phase: "connected" };
      const probe = createConnectorCallProbe();
      publishConnectorCalls(probe.calls);
      probe.arm();
      probe.record("reconnect");
      assert.deepEqual(target.__T3_UPSTREAM_SHADOW__, {
        phase: "connected",
        connectorCalls: { reconnect: 1 },
      });
    } finally {
      if (before === undefined) delete target.__T3_UPSTREAM_SHADOW__;
      else target.__T3_UPSTREAM_SHADOW__ = before;
    }
  });
});
