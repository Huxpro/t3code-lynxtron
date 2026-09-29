#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

import { resolveElectronLaunchCommand } from "../../desktop/scripts/electron-launcher.mjs";

const require = createRequire(import.meta.url);
const appRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(appRoot, "../..");
const sourceRoot = path.resolve(
  process.argv.slice(2).find((value) => value !== "--" && !value.startsWith("--")) ?? "",
);
const keep = process.argv.includes("--keep");
const sourceDatabase = path.join(sourceRoot, "userdata/state.sqlite");
if (!existsSync(sourceDatabase)) throw new Error("Source database missing: " + sourceDatabase);

const runRoot = mkdtempSync(path.join(tmpdir(), "t3-default-electron-native-"));
const electronBaseDir = path.join(runRoot, "electron-home");
const electronProfile = path.join(runRoot, "electron-profile");
const fixtureDir = path.join(runRoot, "native-fixture");
const nativeReportPath = path.join(runRoot, "native-report.json");
const readinessReceiptPath = path.join(runRoot, "native-readiness.json");
const userKey =
  typeof process.getuid === "function" ? process.getuid() : (process.env.USER ?? "user");
const rendezvousDirectory = path.join(tmpdir(), "t3code-local-environments-" + userKey);
mkdirSync(path.join(electronBaseDir, "userdata"), { recursive: true });
mkdirSync(fixtureDir, { recursive: true });

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
async function waitFor(read, label, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let latest;
  while (Date.now() < deadline) {
    latest = await read();
    if (latest) return latest;
    await delay(100);
  }
  throw new Error("Timed out waiting for " + label + ": " + JSON.stringify(latest));
}

function waitForChildExit(child, timeoutMs) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}
async function stopOwnedChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  if (await waitForChildExit(child, 5_000)) return;
  child.kill("SIGKILL");
  await waitForChildExit(child, 3_000);
}
function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}
function runChecked(command, args) {
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || command + " failed");
  return result.stdout;
}

const destinationDatabase = path.join(electronBaseDir, "userdata/state.sqlite");
const vacuumCode =
  "const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(" +
  JSON.stringify(sourceDatabase) +
  ", { readOnly: true }); db.exec('PRAGMA busy_timeout=5000'); db.exec(\"VACUUM INTO '" +
  destinationDatabase.replaceAll("'", "''") +
  "'\"); db.close();";
runChecked(process.execPath, ["-e", vacuumCode]);
for (const name of [
  "environment-id",
  "settings.json",
  "desktop-settings.json",
  "keybindings.json",
]) {
  const source = path.join(sourceRoot, "userdata", name);
  if (existsSync(source)) cpSync(source, path.join(electronBaseDir, "userdata", name));
}
const lookupCode =
  "const db = new (require('bun:sqlite').Database)(" +
  JSON.stringify(destinationDatabase) +
  ", { readonly: true }); process.stdout.write(JSON.stringify(db.query(\"select p.project_id as projectId,p.title as projectTitle,p.workspace_root as workspaceRoot,t.thread_id as threadId,t.title as threadTitle,t.model_selection_json as modelSelectionJson from projection_projects p join projection_threads t on t.project_id=p.project_id where lower(p.title)=lower('background-only') and lower(t.title)=lower('Update README') and t.archived_at is null limit 1\").get()));";
const target = JSON.parse(runChecked("bun", ["-e", lookupCode]));
if (!target?.projectId || !target?.threadId)
  throw new Error("Snapshot lacks background-only / Update README.");
const modelSelection = JSON.parse(target.modelSelectionJson);
writeFileSync(
  path.join(fixtureDir, "visual-state.json"),
  JSON.stringify(
    {
      schemaVersion: 1,
      project: {
        title: target.projectTitle,
        projectId: target.projectId,
        workspaceRoot: target.workspaceRoot,
      },
      route: "thread-transcript",
      theme: "dark",
      sidebarFixture: { titles: [target.threadTitle] },
      idleThreadFixture: {
        threadId: target.threadId,
        title: target.threadTitle,
        sessionStatus: "idle",
        latestTurn: null,
        messageCount: 0,
        modelSelection,
      },
    },
    null,
    2,
  ) + "\n",
);
writeFileSync(
  path.join(fixtureDir, "lynxtron-prefs.json"),
  JSON.stringify({ themePreference: "dark", clientSettings: {}, modelSelection }, null, 2) + "\n",
);

