import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { collectLynxMeasurements } from "./devtool-measurements.mjs";

const appRoot = path.resolve(import.meta.dirname, "..");
const defaultCli = path.join(os.homedir(), ".agents/skills/lynx-devtool/scripts/index.mjs");

function readArgument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function runDevTool(args, options = {}) {
  const { allowNoMessagesTimeout = false, noDaemon = false, ...spawnOptions } = options;
  const cliArgs = noDaemon ? [devToolCli, "--no-daemon", ...args] : [devToolCli, ...args];
  const result = spawnSync(process.execPath, cliArgs, {
    cwd: appRoot,
    encoding: "utf8",
    ...spawnOptions,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const diagnostic = [result.stderr, result.stdout].filter(Boolean).join("\n");
    if (
      allowNoMessagesTimeout &&
      diagnostic.includes("AbortError") &&
      diagnostic.includes("timeout")
    ) {
      return "";
    }
    throw new Error(diagnostic || `Lynx DevTool exited with status ${result.status}`);
  }
  return result.stdout.trim();
}

function readImageDimensions(filePath) {
  const bytes = readFileSync(filePath);
  if (bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") {
    return {
      format: "png",
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
    };
  }

  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      offset += 2;
      if (marker === 0xd8 || marker === 0xd9) continue;
      const segmentLength = bytes.readUInt16BE(offset);
      if (marker >= 0xc0 && marker <= 0xc3) {
        return {
          format: "jpeg",
          width: bytes.readUInt16BE(offset + 5),
          height: bytes.readUInt16BE(offset + 3),
        };
      }
      offset += segmentLength;
    }
  }

  throw new Error(`Unsupported screenshot format: ${filePath}`);
}

function hasNamedClient(serializedClients, name) {
  try {
    return JSON.parse(serializedClients).some((client) => client.info?.App === name);
  } catch {
    return false;
  }
}

async function ensureDaemonClient(name) {
  const daemonClients = runDevTool(["list-clients"]);
  if (hasNamedClient(daemonClients, name)) return;

  const directClients = runDevTool(["list-clients"], { noDaemon: true });
  if (!hasNamedClient(directClients, name)) {
    throw new Error(`No running Lynx DevTool client has app name "${name}".`);
  }

  // The long-lived connector can retain a stale desktop port after a client
  // restart. Shut down only that helper; the next command recreates it and
  // discovers the already-running app.
  await fetch("http://127.0.0.1:21783/devtool/connector/shutdown", {
    method: "POST",
  }).catch(() => undefined);
  const refreshedClients = runDevTool(["list-clients"]);
  if (!hasNamedClient(refreshedClients, name)) {
    throw new Error(`Lynx DevTool daemon did not discover app name "${name}".`);
  }
}

async function createMeasurementCdpClient(name) {
  const connectorModuleUrl = pathToFileURL(
    path.join(path.dirname(devToolCli), "connector.mjs"),
  ).href;
  const { Connector, DaemonTransport } = await import(connectorModuleUrl);
  const transport = new DaemonTransport();
  const connector = new Connector([transport]);
  const clients = await connector.listClients();
  const matches = clients.filter((client) => client.info?.App === name);
  if (matches.length !== 1) {
    throw new Error(
      `Expected one Lynx DevTool client named "${name}" for measurements; found ${matches.length}.`,
    );
  }
  const clientId = matches[0].id;
  const sessions = await connector.sendListSessionMessage(clientId);
  const session = sessions.reduce(
    (latest, candidate) =>
      latest === null || Number(candidate.session_id) > Number(latest.session_id)
        ? candidate
        : latest,
    null,
  );
  if (!session) {
    throw new Error(`No Lynx DevTool session found for measurement client "${name}".`);
  }
  return {
    close: () => transport.close(),
    runCdp: (method, params) =>
      connector.sendCDPMessage(clientId, Number(session.session_id), method, params),
  };
}

