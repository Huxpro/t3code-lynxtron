import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";

const require = createRequire(import.meta.url);
const baseDir = mkdtempSync(join(tmpdir(), "t3code-lynxtron-composer-"));
const previousBaseDir = process.env.T3_LYNXTRON_BASE_DIR;
const previousServerStdio = process.env.T3_LYNXTRON_SERVER_STDIO;
process.env.T3_LYNXTRON_BASE_DIR = baseDir;
process.env.T3_LYNXTRON_SERVER_STDIO = "ignore";

const { T3Connector } = require("../dist/desktop/connector.bundle.cjs");
let latestShell = { projects: [], threads: [] };
const connector = new T3Connector({
  onStatus: () => {},
  onConfig: () => {},
  onShell: (shell) => {
    latestShell = shell;
  },
  onThread: () => {},
  onLog: () => {},
});

async function waitFor(read, label) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const value = read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

try {
  const connected = await connector.connect();
  if (connected.status !== "ready") {
    throw new Error(`Connector did not become ready: ${connected.status}`);
  }

  const project = await waitFor(() => latestShell.projects[0], "canonical project shell");
  const { threadId } = await connector.createThread({ projectId: project.id });
  await waitFor(
    () => latestShell.threads.find((thread) => thread.id === threadId),
    "created thread shell",
  );

  await connector.setThreadRuntimeMode({
    threadId,
    runtimeMode: "approval-required",
  });
  await connector.setThreadInteractionMode({
    threadId,
    interactionMode: "plan",
  });
  const updated = await waitFor(() => {
    const thread = latestShell.threads.find((candidate) => candidate.id === threadId);
    return thread?.runtimeMode === "approval-required" && thread.interactionMode === "plan"
      ? thread
      : undefined;
  }, "updated composer controls");

  await connector.setThreadRuntimeMode({ threadId, runtimeMode: "full-access" });
  await connector.setThreadInteractionMode({ threadId, interactionMode: "default" });
  const restored = await waitFor(() => {
    const thread = latestShell.threads.find((candidate) => candidate.id === threadId);
    return thread?.runtimeMode === "full-access" && thread.interactionMode === "default"
      ? thread
      : undefined;
  }, "restored composer controls");

  console.log(
    JSON.stringify({
      ok: true,
      status: connected.status,
      updated: {
        runtimeMode: updated.runtimeMode,
        interactionMode: updated.interactionMode,
      },
      restored: {
        runtimeMode: restored.runtimeMode,
        interactionMode: restored.interactionMode,
      },
    }),
  );
} finally {
  connector.dispose();
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
  const expectedPrefix = `${tmpdir()}${sep}t3code-lynxtron-composer-`;
  if (!baseDir.startsWith(expectedPrefix)) {
    throw new Error(`Refusing to clean unexpected smoke directory: ${baseDir}`);
  }
  rmSync(baseDir, { recursive: true, force: true });
}