const serverPort = await reservePort();
const electronCommand = resolveElectronLaunchCommand(["dist-electron/main.cjs"]);
const electron = spawn(electronCommand.electronPath, electronCommand.args, {
  cwd: path.join(repoRoot, "apps/desktop"),
  env: {
    ...process.env,
    T3CODE_HOME: electronBaseDir,
    T3CODE_PORT: String(serverPort),
    T3CODE_DESKTOP_USER_DATA_DIR: electronProfile,
    T3CODE_DISABLE_AUTO_UPDATE: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let electronLog = "";
electron.stdout.on("data", (chunk) => {
  electronLog += String(chunk);
});
electron.stderr.on("data", (chunk) => {
  electronLog += String(chunk);
});
let rendezvousPath;
let native;
try {
  rendezvousPath = await waitFor(() => {
    const candidate = path.join(rendezvousDirectory, String(electron.pid) + ".json");
    return existsSync(candidate) ? candidate : null;
  }, "Electron local-environment rendezvous");
  const descriptor = JSON.parse(readFileSync(rendezvousPath, "utf8"));
  if (
    descriptor.ownerPid !== electron.pid ||
    descriptor.httpBaseUrl !== "http://127.0.0.1:" + serverPort + "/"
  ) {
    throw new Error("Unexpected Electron rendezvous: " + JSON.stringify(descriptor));
  }
  if ((statSync(rendezvousPath).mode & 0o777) !== 0o600)
    throw new Error("Rendezvous is not mode 0600.");
  const packagePath = require.resolve("@lynx-js/lynxtron/package.json");
  const executable = path.join(
    path.dirname(packagePath),
    "dist/Lynxtron.app/Contents/MacOS/lynxtron",
  );
  native = spawn(executable, [path.join(appRoot, "dist/desktop")], {
    cwd: appRoot,
    env: {
      ...process.env,
      NODE_ENV: "production",
      T3_LYNXTRON_PAIRING_URL: "",
      T3_LYNXTRON_BACKGROUND: process.env.T3_LYNXTRON_BACKGROUND ?? "1",
      T3_LYNXTRON_BASE_DIR: "",
      T3_LYNXTRON_PREFS_PATH: path.join(fixtureDir, "lynxtron-prefs.json"),
      T3_LYNXTRON_PROJECT_CWD: target.workspaceRoot,
      T3_LYNXTRON_READINESS_REPORT: readinessReceiptPath,
      ...(keep ? { T3_LYNXTRON_ENABLE_DEVTOOL: "1" } : {}),
      T3_LYNXTRON_VIEWPORT_WIDTH: "1280",
      T3_LYNXTRON_VIEWPORT_HEIGHT: "820",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let nativeLog = "";
  native.stdout.on("data", (chunk) => {
    nativeLog += String(chunk);
  });
  native.stderr.on("data", (chunk) => {
    nativeLog += String(chunk);
  });
  const receipt = await waitFor(() => {
    if (!existsSync(readinessReceiptPath)) return null;
    let value;
    try {
      value = JSON.parse(readFileSync(readinessReceiptPath, "utf8"));
    } catch {
      return null;
    }
    const hasProject = value.projects?.some(
      (project) => project.id === target.projectId && project.title === "background-only",
    );
    const hasThread = value.threads?.some(
      (thread) => thread.id === target.threadId && thread.title === "Update README",
    );
    return value.status === "ready" &&
      value.transport?.kind === "main" &&
      value.transport.lastSeq >= 0 &&
      hasProject &&
      hasThread
      ? value
      : null;
  }, "Native readiness receipt");
  if (!keep) await stopOwnedChild(native);
  process.stdout.write(
    JSON.stringify(
      {
        status: "pass",
        runRoot,
        snapshotSha256: createHash("sha256")
          .update(readFileSync(destinationDatabase))
          .digest("hex"),
        electron: {
          processId: electron.pid,
          serverPort,
          rendezvous: { ...descriptor, bootstrapCredential: "<redacted>" },
        },
        target,
        native: {
          processId: native.pid,
          connection: {
            mode: "existing-environment",
            source: "desktop-rendezvous",
            serverOwned: false,
          },
          readiness: receipt,
          rendererErrors: /(?:uncaught|fatal|error:)/iu.test(nativeLog) ? [nativeLog] : [],
          bundle: {
            path: path.join(appRoot, "dist/desktop/main.lynx.bundle"),
            sha256: createHash("sha256")
              .update(readFileSync(path.join(appRoot, "dist/desktop/main.lynx.bundle")))
              .digest("hex"),
          },
        },
        lynxtronPackage: {
          version: require(packagePath).version,
          executable: path.join(
            path.dirname(packagePath),
            "dist/Lynxtron.app/Contents/MacOS/lynxtron",
          ),
        },
        reportPath: readinessReceiptPath,
        pairingCredentialRetained: false,
      },
      null,
      2,
    ) + "\n",
  );
  if (keep) {
    process.stdout.write(
      "[default-electron-native] retained; press Ctrl-C to stop owned processes\n",
    );
    await new Promise((resolve) => {
      process.once("SIGINT", resolve);
      process.once("SIGTERM", resolve);
    });
  }
} finally {
  await stopOwnedChild(native);
  await stopOwnedChild(electron);
  if (rendezvousPath)
    await waitFor(() => !existsSync(rendezvousPath), "Electron rendezvous cleanup", 10_000);
  rmSync(electronProfile, { recursive: true, force: true });
}
