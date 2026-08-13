#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { openOwnedDevToolSession, readOwnedListeningTcpPorts } from "./devtool-client-identity.mjs";

const appRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(appRoot, "../..");
const defaultDevToolCli = path.join(os.homedir(), ".agents/skills/lynx-devtool/scripts/index.mjs");
const retainedStatePath = path.join(os.tmpdir(), "t3-mts-runtime-contract-retained.json");

function commandResult(response) {
  return response?.result?.result ?? response?.result ?? response;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? appRoot,
    encoding: "utf8",
    env: options.env ?? process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      [result.stderr, result.stdout].filter(Boolean).join("\n") ||
        `${command} exited with ${result.status}`,
    );
  }
}

function readRendererErrors({ clientId, devToolCli, sessionId }) {
  const result = spawnSync(
    process.execPath,
    [
      devToolCli,
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
    const diagnostic = [result.stderr, result.stdout].filter(Boolean).join("\n");
    if (diagnostic.includes("AbortError") && diagnostic.includes("timeout")) return "";
    throw new Error(diagnostic || `Lynx DevTool console exited with ${result.status}.`);
  }
  return result.stdout.trim();
}

function resolveLynxtronExecutable() {
  const packageJson = import.meta.resolve("@lynx-js/lynxtron/package.json");
  const packageRoot = path.dirname(fileURLToPath(packageJson));
  return process.platform === "darwin"
    ? path.join(packageRoot, "dist/Lynxtron.app/Contents/MacOS/lynxtron")
    : path.join(packageRoot, "dist/lynxtron");
}

async function waitForOwnedClient(child, devToolCli, expectedBundleUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("Lynxtron exited before the MTS probe DevTool session was ready.");
    }
    try {
      const ownedPorts = readOwnedListeningTcpPorts(child.pid);
      const client = await openOwnedDevToolSession({
        appName: "@t3tools/lynxtron",
        devToolCli,
        ownedPorts,
      });
      if (client.identity.bundleUrl !== expectedBundleUrl) {
        await client.close();
        throw new Error(`Unexpected probe bundle ${String(client.identity.bundleUrl)}`);
      }
      return client;
    } catch (error) {
      lastError = error;
      await wait(100);
    }
  }
  throw lastError ?? new Error("Timed out waiting for the MTS probe DevTool session.");
}

async function queryNode(client, rootNodeId, selector) {
  const response = await client.runCdp("DOM.querySelector", { nodeId: rootNodeId, selector });
  const nodeId = commandResult(response)?.nodeId;
  if (!Number.isInteger(nodeId) || nodeId <= 0) {
    throw new Error(`MTS probe selector is unavailable: ${selector}`);
  }
  return nodeId;
}

async function readAttribute(client, nodeId, name) {
  const response = await client.runCdp("DOM.getAttributes", { nodeId });
  const attributes = commandResult(response)?.attributes ?? [];
  for (let index = 0; index < attributes.length; index += 2) {
    if (attributes[index] === name) return attributes[index + 1] ?? null;
  }
  return null;
}

async function tapNode(client, nodeId) {
  const response = await client.runCdp("DOM.getBoxModel", { nodeId });
  const quad = commandResult(response)?.model?.border ?? commandResult(response)?.model?.content;
  if (!Array.isArray(quad) || quad.length < 8) {
    throw new Error(`MTS probe node ${nodeId} has no tappable box.`);
  }
  const x = Math.round(
    (Math.min(quad[0], quad[2], quad[4], quad[6]) + Math.max(quad[0], quad[2], quad[4], quad[6])) /
      2,
  );
  const y = Math.round(
    (Math.min(quad[1], quad[3], quad[5], quad[7]) + Math.max(quad[1], quad[3], quad[5], quad[7])) /
      2,
  );
  const timestamp = Date.now() / 1000;
  for (const [type, offset] of [
    ["mouseMoved", 0],
    ["mousePressed", 0.01],
    ["mouseReleased", 0.02],
  ]) {
    await client.runCdp("Input.emulateTouchFromMouseEvent", {
      type,
      x,
      y,
      timestamp: timestamp + offset,
      button: "left",
    });
  }
}

