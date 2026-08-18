import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assert, describe, it } from "vite-plus/test";

import { T3_CONNECTOR_EVENT, T3_CONNECTOR_METHODS } from "../shared/connectorProtocol.ts";
import { LiveConnectorHost } from "./liveConnectorHost.ts";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(scriptDir, "..");

function harness() {
  const events: Array<{ eventName: string; params: unknown[] }> = [];
  // A fake socket URL: start() is not called, so no connection is attempted.
  const host = new LiveConnectorHost(
    { socketUrl: "ws://127.0.0.1:1/ws?wsTicket=fake", route: "/" },
    (eventName, params) => events.push({ eventName, params }),
  );
  return { events, host };
}

describe("LiveConnectorHost", () => {
  it("mirrors the renderer bridge contract before any connection", () => {
    const { host } = harness();
    const ready = host.handleNativeCall(T3_CONNECTOR_METHODS.ready, {}, "bridge") as {
      seq: number;
      snapshot: { status: { status: string }; shell: { projects: unknown[]; threads: unknown[] } };
    };
    // Pre-connection snapshot is the connecting placeholder with empty shell.
    assert.equal(ready.seq, 0);
    assert.equal(ready.snapshot.status.status, "connecting");
    assert.deepEqual(ready.snapshot.shell.projects, []);
    assert.equal(host.diagnostics.readyCalls, 1);

    const resync = host.handleNativeCall(T3_CONNECTOR_METHODS.resync, {}, "bridge") as {
      seq: number;
    };
    assert.equal(resync.seq, 0);
    assert.equal(host.diagnostics.resyncCalls, 1);
  });

  it("marks module-ready and reports the live host kind", () => {
    const { host } = harness();
    const ok = host.handleNativeCall("t3:preview.module-ready", {}, "bridge") as { ok: boolean };
    assert.isTrue(ok.ok);
    assert.isTrue(host.diagnostics.nativeModuleReady);
    assert.equal(host.diagnostics.hostKind, "live-browser-preview");
  });

  it("records commands and rejects browser-unavailable capabilities", () => {
    const { host } = harness();
    // selectThread is accepted (records + attempts subscribe; no client yet so no-op).
    host.handleNativeCall(
      T3_CONNECTOR_METHODS.command,
      { method: "selectThread", params: "thread-1" },
      "bridge",
    );
    assert.equal(host.diagnostics.commands[0]?.method, "selectThread");
    assert.throws(
      () =>
        host.handleNativeCall(
          T3_CONNECTOR_METHODS.command,
          {
            method: "readProjectFile",
            params: { cwd: "/tmp/project", relativePath: "README.md" },
          },
          "bridge",
        ),
      /not connected/,
    );
    assert.throws(
      () =>
        host.handleNativeCall(
          T3_CONNECTOR_METHODS.command,
          {
            method: "writeProjectFile",
            params: { cwd: "/tmp/project", relativePath: "README.md", contents: "unsafe" },
          },
          "bridge",
        ),
      /unavailable in the isolated browser preview/,
    );
    assert.throws(
      () =>
        host.handleNativeCall(
          T3_CONNECTOR_METHODS.command,
          { method: "createPairingCredential", params: {} },
          "bridge",
        ),
      /unavailable in the isolated browser preview/,
    );
    assert.throws(
      () =>
        host.handleNativeCall(
          T3_CONNECTOR_METHODS.command,
          { method: "discoverSourceControl", params: {} },
          "bridge",
        ),
      /not connected/,
    );
    assert.throws(
      () =>
        host.handleNativeCall(
          T3_CONNECTOR_METHODS.command,
          { method: "listProjectEntries", params: { cwd: "/tmp/project" } },
          "bridge",
        ),
      /not connected/,
    );
    assert.throws(
      () =>
        host.handleNativeCall(
          T3_CONNECTOR_METHODS.command,
          {
            method: "searchProjectEntries",
            params: { cwd: "/tmp/project", query: "", limit: 200, kind: "file" },
          },
          "bridge",
        ),
      /not connected/,
    );
  });

  it("retains bounded command results independently from completion order", () => {
    const source = readFileSync(path.join(srcRoot, "browser-preview/liveConnectorHost.ts"), "utf8");
    assert.include(source, "readonly commandResults:");
    assert.include(source, "this.diagnostics.commandResults.push(result)");
    assert.include(source, "this.diagnostics.commandResults.length > 32");
    assert.include(source, "this.#recordCommandResult(request.method, context)");
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
      /Rejected live connector command/,
    );
  });

  it("exposes T3_CONNECTOR_EVENT as its push channel name", () => {
    // Sanity: the host uses the shared protocol event name, not a private one.
    assert.equal(T3_CONNECTOR_EVENT, "t3:connector-event");
  });

  it("waits for the live config before replying to renderer readiness", () => {
    const hostSource = readFileSync(
      path.join(srcRoot, "browser-preview/liveConnectorHost.ts"),
      "utf8",
    );
    const previewSource = readFileSync(path.join(srcRoot, "browser-preview/index.ts"), "utf8");
    assert.include(hostSource, "#startPromise: Promise<void> | null = null");
    assert.include(hostSource, "if (this.#startPromise) return this.#startPromise");
    assert.include(previewSource, "const liveHostReady = liveHost ? liveHost.start()");
    assert.include(previewSource, "void liveHostReady.then(() =>");
    assert.include(previewSource, "view.url = bundleUrl");
  });

  it("forwards turn-diff commands to the live orchestration RPC", () => {
    const source = readFileSync(path.join(srcRoot, "browser-preview/liveConnectorHost.ts"), "utf8");
    assert.include(source, 'if (request.method === "getTurnDiff")');
    assert.include(source, "this.#client[ORCHESTRATION_WS_METHODS.getTurnDiff](params)");
    assert.include(source, "OrchestrationGetTurnDiffResult");
  });

  // Production graph isolation: the dev-only live host must never be imported by
  // production main/preload/connector code. It lives under src/browser-preview
  // and is only referenced by that dev harness. Scan the production source tree
  // for any import of it.
  it("is not imported by production main/preload/connector source", () => {
    const productionDirs = [
      path.join(srcRoot, "main"),
      path.join(srcRoot, "app"),
      path.join(srcRoot, "shared"),
    ];
    const offenders: string[] = [];
    const visit = (dir: string) => {
      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry);
        const stats = statSync(full);
        if (stats.isDirectory()) {
          visit(full);
          continue;
        }
        if (!/\.(ts|tsx|js|mjs)$/.test(entry)) continue;
        const text = readFileSync(full, "utf8");
        if (
          text.includes("liveConnectorHost") ||
          text.includes("browser-preview/liveConnectorHost")
        ) {
          offenders.push(path.relative(srcRoot, full));
        }
      }
    };
    for (const dir of productionDirs) visit(dir);
    assert.deepEqual(
      offenders,
      [],
      `dev-only liveConnectorHost must not be imported by production source; found: ${offenders.join(", ")}`,
    );
  });
});
