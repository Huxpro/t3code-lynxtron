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
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { openOwnedDevToolSession, readOwnedListeningTcpPorts } from "./devtool-client-identity.mjs";

const appRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(appRoot, "../..");
const retainedPath =
  process.env.T3_MTS_PRODUCT_RETAINED_PATH ??
  path.join(os.tmpdir(), "t3-mts-product-retained.json");
const devToolCli = path.join(os.homedir(), ".agents/skills/lynx-devtool/scripts/index.mjs");

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
  const sourceRoot = path.join(os.homedir(), ".t3-lynxtron");
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

async function waitForClient(child, expectedBundle, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const expectedBundleUrl = pathToFileURL(realpathSync(expectedBundle)).href;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("MTS product app exited before DevTool became ready.");
    }
    try {
      const client = await openOwnedDevToolSession({
        appName: "@t3tools/lynxtron",
        devToolCli,
        ownedPorts: readOwnedListeningTcpPorts(child.pid),
      });
      if (client.identity.bundleUrl !== expectedBundleUrl) {
        await client.close();
        throw new Error(`Unexpected MTS product bundle ${String(client.identity.bundleUrl)}`);
      }
      return client;
    } catch (error) {
      lastError = error;
      await wait(100);
    }
  }
  throw lastError ?? new Error("Timed out waiting for the MTS product app.");
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
      T3_LYNXTRON_PROJECT_CWD: repoRoot,
      T3_LYNXTRON_VIEWPORT_WIDTH: "1280",
      T3_LYNXTRON_VIEWPORT_HEIGHT: "820",
      T3_LYNXTRON_VIEWPORT_PROBE: "1",
    },
    stdio: ["ignore", logFd, logFd],
  });
  closeSync(logFd);
  if (!child.pid) throw new Error("MTS product app did not return an owned PID.");
  child.unref();
  let client;
  try {
    client = await waitForClient(child, path.join(desktopDir, "main.lynx.bundle"), 30_000);
    writeFileSync(
      retainedPath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          root,
          desktopDir,
          stateDir,
          logPath,
          processId: child.pid,
          client: client.identity,
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
          client: client.identity,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    process.kill(child.pid, "SIGINT");
    rmSync(root, { recursive: true, force: true });
    throw error;
  } finally {
    await client?.close();
  }
}

await main();
