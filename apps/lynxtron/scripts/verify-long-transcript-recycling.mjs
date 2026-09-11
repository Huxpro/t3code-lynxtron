#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { openOwnedDevToolSession, readOwnedListeningTcpPorts } from "./devtool-client-identity.mjs";
import { verifyTranscriptRecycling } from "./transcript-recycling-gate.mjs";

const require = createRequire(import.meta.url);
const appRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(appRoot, "../..");
const defaultDevToolCli = path.join(os.homedir(), ".agents/skills/lynx-devtool/scripts/index.mjs");

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function resolveExecutable() {
  return require("@lynx-js/lynxtron/native-paths").getExecutablePath("devtool");
}

function readHead() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(result.stderr || "Could not resolve git HEAD.");
  return result.stdout.trim();
}

async function waitFor(read, label, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await read();
    if (latest) return latest;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(latest)}`);
}

function waitForChildExit(child, timeoutMs) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolveWait) => {
    const timer = setTimeout(() => resolveWait(false), timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolveWait(true);
    });
  });
}

async function stopOwnedChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGINT");
  if (await waitForChildExit(child, 5_000)) return;
  child.kill("SIGTERM");
  if (await waitForChildExit(child, 2_000)) return;
  child.kill("SIGKILL");
  await waitForChildExit(child, 5_000);
}

function rendererErrors({ clientId, sessionId, devToolCli }) {
  const result = spawnSync(
    process.execPath,
    [
      devToolCli,
      "--no-daemon",
      "get-console",
      "--client",
      clientId,
      "--session",
      String(sessionId),
      "--level",
      "error",
      "--limit",
      "100",
      "--include-stack-traces",
    ],
    { cwd: appRoot, encoding: "utf8" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || `Lynx DevTool console exited ${result.status}.`);
  }
  return result.stdout.trim();
}

const fixtureDir = path.resolve(argumentValue("--fixture-dir") ?? "");
const output = path.resolve(argumentValue("--output") ?? "");
const desktopDir = path.resolve(
  argumentValue("--desktop-dir") ?? path.join(appRoot, "dist/desktop"),
);
const bundle = path.resolve(argumentValue("--bundle") ?? path.join(desktopDir, "main.lynx.bundle"));
const projectCwd = path.resolve(argumentValue("--project-cwd") ?? repoRoot);
const timeoutMs = Number(argumentValue("--timeout-ms") ?? "60000");
const width = Number(argumentValue("--width") ?? "1280");
const height = Number(argumentValue("--height") ?? "820");
const devToolCli = path.resolve(
  argumentValue("--devtool-cli") ?? process.env.LYNX_DEVTOOL_CLI ?? defaultDevToolCli,
);
if (!argumentValue("--fixture-dir") || !argumentValue("--output")) {
  throw new Error("--fixture-dir and --output are required.");
}
for (const required of [
  desktopDir,
  bundle,
  devToolCli,
  path.join(fixtureDir, "visual-state.json"),
]) {
  if (!existsSync(required)) throw new Error(`Required path is missing: ${required}`);
}
const manifest = JSON.parse(readFileSync(path.join(fixtureDir, "visual-state.json"), "utf8"));
const fixture = manifest.longTranscriptFixture;
if (
  typeof fixture?.threadId !== "string" ||
  typeof fixture?.title !== "string" ||
  !Number.isInteger(fixture.expectedTimelineRowCount) ||
  fixture.expectedTimelineRowCount < 100
) {
  throw new Error("Fixture manifest does not contain a valid longTranscriptFixture.");
}
const readinessPath = `${output}.readiness.json`;
const executable = resolveExecutable();
const child = spawn(executable, [desktopDir], {
  cwd: appRoot,
  env: {
    ...process.env,
    NODE_ENV: "production",
    T3_LYNXTRON_BASE_DIR: fixtureDir,
    T3_LYNXTRON_PROJECT_CWD: projectCwd,
    T3_LYNXTRON_VIEWPORT_WIDTH: String(width),
    T3_LYNXTRON_VIEWPORT_HEIGHT: String(height),
    T3_LYNXTRON_VIEWPORT_PROBE: "1",
    T3_LYNXTRON_READINESS_REPORT: readinessPath,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let spawnError = null;
child.once("error", (error) => {
  spawnError = error;
});
await new Promise((resolveWait) => setTimeout(resolveWait, 0));
if (!Number.isInteger(child.pid) || child.pid <= 0) {
  throw new Error(
    `Lynxtron did not return an owned process id: ${
      spawnError instanceof Error ? spawnError.message : executable
    }`,
  );
}
let processLog = "";
child.stdout.on("data", (chunk) => {
  processLog += String(chunk);
});
child.stderr.on("data", (chunk) => {
  processLog += String(chunk);
});
let client;
let report;
try {
  const readiness = await waitFor(
    () => {
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`Owned Lynxtron exited before readiness: ${processLog}`);
      }
      if (!existsSync(readinessPath)) return null;
      try {
        const value = JSON.parse(readFileSync(readinessPath, "utf8"));
        const expectedThread = value.threads?.some(
          (thread) => thread.id === fixture.threadId && thread.title === fixture.title,
        );
        return value.status === "ready" &&
          value.transport?.kind === "main" &&
          Number.isInteger(value.transport.lastSeq) &&
          value.transport.lastSeq >= 0 &&
          value.activeThreadId === fixture.threadId &&
          expectedThread
          ? value
          : null;
      } catch {
        return null;
      }
    },
    "semantic Native readiness",
    timeoutMs,
  );
  const ownedPorts = readOwnedListeningTcpPorts(child.pid);
  client = await openOwnedDevToolSession({
    appName: "@t3tools/lynxtron",
    devToolCli,
    ownedPorts,
  });
  const expectedBundleUrl = pathToFileURL(bundle).href;
  if (client.identity.bundleUrl !== expectedBundleUrl) {
    throw new Error(
      `Owned session loaded ${String(client.identity.bundleUrl)}; expected ${expectedBundleUrl}.`,
    );
  }
  const recycling = await verifyTranscriptRecycling({
    runCdp: client.runCdp,
    minimumRowCount: 100,
    expectedRowCount: fixture.expectedTimelineRowCount,
    timeoutMs: Math.min(timeoutMs, 10_000),
  });
  const geometryResponse = await client.runCdp("Runtime.evaluate", {
    expression:
      "JSON.stringify({minimapItemCount:globalThis.__T3_LYNXTRON_TRANSCRIPT_MINIMAP_COUNT__?.() ?? null})",
    returnByValue: true,
  });
  const geometryValue =
    geometryResponse?.result?.result?.value ?? geometryResponse?.result?.value ?? null;
  const geometry = typeof geometryValue === "string" ? JSON.parse(geometryValue) : null;
  const errors = rendererErrors({
    clientId: client.identity.clientId,
    sessionId: client.identity.sessionId,
    devToolCli,
  });
  if (errors) throw new Error(`Renderer errors were reported:\n${errors}`);
  report = {
    schemaVersion: 1,
    status: "pass",
    recordedAt: new Date().toISOString(),
    head: readHead(),
    executable,
    ownedProcessId: child.pid,
    desktopDir,
    bundle: { path: bundle, sha256: sha256(bundle) },
    fixture: {
      path: fixtureDir,
      snapshotId: manifest.snapshotId,
      threadId: fixture.threadId,
      title: fixture.title,
      expectedTimelineRowCount: fixture.expectedTimelineRowCount,
      backendBehaviorClaimed: false,
    },
    viewport: { width, height },
    readiness,
    devtool: client.identity,
    recycling,
    geometry,
    rendererErrors: [],
  };
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  await client?.close();
  await stopOwnedChild(child);
}
