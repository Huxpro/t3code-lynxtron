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
const owner = new T3Connector(ownerObserver.events);
const attempts = [];

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
  const pairing = await owner.createPairingCredential({ label: "Lynxtron remote reconnect smoke" });
  process.env.T3_LYNXTRON_PAIRING_URL = `http://127.0.0.1:${ownerPort}/pair#token=${encodeURIComponent(pairing.credential)}`;

  // First connection, then the Reconnect action: a fresh connector re-resolved
  // from the same launch environment, as MainConnectorHost does.
  for (const label of ["initial", "reconnect-1", "reconnect-2"]) {
    const observer = createObserver(label);
    const connector = new T3Connector(observer.events);
    try {
      await connector.connect();
      await waitFor(
        () => observer.state.shell.projects.some((candidate) => candidate.id === project.id),
        `${label} project projection`,
      );
      attempts.push({ label, status: "ready" });
    } catch (error) {
      attempts.push({
        label,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      connector.dispose();
    }
  }
  // Reverse state: the owner revokes other sessions; reconnect must report
  // the pairing layer, not a raw transport or token error.
  await owner.revokeOtherClientSessions();
  const revokedObserver = createObserver("after-revoke");
  const revoked = new T3Connector(revokedObserver.events);
  let revokedError = null;
  try {
    await revoked.connect();
  } catch (error) {
    revokedError = error instanceof Error ? error.message : String(error);
  } finally {
    revoked.dispose();
  }
  attempts.push({
    label: "after-revoke",
    status: revokedError ? "error" : "ready",
    error: revokedError,
  });
  const pass =
    attempts.slice(0, 3).every((attempt) => attempt.status === "ready") &&
    typeof revokedError === "string" &&
    revokedError.includes("Pair this device again");
  process.stdout.write(
    `${JSON.stringify({ status: pass ? "pass" : "fail", ownerPort, attempts }, null, 2)}\n`,
  );
  if (!pass) process.exitCode = 1;
} finally {
  owner.dispose();
  restoreEnvironment();
  rmSync(baseDir, { recursive: true, force: true });
  rmSync(workspaceRoot, { recursive: true, force: true });
}
