#!/usr/bin/env node

// Plan 14 M3: packaged Native completes the essential agent journey against a
// paired existing environment owned by another process. The owner connector
// serves a copy of the fixture, issues a pairing credential, and afterwards
// confirms the thread Native created landed on its environment.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { enableOpenCodeInFixtureState } from "./fixture-provider-defaults.mjs";

const require = createRequire(import.meta.url);
const appRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(appRoot, "../..");
const { T3Connector } = require(path.join(appRoot, "dist/desktop/connector.bundle.cjs"));

const sourceFixture = process.argv[2];
const outputPath = process.argv[3];
if (!sourceFixture || !outputPath) {
  throw new Error("Usage: remote-environment-native-journey.mjs <fixture-dir> <output.json>");
}
const runRoot = mkdtempSync(path.join(tmpdir(), "t3-remote-native-journey-"));
const stateDir = path.join(runRoot, "state");
const pairingUrlFile = path.join(runRoot, "pairing-url.txt");
const nativeReport = path.join(runRoot, "native", "report.json");
cpSync(path.resolve(sourceFixture), stateDir, { recursive: true });
enableOpenCodeInFixtureState(stateDir);
const manifest = JSON.parse(readFileSync(path.join(stateDir, "visual-state.json"), "utf8"));
const workspaceRoot = manifest.project?.workspaceRoot;
if (typeof workspaceRoot !== "string") throw new Error("Fixture needs project.workspaceRoot.");

let shell = { projects: [], threads: [] };
const statuses = [];
const owner = new T3Connector({
  onStatus: (status, detail) => statuses.push({ status, detail }),
  onConfig: () => {},
  onAccess: () => {},
  onShell: (next) => {
    shell = next;
  },
  onThread: () => {},
  onLog: () => {},
});

async function waitFor(read, label, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let latest;
  while (Date.now() < deadline) {
    latest = read();
    if (latest) return latest;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(latest)}`);
}

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("exit", (code) => resolve({ code, output }));
  });
}

const previousEnvironment = { ...process.env };
try {
  process.env.T3_LYNXTRON_BASE_DIR = stateDir;
  process.env.T3_LYNXTRON_PROJECT_CWD = workspaceRoot;
  process.env.T3_LYNXTRON_SERVER_STDIO = "ignore";
  delete process.env.T3_LYNXTRON_PAIRING_URL;
  await owner.connect();
  const ownerPort = await waitFor(() => {
    const detail = statuses.find(({ status }) => status === "starting-server")?.detail;
    return Number(detail?.match(/:(\d+)$/u)?.[1]) || null;
  }, "owner server port");
  const pairing = await owner.createPairingCredential({ label: "Lynxtron remote journey" });
  writeFileSync(
    pairingUrlFile,
    `http://127.0.0.1:${ownerPort}/pair#token=${encodeURIComponent(pairing.credential)}\n`,
    { mode: 0o600 },
  );
  const native = await run(process.execPath, [
    path.join(appRoot, "scripts/verify-packaged-readiness.mjs"),
    "--fixture-dir",
    stateDir,
    "--project-cwd",
    workspaceRoot,
    "--output",
    nativeReport,
    "--runs",
    "1",
    "--width",
    "1280",
    "--height",
    "820",
    "--pairing-url-file",
    pairingUrlFile,
    "--verify-remote-journey",
    "--timeout-ms",
    "90000",
  ]);
  const report = JSON.parse(readFileSync(nativeReport, "utf8"));
  const result = report.results?.[0];
  const journey = result?.remoteJourney;
  const ownerThread = journey
    ? await waitFor(
        () => shell.threads.find((thread) => thread.id === journey.threadId) ?? null,
        "owner sees the remote thread",
      ).catch(() => null)
    : null;
  const pass =
    native.code === 0 &&
    result?.status === "pass" &&
    result.connection?.mode === "existing-environment" &&
    result.connection?.serverOwned === false &&
    ownerThread !== null;
  const summary = {
    schemaVersion: 1,
    status: pass ? "pass" : "fail",
    recordedAt: new Date().toISOString(),
    mode: "direct remote (loopback pairing URL to a server owned by another process)",
    ownerPort,
    connection: result?.connection ?? null,
    rendererErrors: result?.rendererErrors ?? null,
    bundle: report.bundle ?? null,
    journey: journey ?? null,
    ownerThread: ownerThread
      ? { id: ownerThread.id, projectId: ownerThread.projectId, title: ownerThread.title }
      : null,
    error: result?.error ?? (native.code === 0 ? null : native.output.slice(-800)),
  };
  writeFileSync(path.resolve(outputPath), `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (!pass) process.exitCode = 1;
} finally {
  owner.dispose();
  for (const key of [
    "T3_LYNXTRON_BASE_DIR",
    "T3_LYNXTRON_PROJECT_CWD",
    "T3_LYNXTRON_SERVER_STDIO",
  ]) {
    if (previousEnvironment[key] === undefined) delete process.env[key];
    else process.env[key] = previousEnvironment[key];
  }
  rmSync(runRoot, { recursive: true, force: true });
}