function commandResult(response) {
  return response?.result?.result ?? response?.result ?? response;
}

function quadCenter(quad) {
  if (!Array.isArray(quad) || quad.length < 8) {
    throw new Error("Lynx DevTool did not return a usable interaction box.");
  }
  const x = [quad[0], quad[2], quad[4], quad[6]];
  const y = [quad[1], quad[3], quad[5], quad[7]];
  return {
    x: Math.round((Math.min(...x) + Math.max(...x)) / 2),
    y: Math.round((Math.min(...y) + Math.max(...y)) / 2),
  };
}

async function prepareInteractionState(name, interactionState) {
  if (interactionState === "none") return;
  if (interactionState !== "sidebar-collapsed") {
    throw new Error(`Unsupported Lynx interaction state: ${interactionState}`);
  }

  const client = await createMeasurementCdpClient(name);
  try {
    await client.runCdp("DOM.enable", { useCompression: false });
    const documentResponse = await client.runCdp("DOM.getDocument", {});
    const root = commandResult(documentResponse)?.root;
    const rootNodeId = root?.children?.[0]?.nodeId ?? root?.nodeId;
    if (!rootNodeId) {
      throw new Error("Lynx DevTool DOM.getDocument did not return a root node.");
    }
    const existingCollapsedResponse = await client.runCdp("DOM.querySelector", {
      nodeId: rootNodeId,
      selector: ".sidebar-container--collapsed",
    });
    const existingCollapsedNodeId = commandResult(existingCollapsedResponse)?.nodeId;
    if (Number.isInteger(existingCollapsedNodeId) && existingCollapsedNodeId > 0) return;

    const globalTriggerResponse = await client.runCdp("DOM.querySelector", {
      nodeId: rootNodeId,
      selector: ".sidebar-global-toggle",
    });
    let triggerNodeId = commandResult(globalTriggerResponse)?.nodeId;
    if (!Number.isInteger(triggerNodeId) || triggerNodeId <= 0) {
      const headerTriggerResponse = await client.runCdp("DOM.querySelector", {
        nodeId: rootNodeId,
        selector: ".sidebar-header-toggle",
      });
      triggerNodeId = commandResult(headerTriggerResponse)?.nodeId;
    }
    if (!Number.isInteger(triggerNodeId) || triggerNodeId <= 0) {
      throw new Error("Lynx Sidebar trigger is unavailable.");
    }
    const boxResponse = await client.runCdp("DOM.getBoxModel", { nodeId: triggerNodeId });
    const model = commandResult(boxResponse)?.model;
    const point = quadCenter(model?.border ?? model?.content);
    const timestamp = Date.now() / 1000;
    await client.runCdp("Input.emulateTouchFromMouseEvent", {
      type: "mouseMoved",
      x: point.x,
      y: point.y,
      timestamp,
      button: "left",
    });
    await client.runCdp("Input.emulateTouchFromMouseEvent", {
      type: "mousePressed",
      x: point.x,
      y: point.y,
      timestamp: timestamp + 0.01,
      button: "left",
    });
    await client.runCdp("Input.emulateTouchFromMouseEvent", {
      type: "mouseReleased",
      x: point.x,
      y: point.y,
      timestamp: timestamp + 0.02,
      button: "left",
    });

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const collapsedResponse = await client.runCdp("DOM.querySelector", {
        nodeId: rootNodeId,
        selector: ".sidebar-container--collapsed",
      });
      const collapsedNodeId = commandResult(collapsedResponse)?.nodeId;
      if (Number.isInteger(collapsedNodeId) && collapsedNodeId > 0) {
        // The class flips before the 200 ms off-canvas transition and its
        // dependent layout have painted. Wait for the settled product state so
        // certification never records a transient frame with missing controls.
        await new Promise((resolveWait) => setTimeout(resolveWait, 250));
        return;
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    throw new Error("Lynx Sidebar did not reach the collapsed state.");
  } finally {
    await client.close();
  }
}

const clientName = readArgument("--client-name", "@t3tools/lynxtron");
const output = path.resolve(
  appRoot,
  readArgument("--output", "reports/screenshots/lynx-devtool.jpg"),
);
const route = readArgument("--route", "new-thread");
const theme = readArgument("--theme", "dark");
const snapshot = readArgument("--snapshot", "unspecified");
const interactionState = readArgument("--interaction-state", "none");
const reuseScreenshot = process.argv.includes("--reuse-screenshot");
const measurementSpecPath = path.resolve(
  appRoot,
  readArgument("--measurement-spec", "scripts/visual-measurement-spec.json"),
);
const devToolCli = process.env.LYNX_DEVTOOL_CLI ?? defaultCli;

if (!existsSync(devToolCli)) {
  throw new Error(
    `Lynx DevTool CLI not found at ${devToolCli}. Set LYNX_DEVTOOL_CLI to its index.mjs path.`,
  );
}

mkdirSync(path.dirname(output), { recursive: true });
await ensureDaemonClient(clientName);
await prepareInteractionState(clientName, interactionState);

// Capture first: Lynx DevTool exposes a single screencast frame per fresh
// desktop session, and another inspection request can consume or wedge it.
if (reuseScreenshot) {
  if (!existsSync(output)) {
    throw new Error(`--reuse-screenshot requires an existing DevTool screenshot: ${output}`);
  }
} else {
  runDevTool(["take-screenshot", "--client-name", clientName, "--output", output]);
}

const errorOutput = runDevTool(
  [
    "get-console",
    "--client-name",
    clientName,
    "--level",
    "error",
    "--limit",
    "200",
    "--include-stack-traces",
  ],
  { allowNoMessagesTimeout: true },
);

if (errorOutput.length > 0) {
  process.stderr.write(`${errorOutput}\n`);
  throw new Error("Lynx DevTool reported renderer errors; capture metadata was not written.");
}

const dimensions = readImageDimensions(output);
const parsedOutput = path.parse(output);
const normalizedExtension = parsedOutput.ext.toLowerCase();
const extensionMatchesFormat =
  (dimensions.format === "jpeg" &&
    (normalizedExtension === ".jpg" || normalizedExtension === ".jpeg")) ||
  (dimensions.format === "png" && normalizedExtension === ".png");
if (!extensionMatchesFormat) {
  throw new Error(
    `Lynx DevTool returned ${dimensions.format} data for ${output}; use a matching file extension.`,
  );
}
const metadataPath = path.join(parsedOutput.dir, `${parsedOutput.name}.capture.json`);
const measurementsPath = path.join(parsedOutput.dir, `${parsedOutput.name}.lynx-measurements.json`);
const measurementSpec = JSON.parse(readFileSync(measurementSpecPath, "utf8"));
const measurementClient = await createMeasurementCdpClient(clientName);
let measurements;
try {
  measurements = await collectLynxMeasurements({
    spec: measurementSpec,
    runCdp: measurementClient.runCdp,
  });
} finally {
  await measurementClient.close();
}
writeFileSync(measurementsPath, `${JSON.stringify(measurements, null, 2)}\n`);
writeFileSync(
  metadataPath,
  `${JSON.stringify(
    {
      baseline: "electron-web",
      clientName,
      route,
      theme,
      snapshot,
      interactionState,
      screenshot: path.relative(appRoot, output),
      dimensions,
      capturedAt: new Date().toISOString(),
      reusedScreenshot: reuseScreenshot,
      devToolConsoleErrors: 0,
      measurements: path.relative(appRoot, measurementsPath),
    },
    null,
    2,
  )}\n`,
);

process.stdout.write(
  `${JSON.stringify(
    { screenshot: output, metadata: metadataPath, measurements: measurementsPath, dimensions },
    null,
    2,
  )}\n`,
);