async function waitForAttributeChange(client, nodeId, previous, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await readAttribute(client, nodeId, "data-result");
    if (value !== previous) return value;
    await wait(50);
  }
  return previous;
}

async function stopOwnedProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGINT");
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    await wait(100);
  }
  child.kill("SIGTERM");
}

async function runRuntimeContract(client) {
  const actions = [
    [
      "inspect",
      "sdk:4.1;String:function;setAttribute:function;elementQuery:function;globalQuery:function",
    ],
    ["string", "string:320"],
    ["set-attribute", "setAttribute:set"],
    ["element-query", "elementQuery:found"],
    ["global-query", "globalQuery:found"],
    ["nested-mts", "nestedMts:found"],
    ["imported-helper", "importedHelper:220"],
  ];
  const results = [];
  for (const [action, expected] of actions) {
    const response = await client.runCdp("Runtime.evaluate", {
      expression: `globalThis.__T3_MTS_RUNTIME_CONTRACT__(${JSON.stringify(
        action,
      )}).then(value => ({ status: "resolved", value }), error => ({ status: "rejected", message: String(error), stack: error?.stack }))`,
      awaitPromise: true,
      returnByValue: true,
    });
    const outcome = commandResult(response)?.value;
    results.push({
      action,
      expected,
      outcome,
      passed: outcome?.status === "resolved" && outcome.value === expected,
    });
  }
  return results;
}

function readProcessCommand(processId) {
  const result = spawnSync("ps", ["-p", String(processId), "-o", "command="], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`Retained MTS probe PID ${processId} is unavailable.`);
  }
  return result.stdout.trim();
}

