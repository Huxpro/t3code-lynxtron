#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const appRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(appRoot, "../..");
const { T3Connector } = require(path.join(appRoot, "dist/desktop/connector.bundle.cjs"));
const sourceFixture = process.argv.slice(2).find((argument) => argument !== "--");
if (!sourceFixture) {
  throw new Error("Usage: shared-environment-native-smoke.mjs <fixture-dir>");
}

const runRoot = mkdtempSync(path.join(tmpdir(), "t3-shared-environment-native-"));
const stateDir = path.join(runRoot, "state");
const outputDir = path.join(runRoot, "native");
const pairingUrlFile = path.join(runRoot, "pairing-url.txt");
const reportPath = path.join(outputDir, "report.json");
cpSync(path.resolve(sourceFixture), stateDir, { recursive: true });

const manifestPath = path.join(stateDir, "visual-state.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const threadId = manifest.transcriptFixture?.threadId ?? manifest.idleThreadFixture?.threadId;
if (typeof threadId !== "string") {
  throw new Error("Shared Native smoke requires a fixture thread id.");
}
const sharedTitle = `Shared Native thread ${Date.now()}`;
const finalTitle = `${sharedTitle} owner survived`;
manifest.sidebarFixture = { ...(manifest.sidebarFixture ?? {}), titles: [sharedTitle] };
manifest.transcriptFixture = manifest.transcriptFixture
  ? { ...manifest.transcriptFixture, title: sharedTitle }
  : manifest.transcriptFixture;
manifest.idleThreadFixture = manifest.idleThreadFixture
  ? { ...manifest.idleThreadFixture, title: sharedTitle }
  : manifest.idleThreadFixture;
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const previous = {
  baseDir: process.env.T3_LYNXTRON_BASE_DIR,
  pairingUrl: process.env.T3_LYNXTRON_PAIRING_URL,
  projectCwd: process.env.T3_LYNXTRON_PROJECT_CWD,
  serverStdio: process.env.T3_LYNXTRON_SERVER_STDIO,
};
function restoreEnvironment() {
  for (const [key, value] of Object.entries({
    T3_LYNXTRON_BASE_DIR: previous.baseDir,
    T3_LYNXTRON_PAIRING_URL: previous.pairingUrl,
    T3_LYNXTRON_PROJECT_CWD: previous.projectCwd,
    T3_LYNXTRON_SERVER_STDIO: previous.serverStdio,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

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

async function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Command failed code=${code} signal=${signal}: ${stderr || stdout}`));
    });
  });
}

try {
  process.env.T3_LYNXTRON_BASE_DIR = stateDir;
  process.env.T3_LYNXTRON_PROJECT_CWD = repoRoot;
  process.env.T3_LYNXTRON_SERVER_STDIO = "ignore";
  delete process.env.T3_LYNXTRON_PAIRING_URL;

  await owner.connect();
  const ownerPort = await waitFor(() => {
    const detail = statuses.find(({ status }) => status === "starting-server")?.detail;
    const match = detail?.match(/:(\d+)$/u);
    return match ? Number(match[1]) : null;
  }, "owner server port");
  await owner.renameThread({ threadId, title: sharedTitle });
  await waitFor(
    () => shell.threads.find((thread) => thread.id === threadId && thread.title === sharedTitle),
    "owner rename",
  );
  const pairing = await owner.createPairingCredential({ label: "Lynxtron Native shared thread" });
  writeFileSync(
    pairingUrlFile,
    `http://127.0.0.1:${ownerPort}/pair#token=${encodeURIComponent(pairing.credential)}\n`,
    { mode: 0o600 },
  );

  await runCommand(process.execPath, [
    path.join(appRoot, "scripts/verify-packaged-readiness.mjs"),
    "--fixture-dir",
    stateDir,
    "--project-cwd",
    repoRoot,
    "--output",
    reportPath,
    "--runs",
    "1",
    "--width",
    "1280",
    "--height",
    "820",
    "--expected-theme",
    "dark",
    "--pairing-url-file",
    pairingUrlFile,
    "--timeout-ms",
    "60000",
  ]);

  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const native = report.results?.[0];
  if (
    report.status !== "pass" ||
    native?.connection?.mode !== "existing-environment" ||
    native.connection.serverOwned !== false ||
    native.canonicalState?.canonicalThreadTitle !== sharedTitle
  ) {
    throw new Error(`Native shared-environment verification failed: ${JSON.stringify(report)}`);
  }

  await owner.renameThread({ threadId, title: finalTitle });
  await waitFor(
    () => shell.threads.find((thread) => thread.id === threadId && thread.title === finalTitle),
    "owner mutation after Native exit",
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        status: "pass",
        ownerPort,
        threadId,
        nativeProcessId: native.processId,
        nativeConnection: native.connection,
        nativeCanonicalTitle: native.canonicalState.canonicalThreadTitle,
        finalOwnerTitle: finalTitle,
        reportPath,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  owner.dispose();
  restoreEnvironment();
  rmSync(pairingUrlFile, { force: true });
}
