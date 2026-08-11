import { assert, describe, it } from "vite-plus/test";

import { T3_CONNECTOR_EVENT, T3_CONNECTOR_METHODS } from "../shared/connectorProtocol.ts";
import { BrowserPreviewConnectorHost } from "./previewConnectorHost.ts";
import { BROWSER_PREVIEW_SCENARIOS } from "./previewScenarios.ts";

function harness() {
  const events: Array<{ eventName: string; params: unknown[] }> = [];
  const host = new BrowserPreviewConnectorHost(
    BROWSER_PREVIEW_SCENARIOS["existing-thread"],
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
    assert.isTrue(ready.snapshot.shell.projects.length >= 1);
    assert.isTrue(ready.snapshot.shell.threads.length >= 1);
    assert.equal(resync.seq, 0);
    assert.equal(host.diagnostics.readyCalls, 1);
    assert.equal(host.diagnostics.resyncCalls, 1);
  });

  it("publishes strictly monotonic connector events", () => {
    const { events, host } = harness();
    host.emitStatus("ready");
    host.switchScenario("new-thread");

    assert.isTrue(events.every((entry) => entry.eventName === T3_CONNECTOR_EVENT));
    const sequences = events.map((entry) => (entry.params[0] as { seq: number }).seq);
    // Strictly monotonic, one-based, contiguous regardless of scenario size.
    assert.deepEqual(
      sequences,
      Array.from({ length: sequences.length }, (_unused, index) => index + 1),
    );
    assert.equal(host.diagnostics.lastSequence, sequences.length);
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
