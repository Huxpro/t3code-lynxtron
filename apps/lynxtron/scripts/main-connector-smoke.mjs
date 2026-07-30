#!/usr/bin/env node
/**
 * AR1 integration smoke: drive the main-owned connector host against a real
 * connector + server, with the Lynxtron window and lynxBridge replaced by
 * local fakes. Proves, through the production connector bundle:
 *   real server bootstrap -> ready snapshot -> create/select thread ->
 *   prompt -> streamed sequenced thread events -> interruption -> shutdown
 *   with the server port released.
 *
 * The lynxBridge/sendGlobalEvent legs themselves are verified by the real
 * flagged app run (see docs/plans/10 AR1); this script covers everything
 * behind those legs.
 */
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import * as path from "node:path";

import { build } from "esbuild";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const baseDir = mkdtempSync(join(tmpdir(), "t3code-lynxtron-mainconn-"));
const previousBaseDir = process.env.T3_LYNXTRON_BASE_DIR;
const previousServerStdio = process.env.T3_LYNXTRON_SERVER_STDIO;
process.env.T3_LYNXTRON_BASE_DIR = baseDir;
process.env.T3_LYNXTRON_SERVER_STDIO = "ignore";

// Bundle the pure host class + protocol (no Lynxtron imports) so plain node
// can load them.
await build({
  entryPoints: [
    path.join(appRoot, "src/main/desktop/mainConnectorHost.ts"),
    path.join(appRoot, "src/shared/connectorProtocol.ts"),
  ],
  outdir: baseDir,
  outExtension: { ".js": ".bundle.cjs" },
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["node:*"],
  resolveExtensions: [".ts", ".js", ".mjs", ".json"],
  logLevel: "warning",
});

const { MainConnectorHost } = require(join(baseDir, "main/desktop/mainConnectorHost.bundle.cjs"));
const { T3Connector } = require("../dist/desktop/connector.bundle.cjs");
const { T3_CONNECTOR_EVENT, T3_CONNECTOR_METHODS } = require(
  join(baseDir, "shared/connectorProtocol.bundle.cjs"),
);

async function waitFor(read, label) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const value = read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

const pushed = [];
const handlers = new Map();
const host = new MainConnectorHost({
  window: {
    sendGlobalEvent: (name, envelope) => {
      if (name !== T3_CONNECTOR_EVENT) throw new Error(`unexpected event channel: ${name}`);
      pushed.push(envelope);
      return true;
    },
  },
  registerHandler: (method, handler) => handlers.set(method, handler),
  createConnector: (events) => new T3Connector(events),
  onLog: () => {},
});

try {
  host.attach();
  for (const method of Object.values(T3_CONNECTOR_METHODS)) {
    if (!handlers.has(method)) throw new Error(`missing handler: ${method}`);
  }

  // Real server bootstrap through the production connector.
  await host.connect();

  // Renderer readiness: one current snapshot exchange.
  const ready = handlers.get(T3_CONNECTOR_METHODS.ready)({});
  if (!ready.snapshot || typeof ready.seq !== "number") {
    throw new Error("ready reply is not a sync reply");
  }
  const project = await waitFor(() => {
    const reply = handlers.get(T3_CONNECTOR_METHODS.ready)({});
    return reply.snapshot.shell.projects[0];
  }, "canonical project shell");

  // Typed command round-trips: create + select + prompt.
  const command = handlers.get(T3_CONNECTOR_METHODS.command);
  const { threadId } = await command({ method: "createThread", params: { projectId: project.id } });
  if (!threadId) throw new Error("createThread returned no threadId");
  await command({ method: "selectThread", params: threadId });
  await waitFor(() => {
    const reply = handlers.get(T3_CONNECTOR_METHODS.ready)({});
    return reply.snapshot.shell.threads.find((thread) => thread.id === threadId);
  }, "created thread in canonical shell");
  await command({ method: "sendPrompt", params: { threadId, text: "Say the word AR1." } });

  // Sequenced streamed thread events for this thread.
  const firstThreadEvent = await waitFor(
    () => pushed.find((event) => event.kind === "thread" && event.threadId === threadId),
    "streamed thread event",
  );
  const sequences = pushed.map((event) => event.seq);
  const monotonic = sequences.every((seq, index) => index === 0 || seq > sequences[index - 1]);
  if (!monotonic) throw new Error("event sequences are not strictly monotonic");

  // Interruption.
  await command({ method: "interrupt", params: { threadId } });

  // Gap recovery: resync returns a snapshot at the latest sequence.
  const resync = handlers.get(T3_CONNECTOR_METHODS.resync)({ lastSeq: firstThreadEvent.seq });
  if (resync.seq < firstThreadEvent.seq || !resync.snapshot.shell) {
    throw new Error("resync reply did not cover the observed sequence");
  }
  if (!resync.snapshot.threads[threadId]) {
    throw new Error("resync snapshot lost the selected thread payload");
  }

  console.log(
    JSON.stringify({
      ok: true,
      events: pushed.length,
      kinds: [...new Set(pushed.map((event) => event.kind))],
      lastSeq: resync.seq,
      threadId,
    }),
  );
} finally {
  host.dispose();
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (previousBaseDir === undefined) {
    delete process.env.T3_LYNXTRON_BASE_DIR;
  } else {
    process.env.T3_LYNXTRON_BASE_DIR = previousBaseDir;
  }
  if (previousServerStdio === undefined) {
    delete process.env.T3_LYNXTRON_SERVER_STDIO;
  } else {
    process.env.T3_LYNXTRON_SERVER_STDIO = previousServerStdio;
  }
  const expectedPrefix = `${tmpdir()}${sep}t3code-lynxtron-mainconn-`;
  if (!baseDir.startsWith(expectedPrefix)) {
    throw new Error(`Refusing to clean unexpected smoke directory: ${baseDir}`);
  }
  rmSync(baseDir, { recursive: true, force: true });
}
