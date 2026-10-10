#!/usr/bin/env node

// One owned, hidden Lynxtron instance to look at while working.
//
//   node scripts/dev-instance.mjs start <base-dir> [--visible] [--env KEY=VALUE]...
//   node scripts/dev-instance.mjs ready <base-dir>
//   node scripts/dev-instance.mjs eval <base-dir> '<expression>'
//   node scripts/dev-instance.mjs shot <base-dir> <output.png>
//   node scripts/dev-instance.mjs tap <base-dir> <x> <y>
//   node scripts/dev-instance.mjs console <base-dir> [--level error]
//   node scripts/dev-instance.mjs stop <base-dir>
//
// <base-dir> is an isolated T3_LYNXTRON_BASE_DIR, for example one fixture from
// prepare-native-battery.mjs. Never the live ~/.t3 home. The instance is the
// built app in dist/desktop; rebuild and restart to see a source change.
//
// `ready` and `eval` run on the background thread, which stops answering about
// twenty seconds after launch on a long-lived instance; `shot`, `tap` and
// `console` keep working. The console backlog is handed out once per app
// session: read it after the interaction, not before.

import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import { createRequire } from "node:module";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import NodeProcess from "node:process";
import * as NodeURL from "node:url";

import { openOwnedDevToolSession, readOwnedListeningTcpPorts } from "./devtool-client-identity.mjs";

const appRoot = NodePath.resolve(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)), "..");
const repoRoot = NodePath.resolve(appRoot, "../..");
const require = createRequire(NodePath.join(appRoot, "package.json"));
const devToolCli = NodePath.resolve(
  NodeProcess.env.LYNX_DEVTOOL_CLI ??
    NodePath.join(NodeOS.homedir(), ".agents/skills/lynx-devtool/scripts/index.mjs"),
);
const APP_NAME = "@t3tools/lynxtron";
const READY_EXPRESSION =
  "JSON.stringify(globalThis.__T3_LYNXTRON_READINESS__?.() ?? {ready:false,status:null,revision:null})";

const [command, baseDirArgument, ...rest] = NodeProcess.argv.slice(2);
if (!command || !baseDirArgument) {
  console.error("Usage: dev-instance.mjs <start|ready|eval|shot|tap|console|stop> <base-dir> ...");
  NodeProcess.exit(2);
}
const baseDir = NodePath.resolve(baseDirArgument);
if (baseDir === NodePath.join(NodeOS.homedir(), ".t3") || baseDir.includes("/.t3/userdata")) {
  throw new Error("Refusing to run against the live T3 home.");
}
const statePath = NodePath.join(baseDir, "dev-instance.json");

const isAlive = (processId) => {
  try {
    NodeProcess.kill(processId, 0);
    return true;
  } catch {
    return false;
  }
};