async function inspectRetained() {
  const retained = JSON.parse(readFileSync(retainedStatePath, "utf8"));
  const command = readProcessCommand(retained.processId);
  if (!command.includes(retained.desktopOutput)) {
    throw new Error(`Refusing retained MTS probe PID ${retained.processId}: identity drift.`);
  }
  const devToolCli = process.env.LYNX_DEVTOOL_CLI ?? defaultDevToolCli;
  const client = await openOwnedDevToolSession({
    appName: "@t3tools/lynxtron",
    devToolCli,
    ownedPorts: readOwnedListeningTcpPorts(retained.processId),
  });
  try {
    await client.runCdp("DOM.enable", { useCompression: false });
    const documentResponse = await client.runCdp("DOM.getDocument", {});
    const root = commandResult(documentResponse)?.root;
    const rootNodeId = root?.children?.[0]?.nodeId ?? root?.nodeId;
    if (!rootNodeId) throw new Error("Retained MTS probe document has no root node.");
    const resultNodeId = await queryNode(client, rootNodeId, ".mts-probe-result");
    const value = await readAttribute(client, resultNodeId, "data-result");
    const rendererErrors = readRendererErrors({
      clientId: client.identity.clientId,
      devToolCli,
      sessionId: client.identity.sessionId,
    });
    process.stdout.write(
      `${JSON.stringify(
        {
          schemaVersion: 1,
          processId: retained.processId,
          client: client.identity,
          value,
          rendererErrors,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await client.close();
  }
  process.kill(retained.processId, "SIGINT");
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      process.kill(retained.processId, 0);
      await wait(100);
    } catch {
      break;
    }
  }
  rmSync(retained.outputRoot, { recursive: true, force: true });
  rmSync(retainedStatePath, { force: true });
}

async function main() {
  if (process.argv.includes("--inspect-retained")) {
    await inspectRetained();
    return;
  }
  const retain = process.argv.includes("--retain");
  const outputRoot = mkdtempSync(path.join(os.tmpdir(), "t3-mts-runtime-contract-"));
  const bundleOutput = path.join(outputRoot, "bundle");
  const desktopOutput = path.join(outputRoot, "desktop");
  mkdirSync(desktopOutput, { recursive: true });

  run("./node_modules/.bin/rspeedy", ["build"], {
    env: {
      ...process.env,
      T3_LYNXTRON_PROBE_ENTRY: path.join(appRoot, "src/app/probes/mts-runtime-contract.tsx"),
      T3_LYNXTRON_PROBE_OUTPUT: bundleOutput,
    },
  });
  const bundle = path.join(bundleOutput, "main.lynx.bundle");
  if (!existsSync(bundle)) throw new Error(`MTS probe bundle is missing: ${bundle}`);

  for (const file of ["main.js", "preload.js", "connector.bundle.cjs", "package.json"]) {
    const source = path.join(appRoot, "dist/desktop", file);
    const destination = path.join(desktopOutput, file);
    writeFileSync(destination, readFileSync(source));
  }
  const stagedBundle = path.join(desktopOutput, "main.lynx.bundle");
  writeFileSync(stagedBundle, readFileSync(bundle));

  const executable = resolveLynxtronExecutable();
  const devToolCli = process.env.LYNX_DEVTOOL_CLI ?? defaultDevToolCli;
  const child = spawn(executable, [desktopOutput], {
    cwd: appRoot,
    env: {
      ...process.env,
      NODE_ENV: "production",
      T3_LYNXTRON_BASE_DIR: path.join(outputRoot, "state"),
      T3_LYNXTRON_BUNDLE_PATH: stagedBundle,
      T3_LYNXTRON_PROJECT_CWD: repoRoot,
      T3_LYNXTRON_VIEWPORT_WIDTH: "760",
      T3_LYNXTRON_VIEWPORT_HEIGHT: "680",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (!child.pid) throw new Error("Lynxtron did not return an owned PID.");
  let logs = "";
  child.stdout?.on("data", (chunk) => {
    logs += String(chunk);
  });
  child.stderr?.on("data", (chunk) => {
    logs += String(chunk);
  });

  let client;
  let retainProcess = false;
  try {
    client = await waitForOwnedClient(child, devToolCli, pathToFileURL(stagedBundle).href, 30_000);
    await client.runCdp("DOM.enable", { useCompression: false });
    const documentResponse = await client.runCdp("DOM.getDocument", {});
    const root = commandResult(documentResponse)?.root;
    const rootNodeId = root?.children?.[0]?.nodeId ?? root?.nodeId;
    if (!rootNodeId) throw new Error("MTS probe document has no root node.");
    const resultNodeId = await queryNode(client, rootNodeId, ".mts-probe-result");
    if (retain) {
      writeFileSync(
        retainedStatePath,
        `${JSON.stringify(
          {
            schemaVersion: 1,
            outputRoot,
            desktopOutput,
            processId: child.pid,
            client: client.identity,
          },
          null,
          2,
        )}\n`,
      );
      retainProcess = true;
      process.stdout.write(
        `${JSON.stringify(
          {
            retained: true,
            processId: child.pid,
            statePath: retainedStatePath,
            client: client.identity,
          },
          null,
          2,
        )}\n`,
      );
      return;
    }
    const runtimeResults = await runRuntimeContract(client);
    const rendererErrors = readRendererErrors({
      clientId: client.identity.clientId,
      devToolCli,
      sessionId: client.identity.sessionId,
    });
    const report = {
      schemaVersion: 1,
      processId: child.pid,
      bundle: pathToFileURL(stagedBundle).href,
      client: client.identity,
      runtimeResults,
      rendererErrors,
      passed: runtimeResults.every((result) => result.passed) && rendererErrors.length === 0,
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.passed) process.exitCode = 1;
  } catch (error) {
    const redactedLogs = logs.replace(/^Token:.*$/gmu, "Token: <redacted>");
    process.stderr.write(
      `${JSON.stringify(
        {
          processId: child.pid,
          exitCode: child.exitCode,
          signalCode: child.signalCode,
          error: error instanceof Error ? error.stack : String(error),
          logs: redactedLogs,
        },
        null,
        2,
      )}\n`,
    );
    throw error;
  } finally {
    await client?.close();
    if (!retainProcess) {
      await stopOwnedProcess(child);
      rmSync(outputRoot, { recursive: true, force: true });
    }
    if (logs.includes("Token:")) logs = logs.replace(/^Token:.*$/gmu, "Token: <redacted>");
  }
}

await main();
