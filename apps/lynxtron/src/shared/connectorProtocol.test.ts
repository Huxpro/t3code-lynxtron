import { assert, describe, it } from "vite-plus/test";

import {
  classifyConnectorSequence,
  isConnectorCommandName,
  isConnectorEventEnvelope,
  isConnectorSyncReply,
} from "./connectorProtocol.ts";

describe("connector protocol sequence classification", () => {
  it("applies the next in-order event", () => {
    assert.equal(classifyConnectorSequence(41, 42), "apply");
  });

  it("applies the first event after a fresh sync", () => {
    assert.equal(classifyConnectorSequence(0, 1), "apply");
  });

  it("drops duplicate and stale events", () => {
    assert.equal(classifyConnectorSequence(42, 42), "duplicate");
    assert.equal(classifyConnectorSequence(42, 7), "duplicate");
  });

  it("flags skipped sequences as a gap", () => {
    assert.equal(classifyConnectorSequence(41, 43), "gap");
    assert.equal(classifyConnectorSequence(0, 9), "gap");
  });
});

describe("connector protocol guards", () => {
  it("accepts only allowlisted command names", () => {
    assert.isTrue(isConnectorCommandName("sendPrompt"));
    assert.isTrue(isConnectorCommandName("reconnect"));
    assert.isTrue(isConnectorCommandName("respondToApproval"));
    assert.isTrue(isConnectorCommandName("readProjectBranch"));
    assert.isTrue(isConnectorCommandName("updateProjectScripts"));
    assert.isTrue(isConnectorCommandName("openInEditor"));
    assert.isTrue(isConnectorCommandName("searchProjectEntries"));
    assert.isTrue(isConnectorCommandName("revokeOtherClientSessions"));
    assert.isFalse(isConnectorCommandName("dispose"));
    assert.isFalse(isConnectorCommandName("connect"));
    assert.isFalse(isConnectorCommandName("__proto__"));
    assert.isFalse(isConnectorCommandName(42));
  });

  it("validates sequenced envelopes", () => {
    assert.isTrue(isConnectorEventEnvelope({ seq: 1, kind: "status", payload: {} }));
    assert.isTrue(isConnectorEventEnvelope({ seq: 9, kind: "thread", threadId: "t", payload: {} }));
    assert.isFalse(isConnectorEventEnvelope({ seq: 0, kind: "status", payload: {} }));
    assert.isFalse(isConnectorEventEnvelope({ seq: 1.5, kind: "status", payload: {} }));
    assert.isFalse(isConnectorEventEnvelope({ seq: 1, kind: "everything", payload: {} }));
    assert.isFalse(isConnectorEventEnvelope(null));
    assert.isFalse(isConnectorEventEnvelope("t3:connector-event"));
  });

  it("validates sync replies", () => {
    const snapshot = {
      status: { status: "ready" },
      config: null,
      access: { pairingLinks: [], clientSessions: [] },
      shell: { projects: [], threads: [] },
      threads: {},
    };
    assert.isTrue(isConnectorSyncReply({ seq: 0, snapshot }));
    assert.isTrue(isConnectorSyncReply({ seq: 12, snapshot }));
    assert.isFalse(isConnectorSyncReply({ seq: -1, snapshot }));
    assert.isFalse(isConnectorSyncReply({ snapshot }));
    assert.isFalse(isConnectorSyncReply({ seq: 1, snapshot: null }));
    assert.isFalse(isConnectorSyncReply({ seq: 1, snapshot: { status: { status: "ready" } } }));
    assert.isFalse(isConnectorSyncReply(null));
  });
});