async function waitUntil(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

function readState() {
  if (!NodeFS.existsSync(statePath)) throw new Error(`No instance recorded at ${statePath}.`);
  const state = JSON.parse(NodeFS.readFileSync(statePath, "utf8"));
  if (!isAlive(state.pid)) throw new Error(`Recorded instance ${state.pid} is not running.`);
  return state;
}

async function withSession(run) {
  const state = readState();
  let session;
  const opened = await waitUntil(async () => {
    try {
      session = await openOwnedDevToolSession({
        appName: APP_NAME,
        devToolCli,
        ownedPorts: readOwnedListeningTcpPorts(state.pid),
      });
      return true;
    } catch {
      return false;
    }
  }, 20_000);
  if (!opened) throw new Error(`No DevTool session for instance ${state.pid}.`);
  if (!String(session.identity.bundleUrl).startsWith(NodeURL.pathToFileURL(appRoot).href)) {
    await session.close();
    throw new Error(`DevTool session is for another bundle: ${session.identity.bundleUrl}`);
  }
  try {
    return await run(session);
  } finally {
    await session.close();
  }
}

function devTool(session, args) {
  const result = NodeChildProcess.spawnSync(
    NodeProcess.execPath,
    [
      devToolCli,
      ...args,
      "--client",
      session.identity.clientId,
      "--session",
      String(session.identity.sessionId),
    ],
    { cwd: appRoot, encoding: "utf8" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout;
}

async function evaluate(session, expression) {
  const response = await session.runCdp("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  const result = response?.result?.result ?? response?.result ?? response;
  return typeof result?.value === "string" ? result.value : JSON.stringify(result);
}

const commands = {
  async start() {
    if (NodeFS.existsSync(statePath)) {
      const previous = JSON.parse(NodeFS.readFileSync(statePath, "utf8"));
      if (isAlive(previous.pid)) throw new Error(`Instance ${previous.pid} is already running.`);
    }
    const extraEnv = Object.fromEntries(
      rest.flatMap((argument, index) =>
        argument === "--env" && rest[index + 1]?.includes("=")
          ? [[rest[index + 1].split("=")[0], rest[index + 1].split("=").slice(1).join("=")]]
          : [],
      ),
    );
    const logPath = NodePath.join(baseDir, "dev-instance.log");
    const log = NodeFS.openSync(logPath, "a");
    const child = NodeChildProcess.spawn(
      require("@lynx-js/lynxtron/native-paths").executablePath,
      [NodePath.join(appRoot, "dist/desktop")],
      {
        cwd: appRoot,
        detached: true,
        env: {
          ...NodeProcess.env,
          NODE_ENV: "production",
          T3_LYNXTRON_BACKGROUND: "1",
          ...(rest.includes("--visible") ? { T3_LYNXTRON_BACKGROUND_WINDOW: "visible" } : {}),
          T3_LYNXTRON_BASE_DIR: baseDir,
          T3_LYNXTRON_PROJECT_CWD: NodeProcess.env.T3_LYNXTRON_PROJECT_CWD ?? repoRoot,
          ...extraEnv,
        },
        stdio: ["ignore", log, log],
      },
    );
    child.unref();
    NodeFS.writeFileSync(statePath, `${JSON.stringify({ pid: child.pid, logPath }, null, 2)}\n`);
    console.log(JSON.stringify({ pid: child.pid, logPath, state: "isolated", baseDir }));
  },
  async ready() {
    const value = await withSession(async (session) => {
      let latest = "";
      await waitUntil(async () => {
        latest = await evaluate(session, READY_EXPRESSION);
        return latest.includes('"ready":true');
      }, 30_000);
      return latest;
    });
    console.log(value);
    if (!value.includes('"ready":true')) NodeProcess.exitCode = 1;
  },
  async eval() {
    console.log(await withSession((session) => evaluate(session, rest[0] ?? "undefined")));
  },
  async shot() {
    const output = NodePath.resolve(rest[0] ?? "frame.png");
    await withSession((session) => devTool(session, ["take-screenshot", "--output", output]));
    console.log(output);
  },
  async tap() {
    const [x, y] = rest.map(Number);
    await withSession(async (session) => {
      for (const type of ["mousePressed", "mouseReleased"]) {
        await session.runCdp("Input.emulateTouchFromMouseEvent", {
          type,
          x,
          y,
          button: "left",
          clickCount: 1,
          timestamp: Math.floor(Date.now() / 1000),
        });
      }
    });
  },
  async console() {
    console.log(await withSession((session) => devTool(session, ["get-console", ...rest])));
  },
  async stop() {
    const state = JSON.parse(NodeFS.readFileSync(statePath, "utf8"));
    const children = NodeChildProcess.spawnSync("pgrep", ["-P", String(state.pid)], {
      encoding: "utf8",
    })
      .stdout.split("\n")
      .filter(Boolean)
      .map(Number);
    if (isAlive(state.pid)) NodeProcess.kill(state.pid, "SIGTERM");
    const exited = await waitUntil(() => !isAlive(state.pid), 10_000);
    const childrenExited = await waitUntil(() => children.every((child) => !isAlive(child)), 5_000);
    NodeFS.rmSync(statePath, { force: true });
    console.log(JSON.stringify({ pid: state.pid, exited, children, childrenExited }));
    if (!exited || !childrenExited) NodeProcess.exitCode = 1;
  },
};

if (!(command in commands)) throw new Error(`Unknown command: ${command}`);
await commands[command]();
