#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import {
  cpSync,
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(appRoot, "../..");
const retainedPath =
  process.env.T3_MTS_PRODUCT_RETAINED_PATH ??
  path.join(os.tmpdir(), "t3-mts-product-retained.json");
const sourceRoot =
  process.env.T3_MTS_PRODUCT_SOURCE_ROOT ?? path.join(os.homedir(), ".t3-lynxtron");
const projectCwd = process.env.T3_MTS_PRODUCT_PROJECT_CWD ?? repoRoot;

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function executablePath() {
  const packageJson = import.meta.resolve("@lynx-js/lynxtron/package.json");
  const packageRoot = path.dirname(fileURLToPath(packageJson));
  return path.join(packageRoot, "dist/Lynxtron.app/Contents/MacOS/lynxtron");
}

function processCommand(processId) {
  const result = spawnSync("ps", ["-p", String(processId), "-o", "command="], {
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`Owned MTS product PID ${processId} is unavailable.`);
  return result.stdout.trim();
}

function createIsolatedState(stateDir) {
  const sourceDatabase = path.join(sourceRoot, "userdata/state.sqlite");
  const targetUserdata = path.join(stateDir, "userdata");
  mkdirSync(targetUserdata, { recursive: true });
  const targetDatabase = path.join(targetUserdata, "state.sqlite");
  const code = `new (require("bun:sqlite").Database)(${JSON.stringify(
    sourceDatabase,
  )}, { readonly: true }).run("VACUUM INTO '" + ${JSON.stringify(targetDatabase)} + "'")`;
  const snapshot = spawnSync("bun", ["-e", code], { encoding: "utf8" });
  if (snapshot.status !== 0) {
    throw new Error(snapshot.stderr || "Could not snapshot MTS product fixture.");
  }
  for (const relativePath of [
    "lynxtron-prefs.json",
    "caches",
    "userdata/environment-id",
    "userdata/keybindings.json",
  ]) {
    const source = path.join(sourceRoot, relativePath);
    if (existsSync(source)) {
      cpSync(source, path.join(stateDir, relativePath), { recursive: true });
    }
  }
}

async function waitForReadiness(child, readinessReportPath, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("MTS product app exited before DevTool became ready.");
    }
    if (existsSync(readinessReportPath)) {
      try {
        const value = JSON.parse(readFileSync(readinessReportPath, "utf8"));
        if (value.status === "ready" && value.transport?.kind === "main") return value;
      } catch {
        // Atomic writer may not have published the first complete report yet.
      }
    }
    await wait(100);
  }
  throw new Error("Timed out waiting for the MTS product app readiness report.");
}

async function stop() {
  const retained = JSON.parse(readFileSync(retainedPath, "utf8"));
  let processExists = true;
  try {
    const command = processCommand(retained.processId);
    if (!command.includes(retained.desktopDir)) {
      throw new Error(`Refusing MTS product PID ${retained.processId}: identity drift.`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("is unavailable")) {
      processExists = false;
    } else {
      throw error;
    }
  }
  if (processExists) {
    process.kill(retained.processId, "SIGINT");
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        process.kill(retained.processId, 0);
        await wait(100);
      } catch {
        break;
      }
    }
  }
  rmSync(retained.root, { recursive: true, force: true });
  rmSync(retainedPath, { force: true });
  console.log(JSON.stringify({ stopped: true, processId: retained.processId }, null, 2));
}

async function main() {
  if (process.argv.includes("--stop")) {
    await stop();
    return;
  }
  if (existsSync(retainedPath)) {
    throw new Error(`Retained MTS product state already exists: ${retainedPath}`);
  }
  const root = mkdtempSync(path.join(os.tmpdir(), "t3-mts-product-"));
  const desktopDir = path.join(root, "desktop");
  const stateDir = path.join(root, "state");
  const logPath = path.join(root, "lynxtron.log");
  const readinessReportPath = path.join(root, "native-readiness.json");
  cpSync(path.join(appRoot, "dist/desktop"), desktopDir, { recursive: true });
  createIsolatedState(stateDir);
  const logFd = openSync(logPath, "a");
  const child = spawn(executablePath(), [desktopDir], {
    cwd: appRoot,
    detached: true,
    env: {
      ...process.env,
      NODE_ENV: "production",
      T3_LYNXTRON_BASE_DIR: stateDir,
      T3_LYNXTRON_PROJECT_CWD: projectCwd,
      T3_LYNXTRON_READINESS_REPORT: readinessReportPath,
      T3_LYNXTRON_VIEWPORT_WIDTH: "1280",
      T3_LYNXTRON_VIEWPORT_HEIGHT: "820",
      T3_LYNXTRON_WINDOW_X: "20",
      T3_LYNXTRON_WINDOW_Y: "60",
      T3_LYNXTRON_VIEWPORT_PROBE: "1",
    },
    stdio: ["ignore", logFd, logFd],
  });
  closeSync(logFd);
  if (!child.pid) throw new Error("MTS product app did not return an owned PID.");
  child.unref();
  try {
    const readiness = await waitForReadiness(child, readinessReportPath, 30_000);
    writeFileSync(
      retainedPath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          root,
          desktopDir,
          stateDir,
          sourceRoot,
          projectCwd,
          logPath,
          readinessReportPath,
          processId: child.pid,
          readiness,
        },
        null,
        2,
      )}\n`,
    );
    console.log(
      JSON.stringify(
        {
          retained: true,
          processId: child.pid,
          statePath: retainedPath,
          readiness,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    process.kill(child.pid, "SIGINT");
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

await main();
