#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const appRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(appRoot, "../..");
const retainedPath =
  process.env.T3_MTS_PRODUCT_RETAINED_PATH ??
  path.join(os.tmpdir(), "t3-mts-product-retained.json");
const sourceRoot =
  process.env.T3_MTS_PRODUCT_SOURCE_ROOT ?? path.join(os.homedir(), ".t3-lynxtron");
const projectCwd = process.env.T3_MTS_PRODUCT_PROJECT_CWD ?? repoRoot;
const viewportWidth = process.env.T3_MTS_PRODUCT_VIEWPORT_WIDTH ?? "1280";
const viewportHeight = process.env.T3_MTS_PRODUCT_VIEWPORT_HEIGHT ?? "820";
const windowX = process.env.T3_MTS_PRODUCT_WINDOW_X ?? "20";
const windowY = process.env.T3_MTS_PRODUCT_WINDOW_Y ?? "60";
const initialRoute = process.env.T3_MTS_PRODUCT_INITIAL_ROUTE?.trim();
const initialOverlay = process.env.T3_MTS_PRODUCT_INITIAL_OVERLAY?.trim();
const expectedThreadId = process.env.T3_MTS_PRODUCT_EXPECTED_THREAD_ID?.trim();

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

export function createIsolatedState(stateDir, options = { sourceRoot, expectedThreadId }) {
  const sourceDatabase = path.join(options.sourceRoot, "userdata/state.sqlite");
  const targetUserdata = path.join(stateDir, "userdata");
  mkdirSync(targetUserdata, { recursive: true });
  const targetDatabase = path.join(targetUserdata, "state.sqlite");
  const source = new DatabaseSync(sourceDatabase, { readOnly: true });
  try {
    source.exec(`VACUUM INTO '${targetDatabase.replaceAll("'", "''")}'`);
  } finally {
    source.close();
  }
  if (!existsSync(targetDatabase)) {
    throw new Error("MTS product snapshot did not materialize its target database.");
  }
  const database = new DatabaseSync(targetDatabase, { readOnly: true });
  let snapshotIdentity;
  try {
    snapshotIdentity = {
      sha256: createHash("sha256").update(readFileSync(targetDatabase)).digest("hex"),
      eventCount: Number(
        database.prepare("SELECT COUNT(*) AS count FROM orchestration_events").get().count,
      ),
      projectIds: database
        .prepare(
          "SELECT project_id AS id FROM projection_projects WHERE deleted_at IS NULL ORDER BY project_id",
        )
        .all()
        .map((row) => row.id),
      threadIds: database
        .prepare(
          "SELECT thread_id AS id FROM projection_threads WHERE deleted_at IS NULL ORDER BY thread_id",
        )
        .all()
        .map((row) => row.id),
    };
  } finally {
    database.close();
  }
  if (options.expectedThreadId && !snapshotIdentity.threadIds.includes(options.expectedThreadId)) {
    throw new Error(`MTS product snapshot is missing expected thread ${options.expectedThreadId}.`);
  }
  for (const relativePath of [
    "lynxtron-prefs.json",
    "caches",
    "userdata/environment-id",
    "userdata/keybindings.json",
  ]) {
    const source = path.join(options.sourceRoot, relativePath);
    if (existsSync(source)) {
      cpSync(source, path.join(stateDir, relativePath), { recursive: true });
    }
  }
  if (initialRoute || initialOverlay) {
    const prefsPath = path.join(stateDir, "lynxtron-prefs.json");
    let prefs = {};
    try {
      prefs = JSON.parse(readFileSync(prefsPath, "utf8"));
    } catch {
      // A fresh isolated source may not have preferences yet.
    }
    writeFileSync(
      prefsPath,
      JSON.stringify(
        {
          ...prefs,
          ...(initialRoute ? { initialRoute } : {}),
          ...(initialOverlay ? { initialOverlay } : {}),
        },
        null,
        2,
      ) + "\n",
    );
  }
  return snapshotIdentity;
}

export function isExpectedReadiness(value, expectedThread = expectedThreadId) {
  return (
    value?.status === "ready" &&
    value.transport?.kind === "main" &&
    (!expectedThread ||
      Boolean(value.threads?.some((thread) => thread.id === expectedThread)) ||
      Boolean(value.archivedThreads?.some((thread) => thread.id === expectedThread)))
  );
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
        if (isExpectedReadiness(value)) {
          return value;
        }
      } catch {
        // Atomic writer may not have published the first complete report yet.
      }
    }
    await wait(100);
  }
  throw new Error("Timed out waiting for the MTS product app readiness report.");
}

async function stop() {
  if (!existsSync(retainedPath)) {
    console.log(JSON.stringify({ stopped: false, reason: "not-retained" }, null, 2));
    return;
  }
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
  let snapshotIdentity;
  try {
    cpSync(path.join(appRoot, "dist/desktop"), desktopDir, { recursive: true });
    snapshotIdentity = createIsolatedState(stateDir);
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
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
      T3_LYNXTRON_VIEWPORT_WIDTH: viewportWidth,
      T3_LYNXTRON_VIEWPORT_HEIGHT: viewportHeight,
      T3_LYNXTRON_WINDOW_X: windowX,
      T3_LYNXTRON_WINDOW_Y: windowY,
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
          snapshotIdentity,
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

const IS_MAIN_MODULE =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (IS_MAIN_MODULE) await main();
