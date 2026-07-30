import { assert, describe, it } from "vite-plus/test";

import {
  startMainConnectorTransport,
  type BridgeCallModule,
  type GlobalEventListenerRegistry,
} from "./mainConnectorTransport.ts";
import {
  T3_CONNECTOR_EVENT,
  T3_CONNECTOR_METHODS,
  type ConnectorEventEnvelope,
  type ConnectorSnapshot,
} from "../../shared/connectorProtocol.ts";

function makeSnapshot(seqTag: string): ConnectorSnapshot {
  return {
    status: { status: "ready" },
    config: null,
    access: {
      pairingLinks: [],
      clientSessions: [],
      pairingLinkCount: 0,
      clientSessionCount: 0,
      hasEntries: false,
    },
    shell: { projects: [], threads: [{ id: seqTag } as never] },
    threads: {},
  };
}

interface Harness {
  bridge: BridgeCallModule;
  registry: GlobalEventListenerRegistry & {
    listeners: Map<string, Array<(...args: unknown[]) => void>>;
  };
  emit: (envelope: unknown) => void;
  applied: ConnectorEventEnvelope[];
  snapshots: ConnectorSnapshot[];
  commandLog: Array<{ method: string; params: Record<string, unknown> }>;
  replyWith: (method: string, reply: unknown) => void;
  logs: string[];
}

function createHarness(): Harness {
  const applied: ConnectorEventEnvelope[] = [];
  const snapshots: ConnectorSnapshot[] = [];
  const commandLog: Array<{ method: string; params: Record<string, unknown> }> = [];
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  const replies = new Map<string, unknown>();
  const logs: string[] = [];

  const bridge: BridgeCallModule = {
    call: (name, params, cb) => {
      commandLog.push({ method: name, params });
      const reply = replies.get(name);
      if (reply instanceof Error) throw reply;
      if (typeof reply === "function") {
        (reply as (params: Record<string, unknown>) => unknown)(params);
        return;
      }
      if (replies.has(name)) cb(reply);
    },
  };

  const registry: Harness["registry"] = {
    listeners,
    addListener: (eventName, listener) => {
      listeners.set(eventName, [...(listeners.get(eventName) ?? []), listener]);
    },
    removeListener: (eventName, listener) => {
      listeners.set(
        eventName,
        (listeners.get(eventName) ?? []).filter((candidate) => candidate !== listener),
      );
    },
  };

  return {
    bridge,
    registry,
    applied,
    snapshots,
    commandLog,
    logs,
    emit: (envelope) => {
      for (const listener of listeners.get(T3_CONNECTOR_EVENT) ?? []) listener(envelope);
    },
    replyWith: (method, reply) => replies.set(method, reply),
  };
}

async function startHarness(harness: Harness, readyTimeoutMs = 50) {
  return startMainConnectorTransport({
    bridge: harness.bridge,
    eventRegistry: harness.registry,
    applySnapshot: (snapshot) => harness.snapshots.push(snapshot),
    applyEvent: (event) => harness.applied.push(event),
    onLog: (line) => harness.logs.push(line),
    readyTimeoutMs,
  });
}

describe("main connector transport", () => {
  it("returns null when the bridge module is unavailable", async () => {
    const result = await startMainConnectorTransport({
      bridge: undefined,
      eventRegistry: undefined,
      applySnapshot: () => {},
      applyEvent: () => {},
      readyTimeoutMs: 10,
    });
    assert.isNull(result);
  });

  it("returns null when main never answers the readiness probe", async () => {
    const harness = createHarness(); // no ready reply registered
    const result = await startHarness(harness, 20);
    assert.isNull(result);
    assert.isFalse(harness.registry.listeners.has(T3_CONNECTOR_EVENT));
  });

  it("applies the ready snapshot once and processes sequenced events", async () => {
    const harness = createHarness();
    harness.replyWith(T3_CONNECTOR_METHODS.ready, { seq: 3, snapshot: makeSnapshot("t1") });
    const transport = await startHarness(harness);
    assert.isNotNull(transport);
    assert.equal(transport!.lastSeq, 3);
    assert.equal(harness.snapshots.length, 1);

    harness.emit({ seq: 4, kind: "status", payload: { status: "ready" } });
    harness.emit({ seq: 5, kind: "log", payload: "line" });
    assert.deepEqual(
      harness.applied.map((event) => event.seq),
      [4, 5],
    );
    assert.equal(transport!.lastSeq, 5);
  });

  it("drops duplicates and out-of-band junk", async () => {
    const harness = createHarness();
    harness.replyWith(T3_CONNECTOR_METHODS.ready, { seq: 1, snapshot: makeSnapshot("t1") });
    const transport = await startHarness(harness);

    harness.emit({ seq: 1, kind: "status", payload: { status: "ready" } });
    harness.emit("not-an-envelope");
    harness.emit({ seq: "x", kind: "status" });
    assert.equal(harness.applied.length, 0);
    assert.equal(transport!.lastSeq, 1);
  });

  it("recovers a sequence gap with a full resync", async () => {
    const harness = createHarness();
    harness.replyWith(T3_CONNECTOR_METHODS.ready, { seq: 2, snapshot: makeSnapshot("t1") });
    harness.replyWith(T3_CONNECTOR_METHODS.resync, { seq: 6, snapshot: makeSnapshot("t2") });
    const transport = await startHarness(harness);

    harness.emit({ seq: 3, kind: "status", payload: { status: "ready" } });
    harness.emit({ seq: 5, kind: "shell", payload: { projects: [], threads: [] } });
    assert.equal(harness.applied.length, 1); // seq 5 skipped -> gap

    await transport!.resync();
    assert.equal(harness.snapshots.length, 2);
    assert.equal(transport!.lastSeq, 6);
    assert.isTrue(harness.commandLog.some((entry) => entry.method === T3_CONNECTOR_METHODS.resync));

    harness.emit({ seq: 7, kind: "status", payload: { status: "ready" } });
    assert.equal(harness.applied.length, 2);
  });

  it("routes typed commands through the command method", async () => {
    const harness = createHarness();
    harness.replyWith(T3_CONNECTOR_METHODS.ready, { seq: 0, snapshot: makeSnapshot("t1") });
    harness.replyWith(T3_CONNECTOR_METHODS.command, { threadId: "t9" });
    const transport = await startHarness(harness);

    const result = await transport!.invoke("createThread", { projectId: "p1" });
    assert.deepEqual(result, { threadId: "t9" });
    const commandCall = harness.commandLog.find(
      (entry) => entry.method === T3_CONNECTOR_METHODS.command,
    );
    assert.deepEqual(commandCall?.params, { method: "createThread", params: { projectId: "p1" } });
  });

  it("stops listening after dispose", async () => {
    const harness = createHarness();
    harness.replyWith(T3_CONNECTOR_METHODS.ready, { seq: 0, snapshot: makeSnapshot("t1") });
    const transport = await startHarness(harness);
    transport!.dispose();
    harness.emit({ seq: 1, kind: "status", payload: { status: "ready" } });
    assert.equal(harness.applied.length, 0);
  });
});
