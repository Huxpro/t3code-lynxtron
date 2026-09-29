import { assert, describe, it } from "vite-plus/test";

import {
  T3_CONNECTOR_EVENT,
  T3_CONNECTOR_METHODS,
  type ConnectorEventEnvelope,
} from "../shared/connectorProtocol.ts";
import { BrowserPreviewConnectorHost } from "./previewConnectorHost.ts";
import { BROWSER_PREVIEW_SCENARIOS } from "./previewScenarios.ts";

function harness() {
  const events: Array<{ eventName: string; params: unknown[] }> = [];
  const host = new BrowserPreviewConnectorHost(
    BROWSER_PREVIEW_SCENARIOS["populated-connecting"],
    (eventName, params) => events.push({ eventName, params }),
  );
  return { events, host };
}

describe("BrowserPreviewConnectorHost", () => {
  it("serves one typed snapshot for ready and resync", () => {
    const { host } = harness();
    const ready = host.handleNativeCall(T3_CONNECTOR_METHODS.ready, {}, "bridge") as {
      seq: number;
      snapshot: { shell: { projects: unknown[]; threads: unknown[] } };
    };
    const resync = host.handleNativeCall(T3_CONNECTOR_METHODS.resync, {}, "bridge") as {
      seq: number;
    };

    assert.equal(ready.seq, 0);
    assert.equal(ready.snapshot.shell.projects.length, 1);
    assert.equal(ready.snapshot.shell.threads.length, 1);
    assert.equal(resync.seq, 0);
    assert.equal(host.diagnostics.readyCalls, 1);
    assert.equal(host.diagnostics.resyncCalls, 1);
  });

  it("serves a deterministic recoverable connection error", () => {
    const host = new BrowserPreviewConnectorHost(
      BROWSER_PREVIEW_SCENARIOS["connection-error"],
      () => {},
    );
    const ready = host.handleNativeCall(T3_CONNECTOR_METHODS.ready, {}, "bridge") as {
      snapshot: { status: { status: string; detail?: string } };
    };

    assert.deepEqual(ready.snapshot.status, {
      status: "error",
      detail: "The local server stopped before the workspace was ready.",
    });
  });

  it("serves a bounded long-transcript fixture with a terminal marker", () => {
    const host = new BrowserPreviewConnectorHost(
      BROWSER_PREVIEW_SCENARIOS["long-transcript"],
      () => {},
    );
    const ready = host.handleNativeCall(T3_CONNECTOR_METHODS.ready, {}, "bridge") as {
      snapshot: { threads: Record<string, { messages: Array<{ text: string }> }> };
    };
    const messages = ready.snapshot.threads["browser-preview-thread"]?.messages ?? [];
    assert.equal(messages.length, 80);
    assert.include(messages.at(-1)?.text ?? "", "Long transcript terminal marker");
    assert.include(messages.at(-1)?.text ?? "", "![Parity proof](./evidence/parity.png)");
  });

  it("publishes strictly monotonic connector events", () => {
    const { events, host } = harness();
    host.emitStatus("ready");
    host.switchScenario("populated-connecting");

    assert.isTrue(events.every((entry) => entry.eventName === T3_CONNECTOR_EVENT));
    assert.deepEqual(
      events.map((entry) => (entry.params[0] as { seq: number }).seq),
      [1, 2, 3, 4, 5, 6],
    );
    assert.equal(host.diagnostics.lastSequence, 6);
  });

  it("can publish one deliberate gap for resync diagnostics", () => {
    const { events, host } = harness();
    host.emitStatus("ready");
    host.emitSequenceGapForDiagnostic("connecting");

    assert.deepEqual(
      events.map((entry) => (entry.params[0] as { seq: number }).seq),
      [1, 3],
    );
    const resync = host.handleNativeCall(T3_CONNECTOR_METHODS.resync, {}, "bridge") as {
      seq: number;
      snapshot: { status: { status: string } };
    };
    assert.equal(resync.seq, 3);
    assert.equal(resync.snapshot.status.status, "connecting");
  });

  it("records safe commands and rejects filesystem access", () => {
    const { host } = harness();
    const created = host.handleNativeCall(
      T3_CONNECTOR_METHODS.command,
      { method: "createThread", params: { projectId: "browser-preview-project" } },
      "bridge",
    ) as { threadId: string };
    assert.equal(created.threadId, "browser-preview-thread");
    assert.equal(host.diagnostics.commands[0]?.method, "createThread");
    assert.throws(
      () =>
        host.handleNativeCall(
          T3_CONNECTOR_METHODS.command,
          { method: "readProjectFile", params: { path: "/etc/passwd" } },
          "bridge",
        ),
      /unavailable in the isolated browser preview/,
    );
  });

  it("publishes canonical request resolution after an intervention command", () => {
    const events: Array<{ eventName: string; params: unknown[] }> = [];
    const host = new BrowserPreviewConnectorHost(
      BROWSER_PREVIEW_SCENARIOS["pending-approval"],
      (eventName, params) => events.push({ eventName, params }),
    );
    host.handleNativeCall(
      T3_CONNECTOR_METHODS.command,
      {
        method: "respondToApproval",
        params: {
          threadId: "browser-preview-thread",
          requestId: "browser-preview-approval-request",
          decision: "accept",
        },
      },
      "bridge",
    );
    const envelope = events.at(-1)?.params[0] as ConnectorEventEnvelope;
    assert.equal(envelope.kind, "thread");
    if (envelope.kind !== "thread") assert.fail("expected thread event");
    assert.equal(envelope.payload.activities?.at(-1)?.kind, "approval.resolved");
  });

  it("fails one send and advances canonical turn state on retry", async () => {
    const events: Array<{ eventName: string; params: unknown[] }> = [];
    const host = new BrowserPreviewConnectorHost(
      BROWSER_PREVIEW_SCENARIOS["send-recovery"],
      (eventName, params) => events.push({ eventName, params }),
    );
    const request = {
      method: "sendPrompt",
      params: { threadId: "browser-preview-thread", text: "Retry this turn" },
    };

    let failure: unknown;
    try {
      await Promise.resolve(host.handleNativeCall(T3_CONNECTOR_METHODS.command, request, "bridge"));
    } catch (error) {
      failure = error;
    }
    assert.match(String(failure), /retry is available/);
    host.handleNativeCall(T3_CONNECTOR_METHODS.command, request, "bridge");

    assert.equal(
      host.diagnostics.commands.filter((entry) => entry.method === "sendPrompt").length,
      2,
    );
    const envelope = events.at(-1)?.params[0] as ConnectorEventEnvelope;
    assert.equal(envelope.kind, "thread");
    if (envelope.kind !== "thread") assert.fail("expected thread event");
    assert.equal(envelope.payload.sessionStatus, "running");
    assert.equal(envelope.payload.activeTurnId, "browser-preview-retry-turn");
    assert.equal(envelope.payload.messages.at(-1)?.text, "Retry this turn");
  });

  it("projects attachment-only retry into canonical thread state", async () => {
    const events: Array<{ eventName: string; params: unknown[] }> = [];
    const host = new BrowserPreviewConnectorHost(
      BROWSER_PREVIEW_SCENARIOS["send-recovery"],
      (eventName, params) => events.push({ eventName, params }),
    );
    const attachment = {
      type: "image" as const,
      name: "proof.png",
      mimeType: "image/png",
      sizeBytes: 4,
      dataUrl: "data:image/png;base64,dGVzdA==",
    };
    const request = {
      method: "sendPrompt",
      params: { threadId: "browser-preview-thread", text: "", attachments: [attachment] },
    };

    let failure: unknown;
    try {
      await Promise.resolve(host.handleNativeCall(T3_CONNECTOR_METHODS.command, request, "bridge"));
    } catch (error) {
      failure = error;
    }
    assert.match(String(failure), /retry is available/);
    host.handleNativeCall(T3_CONNECTOR_METHODS.command, request, "bridge");

    const envelope = events.at(-1)?.params[0] as ConnectorEventEnvelope;
    assert.equal(envelope.kind, "thread");
    if (envelope.kind !== "thread") assert.fail("expected thread event");
    const message = envelope.payload.messages.at(-1);
    assert.equal(message?.text, "");
    assert.deepEqual(message?.attachments, [
      {
        type: "image",
        id: "preview-image-2-0",
        name: "proof.png",
        mimeType: "image/png",
        sizeBytes: 4,
      },
    ]);
  });

  it("publishes canonical interrupted turn state after stop", () => {
    const events: Array<{ eventName: string; params: unknown[] }> = [];
    const host = new BrowserPreviewConnectorHost(
      BROWSER_PREVIEW_SCENARIOS["running-turn"],
      (eventName, params) => events.push({ eventName, params }),
    );
    host.handleNativeCall(
      T3_CONNECTOR_METHODS.command,
      { method: "interrupt", params: { threadId: "browser-preview-thread" } },
      "bridge",
    );
    const envelope = events.at(-1)?.params[0] as ConnectorEventEnvelope;
    assert.equal(envelope.kind, "thread");
    if (envelope.kind !== "thread") assert.fail("expected thread event");
    assert.equal(envelope.payload.sessionStatus, "interrupted");
    assert.equal(envelope.payload.latestTurn?.state, "interrupted");
    assert.isNull(envelope.payload.activeTurnId);
  });

  it("rejects unknown modules and commands", () => {
    const { host } = harness();
    assert.throws(() => host.handleNativeCall("anything", {}, "shell"), /Unsupported/);
    assert.throws(
      () =>
        host.handleNativeCall(
          T3_CONNECTOR_METHODS.command,
          { method: "deleteEverything" },
          "bridge",
        ),
      /Rejected preview connector command/,
    );
  });
});
