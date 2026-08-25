#!/usr/bin/env node

import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const appRoot = path.resolve(import.meta.dirname, "..");
const { T3Connector } = require(path.join(appRoot, "dist/desktop/connector.bundle.cjs"));
const baseDir = mkdtempSync(path.join(tmpdir(), "t3-shared-environment-smoke-"));
const workspaceRoot = mkdtempSync(path.join(tmpdir(), "t3-shared-environment-project-"));

const previous = {
  baseDir: process.env.T3_LYNXTRON_BASE_DIR,
  pairingUrl: process.env.T3_LYNXTRON_PAIRING_URL,
  projectCwd: process.env.T3_LYNXTRON_PROJECT_CWD,
  serverStdio: process.env.T3_LYNXTRON_SERVER_STDIO,
};

function restoreEnvironment() {
  const entries = [
    ["T3_LYNXTRON_BASE_DIR", previous.baseDir],
    ["T3_LYNXTRON_PAIRING_URL", previous.pairingUrl],
    ["T3_LYNXTRON_PROJECT_CWD", previous.projectCwd],
    ["T3_LYNXTRON_SERVER_STDIO", previous.serverStdio],
  ];
  for (const [key, value] of entries) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function createObserver(label) {
  const state = { label, statuses: [], shell: { projects: [], threads: [] }, logs: [] };
  return {
    state,
    events: {
      onStatus: (status, detail) => state.statuses.push({ status, detail }),
      onConfig: () => {},
      onAccess: () => {},
      onShell: (shell) => {
        state.shell = shell;
      },
      onThread: () => {},
      onLog: (line) => state.logs.push(line),
    },
  };
}

async function waitFor(read, label, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let latest;
  while (Date.now() < deadline) {
    latest = read();
    if (latest) return latest;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(latest)}`);
}

const ownerObserver = createObserver("owner");
const attachedObserver = createObserver("attached");
const owner = new T3Connector(ownerObserver.events);
const attached = new T3Connector(attachedObserver.events);

try {
  process.env.T3_LYNXTRON_BASE_DIR = baseDir;
  process.env.T3_LYNXTRON_PROJECT_CWD = workspaceRoot;
  process.env.T3_LYNXTRON_SERVER_STDIO = "ignore";
  delete process.env.T3_LYNXTRON_PAIRING_URL;

  await owner.connect();
  const ownerPort = await waitFor(() => {
    const detail = ownerObserver.state.statuses.find(
      ({ status }) => status === "starting-server",
    )?.detail;
    const match = detail?.match(/:(\d+)$/u);
    return match ? Number(match[1]) : null;
  }, "owned server port");
  const project = await waitFor(
    () => ownerObserver.state.shell.projects[0] ?? null,
    "owner project",
  );
  const pairing = await owner.createPairingCredential({ label: "Lynxtron shared-server smoke" });
  process.env.T3_LYNXTRON_PAIRING_URL = `http://127.0.0.1:${ownerPort}/pair#token=${encodeURIComponent(pairing.credential)}`;

  await attached.connect();
  await waitFor(
    () => attachedObserver.state.shell.projects.some((candidate) => candidate.id === project.id),
    "attached project projection",
  );

  const { threadId } = await owner.createThread({
    projectId: project.id,
    title: "Shared environment initial",
  });
  await waitFor(
    () =>
      attachedObserver.state.shell.threads.find(
        (thread) => thread.id === threadId && thread.title === "Shared environment initial",
      ) ?? null,
    "owner-created thread in attached client",
  );

  await attached.renameThread({ threadId, title: "Renamed from attached client" });
  await waitFor(
    () =>
      ownerObserver.state.shell.threads.find(
        (thread) => thread.id === threadId && thread.title === "Renamed from attached client",
      ) ?? null,
    "attached rename in owner client",
  );

  await owner.renameThread({ threadId, title: "Renamed from owner client" });
  await waitFor(
    () =>
      attachedObserver.state.shell.threads.find(
        (thread) => thread.id === threadId && thread.title === "Renamed from owner client",
      ) ?? null,
    "owner rename in attached client",
  );

  attached.dispose();
  await owner.renameThread({ threadId, title: "Owner survives attached dispose" });
  await waitFor(
    () =>
      ownerObserver.state.shell.threads.find(
        (thread) => thread.id === threadId && thread.title === "Owner survives attached dispose",
      ) ?? null,
    "owner mutation after attached dispose",
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        status: "pass",
        baseDir,
        ownerPort,
        projectId: project.id,
        threadId,
        ownerStatusKinds: ownerObserver.state.statuses.map(({ status }) => status),
        attachedStatusKinds: attachedObserver.state.statuses.map(({ status }) => status),
        attachedStartedServer: attachedObserver.state.statuses.some(
          ({ status }) => status === "starting-server",
        ),
        finalTitle: "Owner survives attached dispose",
      },
      null,
      2,
    )}\n`,
  );
} finally {
  attached.dispose();
  owner.dispose();
  restoreEnvironment();
  rmSync(baseDir, { recursive: true, force: true });
  rmSync(workspaceRoot, { recursive: true, force: true });
}
