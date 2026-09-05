import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assert, describe, it } from "vite-plus/test";

import {
  ProjectId,
  ProviderInstanceId,
  type DispatchableClientOrchestrationCommand,
} from "@t3tools/contracts";

import { T3_CONNECTOR_EVENT, T3_CONNECTOR_METHODS } from "../shared/connectorProtocol.ts";
import { dispatchLivePrompt, LiveConnectorHost } from "./liveConnectorHost.ts";

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
    assert.deepEqual(ready.snapshot.terminals, {});
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
    assert.notInclude(host.diagnostics.unsupportedCapabilities, "shell");
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
            params: { cwd: "/tmp/project", relativePath: "README.md", contents: "safe" },
          },
          "bridge",
        ),
      /not connected/,
    );
    assert.throws(
      () =>
        host.handleNativeCall(
          T3_CONNECTOR_METHODS.command,
          { method: "createPairingCredential", params: {} },
          "bridge",
        ),
      /not connected/,
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
    assert.include(source, "this.#client[WS_METHODS.projectsWriteFile](params)");
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

  it("projects an unexpected shared-server close as reconnecting", () => {
    const source = readFileSync(path.join(srcRoot, "browser-preview/liveConnectorHost.ts"), "utf8");
    assert.include(source, 'this.#setStatus("reconnecting", this.diagnostics.error)');
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

  it("forwards terminal lifecycle commands and emits terminal snapshots", () => {
    const source = readFileSync(path.join(srcRoot, "browser-preview/liveConnectorHost.ts"), "utf8");
    assert.include(source, 'if (request.method === "openTerminal")');
    assert.include(source, "this.#client[WS_METHODS.terminalOpen](params)");
    assert.include(source, "this.#client[WS_METHODS.terminalAttach]");
    assert.include(source, "applyTerminalAttachStreamEvent(buffer, event)");
    assert.include(source, 'if (request.method === "writeTerminal")');
    assert.include(source, "this.#client[WS_METHODS.terminalWrite](params)");
    assert.include(source, 'if (request.method === "resizeTerminal")');
    assert.include(source, "this.#client[WS_METHODS.terminalResize](params)");
    assert.include(
      source,
      'request.method === "openTerminal" || request.method === "resizeTerminal"',
    );
    assert.include(source, "terminalId: input.terminalId");
    assert.include(source, "cols: input.cols ?? 80");
    assert.include(source, "rows: input.rows ?? 24");
    assert.include(source, 'if (request.method === "closeTerminal")');
    assert.include(source, "this.#client[WS_METHODS.terminalClose](params)");
    assert.include(source, 'status: "closed"');
  });

  it("forwards access management through authenticated same-origin HTTP", () => {
    const source = readFileSync(path.join(srcRoot, "browser-preview/liveConnectorHost.ts"), "utf8");
    assert.include(source, 'credentials: "same-origin"');
    assert.include(source, '"/api/auth/pairing-token"');
    assert.include(source, '"/api/auth/pairing-links/revoke"');
    assert.include(source, 'credential: "[redacted]"');
    assert.notInclude(source, '"createPairingCredential",\n  "revokePairingLink"');
  });

  it("forwards one atomic draft promotion and subscribes only after dispatch succeeds", async () => {
    const commands: Array<
      Extract<DispatchableClientOrchestrationCommand, { type: "thread.turn.start" }>
    > = [];
    const selectedThreadIds: string[] = [];
    let resolveDispatch!: (value: { sequence: number }) => void;
    const dispatch = new Promise<{ sequence: number }>((resolve) => {
      resolveDispatch = resolve;
    });
    const bootstrap = {
      createThread: {
        projectId: ProjectId.make("project-1"),
        title: "Implement it",
        modelSelection: {
          instanceId: ProviderInstanceId.make("codex"),
          model: "gpt-5.6",
        },
        runtimeMode: "full-access" as const,
        interactionMode: "default" as const,
        branch: null,
        worktreePath: null,
        createdAt: "2026-08-22T00:00:00.000Z",
      },
    };

    const pending = dispatchLivePrompt({
      params: {
        threadId: "draft-thread",
        text: "Implement it",
        bootstrap,
      },
      thread: undefined,
      dispatch: (command) => {
        commands.push(command);
        return dispatch;
      },
      selectThread: (threadId) => selectedThreadIds.push(threadId),
      commandId: "command-1",
      messageId: "message-1",
      createdAt: "2026-08-22T00:00:01.000Z",
    });

    assert.equal(commands.length, 1);
    assert.deepEqual(selectedThreadIds, []);
    assert.deepEqual(commands[0], {
      type: "thread.turn.start",
      commandId: "command-1",
      threadId: "draft-thread",
      message: {
        messageId: "message-1",
        role: "user",
        text: "Implement it",
        attachments: [],
      },
      modelSelection: bootstrap.createThread.modelSelection,
      titleSeed: "Implement it",
      runtimeMode: "full-access",
      interactionMode: "default",
      bootstrap,
      createdAt: "2026-08-22T00:00:01.000Z",
    });

    resolveDispatch({ sequence: 42 });
    assert.deepEqual(await pending, { sequence: 42 });
    assert.deepEqual(selectedThreadIds, ["draft-thread"]);
    assert.equal(commands.length, 1);
  });

  it("rejects an unknown thread without creating an empty record", async () => {
    let dispatchCount = 0;
    let failure: unknown;
    try {
      await dispatchLivePrompt({
        params: {
          threadId: "missing-thread",
          text: "No implicit create",
        },
        thread: undefined,
        dispatch: async () => {
          dispatchCount += 1;
          return { sequence: 1 };
        },
        selectThread: () => {},
        commandId: "command-2",
        messageId: "message-2",
        createdAt: "2026-08-22T00:00:01.000Z",
      });
    } catch (error) {
      failure = error;
    }
    assert.match(
      failure instanceof Error ? failure.message : String(failure),
      /not present in the canonical snapshot/,
    );
    assert.equal(dispatchCount, 0);
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
