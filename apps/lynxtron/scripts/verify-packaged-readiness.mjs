#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { collectLynxMeasurements } from "./devtool-measurements.mjs";
import { openOwnedDevToolSession, readOwnedListeningTcpPorts } from "./devtool-client-identity.mjs";
import {
  assertComposerGeometry,
  assertComposerRouteState,
  buildPlan11SemanticCertification,
  buildPlan11SemanticOutcomes,
} from "./plan11-semantic-outcomes.mjs";

const APP_ROOT = path.resolve(import.meta.dirname, "..");
const REPO_ROOT = path.resolve(APP_ROOT, "../..");
const DEFAULT_DEVTOOL_CLI = path.join(
  os.homedir(),
  ".agents/skills/lynx-devtool/scripts/index.mjs",
);
const DEFAULT_BUNDLE = path.join(APP_ROOT, "dist/desktop/main.lynx.bundle");
const DEFAULT_DESKTOP_DIR = path.join(APP_ROOT, "dist/desktop");
const DEFAULT_TIMEOUT_MS = 30_000;

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function normalizeNativeScreenshotPng(screenshotPath) {
  const bytes = readFileSync(screenshotPath);
  if (bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return;
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error(`Native screenshot has an unsupported format: ${screenshotPath}`);
  }
  if (process.platform !== "darwin") {
    throw new Error(
      "Native DevTool returned JPEG data, but PNG normalization requires macOS sips.",
    );
  }

  const convertedPath = `${screenshotPath}.converted.png`;
  const conversion = spawnSync(
    "sips",
    ["-s", "format", "png", screenshotPath, "--out", convertedPath],
    { encoding: "utf8" },
  );
  if (conversion.error) throw conversion.error;
  if (conversion.status !== 0 || !existsSync(convertedPath)) {
    throw new Error(
      conversion.stderr || conversion.stdout || "Native screenshot PNG normalization failed.",
    );
  }
  const converted = readFileSync(convertedPath);
  if (converted.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    rmSync(convertedPath, { force: true });
    throw new Error("Native screenshot normalization did not produce PNG data.");
  }
  renameSync(convertedPath, screenshotPath);
}

function captureNativeScreenshot({ client, devToolCli, outputDirectory, name }) {
  const screenshotPath = path.join(outputDirectory, name);
  const screenshot = spawnSync(
    process.execPath,
    [
      devToolCli,
      "take-screenshot",
      "--client",
      client.identity.clientId,
      "--session",
      String(client.identity.sessionId),
      "--output",
      screenshotPath,
    ],
    { cwd: APP_ROOT, encoding: "utf8" },
  );
  if (screenshot.error) throw screenshot.error;
  if (screenshot.status !== 0 || !existsSync(screenshotPath)) {
    throw new Error(
      screenshot.stderr || screenshot.stdout || `Native screenshot capture failed: ${name}`,
    );
  }
  normalizeNativeScreenshotPng(screenshotPath);
  return {
    path: screenshotPath,
    bytes: statSync(screenshotPath).size,
    sha256: sha256(screenshotPath),
  };
}

function commandResult(response) {
  return response?.result?.result ?? response?.result ?? response;
}

function quadPoint(quad, position = "center") {
  if (!Array.isArray(quad) || quad.length < 8) {
    throw new Error("DevTool did not return a tappable node box.");
  }
  if (position === "top-left") {
    const xs = [quad[0], quad[2], quad[4], quad[6]];
    const ys = [quad[1], quad[3], quad[5], quad[7]];
    return { x: Math.min(...xs) + 4, y: Math.min(...ys) + 4 };
  }
  if (position === "bottom-right") {
    const xs = [quad[0], quad[2], quad[4], quad[6]];
    const ys = [quad[1], quad[3], quad[5], quad[7]];
    return { x: Math.max(...xs) - 16, y: Math.max(...ys) - 16 };
  }
  return {
    x: (quad[0] + quad[2] + quad[4] + quad[6]) / 4,
    y: (quad[1] + quad[3] + quad[5] + quad[7]) / 4,
  };
}

function resolveLynxtronExecutable() {
  const configured = process.env.LYNXTRON_EXECUTABLE?.trim();
  if (configured) return path.resolve(configured);
  const packageJson = import.meta.resolve("@lynx-js/lynxtron/package.json");
  const packageRoot = path.dirname(fileURLToPath(packageJson));
  if (process.platform === "darwin") {
    return path.join(packageRoot, "dist/Lynxtron.app/Contents/MacOS/lynxtron");
  }
  return path.join(packageRoot, "dist/lynxtron");
}

function readHead() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(result.stderr || "Could not resolve git HEAD.");
  return result.stdout.trim();
}

function createLogCapture(child) {
  const events = new EventEmitter();
  let text = "";
  const append = (chunk) => {
    text += String(chunk);
    events.emit("change");
  };
  child.stdout?.on("data", append);
  child.stderr?.on("data", append);
  return { events, read: () => text };
}

function redactProcessLog(value) {
  return value
    .replace(/^Token:.*$/gmu, "Token: <redacted>")
    .replace(/^Pairing URL:.*$/gmu, "Pairing URL: <redacted>")
    .replace(/(wsTicket=)[^\s]+/gu, "$1<redacted>")
    .split("\n")
    .filter((line) => !/^[\s█▀▄]+$/u.test(line))
    .join("\n");
}

function waitForEmitterEvent(emitter, eventName, timeoutMs) {
  return new Promise((resolve) => {
    const finish = (reason) => {
      clearTimeout(timer);
      emitter.off(eventName, onEvent);
      resolve(reason);
    };
    const onEvent = () => finish("event");
    const timer = setTimeout(() => finish("timeout"), timeoutMs);
    emitter.once(eventName, onEvent);
  });
}

function waitForChildExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const finish = (exited) => {
      clearTimeout(timer);
      child.off("exit", onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once("exit", onExit);
  });
}

async function waitForLogText(child, log, needle, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (!log.read().includes(needle)) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Lynxtron exited before log signal ${JSON.stringify(needle)}.`);
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error(`Timed out waiting for log signal ${needle}.`);
    await waitForEmitterEvent(log.events, "change", Math.min(remaining, 250));
  }
}

async function waitForLogOccurrence(child, log, needle, count, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (log.read().split(needle).length - 1 < count) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        `Lynxtron exited before log occurrence ${count} of ${JSON.stringify(needle)}.`,
      );
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new Error(`Timed out waiting for log occurrence ${count} of ${needle}.`);
    }
    await waitForEmitterEvent(log.events, "change", Math.min(remaining, 250));
  }
}

function processField(processId, field) {
  const result = spawnSync("ps", ["-p", String(processId), "-o", `${field}=`], {
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || `ps could not inspect process ${processId}.`);
  }
  return result.stdout.trim();
}

function resolveOwnedServerProcess({ appProcessId, baseDir, port }) {
  const result = spawnSync("lsof", ["-Pan", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fp"], {
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || `No process owns server port ${port}.`);
  }
  const processIds = [
    ...new Set(
      result.stdout
        .split("\n")
        .filter((line) => /^p\d+$/u.test(line))
        .map((line) => Number(line.slice(1))),
    ),
  ];
  if (processIds.length !== 1) {
    throw new Error(
      `Expected one listener on server port ${port}; found ${processIds.join(", ")}.`,
    );
  }
  const processId = processIds[0];
  const parentProcessId = Number(processField(processId, "ppid"));
  const command = processField(processId, "command");
  if (parentProcessId !== appProcessId) {
    throw new Error(
      `Refusing to signal server PID ${processId}: parent ${parentProcessId} is not owned app PID ${appProcessId}.`,
    );
  }
  if (!command.includes("--base-dir") || !command.includes(baseDir)) {
    throw new Error(
      `Refusing to signal server PID ${processId}: isolated base-dir identity differs.`,
    );
  }
  return { processId, parentProcessId, port };
}

async function waitForOwnedSession({ child, devToolCli, expectedBundleUrl, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("Lynxtron exited before its DevTool session was available.");
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
        throw new Error(
          `Owned session loaded ${String(client.identity.bundleUrl)}; expected ${expectedBundleUrl}.`,
        );
      }
      return client;
    } catch (error) {
      lastError = error;
      await waitForChildExit(child, 100);
    }
  }
  throw new Error(
    `Timed out resolving the PID-owned DevTool session: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

async function readRendererReadiness(client) {
  const response = await client.runCdp("Runtime.evaluate", {
    expression:
      "JSON.stringify({kind:globalThis.__T3_LYNXTRON_CONNECTOR_TRANSPORT__?.kind ?? null,lastSeq:globalThis.__T3_LYNXTRON_CONNECTOR_TRANSPORT__?.lastSeq?.() ?? null})",
    returnByValue: true,
  });
  const value = commandResult(response)?.value;
  return typeof value === "string" ? JSON.parse(value) : { kind: null, lastSeq: null };
}

async function waitForMainTransport({ child, client, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  let latest;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("Lynxtron exited before renderer readiness.");
    }
    latest = await readRendererReadiness(client).catch(() => ({ kind: null, lastSeq: null }));
    if (latest.kind === "main" && Number.isInteger(latest.lastSeq) && latest.lastSeq >= 0) {
      return latest;
    }
    await waitForChildExit(child, 100);
  }
  throw new Error(`Renderer did not expose a main transport: ${JSON.stringify({ latest })}`);
}

async function invokeSemanticAdvance(client, modelSelection) {
  const response = await client.runCdp("Runtime.evaluate", {
    expression: `globalThis.__T3_LYNXTRON_CONNECTOR_TRANSPORT__.invoke("setModelSelection", ${JSON.stringify(
      { selection: modelSelection },
    )}).then(() => true)`,
    awaitPromise: true,
    returnByValue: true,
  });
  const result = commandResult(response);
  if (response?.exceptionDetails || result?.value !== true) {
    throw new Error(`Semantic readiness command failed: ${JSON.stringify(response)}`);
  }
}

async function invokeConnector(client, method, params) {
  const response = await client.runCdp("Runtime.evaluate", {
    expression: `globalThis.__T3_LYNXTRON_CONNECTOR_TRANSPORT__.invoke(${JSON.stringify(
      method,
    )}, ${JSON.stringify(params)}).then((value) => JSON.stringify(value ?? null))`,
    awaitPromise: true,
    returnByValue: true,
  });
  const result = commandResult(response);
  if (response?.exceptionDetails || typeof result?.value !== "string") {
    throw new Error(`Connector command ${method} failed: ${JSON.stringify(response)}`);
  }
  return JSON.parse(result.value);
}

async function waitForConnectorCommand({ child, client, method, params, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  let latestError = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Lynxtron exited before connector command ${method} became ready.`);
    }
    try {
      return await invokeConnector(client, method, params);
    } catch (error) {
      latestError = error instanceof Error ? error.message : String(error);
    }
    await waitForChildExit(child, 100);
  }
  throw new Error(
    `Connector command ${method} did not become ready: ${JSON.stringify({ latestError })}`,
  );
}

async function waitForSourceControlDiscoveryError({ child, client, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("Lynxtron exited before Source Control discovery became ready.");
    }
    const response = await client.runCdp("Runtime.evaluate", {
      expression:
        'globalThis.__T3_LYNXTRON_CONNECTOR_TRANSPORT__.invoke("discoverSourceControl", {}).then((value) => JSON.stringify({status:"success",value})).catch((error) => JSON.stringify({status:"error",message:error instanceof Error?error.message:String(error)}))',
      awaitPromise: true,
      returnByValue: true,
    });
    const result = commandResult(response);
    latest =
      typeof result?.value === "string"
        ? JSON.parse(result.value)
        : { status: "transport-error", value: result?.value ?? null };
    if (
      latest.status === "error" &&
      latest.message === "Source-control discovery is unavailable in this test environment."
    ) {
      return latest;
    }
    await waitForChildExit(child, 100);
  }
  throw new Error(
    `Source Control discovery did not reach the injected typed error: ${JSON.stringify({ latest })}`,
  );
}

async function readConnectorSnapshot(client) {
  const response = await client.runCdp("Runtime.evaluate", {
    expression:
      "globalThis.__T3_LYNXTRON_CONNECTOR_TRANSPORT__.resync().then(() => JSON.stringify(globalThis.__T3_LYNXTRON_CONNECTOR_TRANSPORT__.lastSeq()))",
    awaitPromise: true,
    returnByValue: true,
  });
  const result = commandResult(response);
  return {
    response,
    lastSeq: typeof result?.value === "string" ? JSON.parse(result.value) : (result?.value ?? null),
  };
}

async function readClientState(client) {
  const response = await client.runCdp("Runtime.evaluate", {
    expression: "JSON.stringify(globalThis.__T3_LYNXTRON_CLIENT_STATE__?.() ?? null)",
    returnByValue: true,
  });
  const result = commandResult(response);
  return typeof result?.value === "string" ? JSON.parse(result.value) : null;
}

async function readComposerPrimaryActionDiagnostics(client) {
  const response = await client.runCdp("Runtime.evaluate", {
    expression: "JSON.stringify(globalThis.__T3_LYNXTRON_COMPOSER_PRIMARY_ACTION__ ?? null)",
    returnByValue: true,
  });
  const result = commandResult(response);
  return typeof result?.value === "string" ? JSON.parse(result.value) : null;
}

async function waitForClientState({ child, client, predicate, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("Lynxtron exited before client state reached its expected postcondition.");
    }
    latest = await readClientState(client);
    if (predicate(latest)) return latest;
    await waitForChildExit(child, 100);
  }
  throw new Error(`Timed out waiting for client state: ${JSON.stringify({ latest })}`);
}

async function waitForSequenceAdvance({ child, client, initial, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  let latest = initial;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("Lynxtron exited before its renderer sequence advanced.");
    }
    latest = await readRendererReadiness(client).catch(() => latest);
    if (latest.kind === "main" && latest.lastSeq > initial.lastSeq) {
      return latest;
    }
    await waitForChildExit(child, 100);
  }
  throw new Error(
    `Renderer sequence did not advance after a main-bridge command: ${JSON.stringify({ initial, latest })}`,
  );
}

async function readCanonicalState(client) {
  const measurements = await collectLynxMeasurements({
    runCdp: client.runCdp,
    spec: {
      route: "packaged-readiness",
      anchors: [{ id: "thread", lynx: ".sidebar-v2-row-title" }],
      typography: [{ id: "model", lynx: ".composer-toolbar-control--model" }],
      colors: [{ id: "app", lynx: ".app-root" }],
    },
  });
  return {
    threadText: measurements.anchors.thread.text,
    modelText: measurements.typography.model.text,
  };
}

async function readLifecycleBanner(client) {
  try {
    const measurements = await collectLynxMeasurements({
      runCdp: client.runCdp,
      spec: {
        route: "packaged-lifecycle",
        anchors: [{ id: "banner", lynx: ".connection-lifecycle-banner-reference" }],
        typography: [],
        colors: [],
      },
    });
    const banner = measurements.anchors.banner;
    return {
      phase: banner.attributes["data-connection-lifecycle-phase"] ?? null,
      text: banner.text,
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("selector did not match")) return null;
    throw error;
  }
}

async function waitForLifecycleBanner({ child, client, phase, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  let latest;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Lynxtron exited before lifecycle phase ${phase} rendered.`);
    }
    latest = await readLifecycleBanner(client);
    if (latest?.phase === phase) return latest;
    await waitForChildExit(child, 100);
  }
  throw new Error(`Lifecycle phase ${phase} did not render: ${JSON.stringify({ latest })}`);
}

async function waitForLifecycleBannerToClear({ child, client, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  let latest;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("Lynxtron exited before lifecycle failure cleared.");
    }
    latest = await readLifecycleBanner(client);
    if (latest === null) return;
    await waitForChildExit(child, 100);
  }
  throw new Error(`Lifecycle banner did not clear: ${JSON.stringify({ latest })}`);
}

async function waitForCanonicalState({ canonicalThreadTitle, child, client, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  let latest;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("Lynxtron exited before canonical UI state was rendered.");
    }
    try {
      latest = await readCanonicalState(client);
      if (latest.threadText.includes(canonicalThreadTitle) && latest.modelText.trim()) {
        return { canonicalThreadTitle, ...latest };
      }
    } catch (error) {
      lastError = error;
    }
    await waitForChildExit(child, 100);
  }
  throw new Error(
    `Canonical UI state did not render: ${JSON.stringify({ canonicalThreadTitle, latest, lastError: lastError instanceof Error ? lastError.message : undefined })}`,
  );
}

async function readSidebarScopeLayout(client, includePopup) {
  const anchors = [
    { id: "sidebar", lynx: ".sidebar" },
    { id: "trigger", lynx: ".sidebar-v2-project-scope-trigger" },
    { id: "threadList", lynx: ".sidebar-v2-thread-list" },
  ];
  if (includePopup) {
    anchors.push(
      { id: "popup", lynx: ".sidebar-v2-scope-popup" },
      { id: "dismissLayer", lynx: ".lynx-menu-dismiss-layer" },
    );
  }
  const measurements = await collectLynxMeasurements({
    runCdp: client.runCdp,
    spec: {
      route: "packaged-sidebar-scope",
      anchors,
      typography: [],
      colors: [],
    },
  });
  return measurements.anchors;
}

function quadRect(quad) {
  if (!Array.isArray(quad) || quad.length < 8) return null;
  const xs = [quad[0], quad[2], quad[4], quad[6]];
  const ys = [quad[1], quad[3], quad[5], quad[7]];
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

async function readSelectorRects(client, selector) {
  await client.runCdp("DOM.enable", { useCompression: false });
  const documentResponse = await client.runCdp("DOM.getDocument", { depth: 0 });
  const root = commandResult(documentResponse)?.root;
  const rootNodeId = root?.children?.[0]?.nodeId ?? root?.nodeId;
  if (!Number.isInteger(rootNodeId) || rootNodeId <= 0) {
    throw new Error("Lynx DevTool did not return a DOM root node.");
  }
  const nodesResponse = await client.runCdp("DOM.querySelectorAll", {
    nodeId: rootNodeId,
    selector,
  });
  const nodeIds = commandResult(nodesResponse)?.nodeIds ?? [];
  const rects = [];
  for (const nodeId of nodeIds) {
    const boxResponse = await client.runCdp("DOM.getBoxModel", { nodeId });
    const model = commandResult(boxResponse)?.model;
    const rect = quadRect(model?.border ?? model?.content);
    if (rect) rects.push(rect);
  }
  return rects;
}

async function readSelectorMeasurements(client, selector) {
  await client.runCdp("DOM.enable", { useCompression: false });
  const documentResponse = await client.runCdp("DOM.getDocument", { depth: 0 });
  const root = commandResult(documentResponse)?.root;
  const rootNodeId = root?.children?.[0]?.nodeId ?? root?.nodeId;
  if (!Number.isInteger(rootNodeId) || rootNodeId <= 0) {
    throw new Error("Lynx DevTool did not return a DOM root node.");
  }
  const nodesResponse = await client.runCdp("DOM.querySelectorAll", {
    nodeId: rootNodeId,
    selector,
  });
  return Promise.all(
    (commandResult(nodesResponse)?.nodeIds ?? []).map(async (nodeId) => {
      const [attributesResponse, boxResponse, textResponse] = await Promise.all([
        client.runCdp("DOM.getAttributes", { nodeId }),
        client.runCdp("DOM.getBoxModel", { nodeId }),
        client.runCdp("DOM.innerText", { nodeId }),
      ]);
      const attributeList = commandResult(attributesResponse)?.attributes ?? [];
      const attributes = Object.fromEntries(
        Array.from({ length: Math.floor(attributeList.length / 2) }, (_, index) => [
          attributeList[index * 2],
          attributeList[index * 2 + 1],
        ]),
      );
      const model = commandResult(boxResponse)?.model;
      return {
        nodeId,
        rect: quadRect(model?.border ?? model?.content),
        text: commandResult(textResponse)?.innerText ?? "",
        attributes,
      };
    }),
  );
}

async function readSelectorStyleValues(client, selector, property) {
  await client.runCdp("DOM.enable", { useCompression: false });
  const documentResponse = await client.runCdp("DOM.getDocument", { depth: 0 });
  const root = commandResult(documentResponse)?.root;
  const rootNodeId = root?.children?.[0]?.nodeId ?? root?.nodeId;
  if (!Number.isInteger(rootNodeId) || rootNodeId <= 0) {
    throw new Error("Lynx DevTool did not return a DOM root node.");
  }
  const nodesResponse = await client.runCdp("DOM.querySelectorAll", {
    nodeId: rootNodeId,
    selector,
  });
  const nodeIds = commandResult(nodesResponse)?.nodeIds ?? [];
  return Promise.all(
    nodeIds.map(async (nodeId) => {
      const styleResponse = await client.runCdp("CSS.getComputedStyleForNode", { nodeId });
      const computedStyle = commandResult(styleResponse)?.computedStyle ?? [];
      return computedStyle.find((entry) => entry.name === property)?.value ?? null;
    }),
  );
}

async function readSelectorAttributeMeasurement(client, { attribute, selector, value }) {
  await client.runCdp("DOM.enable", { useCompression: false });
  const documentResponse = await client.runCdp("DOM.getDocument", { depth: 0 });
  const root = commandResult(documentResponse)?.root;
  const rootNodeId = root?.children?.[0]?.nodeId ?? root?.nodeId;
  if (!Number.isInteger(rootNodeId) || rootNodeId <= 0) {
    throw new Error("Lynx DevTool did not return a DOM root node.");
  }
  const nodesResponse = await client.runCdp("DOM.querySelectorAll", {
    nodeId: rootNodeId,
    selector,
  });
  for (const nodeId of commandResult(nodesResponse)?.nodeIds ?? []) {
    const attributesResponse = await client.runCdp("DOM.getAttributes", { nodeId });
    const attributeList = commandResult(attributesResponse)?.attributes ?? [];
    const attributes = Object.fromEntries(
      Array.from({ length: Math.floor(attributeList.length / 2) }, (_, index) => [
        attributeList[index * 2],
        attributeList[index * 2 + 1],
      ]),
    );
    if (attributes[attribute] !== value) continue;
    const [boxResponse, textResponse] = await Promise.all([
      client.runCdp("DOM.getBoxModel", { nodeId }),
      client.runCdp("DOM.innerText", { nodeId }),
    ]);
    const model = commandResult(boxResponse)?.model;
    return {
      nodeId,
      rect: quadRect(model?.border ?? model?.content),
      text: commandResult(textResponse)?.innerText ?? "",
      attributes,
    };
  }
  return null;
}

async function waitForSelectorAttributeMeasurement({
  attribute,
  child,
  client,
  selector,
  timeoutMs,
  value,
}) {
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Lynxtron exited before ${selector}[${attribute}] became ready.`);
    }
    latest = await readSelectorAttributeMeasurement(client, { attribute, selector, value });
    if (latest) return latest;
    await waitForChildExit(child, 100);
  }
  throw new Error(
    `Timed out waiting for ${selector}[${attribute}="${value}"]: ${JSON.stringify({ latest })}`,
  );
}

async function verifySidebarGeometry(client, viewportWidth) {
  const [sidebar] = await readSelectorRects(client, ".sidebar");
  const [threadList] = await readSelectorRects(client, ".sidebar-v2-thread-list");
  const rows = await readSelectorRects(client, ".sidebar-v2-row-item");
  const cards = await readSelectorRects(client, ".sidebar-v2-row-card");
  const brand = await readOptionalMeasurement(client, ".sidebar-brand");
  if (!sidebar || !threadList || rows.length === 0 || rows.length !== cards.length) {
    throw new Error(
      `Sidebar geometry is incomplete: ${JSON.stringify({ sidebar, threadList, rows, cards })}`,
    );
  }
  const sidebarRight = sidebar.x + sidebar.width;
  const listRight = threadList.x + threadList.width;
  const invalid = rows.flatMap((row, index) => {
    const card = cards[index];
    const rowRight = row.x + row.width;
    const cardRight = card.x + card.width;
    return row.x < sidebar.x - 1 ||
      card.x < sidebar.x - 1 ||
      rowRight > sidebarRight + 1 ||
      cardRight > sidebarRight + 1 ||
      rowRight > listRight + 1 ||
      cardRight > listRight + 1
      ? [{ index, row, card }]
      : [];
  });
  if (invalid.length > 0) {
    throw new Error(
      `Sidebar rows escaped the rail: ${JSON.stringify({ sidebar, threadList, invalid })}`,
    );
  }
  if (!brand?.rect || Math.abs(brand.rect.x - 60) > 1 || !brand.text.includes("Code")) {
    throw new Error(
      `Sidebar brand drifted from the titlebar inset: ${JSON.stringify({
        brand,
        viewportWidth,
      })}`,
    );
  }
  return {
    status: "pass",
    input: "read-only Lynx DevTool DOM box models",
    sidebar,
    threadList,
    rows,
    cards,
    brand,
  };
}

async function verifyComposerGeometry(client, expectedTheme) {
  const composer = await readComposerOutcome(client);
  assertComposerGeometry(composer);
  const controlColors = {
    model: composer.anchors.model.style.color,
    runtime: composer.anchors.runtime.style.color,
    interaction: composer.anchors.interaction.style.color,
  };
  const chevrons = await readSelectorRects(client, ".composer-toolbar-control .pill__chevron-img");
  const runtimeIcons = await readSelectorRects(
    client,
    ".composer-toolbar-control--runtime .pill__icon-img",
  );
  const interactionIcons = await readSelectorRects(
    client,
    ".composer-toolbar-control--interaction .pill__icon-img",
  );
  const footerIconOpacities = await readSelectorStyleValues(
    client,
    ".composer-toolbar-control .pill__icon-img, .composer-toolbar-control .pill__chevron-img",
    "opacity",
  );
  const [contextStrip] = await readSelectorRects(client, ".composer-context-strip");
  const contextControls = await readSelectorRects(client, ".composer-context-control");
  const contextIcons = await readSelectorRects(client, ".composer-context-icon");
  const contextLightBands = await readSelectorRects(client, ".composer-context-light-band");
  const contextLabels = [composer.typography.contextCheckout, composer.typography.contextBranch];
  const themeRoot = composer.colors.themeRoot;
  const contextBackdrop = composer.colors.contextBackdrop;
  const contextLegacyBand = composer.colors.contextLegacyBand;
  const contextLightBandFirst = composer.colors.contextLightBandFirst;
  const contextLightBandLast = composer.colors.contextLightBandLast;
  const wrongSize = (rect, size) =>
    Math.abs(rect.width - size) > 0.5 || Math.abs(rect.height - size) > 0.5;
  const wrongContextSize = (rect) =>
    Math.abs(rect.width - 12) > 0.75 || Math.abs(rect.height - 12) > 0.75;
  const wrongFooterIconOpacity = (opacity) =>
    opacity === null || Math.abs(Number(opacity) - 0.7) > 1 / 255;
  const wrongMutedColor = (color) => {
    const match = /^rgba\((\d+),(\d+),(\d+),([0-9.]+)\)$/u.exec(color);
    if (!match) return true;
    const channels = match.slice(1, 4).map(Number);
    const expectedChannels = expectedTheme === "light" ? [113, 113, 122] : [129, 129, 129];
    return (
      channels.some((channel, index) => channel !== expectedChannels[index]) ||
      Math.abs(Number(match[4]) - 0.7) > 1 / 255
    );
  };
  const contextControlsAligned =
    contextStrip &&
    contextControls.length === 2 &&
    contextControls.every(
      (rect) =>
        Math.abs(rect.y - (contextStrip.y + 20)) <= 1.25 && Math.abs(rect.height - 24) <= 0.5,
    ) &&
    Math.abs(contextControls[0].x - (contextStrip.x + 4)) <= 1.25 &&
    Math.abs(
      contextControls[1].x + contextControls[1].width - (contextStrip.x + contextStrip.width - 4),
    ) <= 1.25;
  const contextLabelsAligned = contextLabels.every(
    (label) =>
      Math.abs((label.rect?.y ?? 0) - (contextStrip.y + 24)) <= 1.25 &&
      Math.abs((label.rect?.height ?? 0) - 16) <= 0.5 &&
      label.style.fontSize === "12px" &&
      label.style.fontWeight === "500" &&
      label.style.lineHeight === "16px" &&
      !wrongMutedColor(label.style.color),
  );
  const contextLightBandsAligned =
    contextLightBands.length === 16 &&
    contextLightBands.every(
      (rect, index) =>
        Math.abs(rect.x - (contextBackdrop.rect.x + 1)) <= 0.75 &&
        Math.abs(rect.y - (contextBackdrop.rect.y + index * 2)) <= 0.75 &&
        Math.abs(rect.width - (contextBackdrop.rect.width - 2)) <= 0.75 &&
        Math.abs(rect.height - (index === 15 ? 1 : 2)) <= 0.5,
    );
  const expectedThemeMatches =
    !expectedTheme ||
    (themeRoot.attributes["data-theme"] === expectedTheme &&
      (expectedTheme !== "light" ||
        (contextBackdrop.style.backgroundColor === "rgb(254,254,254)" &&
          contextBackdrop.style.borderBottomColor === "rgb(234,234,234)" &&
          contextLegacyBand.style.display === "none" &&
          contextLightBandsAligned &&
          contextLightBandFirst.style.backgroundColor === "rgb(222,222,222)" &&
          contextLightBandLast.style.backgroundColor === "rgb(254,254,254)")));
  if (
    chevrons.length < 2 ||
    chevrons.length > 3 ||
    chevrons.some((rect) => wrongSize(rect, 14)) ||
    runtimeIcons.length !== 1 ||
    wrongSize(runtimeIcons[0], 16) ||
    interactionIcons.length !== 1 ||
    wrongSize(interactionIcons[0], 18) ||
    footerIconOpacities.length < 3 ||
    footerIconOpacities.some(wrongFooterIconOpacity) ||
    !contextControlsAligned ||
    !contextLabelsAligned ||
    !expectedThemeMatches ||
    contextIcons.length < 3 ||
    contextIcons.length > 4 ||
    contextIcons.some(wrongContextSize) ||
    Object.values(controlColors).some(wrongMutedColor)
  ) {
    throw new Error(
      `Composer Footer icon geometry drifted: ${JSON.stringify({
        chevrons,
        runtimeIcons,
        interactionIcons,
        footerIconOpacities,
        contextStrip,
        contextControls,
        contextLabels,
        modelAnchor: composer.anchors.modelAnchor,
        runtimeWrap: composer.anchors.runtimeWrap,
        themeRoot,
        contextBackdrop,
        contextLegacyBand,
        contextLightBands,
        contextLightBandFirst,
        contextLightBandLast,
        contextIcons,
        controlColors,
      })}`,
    );
  }
  return {
    status: "pass",
    input: "read-only Lynx DevTool DOM box models",
    composer,
    chevrons,
    runtimeIcons,
    interactionIcons,
    footerIconOpacities,
    contextStrip,
    contextControls,
    contextLabels,
    themeRoot,
    contextBackdrop,
    contextLegacyBand,
    contextLightBands,
    contextLightBandFirst,
    contextLightBandLast,
    contextIcons,
    controlColors,
  };
}

async function waitForSidebarPopup({ child, client, open, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  let latest;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        `Lynxtron exited before the Sidebar scope popup became ${open ? "open" : "closed"}.`,
      );
    }
    try {
      latest = await readSidebarScopeLayout(client, open);
      if (open) return latest;
      const popup = await readSidebarScopeLayout(client, true).catch(() => null);
      if (popup === null) return latest;
    } catch (error) {
      if (open || !(error instanceof Error) || !error.message.includes("selector did not match")) {
        throw error;
      }
    }
    await waitForChildExit(child, 100);
  }
  throw new Error(
    `Sidebar scope popup did not become ${open ? "open" : "closed"}: ${JSON.stringify({ latest })}`,
  );
}

async function readOptionalMeasurement(client, selector) {
  try {
    const measurements = await collectLynxMeasurements({
      runCdp: client.runCdp,
      spec: {
        route: "packaged-outcome",
        anchors: [{ id: "target", lynx: selector }],
        typography: [],
        colors: [],
      },
    });
    return measurements.anchors.target;
  } catch (error) {
    if (error instanceof Error && error.message.includes("selector did not match")) return null;
    throw error;
  }
}

async function waitForMeasurement({ child, client, predicate, selector, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  let latest;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Lynxtron exited before ${selector} reached its expected state.`);
    }
    latest = await readOptionalMeasurement(client, selector);
    if (predicate(latest)) return latest;
    await waitForChildExit(child, 100);
  }
  throw new Error(`Timed out waiting for ${selector}: ${JSON.stringify({ latest })}`);
}

function composerStateForSessionStatus(sessionStatus) {
  if (sessionStatus === "running") return "working";
  if (sessionStatus === "starting") return "disabled";
  return "idle";
}

async function waitForSessionComposerProjection({
  child,
  client,
  expectedSessionStatus,
  timeoutMs,
}) {
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("Lynxtron exited before the session-derived Composer state stabilized.");
    }
    const state = await readClientState(client);
    const composer = await readOptionalMeasurement(client, ".composer-frame");
    const shellSessionStatus = state?.activeThread?.session?.status ?? "idle";
    const expectedComposerState = composerStateForSessionStatus(state?.sessionStatus);
    latest = {
      composer,
      expectedComposerState,
      sessionStatus: state?.sessionStatus ?? null,
      shellSessionStatus,
    };
    if (
      typeof state?.sessionStatus === "string" &&
      state.sessionStatus === shellSessionStatus &&
      (expectedSessionStatus === undefined || state.sessionStatus === expectedSessionStatus) &&
      composer?.attributes["data-composer-state"] === expectedComposerState
    ) {
      return latest;
    }
    await waitForChildExit(child, 100);
  }
  throw new Error(
    `Session-derived Composer state did not stabilize: ${JSON.stringify({ latest })}`,
  );
}

async function readComposerOutcome(client, options = {}) {
  const includeInteraction = options.allowMissingInteraction !== true;
  const includeContext = options.allowMissingContext !== true;
  const measurements = await collectLynxMeasurements({
    runCdp: client.runCdp,
    spec: {
      route: "packaged-composer",
      anchors: [
        { id: "shell", lynx: ".composer-shell" },
        { id: "frame", lynx: ".composer-frame" },
        { id: "surface", lynx: ".composer-surface" },
        { id: "editor", lynx: ".composer__input" },
        { id: "footer", lynx: ".composer-footer" },
        { id: "toolbar", lynx: ".composer-toolbar-row" },
        { id: "modelAnchor", lynx: ".model-picker-anchor" },
        {
          id: "model",
          lynx: ".model-picker-anchor > .composer-toolbar-control--model",
        },
        { id: "runtime", lynx: ".composer-toolbar-control--runtime" },
        { id: "runtimeWrap", lynx: ".composer-runtime-control-wrap" },
        ...(includeInteraction
          ? [{ id: "interaction", lynx: ".composer-toolbar-control--interaction" }]
          : []),
        { id: "primaryAction", lynx: ".composer-primary-action" },
        ...(includeContext ? [{ id: "context", lynx: ".composer-context-strip" }] : []),
      ],
      typography: [
        {
          id: "model",
          lynx: ".model-picker-anchor > .composer-toolbar-control--model",
        },
        { id: "runtime", lynx: ".composer-toolbar-control--runtime" },
        ...(includeInteraction
          ? [{ id: "interaction", lynx: ".composer-toolbar-control--interaction" }]
          : []),
        ...(includeContext
          ? [
              { id: "contextCheckout", lynx: ".composer-context-label--checkout" },
              { id: "contextBranch", lynx: ".composer-context-label--branch" },
            ]
          : []),
      ],
      colors: [
        { id: "themeRoot", lynx: ".app-theme-root" },
        { id: "surface", lynx: ".composer-surface" },
        { id: "primaryAction", lynx: ".composer-primary-action" },
        ...(includeContext
          ? [
              { id: "context", lynx: ".composer-context-strip" },
              { id: "contextBackdrop", lynx: ".composer-context-backdrop" },
              { id: "contextLegacyBand", lynx: ".composer-context-backdrop-band" },
              { id: "contextLightBandFirst", lynx: ".composer-context-light-band--0" },
              { id: "contextLightBandLast", lynx: ".composer-context-light-band--15" },
            ]
          : []),
      ],
    },
  });
  const modelOption = await readOptionalMeasurement(
    client,
    ".composer-toolbar-control--model-option",
  );
  if (modelOption) measurements.anchors.modelOption = modelOption;
  if (!includeInteraction) {
    const interaction = await readOptionalMeasurement(
      client,
      ".composer-toolbar-control--interaction",
    );
    if (interaction) measurements.anchors.interaction = interaction;
  }
  return measurements;
}

async function verifyHeroComposerState({
  child,
  client,
  expectNoComposerContext,
  expectedModelLabel,
  timeoutMs,
}) {
  const hero = await readOptionalMeasurement(client, ".hero");
  const overlay = await readOptionalMeasurement(client, ".composer-overlay");
  assertComposerRouteState({ hero, overlay }, "new-thread");
  await waitForMeasurement({
    child,
    client,
    selector: ".composer-toolbar-control--model",
    timeoutMs,
    predicate: (measurement) => measurement?.text.trim() === expectedModelLabel,
  });
  const composer = await readComposerOutcome(client, {
    allowMissingContext: expectNoComposerContext,
  });
  assertComposerGeometry(composer, {
    allowMissingContext: expectNoComposerContext,
  });
  const context = expectNoComposerContext
    ? await Promise.all([
        readOptionalMeasurement(client, ".composer-context-strip"),
        readOptionalMeasurement(client, ".composer-context-label--checkout"),
        readOptionalMeasurement(client, ".composer-context-label--branch"),
      ]).then((measurements) => {
        if (measurements.some((measurement) => measurement !== null)) {
          throw new Error("Non-repository Hero Composer rendered repository context.");
        }
        return [];
      })
    : [
        composer.typography.contextCheckout.text.trim(),
        composer.typography.contextBranch.text.trim(),
      ];
  const model = composer.anchors.model.text.trim();
  if (model !== expectedModelLabel) {
    throw new Error(
      `Hero Composer model drifted: ${JSON.stringify({ expectedModelLabel, model })}`,
    );
  }
  return {
    status: "pass",
    route: "new-thread",
    hero: hero.rect,
    model,
    composer: {
      frame: composer.anchors.shell.rect,
      surface: composer.anchors.surface.rect,
      editor: composer.anchors.editor.rect,
      footer: composer.anchors.footer.rect,
      controls: [
        composer.anchors.model.text.trim(),
        composer.anchors.modelOption?.text.trim(),
        composer.anchors.runtime.text.trim(),
        composer.anchors.interaction.text.trim(),
      ].filter(Boolean),
      context,
    },
  };
}

async function verifyIdleThreadState({
  child,
  client,
  expectNoComposerContext,
  idleFixture,
  timeoutMs,
}) {
  const clientState = await waitForClientState({
    child,
    client,
    timeoutMs,
    predicate: (state) =>
      state?.activeThreadId === idleFixture.threadId &&
      state?.sessionStatus === "idle" &&
      state?.activeTurnId === null &&
      state?.latestTurn === null,
  });
  const hero = await readOptionalMeasurement(client, ".hero");
  const overlay = await readOptionalMeasurement(client, ".composer-overlay");
  assertComposerRouteState({ hero, overlay }, "existing-thread");
  const emptyTranscript = await waitForMeasurement({
    child,
    client,
    selector: ".transcript-empty",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.text.trim() === "Send a message to start the conversation.",
  });
  const chatBody = await readOptionalMeasurement(client, ".chat-body-reference");
  if (!chatBody) {
    throw new Error("Idle thread chat-body geometry is unavailable.");
  }
  const expectedEmptyRect = chatBody.rect;
  if (
    Math.abs(emptyTranscript.rect.x - expectedEmptyRect.x) > 1 ||
    Math.abs(emptyTranscript.rect.y - expectedEmptyRect.y) > 1 ||
    Math.abs(emptyTranscript.rect.width - expectedEmptyRect.width) > 1 ||
    Math.abs(emptyTranscript.rect.height - expectedEmptyRect.height) > 1
  ) {
    throw new Error(
      `Idle transcript placeholder lost the shared chat body: ${JSON.stringify({
        actual: emptyTranscript.rect,
        expected: expectedEmptyRect,
      })}`,
    );
  }
  const timelineRows = await readSelectorRects(client, ".timeline-row-root");
  const timelineLists = await readSelectorRects(client, ".timeline-list");
  if (timelineRows.length !== 0 || timelineLists.length !== 0) {
    throw new Error(
      `Idle thread rendered timeline content: ${JSON.stringify({ timelineRows, timelineLists })}`,
    );
  }
  await waitForMeasurement({
    child,
    client,
    selector: ".composer-frame",
    timeoutMs,
    predicate: (measurement) => measurement?.attributes["data-composer-state"] === "idle",
  });
  const composer = await readComposerOutcome(client, {
    allowMissingContext: expectNoComposerContext,
  });
  assertComposerGeometry(composer, {
    allowMissingContext: expectNoComposerContext,
  });
  if (expectNoComposerContext) {
    const contextMeasurements = await Promise.all([
      readOptionalMeasurement(client, ".composer-context-strip"),
      readOptionalMeasurement(client, ".composer-context-label--checkout"),
      readOptionalMeasurement(client, ".composer-context-label--branch"),
    ]);
    if (contextMeasurements.some((measurement) => measurement !== null)) {
      throw new Error("Non-repository idle thread rendered repository context.");
    }
  }
  if (
    composer.anchors.frame.attributes["data-composer-state"] !== "idle" ||
    composer.anchors.primaryAction.attributes["data-composer-primary-state"] !== "disabled"
  ) {
    throw new Error(
      `Idle thread Composer state drifted: ${JSON.stringify({
        composerState: composer.anchors.frame.attributes["data-composer-state"],
        primaryState: composer.anchors.primaryAction.attributes["data-composer-primary-state"],
      })}`,
    );
  }
  return {
    status: "pass",
    threadId: idleFixture.threadId,
    sessionProjection: {
      sessionStatus: clientState.sessionStatus,
      activeTurnId: clientState.activeTurnId,
      latestTurn: clientState.latestTurn,
    },
    emptyTranscript: emptyTranscript.rect,
    timelineRowCount: timelineRows.length,
    composer: {
      state: composer.anchors.frame.attributes["data-composer-state"],
      primaryState: composer.anchors.primaryAction.attributes["data-composer-primary-state"],
      frame: composer.anchors.shell.rect,
      surface: composer.anchors.surface.rect,
      editor: composer.anchors.editor.rect,
      footer: composer.anchors.footer.rect,
    },
  };
}

async function verifyQuickSwitchDefault({ child, client, timeoutMs }) {
  const panel = await waitForMeasurement({
    child,
    client,
    selector: ".palette-panel",
    timeoutMs,
    predicate: (measurement) => measurement?.attributes["data-search-overlay-mode"] === "command",
  });
  const search = await readOptionalMeasurement(client, ".palette-search");
  const results = await readOptionalMeasurement(client, ".palette-results");
  const footer = await readOptionalMeasurement(client, ".palette-footer");
  const rows = await readSelectorRects(client, ".palette-row");
  const expectedLabels = [
    "New thread in t3-hero-claude-workspace",
    "New thread in...",
    "Go to file",
    "Search project contents",
    "Add project",
    "Open settings",
    "Quick Switch idle thread",
  ];
  const labels = expectedLabels.filter((label) => panel.text.includes(label));
  if (
    !search ||
    !results ||
    !footer ||
    rows.length !== expectedLabels.length ||
    JSON.stringify(labels) !== JSON.stringify(expectedLabels)
  ) {
    throw new Error(
      `Quick Switch default anatomy drifted: ${JSON.stringify({
        panel: panel.rect,
        search: search?.rect,
        results: results?.rect,
        footer: footer?.rect,
        rows,
        labels,
      })}`,
    );
  }
  await tapSelector({
    child,
    client,
    selector: ".palette-backdrop",
    point: "bottom-right",
    timeoutMs,
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".palette-panel",
    timeoutMs,
    predicate: (measurement) => measurement === null,
  });
  return {
    status: "pass",
    input: "initialOverlay product state plus measured DevTool outside tap",
    panel: panel.rect,
    search: search.rect,
    results: results.rect,
    footer: footer.rect,
    rows,
    labels,
    dismissed: true,
  };
}

async function verifyComposerBehavior({ child, client, timeoutMs }) {
  const existingOverlay = await readOptionalMeasurement(client, ".composer-overlay");
  const existingHero = await readOptionalMeasurement(client, ".hero");
  assertComposerRouteState({ hero: existingHero, overlay: existingOverlay }, "existing-thread");
  const existingThread = await readComposerOutcome(client);
  assertComposerGeometry(existingThread);

  const existingModelOption = existingThread.anchors.modelOption;
  const modelOption = existingModelOption?.text.trim()
    ? await (async () => {
        const before = existingModelOption.text.trim();
        const beforeSequence = await readRendererReadiness(client);
        await tapSelector({
          child,
          client,
          selector: ".composer-toolbar-control--model-option",
          timeoutMs,
        });
        const afterSequence = await waitForSequenceAdvance({
          child,
          client,
          initial: beforeSequence,
          timeoutMs,
        });
        const after = await waitForMeasurement({
          child,
          client,
          selector: ".composer-toolbar-control--model-option",
          timeoutMs,
          predicate: (measurement) =>
            typeof measurement?.text === "string" && measurement.text.trim() !== before,
        });
        return {
          status: "pass",
          before,
          after: after.text.trim(),
          sequence: { before: beforeSequence.lastSeq, after: afterSequence.lastSeq },
        };
      })()
    : {
        status: "not-applicable",
        reason: "The canonical thread model exposes no provider option control.",
      };

  const beforeModel = existingThread.anchors.model.text.trim();
  const beforeModelSequence = await readRendererReadiness(client);
  await tapSelector({
    child,
    client,
    selector: ".composer-toolbar-control--model",
    timeoutMs,
  });
  const modelPicker = await waitForMeasurement({
    child,
    client,
    selector: ".model-picker-panel",
    timeoutMs,
    predicate: (measurement) => measurement !== null,
  });
  await tapSelector({
    child,
    client,
    selector: ".model-picker-row--unselected",
    timeoutMs,
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".model-picker-panel",
    timeoutMs,
    predicate: (measurement) => measurement === null,
  });
  const afterModelSequence = await waitForSequenceAdvance({
    child,
    client,
    initial: beforeModelSequence,
    timeoutMs,
  });
  const afterModel = await waitForMeasurement({
    child,
    client,
    selector: ".composer-toolbar-control--model",
    timeoutMs,
    predicate: (measurement) =>
      typeof measurement?.text === "string" && measurement.text.trim() !== beforeModel,
  });

  const beforeRuntime = existingThread.anchors.runtime.text.trim();
  const beforeRuntimeSequence = await readRendererReadiness(client);
  await tapSelector({
    child,
    client,
    selector: ".composer-toolbar-control--runtime",
    timeoutMs,
  });
  const afterRuntimeSequence = await waitForSequenceAdvance({
    child,
    client,
    initial: beforeRuntimeSequence,
    timeoutMs,
  });
  const afterRuntime = await waitForMeasurement({
    child,
    client,
    selector: ".composer-toolbar-control--runtime",
    timeoutMs,
    predicate: (measurement) =>
      typeof measurement?.text === "string" && measurement.text.trim() !== beforeRuntime,
  });

  const beforeInteraction = existingThread.anchors.interaction.text.trim();
  const beforeInteractionSequence = await readRendererReadiness(client);
  await tapSelector({
    child,
    client,
    selector: ".composer-toolbar-control--interaction",
    timeoutMs,
  });
  const afterInteractionSequence = await waitForSequenceAdvance({
    child,
    client,
    initial: beforeInteractionSequence,
    timeoutMs,
  });
  const afterInteraction = await waitForMeasurement({
    child,
    client,
    selector: ".composer-toolbar-control--interaction",
    timeoutMs,
    predicate: (measurement) =>
      typeof measurement?.text === "string" && measurement.text.trim() !== beforeInteraction,
  });

  const beforeNewThreadSequence = await readRendererReadiness(client);
  await tapSelector({
    child,
    client,
    selector: ".sidebar-v2-new-thread",
    timeoutMs,
  });
  const afterNewThreadSequence = await waitForSequenceAdvance({
    child,
    client,
    initial: beforeNewThreadSequence,
    timeoutMs,
  });
  const newThreadHero = await waitForMeasurement({
    child,
    client,
    selector: ".hero",
    timeoutMs,
    predicate: (measurement) => measurement !== null,
  });
  const newThreadOverlay = await readOptionalMeasurement(client, ".composer-overlay");
  assertComposerRouteState({ hero: newThreadHero, overlay: newThreadOverlay }, "new-thread");
  const newThread = await readComposerOutcome(client);
  assertComposerGeometry(newThread);

  return {
    status: "pass",
    input: "DevTool Input.emulateTouchFromMouseEvent on measured semantic selectors",
    states: {
      existingThread,
      newThread,
      transitionSequence: {
        before: beforeNewThreadSequence.lastSeq,
        after: afterNewThreadSequence.lastSeq,
      },
    },
    modelPicker: { opened: modelPicker !== null, closed: true },
    model: {
      before: beforeModel,
      after: afterModel.text.trim(),
      sequence: { before: beforeModelSequence.lastSeq, after: afterModelSequence.lastSeq },
    },
    modelOption,
    runtimeMode: {
      before: beforeRuntime,
      after: afterRuntime.text.trim(),
      sequence: { before: beforeRuntimeSequence.lastSeq, after: afterRuntimeSequence.lastSeq },
    },
    interactionMode: {
      before: beforeInteraction,
      after: afterInteraction.text.trim(),
      sequence: {
        before: beforeInteractionSequence.lastSeq,
        after: afterInteractionSequence.lastSeq,
      },
    },
  };
}

function readPersistedThreadModelSelection(baseDir, threadId) {
  const escapedThreadId = threadId.replaceAll("'", "''");
  const query = spawnSync(
    process.env.T3_NODE_BIN?.trim() || "node",
    [
      path.join(REPO_ROOT, "apps/server/scripts/t3-sqlite-state.ts"),
      "query",
      "--base-dir",
      baseDir,
      "--sql",
      `SELECT model_selection_json FROM projection_threads WHERE thread_id = '${escapedThreadId}'`,
    ],
    { cwd: REPO_ROOT, encoding: "utf8" },
  );
  if (query.status !== 0) {
    throw new Error(
      `Could not read persisted model selection: ${query.stderr || query.stdout || "unknown"}`,
    );
  }
  const report = JSON.parse(query.stdout);
  const stored = report.rows?.[0]?.model_selection_json;
  return typeof stored === "string" ? JSON.parse(stored) : null;
}

async function selectSessionlessFixtureThread({ baseDir, child, client, timeoutMs }) {
  let state = await readClientState(client);
  if (state?.sessionStatus === "idle" && state?.activeThread?.session == null) {
    return state;
  }
  const initialThreadId = state?.activeThreadId;
  const seedReport = JSON.parse(
    readFileSync(path.join(baseDir, "workbench-seed-report.json"), "utf8"),
  );
  const idleThreadId = seedReport.dataset?.idleThread?.id;
  if (typeof idleThreadId !== "string") {
    throw new Error("The fixture has no sessionless idle thread.");
  }
  await tapSelectorByAttribute({
    attribute: "data-thread-id",
    child,
    client,
    descendantSelector: ".sidebar-v2-row-card",
    selector: ".sidebar-v2-row-item",
    timeoutMs,
    value: idleThreadId,
  });
  state = await waitForClientState({
    child,
    client,
    timeoutMs,
    predicate: (candidate) =>
      candidate?.activeThreadId === idleThreadId &&
      candidate?.activeThreadId !== initialThreadId &&
      candidate?.sessionStatus === "idle" &&
      candidate?.activeThread?.session == null,
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".sidebar-v2-row-item--active",
    timeoutMs,
    predicate: (measurement) => measurement?.attributes["data-thread-id"] === idleThreadId,
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".composer-frame",
    timeoutMs,
    predicate: (measurement) => measurement?.attributes["data-composer-state"] === "idle",
  });
  return state;
}

async function verifyModelSelectionMutation({
  baseDir,
  child,
  client,
  devToolCli,
  outputDirectory,
  timeoutMs,
}) {
  const beforeState = await selectSessionlessFixtureThread({
    baseDir,
    child,
    client,
    timeoutMs,
  });
  const threadId = beforeState?.activeThreadId;
  const beforeSelection = beforeState?.activeThread?.modelSelection;
  if (
    typeof threadId !== "string" ||
    typeof beforeSelection?.instanceId !== "string" ||
    typeof beforeSelection?.model !== "string"
  ) {
    throw new Error(`Model selection baseline is incomplete: ${JSON.stringify(beforeState)}`);
  }
  const beforeModel = await waitForMeasurement({
    child,
    client,
    selector: ".composer-toolbar-control--model",
    timeoutMs,
    predicate: (measurement) => Boolean(measurement?.text.trim()),
  });
  const beforeSequence = await readRendererReadiness(client);
  await tapSelector({
    child,
    client,
    selector: ".composer-toolbar-control--model",
    timeoutMs,
  });
  const panel = await waitForMeasurement({
    child,
    client,
    selector: ".model-picker-panel",
    timeoutMs,
    predicate: (measurement) => measurement !== null,
  });
  const content = await waitForMeasurement({
    child,
    client,
    selector: ".model-picker-content",
    timeoutMs,
    predicate: (measurement) =>
      typeof measurement?.attributes["data-model-picker-selected-provider"] === "string",
  });
  const target = await waitForMeasurement({
    child,
    client,
    selector: ".model-picker-row--unselected",
    timeoutMs,
    predicate: (measurement) => {
      const key = measurement?.attributes["data-model-picker-key"];
      return typeof key === "string" && key.includes(":");
    },
  });
  const targetKey = target.attributes["data-model-picker-key"];
  const separator = targetKey.indexOf(":");
  const targetSelection = {
    instanceId: targetKey.slice(0, separator),
    model: targetKey.slice(separator + 1),
  };
  await tapSelector({
    child,
    client,
    selector: ".model-picker-row--unselected",
    timeoutMs,
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".model-picker-panel",
    timeoutMs,
    predicate: (measurement) => measurement === null,
  });
  const afterSequence = await waitForSequenceAdvance({
    child,
    client,
    initial: beforeSequence,
    timeoutMs,
  });
  const afterState = await waitForClientState({
    child,
    client,
    timeoutMs,
    predicate: (state) =>
      state?.activeThreadId === threadId &&
      state?.activeThread?.modelSelection?.instanceId === targetSelection.instanceId &&
      state?.activeThread?.modelSelection?.model === targetSelection.model,
  });
  const afterModel = await waitForMeasurement({
    child,
    client,
    selector: ".composer-toolbar-control--model",
    timeoutMs,
    predicate: (measurement) =>
      Boolean(measurement?.text.trim()) && measurement.text.trim() !== beforeModel.text.trim(),
  });
  const persistedSelection = readPersistedThreadModelSelection(baseDir, threadId);
  if (
    persistedSelection?.instanceId !== targetSelection.instanceId ||
    persistedSelection?.model !== targetSelection.model
  ) {
    throw new Error(
      `Model selection did not persist: ${JSON.stringify({ targetSelection, persistedSelection })}`,
    );
  }
  const screenshot = captureNativeScreenshot({
    client,
    devToolCli,
    outputDirectory,
    name: "native-model-selection-after.png",
  });

  return {
    status: "pass",
    input: "DevTool Input.emulateTouchFromMouseEvent on measured model trigger and row",
    threadId,
    panel: panel.rect,
    activeProvider: content.attributes["data-model-picker-selected-provider"],
    target: {
      key: targetKey,
      label: target.text.trim(),
      rect: target.rect,
    },
    selection: {
      before: beforeSelection,
      after: afterState.activeThread.modelSelection,
      persisted: persistedSelection,
    },
    modelLabel: {
      before: beforeModel.text.trim(),
      after: afterModel.text.trim(),
    },
    sequence: {
      before: beforeSequence.lastSeq,
      after: afterSequence.lastSeq,
    },
    overlayDismissed: true,
    screenshot,
  };
}

async function verifyRuntimeMenuDismiss({ child, client, timeoutMs }) {
  const beforeState = await readClientState(client);
  const beforeMode = beforeState?.activeThread?.runtimeMode;
  if (typeof beforeMode !== "string") {
    throw new Error(`Runtime menu baseline is incomplete: ${JSON.stringify(beforeState)}`);
  }
  const trigger = await waitForMeasurement({
    child,
    client,
    selector: ".composer-toolbar-control--runtime",
    timeoutMs,
    predicate: (measurement) => Boolean(measurement?.text.trim()),
  });
  await tapSelector({
    child,
    client,
    selector: ".composer-toolbar-control--runtime",
    timeoutMs,
  });
  const menu = await waitForMeasurement({
    child,
    client,
    selector: ".composer-runtime-menu",
    timeoutMs,
    predicate: (measurement) => measurement !== null,
  });
  const activeItem = await waitForMeasurement({
    child,
    client,
    selector: ".composer-runtime-menu__item--active",
    timeoutMs,
    predicate: (measurement) => measurement?.attributes["aria-checked"] === "true",
  });
  const dismissLayer = await waitForMeasurement({
    child,
    client,
    selector: ".composer-runtime-menu-dismiss-layer",
    timeoutMs,
    predicate: (measurement) =>
      (measurement?.rect?.width ?? 0) >= 1280 && (measurement?.rect?.height ?? 0) >= 820,
  });
  await tapSelector({
    child,
    client,
    point: "bottom-right",
    selector: ".composer-runtime-menu-dismiss-layer",
    timeoutMs,
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".composer-runtime-menu",
    timeoutMs,
    predicate: (measurement) => measurement === null,
  });
  const afterState = await readClientState(client);
  const afterTrigger = await waitForMeasurement({
    child,
    client,
    selector: ".composer-toolbar-control--runtime",
    timeoutMs,
    predicate: (measurement) => measurement?.text.trim() === trigger.text.trim(),
  });
  if (afterState?.activeThread?.runtimeMode !== beforeMode) {
    throw new Error(
      `Dismissing runtime menu changed the permission: ${JSON.stringify({
        beforeMode,
        afterMode: afterState?.activeThread?.runtimeMode,
      })}`,
    );
  }

  return {
    status: "pass",
    input: "DevTool Input.emulateTouchFromMouseEvent on measured runtime trigger and dismiss layer",
    runtimeMode: beforeMode,
    label: afterTrigger.text.trim(),
    trigger: trigger.rect,
    menu: menu.rect,
    activeItem: {
      text: activeItem.text.trim(),
      rect: activeItem.rect,
    },
    dismissLayer: dismissLayer.rect,
    dismissed: true,
    valueUnchanged: true,
  };
}

async function verifyModelOptionMenuMutation({ baseDir, child, client, timeoutMs }) {
  const beforeState = await selectSessionlessFixtureThread({
    baseDir,
    child,
    client,
    timeoutMs,
  });
  const providerFixture = {
    instanceId: "codex",
    driver: "codex",
    displayName: "Codex",
    showInteractionModeToggle: true,
    enabled: true,
    installed: true,
    version: "test",
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-08-16T00:00:00.000Z",
    availability: "available",
    models: [
      {
        slug: "gpt-5.6-sol",
        name: "gpt-5.6-sol",
        isCustom: false,
        isDefault: true,
        capabilities: {
          optionDescriptors: [
            {
              id: "reasoningEffort",
              label: "Reasoning",
              type: "select",
              options: [
                { id: "high", label: "High" },
                { id: "xhigh", label: "Extra High", isDefault: true },
              ],
            },
            {
              id: "contextWindow",
              label: "Context window",
              type: "select",
              options: [
                { id: "200k", label: "200k" },
                { id: "1m", label: "1M", isDefault: true },
              ],
            },
            {
              id: "thinking",
              label: "Thinking",
              type: "boolean",
              currentValue: false,
            },
          ],
        },
      },
    ],
    slashCommands: [],
    skills: [],
  };
  const fixtureResponse = await client.runCdp("Runtime.evaluate", {
    expression: `globalThis.__T3_LYNXTRON_MTS_PROVIDER_FIXTURE__?.(${JSON.stringify(providerFixture)})`,
    returnByValue: true,
  });
  if (commandResult(fixtureResponse)?.value !== true) {
    throw new Error(
      `Model-option provider fixture was not applied: ${JSON.stringify(fixtureResponse)}`,
    );
  }
  const threadId = beforeState?.activeThreadId;
  const beforeSelection = beforeState?.activeThread?.modelSelection;
  if (
    typeof threadId !== "string" ||
    typeof beforeSelection?.instanceId !== "string" ||
    typeof beforeSelection?.model !== "string"
  ) {
    throw new Error(`Model-option baseline is incomplete: ${JSON.stringify(beforeState)}`);
  }
  const trigger = await waitForMeasurement({
    child,
    client,
    selector: ".composer-toolbar-control--model-option",
    timeoutMs,
    predicate: (measurement) => Boolean(measurement?.text.trim()),
  });
  const beforeSequence = await readRendererReadiness(client);
  await tapSelector({
    child,
    client,
    selector: ".composer-toolbar-control--model-option",
    timeoutMs,
  });
  const menu = await waitForMeasurement({
    child,
    client,
    selector: ".composer-model-option-menu",
    timeoutMs,
    predicate: (measurement) => measurement !== null,
  });
  const target = await waitForMeasurement({
    child,
    client,
    selector: ".composer-model-option-menu__item--unselected",
    timeoutMs,
    predicate: (measurement) =>
      typeof measurement?.attributes["data-composer-model-option-descriptor"] === "string" &&
      typeof measurement?.attributes["data-composer-model-option-value"] === "string" &&
      typeof measurement?.attributes["data-composer-model-option-value-type"] === "string",
  });
  const descriptorId = target.attributes["data-composer-model-option-descriptor"];
  const valueText = target.attributes["data-composer-model-option-value"];
  const value =
    target.attributes["data-composer-model-option-value-type"] === "boolean"
      ? valueText === "true"
      : valueText;
  await tapSelector({
    child,
    client,
    selector: ".composer-model-option-menu__item--unselected",
    timeoutMs,
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".composer-model-option-menu",
    timeoutMs,
    predicate: (measurement) => measurement === null,
  });
  const afterSequence = await waitForSequenceAdvance({
    child,
    client,
    initial: beforeSequence,
    timeoutMs,
  });
  const afterState = await waitForClientState({
    child,
    client,
    timeoutMs,
    predicate: (state) =>
      state?.activeThreadId === threadId &&
      state?.activeThread?.modelSelection?.options?.some(
        (option) => option.id === descriptorId && option.value === value,
      ),
  });
  const persistedSelection = readPersistedThreadModelSelection(baseDir, threadId);
  if (
    JSON.stringify(persistedSelection?.options ?? null) !==
    JSON.stringify(afterState.activeThread.modelSelection.options ?? null)
  ) {
    throw new Error(
      `Model options did not persist: ${JSON.stringify({
        projected: afterState.activeThread.modelSelection.options,
        persisted: persistedSelection?.options,
      })}`,
    );
  }
  const afterTrigger = await waitForMeasurement({
    child,
    client,
    selector: ".composer-toolbar-control--model-option",
    timeoutMs,
    predicate: (measurement) => Boolean(measurement?.text.trim()),
  });
  await tapSelector({
    child,
    client,
    selector: ".composer-toolbar-control--model-option",
    timeoutMs,
  });
  const selected = await waitForMeasurement({
    child,
    client,
    selector: ".composer-model-option-menu__item--selected",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.attributes["data-composer-model-option-descriptor"] === descriptorId &&
      measurement?.attributes["data-composer-model-option-value"] === valueText,
  });
  const thinkingTarget = await waitForSelectorAttributeMeasurement({
    attribute: "data-composer-model-option-descriptor",
    child,
    client,
    selector: ".composer-model-option-menu__item--unselected",
    timeoutMs,
    value: "thinking",
  });
  const beforeThinkingSequence = await readRendererReadiness(client);
  await tapSelectorByAttribute({
    attribute: "data-composer-model-option-descriptor",
    child,
    client,
    selector: ".composer-model-option-menu__item--unselected",
    timeoutMs,
    value: "thinking",
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".composer-model-option-menu",
    timeoutMs,
    predicate: (measurement) => measurement === null,
  });
  const afterThinkingSequence = await waitForSequenceAdvance({
    child,
    client,
    initial: beforeThinkingSequence,
    timeoutMs,
  });
  const thinkingState = await waitForClientState({
    child,
    client,
    timeoutMs,
    predicate: (state) =>
      state?.activeThreadId === threadId &&
      state?.activeThread?.modelSelection?.options?.some(
        (option) => option.id === "thinking" && option.value === true,
      ),
  });
  const thinkingPersistedSelection = readPersistedThreadModelSelection(baseDir, threadId);
  if (
    JSON.stringify(thinkingPersistedSelection?.options ?? null) !==
    JSON.stringify(thinkingState.activeThread.modelSelection.options ?? null)
  ) {
    throw new Error(
      `Thinking option did not persist: ${JSON.stringify({
        projected: thinkingState.activeThread.modelSelection.options,
        persisted: thinkingPersistedSelection?.options,
      })}`,
    );
  }
  const thinkingTrigger = await waitForMeasurement({
    child,
    client,
    selector: ".composer-toolbar-control--model-option",
    timeoutMs,
    predicate: (measurement) => measurement?.text.includes("Thinking On"),
  });
  await tapSelector({
    child,
    client,
    selector: ".composer-toolbar-control--model-option",
    timeoutMs,
  });
  const selectedThinking = await waitForSelectorAttributeMeasurement({
    attribute: "data-composer-model-option-descriptor",
    child,
    client,
    selector: ".composer-model-option-menu__item--selected",
    timeoutMs,
    value: "thinking",
  });
  if (selectedThinking.attributes["data-composer-model-option-value"] !== "true") {
    throw new Error(`Thinking menu did not reopen selected: ${JSON.stringify(selectedThinking)}`);
  }
  const dismissLayer = await waitForMeasurement({
    child,
    client,
    selector: ".composer-model-option-menu-dismiss-layer",
    timeoutMs,
    predicate: (measurement) =>
      (measurement?.rect?.width ?? 0) >= 1280 && (measurement?.rect?.height ?? 0) >= 820,
  });
  await tapSelector({
    child,
    client,
    point: "bottom-right",
    selector: ".composer-model-option-menu-dismiss-layer",
    timeoutMs,
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".composer-model-option-menu",
    timeoutMs,
    predicate: (measurement) => measurement === null,
  });

  return {
    status: "pass",
    input:
      "DevTool Input.emulateTouchFromMouseEvent on measured model-option rows and dismiss layer",
    threadId,
    trigger: {
      before: trigger.text.trim(),
      after: afterTrigger.text.trim(),
      rect: trigger.rect,
    },
    menu: {
      rect: menu.rect,
      text: menu.text.trim(),
    },
    selectedOption: {
      descriptorId,
      value,
      label: selected.text.trim(),
      rect: selected.rect,
    },
    thinkingOption: {
      descriptorId: "thinking",
      beforeLabel: thinkingTarget.text.trim(),
      afterLabel: selectedThinking.text.trim(),
      value: true,
      rect: selectedThinking.rect,
    },
    selections: {
      before: beforeSelection.options ?? [],
      after: afterState.activeThread.modelSelection.options ?? [],
      persisted: persistedSelection.options ?? [],
      afterThinking: thinkingState.activeThread.modelSelection.options ?? [],
      persistedThinking: thinkingPersistedSelection.options ?? [],
    },
    sequence: {
      before: beforeSequence.lastSeq,
      after: afterSequence.lastSeq,
      beforeThinking: beforeThinkingSequence.lastSeq,
      afterThinking: afterThinkingSequence.lastSeq,
    },
    finalTrigger: thinkingTrigger.text.trim(),
    dismissLayer: dismissLayer.rect,
    reopenedSelected: true,
    dismissed: true,
  };
}

async function verifyComposerStopBehavior({
  child,
  client,
  devToolCli,
  outputDirectory,
  projectId,
  timeoutMs,
}) {
  const modelSelection = {
    instanceId: "opencode",
    model: "opencode/big-pickle",
  };
  await invokeConnector(client, "setModelSelection", { selection: modelSelection });
  const created = await invokeConnector(client, "createThread", {
    projectId,
    title: "Native stop acceptance",
  });
  if (typeof created?.threadId !== "string" || created.threadId.length === 0) {
    throw new Error(`createThread returned no thread id: ${JSON.stringify(created)}`);
  }
  const selectResponse = await client.runCdp("Runtime.evaluate", {
    expression: `globalThis.__T3_LYNXTRON_SELECT_THREAD__?.(${JSON.stringify(created.threadId)})`,
    returnByValue: true,
  });
  if (selectResponse?.exceptionDetails) {
    throw new Error(`Native thread selection failed: ${JSON.stringify(selectResponse)}`);
  }
  const selectedState = await waitForClientState({
    child,
    client,
    timeoutMs,
    predicate: (state) => state?.activeThreadId === created.threadId,
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".composer-primary-action",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.attributes["data-composer-primary-state"] === "disabled",
  });

  const beforeSend = await readRendererReadiness(client);
  await invokeConnector(client, "sendPrompt", {
    threadId: created.threadId,
    text: "Run `sleep 120` in the shell, then reply done. Do not modify files.",
  });
  const beforeStop = await waitForMeasurement({
    child,
    client,
    selector: ".composer-primary-action",
    timeoutMs,
    predicate: (measurement) => measurement?.attributes["data-composer-primary-state"] === "stop",
  });
  const runningSequence = await waitForSequenceAdvance({
    child,
    client,
    initial: beforeSend,
    timeoutMs,
  });
  const runningState = await waitForClientState({
    child,
    client,
    timeoutMs,
    predicate: (state) =>
      state?.activeThreadId === created.threadId &&
      (state?.sessionStatus === "starting" || state?.sessionStatus === "running"),
  });
  const screenshotPath = path.join(outputDirectory, "native-working.png");
  const screenshot = spawnSync(
    process.execPath,
    [
      devToolCli,
      "take-screenshot",
      "--client",
      client.identity.clientId,
      "--session",
      String(client.identity.sessionId),
      "--output",
      screenshotPath,
    ],
    { cwd: APP_ROOT, encoding: "utf8" },
  );
  if (screenshot.error) throw screenshot.error;
  if (screenshot.status !== 0 || !existsSync(screenshotPath)) {
    throw new Error(
      screenshot.stderr || screenshot.stdout || "Native working screenshot capture failed.",
    );
  }
  normalizeNativeScreenshotPng(screenshotPath);
  const primaryActionBeforeTap = await readComposerPrimaryActionDiagnostics(client);
  await tapSelector({
    child,
    client,
    selector: ".composer-primary-action",
    timeoutMs,
  });
  const primaryActionAfterTap = await readComposerPrimaryActionDiagnostics(client);
  if ((primaryActionAfterTap?.count ?? 0) <= (primaryActionBeforeTap?.count ?? 0)) {
    throw new Error(
      `Native Stop tap did not invoke the Composer handler: ${JSON.stringify({
        before: primaryActionBeforeTap,
        after: primaryActionAfterTap,
      })}`,
    );
  }
  const sequenceAfterTap = await waitForSequenceAdvance({
    child,
    client,
    initial: runningSequence,
    timeoutMs: Math.min(timeoutMs, 10_000),
  }).catch(async (error) => ({
    error: error instanceof Error ? error.message : String(error),
    latest: await readRendererReadiness(client),
  }));
  if ("error" in sequenceAfterTap) {
    throw new Error(
      `Native Stop tap did not emit a connector event: ${JSON.stringify(sequenceAfterTap)}`,
    );
  }
  let afterStop;
  try {
    afterStop = await waitForMeasurement({
      child,
      client,
      selector: ".composer-primary-action",
      timeoutMs: Math.min(timeoutMs, 15_000),
      predicate: (measurement) => measurement?.attributes["data-composer-primary-state"] !== "stop",
    });
  } catch (error) {
    const clientState = await readClientState(client).catch((stateError) => ({
      error: stateError instanceof Error ? stateError.message : String(stateError),
    }));
    throw new Error(
      `Native Stop emitted connector seq ${sequenceAfterTap.lastSeq} but kept rendering stop: ${
        error instanceof Error ? error.message : String(error)
      }; clientState=${JSON.stringify(clientState)}; primaryAction=${JSON.stringify({
        before: primaryActionBeforeTap,
        after: primaryActionAfterTap,
      })}`,
    );
  }
  const stoppedSequence = await waitForSequenceAdvance({
    child,
    client,
    initial: runningSequence,
    timeoutMs,
  });
  return {
    status: "pass",
    input: "DevTool Input.emulateTouchFromMouseEvent on the measured Native Stop control",
    threadId: created.threadId,
    modelSelection,
    screenshot: {
      path: screenshotPath,
      bytes: statSync(screenshotPath).size,
      sha256: sha256(screenshotPath),
    },
    selectedState,
    runningState,
    before: {
      state: beforeStop.attributes["data-composer-primary-state"] ?? null,
      ariaLabel: beforeStop.attributes["aria-label"] ?? null,
    },
    after: {
      state: afterStop.attributes["data-composer-primary-state"] ?? null,
      ariaLabel: afterStop.attributes["aria-label"] ?? null,
    },
    sequence: {
      beforeSend: beforeSend.lastSeq,
      running: runningSequence.lastSeq,
      afterTap: sequenceAfterTap,
      stopped: stoppedSequence.lastSeq,
    },
  };
}

async function verifyModelPickerFidelity({
  child,
  client,
  devToolCli,
  expectedTheme,
  outputDirectory,
  timeoutMs,
}) {
  await tapSelector({
    child,
    client,
    selector: ".composer-toolbar-control--model",
    timeoutMs,
  });
  const panel = await waitForMeasurement({
    child,
    client,
    selector: ".model-picker-panel",
    timeoutMs,
    predicate: (measurement) =>
      measurement !== null &&
      Math.abs((measurement.rect?.width ?? 0) - 360) <= 1 &&
      Math.abs((measurement.rect?.height ?? 0) - 346) <= 1,
  });
  const content = await waitForMeasurement({
    child,
    client,
    selector: ".model-picker-content",
    timeoutMs,
    predicate: (measurement) => measurement !== null,
  });
  const rail = await waitForMeasurement({
    child,
    client,
    selector: ".model-picker-rail-scroll",
    timeoutMs,
    predicate: (measurement) => measurement !== null,
  });
  const expectedColors =
    expectedTheme === "light"
      ? {
          panel: "rgb(255,255,255)",
          content: "rgb(255,255,255)",
          rail: "rgb(250,250,250)",
        }
      : {
          panel: "rgb(25,25,25)",
          content: "rgb(25,25,25)",
          rail: "rgba(255,255,255,0.0392157)",
        };
  const resolvedColors = {
    panel: panel.style.backgroundColor,
    content: content.style.backgroundColor,
    rail: rail.style.backgroundColor,
  };
  if (
    resolvedColors.panel !== expectedColors.panel ||
    resolvedColors.content !== expectedColors.content ||
    resolvedColors.rail !== expectedColors.rail
  ) {
    throw new Error(
      `Native model-picker theme drifted: ${JSON.stringify({
        expectedTheme,
        expectedColors,
        resolvedColors,
      })}`,
    );
  }
  const checkout = await waitForMeasurement({
    child,
    client,
    selector: ".composer-context-label--checkout",
    timeoutMs,
    predicate: (measurement) => measurement?.text.trim() === "Current checkout",
  });
  const screenshotPath = path.join(outputDirectory, "native-model-picker.png");
  const screenshot = spawnSync(
    process.execPath,
    [
      devToolCli,
      "take-screenshot",
      "--client",
      client.identity.clientId,
      "--session",
      String(client.identity.sessionId),
      "--output",
      screenshotPath,
    ],
    { cwd: APP_ROOT, encoding: "utf8" },
  );
  if (screenshot.error) throw screenshot.error;
  if (screenshot.status !== 0 || !existsSync(screenshotPath)) {
    throw new Error(
      screenshot.stderr || screenshot.stdout || "Native model-picker screenshot capture failed.",
    );
  }
  normalizeNativeScreenshotPng(screenshotPath);
  await tapSelector({
    child,
    client,
    selector: ".model-picker-close",
    timeoutMs,
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".model-picker-panel",
    timeoutMs,
    predicate: (measurement) => measurement === null,
  });
  await tapSelector({
    child,
    client,
    selector: ".composer-toolbar-control--model",
    timeoutMs,
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".model-picker-panel",
    timeoutMs,
    predicate: (measurement) => measurement !== null,
  });
  await tapSelector({
    child,
    client,
    selector: ".model-picker-dismiss-layer",
    point: "bottom-right",
    timeoutMs,
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".model-picker-panel",
    timeoutMs,
    predicate: (measurement) => measurement === null,
  });
  return {
    status: "pass",
    input:
      "DevTool Input.emulateTouchFromMouseEvent on measured Native trigger, Close control, and outside dismiss layer",
    panel: {
      rect: panel.rect,
      attributes: panel.attributes,
    },
    colors: resolvedColors,
    checkoutLabel: checkout.text.trim(),
    dismissed: {
      closeButton: true,
      outsideTap: true,
    },
    screenshot: {
      path: screenshotPath,
      bytes: statSync(screenshotPath).size,
      sha256: sha256(screenshotPath),
    },
  };
}

async function verifyComposerWorkingState({ client, devToolCli, outputDirectory, stopEvidence }) {
  const composer = await readComposerOutcome(client, { allowMissingInteraction: true });
  assertComposerGeometry(composer, { allowMissingInteraction: true });
  const primaryAction = composer.anchors.primaryAction;
  if (primaryAction.attributes["data-composer-primary-state"] !== "stop") {
    throw new Error(
      `Canonical working Composer did not render Stop: ${JSON.stringify(primaryAction)}`,
    );
  }
  const [timelineList] = await readSelectorRects(client, ".timeline-list");
  const [firstRow] = await readSelectorRects(client, ".timeline-row-root");
  const [workingRowRoot] = await readSelectorRects(client, ".timeline-row-root--working");
  const [workingRow] = await readSelectorRects(client, ".transcript-working-row");
  const checkoutLabel = composer.typography.contextCheckout.text.trim();
  const transcriptGeometryMatches =
    timelineList &&
    firstRow &&
    workingRowRoot &&
    workingRow &&
    Math.abs(firstRow.y - (timelineList.y + 16)) <= 1 &&
    Math.abs(workingRowRoot.height - 40) <= 0.5 &&
    Math.abs(workingRow.height - 24) <= 0.5;
  if (!transcriptGeometryMatches || checkoutLabel !== "Local checkout") {
    throw new Error(
      `Canonical working transcript geometry drifted: ${JSON.stringify({
        timelineList,
        firstRow,
        workingRowRoot,
        workingRow,
        checkoutLabel,
      })}`,
    );
  }
  const screenshotPath = path.join(outputDirectory, "native-working.png");
  const screenshot = spawnSync(
    process.execPath,
    [
      devToolCli,
      "take-screenshot",
      "--client",
      client.identity.clientId,
      "--session",
      String(client.identity.sessionId),
      "--output",
      screenshotPath,
    ],
    { cwd: APP_ROOT, encoding: "utf8" },
  );
  if (screenshot.error) throw screenshot.error;
  if (screenshot.status !== 0 || !existsSync(screenshotPath)) {
    throw new Error(
      screenshot.stderr || screenshot.stdout || "Native working screenshot capture failed.",
    );
  }
  normalizeNativeScreenshotPng(screenshotPath);
  return {
    status: "pass",
    primaryAction: {
      state: primaryAction.attributes["data-composer-primary-state"] ?? null,
      ariaLabel: primaryAction.attributes["aria-label"] ?? null,
      ariaDisabled: primaryAction.attributes["aria-disabled"] ?? null,
    },
    transcript: {
      timelineList,
      firstRow,
      workingRowRoot,
      workingRow,
      checkoutLabel,
    },
    screenshot: {
      path: screenshotPath,
      bytes: statSync(screenshotPath).size,
      sha256: sha256(screenshotPath),
    },
    stopEvidence,
  };
}

async function verifyCompletedTranscriptState({ client, devToolCli, outputDirectory }) {
  const composer = await readComposerOutcome(client, { allowMissingInteraction: true });
  assertComposerGeometry(composer, { allowMissingInteraction: true });
  const primaryAction = composer.anchors.primaryAction;
  if (primaryAction.attributes["data-composer-primary-state"] !== "disabled") {
    throw new Error(
      `Canonical completed Composer was not idle-disabled: ${JSON.stringify(primaryAction)}`,
    );
  }
  const [timelineHost] = await readSelectorRects(client, ".timeline-host");
  const [timelineList] = await readSelectorRects(client, ".timeline-list");
  const rowRoots = await readSelectorRects(client, ".timeline-row-root");
  const assistantRowRoot = rowRoots[1];
  const assistantRowMeasurement = await readOptionalMeasurement(
    client,
    ".transcript-assistant-row",
  );
  const assistantRow = assistantRowMeasurement?.rect;
  const assistantText = assistantRowMeasurement?.text.trim();
  const checkoutLabel = composer.typography.contextCheckout.text.trim();
  const transcriptGeometryMatches =
    timelineHost &&
    timelineList &&
    rowRoots.length === 2 &&
    assistantRowRoot &&
    assistantRow &&
    Math.abs(rowRoots[0].y - (timelineHost.y + 48)) <= 1 &&
    Math.abs(assistantRowRoot.y - (rowRoots[0].y + rowRoots[0].height)) <= 1 &&
    Math.abs(assistantRowRoot.height - (assistantRow.height + 16)) <= 0.5;
  if (
    !transcriptGeometryMatches ||
    assistantText !== "fidelity loop complete" ||
    checkoutLabel !== "Local checkout"
  ) {
    throw new Error(
      `Canonical completed transcript drifted: ${JSON.stringify({
        timelineHost,
        timelineList,
        rowRoots,
        assistantRowRoot,
        assistantRow,
        assistantText,
        checkoutLabel,
      })}`,
    );
  }
  const screenshot = captureNativeScreenshot({
    client,
    devToolCli,
    outputDirectory,
    name: "native-completed.png",
  });
  return {
    status: "pass",
    primaryAction: {
      state: primaryAction.attributes["data-composer-primary-state"] ?? null,
      ariaLabel: primaryAction.attributes["aria-label"] ?? null,
      ariaDisabled: primaryAction.attributes["aria-disabled"] ?? null,
    },
    transcript: {
      timelineHost,
      timelineList,
      rowRoots,
      assistantRowRoot,
      assistantRow,
      assistantText,
      checkoutLabel,
    },
    screenshot,
  };
}

async function verifyFailedTranscriptState({ client, devToolCli, outputDirectory }) {
  const composer = await readComposerOutcome(client, { allowMissingInteraction: true });
  assertComposerGeometry(composer, { allowMissingInteraction: true });
  const primaryAction = composer.anchors.primaryAction;
  const modelText = composer.anchors.model.text.trim();
  const [errorBanner] = await readSelectorRects(client, ".thread-error-banner");
  const errorDescription = await readOptionalMeasurement(client, ".thread-error-description");
  const [timelineHost] = await readSelectorRects(client, ".timeline-host");
  const rowRoots = await readSelectorRects(client, ".timeline-row-root");
  const errorWorkEntry = await readOptionalMeasurement(client, ".transcript-work-status--failed");
  const checkoutLabel = composer.typography.contextCheckout.text.trim();
  const matches =
    primaryAction.attributes["data-composer-primary-state"] === "disabled" &&
    modelText === "Big Pickle" &&
    errorBanner &&
    errorDescription?.text.includes("Model not found: opencode/not-a-real-model.") &&
    timelineHost &&
    rowRoots.length === 2 &&
    Math.abs(rowRoots[0].y - (timelineHost.y + 16)) <= 1 &&
    errorWorkEntry !== null &&
    checkoutLabel === "Local checkout";
  if (!matches) {
    throw new Error(
      `Canonical failed transcript drifted: ${JSON.stringify({
        primaryAction,
        modelText,
        errorBanner,
        errorDescription,
        timelineHost,
        rowRoots,
        errorWorkEntry,
        checkoutLabel,
      })}`,
    );
  }
  const screenshot = captureNativeScreenshot({
    client,
    devToolCli,
    outputDirectory,
    name: "native-failed.png",
  });
  return {
    status: "pass",
    primaryAction: {
      state: primaryAction.attributes["data-composer-primary-state"] ?? null,
      ariaLabel: primaryAction.attributes["aria-label"] ?? null,
      ariaDisabled: primaryAction.attributes["aria-disabled"] ?? null,
    },
    modelText,
    errorBanner,
    errorDescription: errorDescription.text.trim(),
    timelineHost,
    rowRoots,
    errorWorkEntry: {
      rect: errorWorkEntry.rect,
      text: errorWorkEntry.text.trim(),
      attributes: errorWorkEntry.attributes,
    },
    checkoutLabel,
    screenshot,
  };
}

async function verifyApprovalTranscriptState({
  approvalFixture,
  client,
  devToolCli,
  outputDirectory,
}) {
  const clientState = await readClientState(client);
  const frame = await readOptionalMeasurement(client, ".composer-frame");
  const surface = await readOptionalMeasurement(client, ".composer-surface--approval");
  const pending = await readOptionalMeasurement(client, ".composer-pending-approval");
  const detail = await readOptionalMeasurement(client, ".composer-pending-approval__detail");
  const editor = await readOptionalMeasurement(client, ".composer-editor-area--approval");
  const editorValue = await readOptionalMeasurement(client, ".composer__input--approval");
  const footer = await readOptionalMeasurement(client, ".composer-footer--approval");
  const actionSpecs = [
    [".composer-approval-action--cancel", "Cancel turn", 97],
    [".composer-approval-action--decline", "Decline", 69],
    [".composer-approval-action--session", "Always allow this session", 184],
    [".composer-approval-action--accept", "Approve once", 112],
  ];
  const actions = await Promise.all(
    actionSpecs.map(async ([selector, label, width]) => ({
      selector,
      label,
      width,
      measurement: await readOptionalMeasurement(client, selector),
    })),
  );
  const approximately = (actual, expected, tolerance = 0.75) =>
    typeof actual === "number" && Math.abs(actual - expected) <= tolerance;
  const rectMatches = (measurement, expected) => {
    const rect = measurement?.rect;
    return (
      rect && Object.entries(expected).every(([key, value]) => approximately(rect[key], value))
    );
  };
  const actionGeometryMatches = actions.every((action, index) => {
    const previous = actions[index - 1]?.measurement?.rect;
    const rect = action.measurement?.rect;
    return (
      rectMatches(action.measurement, { width: action.width, height: 28 }) &&
      action.measurement?.text.trim() === action.label &&
      approximately(rect?.y, footer?.rect?.y) &&
      (index === 0
        ? approximately(rect?.x, (footer?.rect?.x ?? 0) + 12)
        : approximately(rect?.x, (previous?.x ?? 0) + (previous?.width ?? 0) + 8))
    );
  });
  const expectedDetail = approvalFixture.activity?.payload?.detail;
  const stateMatches =
    clientState?.activeThreadId === approvalFixture.threadId &&
    clientState?.activeThread?.id === approvalFixture.threadId &&
    clientState?.activeThread?.hasPendingApprovals === true &&
    clientState?.activeThread?.modelSelection?.instanceId ===
      approvalFixture.modelSelection?.instanceId &&
    clientState?.activeThread?.modelSelection?.model === approvalFixture.modelSelection?.model &&
    clientState?.sessionStatus === approvalFixture.sessionStatus &&
    clientState?.sessionStatus === "running" &&
    clientState?.activeTurnId === approvalFixture.activeTurnId &&
    frame?.attributes["data-composer-state"] === "working";
  const contentMatches =
    typeof expectedDetail === "string" &&
    pending?.text.includes("PENDING APPROVAL") &&
    pending.text.includes("Command approval requested") &&
    pending.text.includes("Command") &&
    pending.text.includes(expectedDetail) &&
    detail?.text.includes(expectedDetail) &&
    editorValue?.text.trim() === expectedDetail;
  const geometryMatches =
    rectMatches(frame, { width: 768, height: 247 }) &&
    rectMatches(surface, { width: 766, height: 245 }) &&
    rectMatches(pending, { width: 766, height: 114 }) &&
    rectMatches(detail, { width: 726, height: 50 }) &&
    rectMatches(editor, { width: 766, height: 90 }) &&
    rectMatches(footer, { width: 766, height: 40 }) &&
    approximately(surface?.rect?.x, (frame?.rect?.x ?? 0) + 1) &&
    approximately(surface?.rect?.y, (frame?.rect?.y ?? 0) + 1) &&
    approximately(pending?.rect?.x, surface?.rect?.x) &&
    approximately(pending?.rect?.y, surface?.rect?.y) &&
    approximately(detail?.rect?.x, (pending?.rect?.x ?? 0) + 20) &&
    approximately(detail?.rect?.y, (pending?.rect?.y ?? 0) + 48) &&
    approximately(editor?.rect?.x, surface?.rect?.x) &&
    approximately(editor?.rect?.y, (pending?.rect?.y ?? 0) + 115) &&
    approximately(footer?.rect?.x, surface?.rect?.x) &&
    approximately(footer?.rect?.y, (editor?.rect?.y ?? 0) + (editor?.rect?.height ?? 0)) &&
    approximately(
      (footer?.rect?.y ?? 0) + (footer?.rect?.height ?? 0),
      (surface?.rect?.y ?? 0) + (surface?.rect?.height ?? 0),
    ) &&
    actionGeometryMatches;
  if (!stateMatches || !contentMatches || !geometryMatches) {
    throw new Error(
      `Canonical approval transcript drifted: ${JSON.stringify({
        clientState,
        frame,
        surface,
        pending,
        detail,
        editor,
        editorValue,
        footer,
        actions,
        expectedDetail,
        stateMatches,
        contentMatches,
        geometryMatches,
      })}`,
    );
  }
  const screenshot = captureNativeScreenshot({
    client,
    devToolCli,
    outputDirectory,
    name: "native-approval.png",
  });
  return {
    status: "pass",
    fixture: {
      threadId: approvalFixture.threadId,
      requestedTitle: approvalFixture.title,
      renderedTitle: clientState.activeThread.title,
      requestId: approvalFixture.activity.payload.requestId,
      activeTurnId: approvalFixture.activeTurnId,
    },
    semanticState: {
      transport: "main",
      sessionStatus: clientState.sessionStatus,
      composerState: frame.attributes["data-composer-state"],
      primaryState: "stop",
    },
    content: {
      pending: pending.text.trim(),
      detail: expectedDetail,
      actions: actions.map((action) => action.measurement.text.trim()),
    },
    geometry: {
      frame: frame.rect,
      surface: surface.rect,
      pending: pending.rect,
      detail: detail.rect,
      editor: editor.rect,
      footer: footer.rect,
      actions: actions.map((action) => action.measurement.rect),
    },
    screenshot,
  };
}

async function verifyApprovalDeclineMutation({
  approvalFixture,
  baseDir,
  bundle,
  child,
  client,
  desktopDir,
  devToolCli,
  executable,
  height,
  projectCwd,
  timeoutMs,
  width,
}) {
  const threadId = approvalFixture.threadId;
  const requestId = approvalFixture.activity.payload.requestId;
  const selector = ".composer-approval-action--decline";
  const before = await waitForMeasurement({
    child,
    client,
    selector,
    timeoutMs,
    predicate: (measurement) => measurement?.text.trim() === "Decline",
  });
  const beforeSequence = await readRendererReadiness(client);

  await tapSelector({ child, client, selector, timeoutMs });
  const resolvedState = await waitForClientState({
    child,
    client,
    timeoutMs,
    predicate: (state) =>
      state?.activeThreadId === threadId &&
      state?.activeThread?.hasPendingApprovals === false &&
      state?.approvalReceipts?.some(
        (receipt) =>
          receipt.kind === "provider.approval.respond.failed" && receipt.requestId === requestId,
      ) === true,
  });
  const afterSequence = await waitForSequenceAdvance({
    child,
    client,
    initial: beforeSequence,
    timeoutMs,
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".composer-pending-approval",
    timeoutMs,
    predicate: (measurement) => measurement === null,
  });
  const resolvedReceipt = resolvedState.approvalReceipts.find(
    (receipt) => receipt.kind === "approval.resolved" && receipt.requestId === requestId,
  );
  if (resolvedReceipt) {
    throw new Error(
      `Stale approval decline faked a resolution receipt: ${JSON.stringify(resolvedReceipt)}`,
    );
  }

  const initialProcessId = child.pid;
  const initialClient = client.identity;
  const initialRendererErrors = readRendererErrors({
    clientId: client.identity.clientId,
    devToolCli,
    sessionId: client.identity.sessionId,
  });
  if (initialRendererErrors) {
    throw new Error(`Renderer errors before Approval cold restart:\n${initialRendererErrors}`);
  }
  await client.close();
  await stopOwnedProcess(child);

  const restartedChild = spawn(executable, [desktopDir], {
    cwd: APP_ROOT,
    env: {
      ...process.env,
      NODE_ENV: "production",
      T3_LYNXTRON_BASE_DIR: baseDir,
      T3_LYNXTRON_PROJECT_CWD: projectCwd,
      T3_LYNXTRON_VIEWPORT_WIDTH: String(width),
      T3_LYNXTRON_VIEWPORT_HEIGHT: String(height),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (!Number.isInteger(restartedChild.pid) || restartedChild.pid <= 0) {
    throw new Error("Approval cold restart did not return an owned process id.");
  }
  const restartedLog = createLogCapture(restartedChild);
  let restartedClient;
  try {
    restartedClient = await waitForOwnedSession({
      child: restartedChild,
      devToolCli,
      expectedBundleUrl: pathToFileURL(bundle).href,
      timeoutMs,
    });
    await waitForLogText(restartedChild, restartedLog, "T3 Code server is ready", timeoutMs);
    const restartTransport = await waitForMainTransport({
      child: restartedChild,
      client: restartedClient,
      timeoutMs,
    });
    const restartSelectResponse = await restartedClient.runCdp("Runtime.evaluate", {
      expression: `globalThis.__T3_LYNXTRON_SELECT_THREAD__?.(${JSON.stringify(threadId)})`,
      returnByValue: true,
    });
    if (restartSelectResponse?.exceptionDetails) {
      throw new Error(
        `Approval cold restart thread selection failed: ${JSON.stringify(restartSelectResponse)}`,
      );
    }
    const restartedState = await waitForClientState({
      child: restartedChild,
      client: restartedClient,
      timeoutMs,
      predicate: (state) =>
        state?.activeThreadId === threadId && state?.activeThread?.hasPendingApprovals === false,
    });
    await waitForMeasurement({
      child: restartedChild,
      client: restartedClient,
      selector: ".composer-pending-approval",
      timeoutMs,
      predicate: (measurement) => measurement === null,
    });

    return {
      outcome: {
        status: "pass",
        input: "DevTool touch on the measured Decline action",
        threadId,
        requestId,
        before,
        sequence: { before: beforeSequence.lastSeq, after: afterSequence.lastSeq },
        receipt: resolvedState.approvalReceipts.find(
          (receipt) =>
            receipt.requestId === requestId && receipt.kind === "provider.approval.respond.failed",
        ),
        pendingRemoved: true,
        coldRestart: {
          initialProcessId,
          initialClient,
          restartedProcessId: restartedChild.pid,
          restartedClient: restartedClient.identity,
          transport: restartTransport,
          replayedReceipt:
            restartedState.approvalReceipts.find(
              (receipt) =>
                receipt.requestId === requestId &&
                receipt.kind === "provider.approval.respond.failed",
            ) ?? null,
          pendingRestored: false,
        },
      },
      child: restartedChild,
      client: restartedClient,
      log: restartedLog,
    };
  } catch (error) {
    await restartedClient?.close();
    await stopOwnedProcess(restartedChild);
    throw error;
  }
}

async function verifyQuestionTranscriptState({
  child,
  client,
  devToolCli,
  outputDirectory,
  questionFixture,
  timeoutMs,
}) {
  const question = questionFixture.activity.payload.questions[0];
  const clientState = await readClientState(client);
  const frame = await readOptionalMeasurement(client, ".composer-frame");
  const surface = await readOptionalMeasurement(client, ".composer-surface--question");
  const pending = await readOptionalMeasurement(client, ".composer-pending-question");
  const editor = await readOptionalMeasurement(client, ".composer-editor-area--question");
  const footer = await readOptionalMeasurement(client, ".composer-footer--question");
  const optionRects = await readSelectorRects(client, ".composer-pending-question__option");
  const firstOption = await readOptionalMeasurement(client, ".composer-pending-question__option");
  const approximately = (actual, expected, tolerance = 1) =>
    typeof actual === "number" && Math.abs(actual - expected) <= tolerance;
  const stateMatches =
    clientState?.activeThreadId === questionFixture.threadId &&
    clientState?.activeThread?.id === questionFixture.threadId &&
    clientState?.activeThread?.hasPendingUserInput === true &&
    clientState?.sessionStatus === "running" &&
    clientState?.activeTurnId === questionFixture.activeTurnId &&
    frame?.attributes["data-composer-state"] === "working";
  const contentMatches =
    pending?.text.includes(question.header) &&
    pending.text.includes(question.question) &&
    question.options.every((option) => pending.text.includes(option.label)) &&
    optionRects.length === question.options.length &&
    firstOption?.text.includes(question.options[0].label) === true;
  const geometryMatches =
    approximately(frame?.rect?.width, 768) &&
    approximately(frame?.rect?.height, 343.5) &&
    approximately(surface?.rect?.width, 766) &&
    approximately(surface?.rect?.height, 341.5) &&
    approximately(editor?.rect?.width, 766) &&
    approximately(editor?.rect?.height, 90) &&
    approximately(footer?.rect?.width, 766) &&
    approximately(footer?.rect?.height, 48) &&
    approximately(footer?.rect?.y, (editor?.rect?.y ?? 0) + (editor?.rect?.height ?? 0));
  if (!stateMatches || !contentMatches || !geometryMatches) {
    throw new Error(
      `Canonical question transcript drifted: ${JSON.stringify({
        clientState,
        frame,
        surface,
        pending,
        editor,
        footer,
        optionRects,
        firstOption,
        stateMatches,
        contentMatches,
        geometryMatches,
      })}`,
    );
  }

  const selectedLabel = question.options[0].label;
  await tapSelector({
    child,
    client,
    selector: ".composer-pending-question__option",
    timeoutMs,
  });
  const selectedOption = await waitForMeasurement({
    child,
    client,
    selector: ".composer-pending-question__option",
    timeoutMs,
    predicate: (measurement) => measurement?.attributes["data-question-option-selected"] === "true",
  });
  const submit = await waitForMeasurement({
    child,
    client,
    selector: ".composer-question-submit",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.attributes["aria-disabled"] === "false" && measurement.text.trim() === "Submit",
  });
  const screenshot = captureNativeScreenshot({
    client,
    devToolCli,
    outputDirectory,
    name: "native-question.png",
  });
  const beforeSubmit = await readRendererReadiness(client);
  await tapSelector({
    child,
    client,
    selector: ".composer-question-submit",
    timeoutMs,
  });
  const afterSubmit = await waitForSequenceAdvance({
    child,
    client,
    initial: beforeSubmit,
    timeoutMs,
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".composer-pending-question",
    timeoutMs,
    predicate: (measurement) => measurement === null,
  });
  const resolvedState = await waitForClientState({
    child,
    client,
    timeoutMs,
    predicate: (state) =>
      state?.activeThreadId === questionFixture.threadId &&
      state?.activeThread?.hasPendingUserInput === false,
  });

  return {
    status: "pass",
    fixture: {
      threadId: questionFixture.threadId,
      requestId: questionFixture.activity.payload.requestId,
      activeTurnId: questionFixture.activeTurnId,
      questionId: question.id,
    },
    content: {
      header: question.header,
      question: question.question,
      options: question.options.map((option) => option.label),
      selectedLabel,
      submitLabel: submit.text.trim(),
    },
    geometry: {
      frame: frame.rect,
      surface: surface.rect,
      editor: editor.rect,
      footer: footer.rect,
      options: optionRects,
      selectedOption: selectedOption.rect,
      submit: submit.rect,
    },
    sequence: {
      beforeSubmit: beforeSubmit.lastSeq,
      afterSubmit: afterSubmit.lastSeq,
    },
    resolvedState,
    screenshot,
  };
}

async function verifyReviewDiffState({
  child,
  client,
  devToolCli,
  outputDirectory,
  reviewFixture,
  timeoutMs,
}) {
  const checkpoint = reviewFixture.checkpoint;
  const expectedFile = checkpoint.files[0];
  const clientState = await waitForClientState({
    child,
    client,
    timeoutMs,
    predicate: (state) =>
      state?.activeThreadId === reviewFixture.threadId && state?.latestTurn?.state === "completed",
  });
  const checkpointCard = await waitForMeasurement({
    child,
    client,
    selector: ".turn-diff-card",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.attributes["data-review-checkpoint-status"] === "ready" &&
      measurement?.attributes["data-review-turn-id"] === checkpoint.turnId &&
      measurement.text.includes(expectedFile.path),
  });
  await tapSelector({
    child,
    client,
    selector: "[data-review-open-diff]",
    timeoutMs,
  });
  const rightPanel = await waitForMeasurement({
    child,
    client,
    selector: ".right-panel",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.attributes["data-right-panel-open"] === "true" &&
      measurement?.attributes["data-right-panel-active-kind"] === "diff",
  });
  const diffSurface = await waitForMeasurement({
    child,
    client,
    selector: ".diff-panel",
    timeoutMs,
    predicate: (measurement) => measurement !== null,
  });
  const diffFile = await waitForMeasurement({
    child,
    client,
    selector: ".diff-code-file",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.attributes["data-review-file-path"] === expectedFile.path &&
      measurement.text.includes("original review fixture") &&
      measurement.text.includes("updated by T3 review fixture"),
  });
  const loading = await readOptionalMeasurement(client, "[data-review-patch-loading]");
  const error = await readOptionalMeasurement(client, "[data-review-patch-error]");
  if (loading || error) {
    throw new Error(
      `Native review diff retained a transient/error state: ${JSON.stringify({ loading, error })}`,
    );
  }
  const composer = await waitForMeasurement({
    child,
    client,
    selector: ".composer-frame",
    timeoutMs,
    predicate: (measurement) => measurement?.attributes["data-composer-state"] === "idle",
  });
  const screenshot = captureNativeScreenshot({
    client,
    devToolCli,
    outputDirectory,
    name: "native-review-diff.png",
  });

  return {
    status: "pass",
    fixture: {
      threadId: reviewFixture.threadId,
      turnId: checkpoint.turnId,
      file: expectedFile,
    },
    clientState,
    checkpointCard: {
      rect: checkpointCard.rect,
      text: checkpointCard.text,
    },
    rightPanel: {
      rect: rightPanel.rect,
      activeKind: rightPanel.attributes["data-right-panel-active-kind"],
    },
    diffSurface: {
      rect: diffSurface.rect,
      selectedTurn: checkpoint.turnId,
    },
    diffFile: {
      rect: diffFile.rect,
      path: diffFile.attributes["data-review-file-path"],
      text: diffFile.text,
    },
    composer: {
      rect: composer.rect,
      state: composer.attributes["data-composer-state"],
    },
    screenshot,
  };
}

async function verifyReviewCheckpointStates({
  child,
  client,
  devToolCli,
  outputDirectory,
  reviewFixture,
  timeoutMs,
}) {
  const checkpoint = reviewFixture.checkpoint;
  const restored = await restoreOutcomeSurface({ child, client, timeoutMs });
  await waitForClientState({
    child,
    client,
    timeoutMs,
    predicate: (state) =>
      state?.activeThreadId === reviewFixture.threadId && state?.latestTurn?.state === "completed",
  });
  let checkpointCard = await waitForMeasurement({
    child,
    client,
    selector: ".turn-diff-card",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.attributes["data-review-checkpoint-status"] === "ready" &&
      measurement?.attributes["data-review-turn-id"] === checkpoint.turnId,
  });
  if (checkpointCard.attributes["data-changed-files-state"] === "expanded") {
    await tapSelector({
      child,
      client,
      selector: ".turn-diff-card__toggle",
      timeoutMs,
    });
  }
  const preview = await waitForMeasurement({
    child,
    client,
    selector: ".turn-diff-card",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.attributes["data-changed-files-state"] === "preview" &&
      Math.abs(measurement.rect.height - 106) <= 1 &&
      measurement.text.includes(checkpoint.files[0].path),
  });
  const previewTree = await readOptionalMeasurement(client, "[data-review-tree]");
  if (previewTree) {
    throw new Error(
      `Review checkpoint preview retained an expanded tree: ${JSON.stringify(previewTree)}`,
    );
  }
  const previewScreenshot = captureNativeScreenshot({
    client,
    devToolCli,
    outputDirectory,
    name: "native-review-checkpoint-preview.png",
  });
  await tapSelector({
    child,
    client,
    selector: ".turn-diff-card__toggle",
    timeoutMs,
  });
  checkpointCard = await waitForMeasurement({
    child,
    client,
    selector: ".turn-diff-card",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.attributes["data-changed-files-state"] === "expanded" &&
      Math.abs(measurement.rect.height - 79) <= 1,
  });
  const tree = await waitForMeasurement({
    child,
    client,
    selector: "[data-review-tree]",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.attributes["data-review-file-count"] === "1" &&
      measurement.text.includes(checkpoint.files[0].path),
  });
  const treeRows = await readSelectorRects(client, "[data-review-file-path]");
  if (treeRows.length !== 1) {
    throw new Error(`Review tree did not expose one file row: ${JSON.stringify(treeRows)}`);
  }
  const treeScreenshot = captureNativeScreenshot({
    client,
    devToolCli,
    outputDirectory,
    name: "native-review-tree.png",
  });
  return {
    status: "pass",
    fixture: {
      threadId: reviewFixture.threadId,
      turnId: checkpoint.turnId,
      file: checkpoint.files[0],
    },
    restored,
    preview: {
      card: preview.rect,
      tree: null,
      screenshot: previewScreenshot,
    },
    expanded: {
      card: checkpointCard.rect,
      tree: tree.rect,
      rows: treeRows,
      screenshot: treeScreenshot,
    },
  };
}

async function verifyRuntimeCapabilities(client) {
  let keyDispatchError = null;
  try {
    await client.runCdp("Input.dispatchKeyEvent", {
      type: "char",
      text: "x",
      unmodifiedText: "x",
    });
  } catch (error) {
    keyDispatchError = error instanceof Error ? error.message : String(error);
  }
  const runtimeResponse = await client.runCdp("Runtime.evaluate", {
    expression:
      "JSON.stringify({Worker:typeof Worker,OffscreenCanvas:typeof OffscreenCanvas,Blob:typeof Blob,URL:typeof URL,kind:globalThis.__T3_LYNXTRON_CONNECTOR_TRANSPORT__?.kind ?? null})",
    returnByValue: true,
  });
  const runtimeResult = commandResult(runtimeResponse);
  const runtime = typeof runtimeResult?.value === "string" ? JSON.parse(runtimeResult.value) : null;
  if (
    !keyDispatchError?.includes("Not implemented") ||
    runtime?.Worker !== "undefined" ||
    runtime?.OffscreenCanvas !== "undefined" ||
    runtime?.Blob !== "undefined" ||
    runtime?.kind !== "main"
  ) {
    throw new Error(
      `Runtime capability blocker contract changed: ${JSON.stringify({
        keyDispatchError,
        runtime,
      })}`,
    );
  }
  return {
    status: "pass",
    R5: {
      operation: "Input.dispatchKeyEvent",
      error: keyDispatchError,
    },
    R10: runtime,
  };
}

async function verifyShellInteractions({ child, client, timeoutMs }) {
  const initialRightPanel = await readOptionalMeasurement(client, ".right-panel");
  if (initialRightPanel) {
    await tapSelector({
      child,
      client,
      selector: ".right-panel__layout-control--close",
      timeoutMs,
    });
    await waitForMeasurement({
      child,
      client,
      selector: ".right-panel",
      timeoutMs,
      predicate: (measurement) => measurement === null,
    });
  }
  const terminalControl = await waitForMeasurement({
    child,
    client,
    selector: ".topbar__toggle--terminal",
    timeoutMs,
    predicate: (measurement) => typeof measurement?.attributes.bindtap === "string",
  });
  await tapSelector({
    child,
    client,
    selector: ".topbar__toggle--terminal",
    timeoutMs,
  });
  const terminalPanel = await waitForMeasurement({
    child,
    client,
    selector: ".right-panel",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.attributes["data-right-panel-active-kind"] === "terminal",
  });
  const terminal = await waitForMeasurement({
    child,
    client,
    selector: ".terminal-placeholder",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.text.includes("Terminal sessions are not connected yet") === true,
  });
  const rightPanel = await waitForMeasurement({
    child,
    client,
    selector: ".right-panel",
    timeoutMs,
    predicate: (measurement) => measurement?.attributes["data-right-panel-open"] === "true",
  });
  await tapSelector({
    child,
    client,
    selector: ".right-panel__layout-control--close",
    timeoutMs,
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".right-panel",
    timeoutMs,
    predicate: (measurement) => measurement === null,
  });
  await tapSelector({
    child,
    client,
    selector: ".topbar__toggle--right-panel",
    timeoutMs,
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".right-panel",
    timeoutMs,
    predicate: (measurement) => measurement !== null,
  });
  await tapSelector({
    child,
    client,
    selector: ".right-panel__layout-control--close",
    timeoutMs,
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".right-panel",
    timeoutMs,
    predicate: (measurement) => measurement === null,
  });

  await tapSelector({
    child,
    client,
    selector: "[data-sidebar-thread-action-trigger]",
    timeoutMs,
  });
  const menu = await waitForMeasurement({
    child,
    client,
    selector: ".sidebar-v2-action-menu",
    timeoutMs,
    predicate: (measurement) => measurement !== null,
  });
  const items = await readSelectorRects(client, ".sidebar-v2-action-menu__item");
  const rowsValid =
    items.length >= 5 &&
    items.every((rect) => Math.abs(rect.height - 30) <= 0.5) &&
    items.every(
      (rect, index) =>
        index === 0 || Math.abs(rect.y - (items[index - 1].y + items[index - 1].height)) <= 0.5,
    );
  if (!rowsValid || (menu.rect?.height ?? 0) < items.length * 30 + 8) {
    throw new Error(
      `Sidebar action menu rows collapsed: ${JSON.stringify({ menu: menu.rect, items })}`,
    );
  }
  await tapSelector({
    child,
    client,
    selector: ".sidebar-v2-action-menu-dismiss",
    point: "bottom-right",
    timeoutMs,
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".sidebar-v2-action-menu",
    timeoutMs,
    predicate: (measurement) => measurement === null,
  });

  return {
    status: "pass",
    terminal: {
      control: terminalControl.rect,
      panel: terminalPanel.rect,
      rect: terminal.rect,
      placeholder: true,
    },
    rightPanel: {
      rect: rightPanel.rect,
      terminalOpen: true,
      titlebarToggleOpen: true,
      closeControl: true,
    },
    sidebarMenu: {
      rect: menu.rect,
      items,
      dismissed: true,
    },
  };
}

async function verifyGitPublishDialog({ child, client, timeoutMs }) {
  let headerAction;
  try {
    headerAction = await waitForMeasurement({
      child,
      client,
      selector: ".action-btn--commit",
      timeoutMs,
      predicate: (measurement) =>
        measurement?.attributes["data-git-quick-action-kind"] === "open_publish" &&
        measurement.attributes["data-git-quick-action-label"] === "Publish repository",
    });
  } catch (error) {
    const clientState = await readClientState(client);
    throw new Error(
      `Native Header did not project Publish repository: ${JSON.stringify({
        cause: error instanceof Error ? error.message : String(error),
        clientState,
      })}`,
    );
  }
  const beforeOpen = await readRendererReadiness(client);
  await tapSelector({
    child,
    client,
    selector: ".action-btn--commit .action-btn__primary",
    timeoutMs,
  });
  const dialog = await waitForMeasurement({
    child,
    client,
    selector: ".git-publish-dialog",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.text.includes("Publish repository") &&
      measurement.text.includes("Pick where to host it"),
  });
  const afterOpen = await waitForSequenceAdvance({
    child,
    client,
    initial: beforeOpen,
    timeoutMs,
  });
  const activeProvider = await waitForMeasurement({
    child,
    client,
    selector: ".git-publish-provider-card--active",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.attributes["data-git-publish-provider"] === "github" &&
      measurement.attributes["data-git-publish-provider-ready"] === "true",
  });
  const steps = await readSelectorRects(client, "[data-git-publish-step-label]");
  const providers = await readSelectorRects(client, "[data-git-publish-provider]");
  if (steps.length !== 3 || providers.length !== 4) {
    throw new Error(
      `Native Publish wizard anatomy drifted: ${JSON.stringify({ steps, providers })}`,
    );
  }
  await tapSelector({
    child,
    client,
    point: "top-left",
    selector: ".git-publish-dismiss",
    timeoutMs,
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".git-publish-dialog",
    timeoutMs,
    predicate: (measurement) => measurement === null,
  });
  return {
    status: "pass",
    input: "DevTool Input.emulateTouchFromMouseEvent on measured semantic selectors",
    headerAction,
    dialog,
    activeProvider,
    steps,
    providers,
    sequence: { beforeOpen: beforeOpen.lastSeq, afterOpen: afterOpen.lastSeq },
    dismissed: true,
  };
}

function readIsolatedClientSettings(baseDir) {
  const prefsPath = path.join(baseDir, "lynxtron-prefs.json");
  const prefs = JSON.parse(readFileSync(prefsPath, "utf8"));
  return {
    prefsPath,
    clientSettings: prefs.clientSettings ?? null,
  };
}

async function openBetaSettings({ child, client, timeoutMs }) {
  await tapSelector({ child, client, selector: ".sidebar-settings-row", timeoutMs });
  await waitForRoutePanel({
    child,
    client,
    panel: "general",
    route: "/settings/general",
    timeoutMs,
  });
  await tapSelector({
    child,
    client,
    selector: ".settings-nav__item--beta",
    timeoutMs,
  });
  const route = await waitForRoutePanel({
    child,
    client,
    panel: "beta",
    route: "/settings/beta",
    timeoutMs,
  });
  return route;
}

async function verifyBetaMutation({
  baseDir,
  bundle,
  child,
  client,
  desktopDir,
  devToolCli,
  executable,
  height,
  projectCwd,
  timeoutMs,
  width,
}) {
  const route = await openBetaSettings({ child, client, timeoutMs });
  const selector = ".settings-toggle--auto-settle";
  const before = await waitForMeasurement({
    child,
    client,
    selector,
    timeoutMs,
    predicate: (measurement) => measurement?.attributes["aria-checked"] === "true",
  });
  const beforeDays = await waitForMeasurement({
    child,
    client,
    selector: ".settings-number-input",
    timeoutMs,
    predicate: (measurement) => measurement !== null,
  });

  await tapSelector({ child, client, selector, timeoutMs });
  const disabled = await waitForMeasurement({
    child,
    client,
    selector,
    timeoutMs,
    predicate: (measurement) => measurement?.attributes["aria-checked"] === "false",
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".settings-number-input",
    timeoutMs,
    predicate: (measurement) => measurement === null,
  });
  const disabledPrefs = readIsolatedClientSettings(baseDir);
  if (disabledPrefs.clientSettings?.sidebarAutoSettleAfterDays !== null) {
    throw new Error(`Beta auto-settle disable did not persist: ${JSON.stringify(disabledPrefs)}`);
  }

  await tapSelector({ child, client, selector, timeoutMs });
  const enabled = await waitForMeasurement({
    child,
    client,
    selector,
    timeoutMs,
    predicate: (measurement) => measurement?.attributes["aria-checked"] === "true",
  });
  const restoredDays = await waitForMeasurement({
    child,
    client,
    selector: ".settings-number-input",
    timeoutMs,
    predicate: (measurement) => measurement !== null,
  });
  const enabledPrefs = readIsolatedClientSettings(baseDir);
  if (
    !Number.isInteger(enabledPrefs.clientSettings?.sidebarAutoSettleAfterDays) ||
    enabledPrefs.clientSettings.sidebarAutoSettleAfterDays <= 0
  ) {
    throw new Error(`Beta auto-settle enable did not persist: ${JSON.stringify(enabledPrefs)}`);
  }

  const initialProcessId = child.pid;
  const initialClient = client.identity;
  const initialRendererErrors = readRendererErrors({
    clientId: client.identity.clientId,
    devToolCli,
    sessionId: client.identity.sessionId,
  });
  if (initialRendererErrors) {
    throw new Error(`Renderer errors before Beta cold restart:\n${initialRendererErrors}`);
  }
  await client.close();
  await stopOwnedProcess(child);

  const restartedChild = spawn(executable, [desktopDir], {
    cwd: APP_ROOT,
    env: {
      ...process.env,
      NODE_ENV: "production",
      T3_LYNXTRON_BASE_DIR: baseDir,
      T3_LYNXTRON_PROJECT_CWD: projectCwd,
      T3_LYNXTRON_VIEWPORT_WIDTH: String(width),
      T3_LYNXTRON_VIEWPORT_HEIGHT: String(height),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (!Number.isInteger(restartedChild.pid) || restartedChild.pid <= 0) {
    throw new Error("Beta cold restart did not return an owned process id.");
  }
  const restartedLog = createLogCapture(restartedChild);
  let restartedClient;
  try {
    restartedClient = await waitForOwnedSession({
      child: restartedChild,
      devToolCli,
      expectedBundleUrl: pathToFileURL(bundle).href,
      timeoutMs,
    });
    await waitForLogText(restartedChild, restartedLog, "T3 Code server is ready", timeoutMs);
    const restartTransport = await waitForMainTransport({
      child: restartedChild,
      client: restartedClient,
      timeoutMs,
    });
    const restartRoute = await openBetaSettings({
      child: restartedChild,
      client: restartedClient,
      timeoutMs,
    });
    const restartedToggle = await waitForMeasurement({
      child: restartedChild,
      client: restartedClient,
      selector,
      timeoutMs,
      predicate: (measurement) => measurement?.attributes["aria-checked"] === "true",
    });
    const restartedDays = await waitForMeasurement({
      child: restartedChild,
      client: restartedClient,
      selector: ".settings-number-input",
      timeoutMs,
      predicate: (measurement) =>
        measurement?.attributes.value ===
        String(enabledPrefs.clientSettings.sidebarAutoSettleAfterDays),
    });
    const restartedPrefs = readIsolatedClientSettings(baseDir);
    if (
      restartedPrefs.clientSettings?.sidebarAutoSettleAfterDays !==
      enabledPrefs.clientSettings.sidebarAutoSettleAfterDays
    ) {
      throw new Error(
        `Beta auto-settle value changed across cold restart: ${JSON.stringify({
          before: enabledPrefs,
          after: restartedPrefs,
        })}`,
      );
    }

    return {
      outcome: {
        status: "pass",
        input: "DevTool Input.emulateTouchFromMouseEvent on measured semantic selectors",
        route,
        before,
        beforeDays,
        disabled,
        disabledDiskValue: disabledPrefs.clientSettings.sidebarAutoSettleAfterDays,
        enabled,
        restoredDays,
        enabledDiskValue: enabledPrefs.clientSettings.sidebarAutoSettleAfterDays,
        prefsPath: enabledPrefs.prefsPath,
        coldRestart: {
          initialProcessId,
          initialClient,
          restartedProcessId: restartedChild.pid,
          restartedClient: restartedClient.identity,
          transport: restartTransport,
          route: restartRoute,
          toggle: restartedToggle,
          days: restartedDays,
          diskValue: restartedPrefs.clientSettings.sidebarAutoSettleAfterDays,
        },
      },
      child: restartedChild,
      client: restartedClient,
      log: restartedLog,
    };
  } catch (error) {
    await restartedClient?.close();
    await stopOwnedProcess(restartedChild);
    throw error;
  }
}

async function openArchiveSettings({ child, client, timeoutMs }) {
  await tapSelector({ child, client, selector: ".sidebar-settings-row", timeoutMs });
  await waitForRoutePanel({
    child,
    client,
    panel: "general",
    route: "/settings/general",
    timeoutMs,
  });
  await tapSelector({
    child,
    client,
    selector: ".settings-nav__item--archived",
    timeoutMs,
  });
  return waitForRoutePanel({
    child,
    client,
    panel: "archive",
    route: "/settings/archived",
    timeoutMs,
  });
}

async function verifyArchiveMutation({
  baseDir,
  bundle,
  child,
  client,
  desktopDir,
  devToolCli,
  executable,
  height,
  projectCwd,
  timeoutMs,
  width,
}) {
  const initialState = await waitForClientState({
    child,
    client,
    timeoutMs,
    predicate: (state) =>
      Array.isArray(state?.threadIds) &&
      Array.isArray(state?.archivedThreadIds) &&
      state.threadIds.length > 1,
  });
  const targetThreadId = initialState.threadIds.find(
    (threadId) => threadId !== initialState.activeThreadId,
  );
  if (!targetThreadId) {
    throw new Error(
      `Archive mutation fixture lacks an inactive thread: ${JSON.stringify(initialState)}`,
    );
  }

  await invokeConnector(client, "archiveThread", { threadId: targetThreadId });
  const preparedState = await waitForClientState({
    child,
    client,
    timeoutMs,
    predicate: (state) =>
      state?.archivedThreadIds?.includes(targetThreadId) === true &&
      state?.threadIds?.includes(targetThreadId) === false,
  });
  const route = await openArchiveSettings({ child, client, timeoutMs });
  const actionSelector = `.settings-archive-unarchive--${targetThreadId}`;
  const preparedAction = await waitForMeasurement({
    child,
    client,
    selector: actionSelector,
    timeoutMs,
    predicate: (measurement) => measurement?.text.includes("Unarchive") === true,
  });

  await tapSelector({ child, client, selector: actionSelector, timeoutMs });
  const unarchivedState = await waitForClientState({
    child,
    client,
    timeoutMs,
    predicate: (state) =>
      state?.threadIds?.includes(targetThreadId) === true &&
      state?.archivedThreadIds?.includes(targetThreadId) === false,
  });
  await waitForMeasurement({
    child,
    client,
    selector: actionSelector,
    timeoutMs,
    predicate: (measurement) => measurement === null,
  });

  await invokeConnector(client, "archiveThread", { threadId: targetThreadId });
  const rearchivedState = await waitForClientState({
    child,
    client,
    timeoutMs,
    predicate: (state) =>
      state?.archivedThreadIds?.includes(targetThreadId) === true &&
      state?.threadIds?.includes(targetThreadId) === false,
  });
  const restoredAction = await waitForMeasurement({
    child,
    client,
    selector: actionSelector,
    timeoutMs,
    predicate: (measurement) => measurement?.text.includes("Unarchive") === true,
  });

  const initialProcessId = child.pid;
  const initialClient = client.identity;
  const initialRendererErrors = readRendererErrors({
    clientId: client.identity.clientId,
    devToolCli,
    sessionId: client.identity.sessionId,
  });
  if (initialRendererErrors) {
    throw new Error(`Renderer errors before Archive cold restart:\n${initialRendererErrors}`);
  }
  await client.close();
  await stopOwnedProcess(child);

  const restartedChild = spawn(executable, [desktopDir], {
    cwd: APP_ROOT,
    env: {
      ...process.env,
      NODE_ENV: "production",
      T3_LYNXTRON_BASE_DIR: baseDir,
      T3_LYNXTRON_PROJECT_CWD: projectCwd,
      T3_LYNXTRON_VIEWPORT_WIDTH: String(width),
      T3_LYNXTRON_VIEWPORT_HEIGHT: String(height),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (!Number.isInteger(restartedChild.pid) || restartedChild.pid <= 0) {
    throw new Error("Archive cold restart did not return an owned process id.");
  }
  const restartedLog = createLogCapture(restartedChild);
  let restartedClient;
  try {
    restartedClient = await waitForOwnedSession({
      child: restartedChild,
      devToolCli,
      expectedBundleUrl: pathToFileURL(bundle).href,
      timeoutMs,
    });
    await waitForLogText(restartedChild, restartedLog, "T3 Code server is ready", timeoutMs);
    const restartTransport = await waitForMainTransport({
      child: restartedChild,
      client: restartedClient,
      timeoutMs,
    });
    const restartedState = await waitForClientState({
      child: restartedChild,
      client: restartedClient,
      timeoutMs,
      predicate: (state) =>
        state?.archivedThreadIds?.includes(targetThreadId) === true &&
        state?.threadIds?.includes(targetThreadId) === false,
    });
    const restartRoute = await openArchiveSettings({
      child: restartedChild,
      client: restartedClient,
      timeoutMs,
    });
    const restartedAction = await waitForMeasurement({
      child: restartedChild,
      client: restartedClient,
      selector: actionSelector,
      timeoutMs,
      predicate: (measurement) => measurement?.text.includes("Unarchive") === true,
    });

    return {
      outcome: {
        status: "pass",
        input: "Typed archive commands plus DevTool touch on the measured Unarchive action",
        targetThreadId,
        route,
        preparedState,
        preparedAction,
        unarchivedState,
        rearchivedState,
        restoredAction,
        coldRestart: {
          initialProcessId,
          initialClient,
          restartedProcessId: restartedChild.pid,
          restartedClient: restartedClient.identity,
          transport: restartTransport,
          route: restartRoute,
          state: restartedState,
          action: restartedAction,
        },
      },
      child: restartedChild,
      client: restartedClient,
      log: restartedLog,
    };
  } catch (error) {
    await restartedClient?.close();
    await stopOwnedProcess(restartedChild);
    throw error;
  }
}

async function openConnectionsSettings({ child, client, timeoutMs }) {
  await tapSelector({ child, client, selector: ".sidebar-settings-row", timeoutMs });
  await waitForRoutePanel({
    child,
    client,
    panel: "general",
    route: "/settings/general",
    timeoutMs,
  });
  await tapSelector({
    child,
    client,
    selector: ".settings-nav__item--connections",
    timeoutMs,
  });
  return waitForRoutePanel({
    child,
    client,
    panel: "connections",
    route: "/settings/connections",
    timeoutMs,
  });
}

async function verifyConnectionsMutation({
  baseDir,
  bundle,
  child,
  client,
  desktopDir,
  devToolCli,
  executable,
  height,
  projectCwd,
  timeoutMs,
  width,
}) {
  const initialState = await waitForClientState({
    child,
    client,
    timeoutMs,
    predicate: (state) =>
      Array.isArray(state?.pairingLinkIds) && Number.isInteger(state?.pairingLinkCount),
  });
  const initialPairingLinkIds = [...initialState.pairingLinkIds];
  const route = await openConnectionsSettings({ child, client, timeoutMs });
  const createSelector = ".settings-connections-create-pairing";
  const createButton = await waitForMeasurement({
    child,
    client,
    selector: createSelector,
    timeoutMs,
    predicate: (measurement) => measurement?.text.trim() === "Create",
  });

  await tapSelector({ child, client, selector: createSelector, timeoutMs });
  const createdState = await waitForClientState({
    child,
    client,
    timeoutMs,
    predicate: (state) =>
      Array.isArray(state?.pairingLinkIds) &&
      state.pairingLinkIds.length === initialPairingLinkIds.length + 1,
  });
  const createdPairingLinkId = createdState.pairingLinkIds.find(
    (id) => !initialPairingLinkIds.includes(id),
  );
  if (!createdPairingLinkId) {
    throw new Error(
      `Connections mutation could not identify the created pairing link: ${JSON.stringify({
        before: initialPairingLinkIds,
        after: createdState.pairingLinkIds,
      })}`,
    );
  }
  const copyButton = await waitForMeasurement({
    child,
    client,
    selector: createSelector,
    timeoutMs,
    predicate: (measurement) => measurement?.text.trim() === "Copy code",
  });
  const revokeSelector = `.settings-connections-revoke-pairing--${createdPairingLinkId}`;
  const revokeButton = await waitForMeasurement({
    child,
    client,
    selector: revokeSelector,
    timeoutMs,
    predicate: (measurement) => measurement?.text.trim() === "Revoke",
  });

  await tapSelector({ child, client, selector: revokeSelector, timeoutMs });
  const revokedState = await waitForClientState({
    child,
    client,
    timeoutMs,
    predicate: (state) =>
      Array.isArray(state?.pairingLinkIds) &&
      state.pairingLinkIds.length === initialPairingLinkIds.length &&
      state.pairingLinkIds.includes(createdPairingLinkId) === false,
  });
  await waitForMeasurement({
    child,
    client,
    selector: revokeSelector,
    timeoutMs,
    predicate: (measurement) => measurement === null,
  });
  const restoredCreateButton = await waitForMeasurement({
    child,
    client,
    selector: createSelector,
    timeoutMs,
    predicate: (measurement) => measurement?.text.trim() === "Create",
  });

  const initialProcessId = child.pid;
  const initialClient = client.identity;
  const initialRendererErrors = readRendererErrors({
    clientId: client.identity.clientId,
    devToolCli,
    sessionId: client.identity.sessionId,
  });
  if (initialRendererErrors) {
    throw new Error(`Renderer errors before Connections cold restart:\n${initialRendererErrors}`);
  }
  await client.close();
  await stopOwnedProcess(child);

  const restartedChild = spawn(executable, [desktopDir], {
    cwd: APP_ROOT,
    env: {
      ...process.env,
      NODE_ENV: "production",
      T3_LYNXTRON_BASE_DIR: baseDir,
      T3_LYNXTRON_PROJECT_CWD: projectCwd,
      T3_LYNXTRON_VIEWPORT_WIDTH: String(width),
      T3_LYNXTRON_VIEWPORT_HEIGHT: String(height),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (!Number.isInteger(restartedChild.pid) || restartedChild.pid <= 0) {
    throw new Error("Connections cold restart did not return an owned process id.");
  }
  const restartedLog = createLogCapture(restartedChild);
  let restartedClient;
  try {
    restartedClient = await waitForOwnedSession({
      child: restartedChild,
      devToolCli,
      expectedBundleUrl: pathToFileURL(bundle).href,
      timeoutMs,
    });
    await waitForLogText(restartedChild, restartedLog, "T3 Code server is ready", timeoutMs);
    const restartTransport = await waitForMainTransport({
      child: restartedChild,
      client: restartedClient,
      timeoutMs,
    });
    const restartedState = await waitForClientState({
      child: restartedChild,
      client: restartedClient,
      timeoutMs,
      predicate: (state) =>
        Array.isArray(state?.pairingLinkIds) &&
        state.pairingLinkIds.length === initialPairingLinkIds.length &&
        state.pairingLinkIds.includes(createdPairingLinkId) === false,
    });
    const restartRoute = await openConnectionsSettings({
      child: restartedChild,
      client: restartedClient,
      timeoutMs,
    });
    const restartedCreateButton = await waitForMeasurement({
      child: restartedChild,
      client: restartedClient,
      selector: createSelector,
      timeoutMs,
      predicate: (measurement) => measurement?.text.trim() === "Create",
    });

    return {
      outcome: {
        status: "pass",
        input: "DevTool touch on measured Create and thread-specific Revoke actions",
        route,
        initialPairingLinkCount: initialPairingLinkIds.length,
        createdPairingLinkId,
        createButton,
        copyButton,
        revokeButton,
        revokedPairingLinkCount: revokedState.pairingLinkIds.length,
        restoredCreateButton,
        coldRestart: {
          initialProcessId,
          initialClient,
          restartedProcessId: restartedChild.pid,
          restartedClient: restartedClient.identity,
          transport: restartTransport,
          route: restartRoute,
          pairingLinkCount: restartedState.pairingLinkIds.length,
          createButton: restartedCreateButton,
        },
      },
      child: restartedChild,
      client: restartedClient,
      log: restartedLog,
    };
  } catch (error) {
    await restartedClient?.close();
    await stopOwnedProcess(restartedChild);
    throw error;
  }
}

async function verifyDevBranding(client) {
  const backdrop = await readOptionalMeasurement(client, ".sidebar-stage-backdrop--dev");
  const brand = await readOptionalMeasurement(client, ".sidebar-brand");
  if (
    backdrop?.attributes["data-stage-backdrop-variant"] !== "dev" ||
    !backdrop.rect ||
    backdrop.rect.width <= 0 ||
    backdrop.rect.height <= 0
  ) {
    throw new Error(`Packaged Dev backdrop is not visibly rendered: ${JSON.stringify(backdrop)}`);
  }
  if (!brand?.rect || !brand.text.includes("Code")) {
    throw new Error(`Shared Sidebar brand is not visibly rendered: ${JSON.stringify(brand)}`);
  }

  return {
    status: "pass",
    source: "shared SidebarChromeHeader and SidebarStageBackdrop.lynx",
    backdrop,
    brand,
  };
}

async function captureOutcome(action, cleanup) {
  let outcome;
  try {
    outcome = await action();
  } catch (error) {
    outcome = {
      status: "fail",
      error: error instanceof Error ? error.message : String(error),
    };
  }

  if (!cleanup) return outcome;
  try {
    return { ...outcome, cleanup: await cleanup() };
  } catch (error) {
    const cleanupError = error instanceof Error ? error.message : String(error);
    return outcome.status === "pass"
      ? {
          ...outcome,
          status: "fail",
          error: `Outcome cleanup failed: ${cleanupError}`,
          cleanup: { status: "fail", error: cleanupError },
        }
      : { ...outcome, cleanup: { status: "fail", error: cleanupError } };
  }
}

async function tapSelector({ child, client, point = "center", selector, timeoutMs }) {
  await client.runCdp("DOM.enable", { useCompression: false });
  const deadline = Date.now() + timeoutMs;
  let nodeId;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Lynxtron exited before ${selector} became tappable.`);
    }
    const documentResponse = await client.runCdp("DOM.getDocument", { depth: 0 });
    const root = commandResult(documentResponse)?.root;
    const rootNodeId = root?.children?.[0]?.nodeId ?? root?.nodeId;
    if (!Number.isInteger(rootNodeId) || rootNodeId <= 0) {
      throw new Error("Lynx DevTool did not return a DOM root node.");
    }
    const nodeResponse = await client.runCdp("DOM.querySelector", { nodeId: rootNodeId, selector });
    nodeId = commandResult(nodeResponse)?.nodeId;
    if (Number.isInteger(nodeId) && nodeId > 0) break;
    await waitForChildExit(child, 100);
  }
  if (!Number.isInteger(nodeId) || nodeId <= 0) {
    const treeResponse = await client.runCdp("DOM.getDocument", { depth: -1, pierce: true });
    const matches = [];
    const visit = (node) => {
      const attributes = Object.fromEntries(
        Array.from({ length: Math.floor((node?.attributes?.length ?? 0) / 2) }, (_, index) => [
          node.attributes[index * 2],
          node.attributes[index * 2 + 1],
        ]),
      );
      const searchable = `${attributes.class ?? ""} ${attributes["data-sidebar"] ?? ""} ${attributes["data-slot"] ?? ""}`;
      if (/sidebar|settings/iu.test(searchable)) {
        matches.push({ nodeName: node.nodeName, attributes });
      }
      for (const childNode of node?.children ?? []) visit(childNode);
    };
    visit(commandResult(treeResponse)?.root);
    throw new Error(
      `Lynx route smoke could not find ${selector}: ${JSON.stringify(matches.slice(-40))}`,
    );
  }
  const boxResponse = await client.runCdp("DOM.getBoxModel", { nodeId });
  const model = commandResult(boxResponse)?.model;
  const tapPoint = quadPoint(model?.border ?? model?.content, point);
  const timestamp = Date.now() / 1000;
  for (const [type, offset] of [
    ["mouseMoved", 0],
    ["mousePressed", 0.01],
    ["mouseReleased", 0.02],
  ]) {
    await client.runCdp("Input.emulateTouchFromMouseEvent", {
      type,
      x: tapPoint.x,
      y: tapPoint.y,
      timestamp: timestamp + offset,
      button: "left",
    });
  }
}

async function tapSelectorByAttribute({
  attribute,
  child,
  client,
  descendantSelector,
  selector,
  timeoutMs,
  value,
}) {
  await client.runCdp("DOM.enable", { useCompression: false });
  const deadline = Date.now() + timeoutMs;
  let nodeId;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Lynxtron exited before ${selector}[${attribute}] became tappable.`);
    }
    const documentResponse = await client.runCdp("DOM.getDocument", { depth: 0 });
    const root = commandResult(documentResponse)?.root;
    const rootNodeId = root?.children?.[0]?.nodeId ?? root?.nodeId;
    if (!Number.isInteger(rootNodeId) || rootNodeId <= 0) {
      throw new Error("Lynx DevTool did not return a DOM root node.");
    }
    const nodesResponse = await client.runCdp("DOM.querySelectorAll", {
      nodeId: rootNodeId,
      selector,
    });
    for (const candidateId of commandResult(nodesResponse)?.nodeIds ?? []) {
      const attributesResponse = await client.runCdp("DOM.getAttributes", {
        nodeId: candidateId,
      });
      const attributes = commandResult(attributesResponse)?.attributes ?? [];
      const record = Object.fromEntries(
        Array.from({ length: Math.floor(attributes.length / 2) }, (_, index) => [
          attributes[index * 2],
          attributes[index * 2 + 1],
        ]),
      );
      if (record[attribute] === value) {
        nodeId = candidateId;
        break;
      }
    }
    if (Number.isInteger(nodeId) && nodeId > 0) break;
    await waitForChildExit(child, 100);
  }
  if (!Number.isInteger(nodeId) || nodeId <= 0) {
    throw new Error(`Lynx route smoke could not find ${selector}[${attribute}="${value}"].`);
  }
  if (descendantSelector) {
    const descendantResponse = await client.runCdp("DOM.querySelector", {
      nodeId,
      selector: descendantSelector,
    });
    const descendantNodeId = commandResult(descendantResponse)?.nodeId;
    if (!Number.isInteger(descendantNodeId) || descendantNodeId <= 0) {
      throw new Error(
        `Lynx route smoke could not find ${descendantSelector} within ${selector}[${attribute}="${value}"].`,
      );
    }
    nodeId = descendantNodeId;
  }
  const boxResponse = await client.runCdp("DOM.getBoxModel", { nodeId });
  const model = commandResult(boxResponse)?.model;
  const tapPoint = quadPoint(model?.border ?? model?.content);
  const timestamp = Date.now() / 1000;
  for (const [type, offset] of [
    ["mouseMoved", 0],
    ["mousePressed", 0.01],
    ["mouseReleased", 0.02],
  ]) {
    await client.runCdp("Input.emulateTouchFromMouseEvent", {
      type,
      x: tapPoint.x,
      y: tapPoint.y,
      timestamp: timestamp + offset,
      button: "left",
    });
  }
}

async function restoreOutcomeSurface({ child, client, timeoutMs }) {
  const closed = [];
  for (const [surfaceSelector, dismissSelector, point] of [
    [".model-picker-panel", ".model-picker-backdrop", "center"],
    [".qs-panel", ".qs-backdrop", "top-left"],
    [".sidebar-v2-scope-popup", ".lynx-menu-dismiss-layer", "center"],
  ]) {
    if ((await readOptionalMeasurement(client, surfaceSelector)) === null) continue;
    await tapSelector({ child, client, point, selector: dismissSelector, timeoutMs });
    await waitForMeasurement({
      child,
      client,
      selector: surfaceSelector,
      timeoutMs,
      predicate: (measurement) => measurement === null,
    });
    closed.push(surfaceSelector);
  }

  if ((await readOptionalMeasurement(client, ".right-panel")) !== null) {
    await tapSelector({
      child,
      client,
      selector: ".right-panel__layout-control--close",
      timeoutMs,
    });
    await waitForMeasurement({
      child,
      client,
      selector: ".right-panel",
      timeoutMs,
      predicate: (measurement) => measurement === null,
    });
    closed.push("right-panel");
  }

  const route = await readRoutePanel(client);
  if (typeof route.route === "string" && route.route.startsWith("/settings")) {
    await tapSelector({ child, client, selector: ".settings-nav__back", timeoutMs });
    await waitForChatRoute({ child, client, timeoutMs });
    closed.push("settings");
  }

  return { status: "pass", closed };
}

async function readRoutePanel(client) {
  const routeResponse = await client.runCdp("Runtime.evaluate", {
    expression: "globalThis.__T3_LYNXTRON_ROUTE__?.() ?? null",
    returnByValue: true,
  });
  await client.runCdp("DOM.enable", { useCompression: false });
  const documentResponse = await client.runCdp("DOM.getDocument", {});
  const root = commandResult(documentResponse)?.root;
  const rootNodeId = root?.children?.[0]?.nodeId ?? root?.nodeId;
  let panel = null;
  if (Number.isInteger(rootNodeId) && rootNodeId > 0) {
    for (const candidate of [
      "archive",
      "appearance",
      "beta",
      "connections",
      "general",
      "keybindings",
      "providers",
      "source-control",
    ]) {
      const panelResponse = await client.runCdp("DOM.querySelector", {
        nodeId: rootNodeId,
        selector: `.settings-content--${candidate}`,
      });
      const panelNodeId = commandResult(panelResponse)?.nodeId;
      if (Number.isInteger(panelNodeId) && panelNodeId > 0) {
        panel = candidate;
        break;
      }
    }
  }
  return { route: commandResult(routeResponse)?.value ?? null, panel };
}

async function waitForRoutePanel({ child, client, panel, route, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  let latest;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Lynxtron exited before route ${route} rendered.`);
    }
    latest = await readRoutePanel(client).catch(() => latest);
    if (latest?.route === route && latest?.panel === panel) return latest;
    await waitForChildExit(child, 100);
  }
  throw new Error(
    `Route/content pairing did not render: ${JSON.stringify({ expected: { route, panel }, latest })}`,
  );
}

async function waitForChatRoute({ child, client, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  let latest;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("Lynxtron exited before Back returned to chat.");
    }
    latest = await readRoutePanel(client).catch(() => latest);
    if (latest?.route === "/" && latest?.panel === null) return latest;
    await waitForChildExit(child, 100);
  }
  throw new Error(`Back did not return to chat: ${JSON.stringify({ latest })}`);
}

async function waitForRouteChange({ child, client, initialRoute, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  let latest;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("Lynxtron exited before thread selection changed the route.");
    }
    latest = await readRoutePanel(client).catch(() => latest);
    if (
      typeof latest?.route === "string" &&
      latest.route !== initialRoute &&
      latest.panel === null
    ) {
      return latest;
    }
    await waitForChildExit(child, 100);
  }
  throw new Error(
    `Thread selection did not change the chat route: ${JSON.stringify({ initialRoute, latest })}`,
  );
}

async function verifySettingsRouteBehavior({
  child,
  client,
  devToolCli,
  modelSelection,
  outputDirectory,
  timeoutMs,
}) {
  const observed = [];
  let appearance = null;
  let sourceControl = null;
  await tapSelector({ child, client, selector: ".sidebar-settings-row", timeoutMs });
  observed.push(
    await waitForRoutePanel({
      child,
      client,
      panel: "general",
      route: "/settings/general",
      timeoutMs,
    }),
  );
  const generalPanel = await waitForMeasurement({
    child,
    client,
    selector: ".settings-content--general",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.text.includes("General") === true &&
      measurement.text.includes("Project grouping") &&
      measurement.text.includes("Diagnostics"),
  });
  const generalSections = await readSelectorRects(
    client,
    ".settings-content--general .settings-section",
  );
  const generalRows = await readSelectorRects(client, ".settings-content--general .settings-row");
  const generalScreenshot = captureNativeScreenshot({
    client,
    devToolCli,
    outputDirectory,
    name: "native-settings-general.png",
  });

  const beforeResync = await readRendererReadiness(client);
  await invokeSemanticAdvance(client, modelSelection);
  const afterResync = await waitForSequenceAdvance({
    child,
    client,
    initial: beforeResync,
    timeoutMs,
  });
  const afterResyncRoute = await readRoutePanel(client);
  if (afterResyncRoute.route !== "/settings/general" || afterResyncRoute.panel !== "general") {
    throw new Error(
      `Connector update changed the Settings route: ${JSON.stringify(afterResyncRoute)}`,
    );
  }

  for (const [route, panel] of [
    ["/settings/appearance", "appearance"],
    ["/settings/keybindings", "keybindings"],
    ["/settings/providers", "providers"],
    ["/settings/connections", "connections"],
    ["/settings/source-control", "source-control"],
    ["/settings/beta", "beta"],
    ["/settings/archived", "archive"],
  ]) {
    await tapSelector({
      child,
      client,
      selector: `.settings-nav__item--${route.slice("/settings/".length)}`,
      timeoutMs,
    });
    observed.push(await waitForRoutePanel({ child, client, panel, route, timeoutMs }));
    if (route === "/settings/appearance") {
      const appearancePanel = await waitForMeasurement({
        child,
        client,
        selector: ".settings-content--appearance",
        timeoutMs,
        predicate: (measurement) =>
          measurement?.text.includes("Appearance") === true &&
          measurement.text.includes("Theme") &&
          measurement.text.includes("Glass opacity") &&
          measurement.text.includes("Word wrap"),
      });
      const rows = await readSelectorMeasurements(
        client,
        ".settings-content--appearance .settings-row",
      );
      const theme = rows.find((row) =>
        row.text.includes("Choose how T3 Code looks across the app."),
      );
      if (
        !theme ||
        theme.attributes["aria-disabled"] === "true" ||
        theme.attributes["data-settings-unavailable"] === "true"
      ) {
        throw new Error(`Appearance Theme row is not available: ${JSON.stringify(theme)}`);
      }
      const unavailableRows = [];
      for (const title of [
        "Glass opacity",
        ...(appearancePanel.text.includes("Environment identification")
          ? ["Environment identification"]
          : []),
        "Word wrap",
      ]) {
        const row = rows.find(
          (candidate) =>
            candidate.attributes["data-settings-unavailable"] === "true" &&
            candidate.text.includes(title),
        );
        if (
          !row ||
          row.attributes["aria-disabled"] !== "true" ||
          row.attributes["data-settings-unavailable"] !== "true"
        ) {
          throw new Error(
            `Appearance unavailable row lost disabled semantics: ${JSON.stringify({ title, row })}`,
          );
        }
        unavailableRows.push(row);
      }
      const unavailableOpacities = await readSelectorStyleValues(
        client,
        ".settings-content--appearance .settings-row--unavailable",
        "opacity",
      );
      if (
        unavailableOpacities.length !== unavailableRows.length ||
        unavailableOpacities.some(
          (opacity) => opacity === null || Math.abs(Number(opacity) - 0.48) > 1 / 255,
        )
      ) {
        throw new Error(
          `Appearance unavailable rows are not visibly muted: ${JSON.stringify({
            unavailableOpacities,
            unavailableRows,
          })}`,
        );
      }
      appearance = {
        panel: appearancePanel.rect,
        text: appearancePanel.text,
        theme,
        unavailableRows,
        unavailableOpacities,
        screenshot: captureNativeScreenshot({
          client,
          devToolCli,
          outputDirectory,
          name: "native-settings-appearance-unavailable.png",
        }),
      };
    } else if (route === "/settings/source-control") {
      const sourceControlPanel = await waitForMeasurement({
        child,
        client,
        selector: ".settings-content--source-control",
        timeoutMs,
        predicate: (measurement) =>
          measurement?.text.includes("Version Control") === true &&
          measurement.text.includes("Source Control Providers") &&
          measurement.text.includes("Text generation") &&
          measurement.text.includes("Source control writing style") &&
          measurement.text.includes("Follow change request templates") &&
          measurement.text.includes("Source control writer model"),
      });
      sourceControl = {
        panel: sourceControlPanel.rect,
        sections: await readSelectorRects(client, ".source-control-section"),
        discoveryRows: await readSelectorRects(client, ".source-control-item"),
        settingsRows: await readSelectorRects(client, ".source-control-writing-row"),
        screenshot: captureNativeScreenshot({
          client,
          devToolCli,
          outputDirectory,
          name: "native-settings-source-control.png",
        }),
      };
    }
  }

  await tapSelector({ child, client, selector: ".settings-nav__back", timeoutMs });
  await waitForChatRoute({ child, client, timeoutMs });

  for (let cycle = 1; cycle <= 2; cycle += 1) {
    await tapSelector({ child, client, selector: ".sidebar-settings-row", timeoutMs });
    await waitForRoutePanel({
      child,
      client,
      panel: "general",
      route: "/settings/general",
      timeoutMs,
    });
    await tapSelector({
      child,
      client,
      selector: ".settings-nav__item--providers",
      timeoutMs,
    });
    await waitForRoutePanel({
      child,
      client,
      panel: "providers",
      route: "/settings/providers",
      timeoutMs,
    });
    await tapSelector({ child, client, selector: ".settings-nav__back", timeoutMs });
    await waitForChatRoute({ child, client, timeoutMs });
  }

  return {
    status: "pass",
    input: "DevTool Input.emulateTouchFromMouseEvent on measured semantic selectors",
    general: {
      panel: generalPanel.rect,
      text: generalPanel.text,
      sections: generalSections,
      rows: generalRows,
      screenshot: generalScreenshot,
    },
    appearance,
    sourceControl,
    resync: { beforeSeq: beforeResync.lastSeq, afterSeq: afterResync.lastSeq },
    observed,
    repeatedCycles: 2,
    finalRoute: "/",
  };
}

async function verifySourceControlErrorBehavior({
  child,
  client,
  devToolCli,
  outputDirectory,
  timeoutMs,
}) {
  const discoveryProbe = await waitForSourceControlDiscoveryError({ child, client, timeoutMs });
  await tapSelector({ child, client, selector: ".sidebar-settings-row", timeoutMs });
  await waitForRoutePanel({
    child,
    client,
    panel: "general",
    route: "/settings/general",
    timeoutMs,
  });
  await tapSelector({
    child,
    client,
    selector: ".settings-nav__item--source-control",
    timeoutMs,
  });
  await waitForRoutePanel({
    child,
    client,
    panel: "source-control",
    route: "/settings/source-control",
    timeoutMs,
  });
  const panel = await waitForMeasurement({
    child,
    client,
    selector: ".settings-content--source-control",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.text.includes("Server environment") === true &&
      measurement.text.includes("Could not scan the server environment") &&
      measurement.text.includes(
        "Source-control discovery is unavailable in this test environment.",
      ) &&
      measurement.text.includes("Scan") &&
      measurement.text.includes("Text generation"),
  });
  const sections = await readSelectorRects(client, ".source-control-section");
  const [empty] = await readSelectorRects(client, ".source-control-empty");
  const [title] = await readSelectorRects(client, ".source-control-empty__title");
  const [description] = await readSelectorRects(client, ".source-control-empty__description");
  const [retry] = await readSelectorRects(client, "[data-source-control-retry]");
  const sectionGap =
    sections.length === 2 ? sections[1].y - (sections[0].y + sections[0].height) : null;
  if (
    sections.length !== 2 ||
    !empty ||
    !title ||
    !description ||
    !retry ||
    Math.abs(sections[0].width - 896) > 1 ||
    Math.abs(sections[0].height - 396) > 1 ||
    Math.abs(empty.width - 896) > 1 ||
    Math.abs(empty.height - 352) > 1 ||
    typeof sectionGap !== "number" ||
    Math.abs(sectionGap - 48) > 2
  ) {
    throw new Error(
      `Source Control error geometry drifted: ${JSON.stringify({ sections, sectionGap, empty, title, description, retry })}`,
    );
  }
  const beforeRetry = await readRendererReadiness(client);
  await tapSelector({ child, client, selector: "[data-source-control-retry]", timeoutMs });
  const afterRetry = await waitForSequenceAdvance({
    child,
    client,
    initial: beforeRetry,
    timeoutMs,
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".source-control-empty",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.text.includes("Could not scan the server environment") === true &&
      measurement.text.includes(
        "Source-control discovery is unavailable in this test environment.",
      ),
  });
  return {
    status: "pass",
    panel: panel.rect,
    sections,
    sectionGap,
    empty,
    title,
    description,
    retry,
    discoveryProbe,
    retryTransport: { before: beforeRetry, after: afterRetry },
    screenshot: captureNativeScreenshot({
      client,
      devToolCli,
      outputDirectory,
      name: "native-settings-source-control-error.png",
    }),
  };
}

async function verifySourceControlLoadingBehavior({
  child,
  client,
  devToolCli,
  outputDirectory,
  projectCwd,
  timeoutMs,
}) {
  const connectorProbe = await waitForConnectorCommand({
    child,
    client,
    method: "readProjectBranch",
    params: { cwd: projectCwd },
    timeoutMs,
  });
  await tapSelector({ child, client, selector: ".sidebar-settings-row", timeoutMs });
  await waitForRoutePanel({
    child,
    client,
    panel: "general",
    route: "/settings/general",
    timeoutMs,
  });
  await tapSelector({
    child,
    client,
    selector: ".settings-nav__item--source-control",
    timeoutMs,
  });
  await waitForRoutePanel({
    child,
    client,
    panel: "source-control",
    route: "/settings/source-control",
    timeoutMs,
  });
  const panel = await waitForMeasurement({
    child,
    client,
    selector: ".settings-content--source-control",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.text.includes("Version Control") === true &&
      measurement.text.includes("Source Control Providers") &&
      measurement.text.includes("Text generation"),
  });
  const sections = await readSelectorRects(client, ".source-control-section");
  const rows = await readSelectorRects(client, "[data-source-control-loading-row]");
  if (
    sections.length !== 3 ||
    rows.length !== 4 ||
    Math.abs(sections[0].width - 896) > 1 ||
    Math.abs(sections[0].height - 176) > 1 ||
    Math.abs(sections[1].width - 896) > 1 ||
    Math.abs(sections[1].height - 176) > 1 ||
    Math.abs(sections[1].y - 312) > 1 ||
    Math.abs(sections[2].y - 536) > 1 ||
    rows.some((row) => Math.abs(row.width - 896) > 1 || Math.abs(row.height - 66) > 1)
  ) {
    throw new Error(
      `Source Control loading geometry drifted: ${JSON.stringify({ sections, rows })}`,
    );
  }
  return {
    status: "pass",
    panel: panel.rect,
    sections,
    rows,
    connectorProbe,
    transport: await readRendererReadiness(client),
    screenshot: captureNativeScreenshot({
      client,
      devToolCli,
      outputDirectory,
      name: "native-settings-source-control-loading.png",
    }),
  };
}

async function verifySidebarScopeBehavior({ child, client, timeoutMs }) {
  const before = await readSidebarScopeLayout(client, false);
  await tapSelector({
    child,
    client,
    selector: ".sidebar-v2-project-scope-trigger",
    timeoutMs,
  });
  const opened = await waitForSidebarPopup({ child, client, open: true, timeoutMs });
  const sidebarRect = opened.sidebar.rect;
  const triggerRect = opened.trigger.rect;
  const popupRect = opened.popup.rect;
  const beforeThreadListRect = before.threadList.rect;
  const openedThreadListRect = opened.threadList.rect;
  if (
    !sidebarRect ||
    !triggerRect ||
    !popupRect ||
    !beforeThreadListRect ||
    !openedThreadListRect
  ) {
    throw new Error(`Sidebar scope popup lacks measurable geometry: ${JSON.stringify(opened)}`);
  }
  const popupRight = popupRect.x + popupRect.width;
  const sidebarRight = sidebarRect.x + sidebarRect.width;
  if (
    popupRect.x < sidebarRect.x - 1 ||
    popupRight > sidebarRight + 1 ||
    popupRect.y < triggerRect.y + triggerRect.height - 1
  ) {
    throw new Error(
      `Sidebar scope popup escaped its anchored rail: ${JSON.stringify({ sidebarRect, triggerRect, popupRect })}`,
    );
  }
  const listShift = Math.abs(openedThreadListRect.y - beforeThreadListRect.y);
  if (listShift > 1) {
    throw new Error(`Sidebar scope popup reflowed the thread list by ${listShift}px.`);
  }
  if (!opened.popup.text.includes("All projects")) {
    throw new Error(`Sidebar scope popup lost canonical options: ${opened.popup.text}`);
  }

  await tapSelector({ child, client, selector: ".sidebar-v2-scope-option", timeoutMs });
  const selected = await waitForSidebarPopup({ child, client, open: false, timeoutMs });
  if (selected.trigger.text.trim() === "All projects") {
    throw new Error(
      `Selecting the project scope did not update the trigger: ${JSON.stringify({
        dismissLayer: opened.dismissLayer,
        popup: opened.popup,
        trigger: selected.trigger,
      })}`,
    );
  }

  await tapSelector({
    child,
    client,
    selector: ".sidebar-v2-project-scope-trigger",
    timeoutMs,
  });
  await waitForSidebarPopup({ child, client, open: true, timeoutMs });
  await tapSelector({ child, client, selector: ".lynx-menu-dismiss-layer", timeoutMs });
  await waitForSidebarPopup({ child, client, open: false, timeoutMs });

  return {
    status: "pass",
    input: "DevTool Input.emulateTouchFromMouseEvent on measured semantic selectors",
    closed: {
      trigger: before.trigger,
      threadList: before.threadList,
    },
    opened: {
      trigger: opened.trigger,
      popup: opened.popup,
      threadList: opened.threadList,
      listShift,
    },
    selectedScope: selected.trigger.text,
    outsideTapClosed: true,
  };
}

async function verifyLifecycleRecovery({ baseDir, child, client, log, timeoutMs }) {
  await waitForLifecycleBannerToClear({ child, client, timeoutMs });
  const connectedProjection = await waitForSessionComposerProjection({
    child,
    client,
    timeoutMs,
  });
  const ports = [...log.read().matchAll(/Listening on http:\/\/127\.0\.0\.1:(\d+)/gu)].map(
    (match) => Number(match[1]),
  );
  const initialPort = ports.at(-1);
  if (!Number.isInteger(initialPort))
    throw new Error("Could not resolve the isolated server port.");
  const server = resolveOwnedServerProcess({
    appProcessId: child.pid,
    baseDir,
    port: initialPort,
  });
  const beforeInterrupt = await readRendererReadiness(client);

  process.kill(server.processId, "SIGKILL");
  const failure = await waitForLifecycleBanner({
    child,
    client,
    phase: "error",
    timeoutMs,
  });
  if (!failure.text.includes("Server exited") || !failure.text.includes("Reconnect")) {
    throw new Error(`Lifecycle failure lacks recovery guidance: ${JSON.stringify(failure)}`);
  }
  const disabledComposer = await waitForMeasurement({
    child,
    client,
    selector: ".composer-frame",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.attributes["data-composer-state"] ===
      connectedProjection.composer.attributes["data-composer-state"],
  });
  const disabledPrimaryAction = await waitForMeasurement({
    child,
    client,
    selector: ".composer-primary-action",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.attributes["data-composer-primary-state"] === "disabled",
  });

  await tapSelector({
    child,
    client,
    selector: ".connection-lifecycle-reconnect",
    timeoutMs,
  });
  const reconnecting = await waitForLifecycleBanner({
    child,
    client,
    phase: "reconnecting",
    timeoutMs,
  });
  await waitForLogOccurrence(child, log, "T3 Code server is ready", 2, timeoutMs);
  const afterRecovery = await waitForSequenceAdvance({
    child,
    client,
    initial: beforeInterrupt,
    timeoutMs,
  });
  await waitForLifecycleBannerToClear({ child, client, timeoutMs });
  const recoveredProjection = await waitForSessionComposerProjection({
    child,
    client,
    expectedSessionStatus: connectedProjection.sessionStatus,
    timeoutMs,
  });

  const recoveredPorts = [...log.read().matchAll(/Listening on http:\/\/127\.0\.0\.1:(\d+)/gu)].map(
    (match) => Number(match[1]),
  );
  const recoveredPort = recoveredPorts.at(-1);
  if (!Number.isInteger(recoveredPort)) {
    throw new Error("Could not resolve the recovered server port.");
  }
  const recoveredServer = resolveOwnedServerProcess({
    appProcessId: child.pid,
    baseDir,
    port: recoveredPort,
  });

  return {
    status: "pass",
    connectedComposer: {
      sessionStatus: connectedProjection.sessionStatus,
      state: connectedProjection.composer.attributes["data-composer-state"],
      rect: connectedProjection.composer.rect,
    },
    interruptedServer: server,
    failure,
    disabledComposer: {
      state: disabledComposer.attributes["data-composer-state"],
      rect: disabledComposer.rect,
      primaryState: disabledPrimaryAction.attributes["data-composer-primary-state"],
    },
    recoveryInput: "DevTool Input.emulateTouchFromMouseEvent on measured semantic selector",
    reconnecting,
    recoveredComposer: {
      sessionStatus: recoveredProjection.sessionStatus,
      state: recoveredProjection.composer.attributes["data-composer-state"],
      rect: recoveredProjection.composer.rect,
    },
    recoveredServer,
    sequence: { before: beforeInterrupt.lastSeq, after: afterRecovery.lastSeq },
    finalBanner: null,
  };
}

function readRendererErrors({ clientId, devToolCli, sessionId }) {
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
    { cwd: APP_ROOT, encoding: "utf8" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || `Lynx DevTool console exited ${result.status}.`);
  }
  return result.stdout.trim();
}

async function stopOwnedProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGINT");
  await waitForChildExit(child, 5_000);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGTERM");
    await waitForChildExit(child, 2_000);
  }
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await waitForChildExit(child, 5_000);
  }
}

async function runOnce({
  bundle,
  canonicalThreadTitle,
  desktopDir,
  devToolCli,
  executable,
  fixtureManifestProjectId,
  fixtureDir,
  height,
  index,
  isFinalRun,
  modelSelection,
  expectedTheme,
  expectNoComposerContext,
  expectedModelLabel,
  outputDirectory,
  projectCwd,
  requireCanonicalThread,
  timeoutMs,
  verifySettingsNavigation,
  verifySourceControlLoading: shouldVerifySourceControlLoading,
  verifySourceControlError: shouldVerifySourceControlError,
  verifyComposerGeometry: shouldVerifyComposerGeometry,
  verifyHeroComposerState: shouldVerifyHeroComposerState,
  verifyIdleThreadState: shouldVerifyIdleThreadState,
  idleFixture,
  verifyQuickSwitchDefault: shouldVerifyQuickSwitchDefault,
  verifySidebarGeometry: shouldVerifySidebarGeometry,
  verifySidebarScope,
  verifyLifecycleRecovery: shouldVerifyLifecycleRecovery,
  verifyComposerBranding,
  verifyModelPickerFidelity: shouldVerifyModelPickerFidelity,
  verifyModelSelectionMutation: shouldVerifyModelSelectionMutation,
  verifyRuntimeMenuDismiss: shouldVerifyRuntimeMenuDismiss,
  verifyModelOptionMenuMutation: shouldVerifyModelOptionMenuMutation,
  verifyComposerStop,
  verifyComposerWorkingState: shouldVerifyComposerWorkingState,
  verifyCompletedTranscriptState: shouldVerifyCompletedTranscriptState,
  verifyFailedTranscriptState: shouldVerifyFailedTranscriptState,
  verifyApprovalTranscriptState: shouldVerifyApprovalTranscriptState,
  verifyApprovalDeclineMutation: shouldVerifyApprovalDeclineMutation,
  approvalFixture,
  verifyQuestionTranscriptState: shouldVerifyQuestionTranscriptState,
  questionFixture,
  verifyReviewDiffState: shouldVerifyReviewDiffState,
  verifyReviewCheckpointStates: shouldVerifyReviewCheckpointStates,
  reviewFixture,
  verifyShellInteractions: shouldVerifyShellInteractions,
  verifyGitPublishDialog: shouldVerifyGitPublishDialog,
  verifyBetaMutation: shouldVerifyBetaMutation,
  verifyArchiveMutation: shouldVerifyArchiveMutation,
  verifyConnectionsMutation: shouldVerifyConnectionsMutation,
  composerStopEvidence,
  verifyRuntimeCapabilities: shouldVerifyRuntimeCapabilities,
  verifyPlan11SemanticOutcomes,
  width,
}) {
  const runRoot = mkdtempSync(path.join(os.tmpdir(), `t3code-packaged-readiness-${index}-`));
  const baseDir = path.join(runRoot, "state");
  cpSync(fixtureDir, baseDir, { recursive: true });
  let child = spawn(executable, [desktopDir], {
    cwd: APP_ROOT,
    env: {
      ...process.env,
      NODE_ENV: "production",
      T3_LYNXTRON_BASE_DIR: baseDir,
      T3_LYNXTRON_PROJECT_CWD: projectCwd,
      T3_LYNXTRON_VIEWPORT_WIDTH: String(width),
      T3_LYNXTRON_VIEWPORT_HEIGHT: String(height),
      ...(shouldVerifyModelOptionMenuMutation ? { T3_LYNXTRON_VIEWPORT_PROBE: "1" } : {}),
      ...(shouldVerifySourceControlLoading
        ? { T3_TEST_SOURCE_CONTROL_DISCOVERY_PENDING: "1" }
        : {}),
      ...(shouldVerifySourceControlError ? { T3_TEST_SOURCE_CONTROL_DISCOVERY_ERROR: "1" } : {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (!Number.isInteger(child.pid) || child.pid <= 0) {
    throw new Error("Lynxtron did not return an owned process id.");
  }
  let log = createLogCapture(child);
  let client;
  const startedAt = new Date().toISOString();
  try {
    client = await waitForOwnedSession({
      child,
      devToolCli,
      expectedBundleUrl: pathToFileURL(bundle).href,
      timeoutMs,
    });
    await waitForLogText(child, log, "T3 Code server is ready", timeoutMs);
    const beforeProbe = await waitForMainTransport({ child, client, timeoutMs });
    // Same-value, no-thread selection is an isolated-state no-op. It still
    // crosses renderer -> main and emits the connector log back through the
    // sequenced main -> renderer channel, proving both transport legs.
    await invokeSemanticAdvance(client, modelSelection);
    const afterProbe = await waitForSequenceAdvance({
      child,
      client,
      initial: beforeProbe,
      timeoutMs,
    });
    const transport = {
      kind: "main",
      probe: "same-value model selection without thread mutation",
      beforeProbe,
      afterProbe,
    };
    const canonicalState =
      shouldVerifyApprovalTranscriptState ||
      shouldVerifyApprovalDeclineMutation ||
      shouldVerifyQuestionTranscriptState ||
      shouldVerifyReviewDiffState
        ? await waitForClientState({
            child,
            client,
            timeoutMs,
            predicate: (state) =>
              state?.activeThreadId ===
                (shouldVerifyApprovalTranscriptState || shouldVerifyApprovalDeclineMutation
                  ? approvalFixture.threadId
                  : shouldVerifyQuestionTranscriptState
                    ? questionFixture.threadId
                    : reviewFixture.threadId) &&
              (shouldVerifyApprovalTranscriptState || shouldVerifyApprovalDeclineMutation
                ? state?.activeThread?.hasPendingApprovals === true
                : shouldVerifyQuestionTranscriptState
                  ? state?.activeThread?.hasPendingUserInput === true
                  : state?.latestTurn?.state === "completed") &&
              state?.activeThread?.modelSelection?.instanceId ===
                (shouldVerifyApprovalTranscriptState || shouldVerifyApprovalDeclineMutation
                  ? approvalFixture.modelSelection?.instanceId
                  : shouldVerifyQuestionTranscriptState
                    ? questionFixture.modelSelection?.instanceId
                    : reviewFixture.modelSelection?.instanceId) &&
              state?.activeThread?.modelSelection?.model ===
                (shouldVerifyApprovalTranscriptState || shouldVerifyApprovalDeclineMutation
                  ? approvalFixture.modelSelection?.model
                  : shouldVerifyQuestionTranscriptState
                    ? questionFixture.modelSelection?.model
                    : reviewFixture.modelSelection?.model) &&
              (shouldVerifyReviewDiffState ||
                (state?.sessionStatus === "running" &&
                  state?.activeTurnId ===
                    (shouldVerifyApprovalTranscriptState || shouldVerifyApprovalDeclineMutation
                      ? approvalFixture.activeTurnId
                      : questionFixture.activeTurnId))),
          })
        : requireCanonicalThread
          ? await waitForCanonicalState({
              canonicalThreadTitle,
              child,
              client,
              timeoutMs,
            })
          : {
              canonicalThreadTitle: null,
              threadText: null,
              modelText: null,
              skipped: "Lifecycle-only empty fixture.",
            };
    const runPlan11Outcomes = verifyPlan11SemanticOutcomes && isFinalRun;
    const cleanupOutcome = () => restoreOutcomeSurface({ child, client, timeoutMs });
    const sidebarScope = runPlan11Outcomes
      ? await captureOutcome(
          () => verifySidebarScopeBehavior({ child, client, timeoutMs }),
          cleanupOutcome,
        )
      : verifySidebarScope
        ? await verifySidebarScopeBehavior({ child, client, timeoutMs })
        : undefined;
    const sidebarGeometry = shouldVerifySidebarGeometry
      ? await verifySidebarGeometry(client, width)
      : undefined;
    const composerGeometry = shouldVerifyComposerGeometry
      ? await verifyComposerGeometry(client, expectedTheme)
      : undefined;
    const heroComposerState = shouldVerifyHeroComposerState
      ? await verifyHeroComposerState({
          child,
          client,
          expectNoComposerContext,
          expectedModelLabel,
          timeoutMs,
        })
      : undefined;
    const idleThreadState = shouldVerifyIdleThreadState
      ? await verifyIdleThreadState({
          child,
          client,
          expectNoComposerContext,
          idleFixture,
          timeoutMs,
        })
      : undefined;
    const quickSwitchDefault = shouldVerifyQuickSwitchDefault
      ? await verifyQuickSwitchDefault({ child, client, timeoutMs })
      : undefined;
    const composerThemeScreenshot =
      shouldVerifyComposerGeometry && expectedTheme
        ? captureNativeScreenshot({
            client,
            devToolCli,
            outputDirectory,
            name: `native-composer-${expectedTheme}.png`,
          })
        : undefined;
    const settingsNavigation = runPlan11Outcomes
      ? await captureOutcome(
          () =>
            verifySettingsRouteBehavior({
              child,
              client,
              devToolCli,
              modelSelection,
              outputDirectory,
              timeoutMs,
            }),
          cleanupOutcome,
        )
      : verifySettingsNavigation
        ? await verifySettingsRouteBehavior({
            child,
            client,
            devToolCli,
            modelSelection,
            outputDirectory,
            timeoutMs,
          })
        : undefined;
    const sourceControlLoading = shouldVerifySourceControlLoading
      ? await verifySourceControlLoadingBehavior({
          child,
          client,
          devToolCli,
          outputDirectory,
          projectCwd,
          timeoutMs,
        })
      : undefined;
    const sourceControlError = shouldVerifySourceControlError
      ? await verifySourceControlErrorBehavior({
          child,
          client,
          devToolCli,
          outputDirectory,
          timeoutMs,
        })
      : undefined;
    const composer = runPlan11Outcomes
      ? await captureOutcome(
          () => verifyComposerBehavior({ child, client, timeoutMs }),
          cleanupOutcome,
        )
      : verifyComposerBranding
        ? await verifyComposerBehavior({ child, client, timeoutMs })
        : undefined;
    const modelPickerFidelity = shouldVerifyModelPickerFidelity
      ? await verifyModelPickerFidelity({
          child,
          client,
          devToolCli,
          expectedTheme,
          outputDirectory,
          timeoutMs,
        })
      : undefined;
    const modelSelectionMutation = shouldVerifyModelSelectionMutation
      ? await verifyModelSelectionMutation({
          baseDir,
          child,
          client,
          devToolCli,
          outputDirectory,
          timeoutMs,
        })
      : undefined;
    const runtimeMenuDismiss = shouldVerifyRuntimeMenuDismiss
      ? await verifyRuntimeMenuDismiss({
          child,
          client,
          timeoutMs,
        })
      : undefined;
    const modelOptionMenuMutation = shouldVerifyModelOptionMenuMutation
      ? await verifyModelOptionMenuMutation({
          baseDir,
          child,
          client,
          timeoutMs,
        })
      : undefined;
    const composerStop = verifyComposerStop
      ? await verifyComposerStopBehavior({
          child,
          client,
          devToolCli,
          outputDirectory,
          projectId: fixtureManifestProjectId,
          timeoutMs,
        })
      : undefined;
    const composerWorkingState = shouldVerifyComposerWorkingState
      ? await verifyComposerWorkingState({
          client,
          devToolCli,
          outputDirectory,
          stopEvidence: composerStopEvidence,
        })
      : undefined;
    const completedTranscriptState = shouldVerifyCompletedTranscriptState
      ? await verifyCompletedTranscriptState({
          client,
          devToolCli,
          outputDirectory,
        })
      : undefined;
    const failedTranscriptState = shouldVerifyFailedTranscriptState
      ? await verifyFailedTranscriptState({
          client,
          devToolCli,
          outputDirectory,
        })
      : undefined;
    const approvalTranscriptState =
      shouldVerifyApprovalTranscriptState || shouldVerifyApprovalDeclineMutation
        ? await verifyApprovalTranscriptState({
            approvalFixture,
            client,
            devToolCli,
            outputDirectory,
          })
        : undefined;
    let approvalDeclineMutation;
    if (shouldVerifyApprovalDeclineMutation) {
      const approvalDeclineVerification = await verifyApprovalDeclineMutation({
        approvalFixture,
        baseDir,
        bundle,
        child,
        client,
        desktopDir,
        devToolCli,
        executable,
        height,
        projectCwd,
        timeoutMs,
        width,
      });
      approvalDeclineMutation = approvalDeclineVerification.outcome;
      child = approvalDeclineVerification.child;
      client = approvalDeclineVerification.client;
      log = approvalDeclineVerification.log;
    }
    const questionTranscriptState = shouldVerifyQuestionTranscriptState
      ? await verifyQuestionTranscriptState({
          child,
          client,
          devToolCli,
          outputDirectory,
          questionFixture,
          timeoutMs,
        })
      : undefined;
    const reviewDiffState = shouldVerifyReviewDiffState
      ? await verifyReviewDiffState({
          child,
          client,
          devToolCli,
          outputDirectory,
          reviewFixture,
          timeoutMs,
        })
      : undefined;
    const reviewCheckpointStates = shouldVerifyReviewCheckpointStates
      ? await verifyReviewCheckpointStates({
          child,
          client,
          devToolCli,
          outputDirectory,
          reviewFixture,
          timeoutMs,
        })
      : undefined;
    const shellInteractions = shouldVerifyShellInteractions
      ? await verifyShellInteractions({
          child,
          client,
          timeoutMs,
        })
      : undefined;
    const gitPublishDialog = shouldVerifyGitPublishDialog
      ? await verifyGitPublishDialog({
          child,
          client,
          timeoutMs,
        })
      : undefined;
    let betaMutation;
    if (shouldVerifyBetaMutation) {
      const betaVerification = await verifyBetaMutation({
        baseDir,
        bundle,
        child,
        client,
        desktopDir,
        devToolCli,
        executable,
        height,
        projectCwd,
        timeoutMs,
        width,
      });
      betaMutation = betaVerification.outcome;
      child = betaVerification.child;
      client = betaVerification.client;
      log = betaVerification.log;
    }
    let archiveMutation;
    if (shouldVerifyArchiveMutation) {
      const archiveVerification = await verifyArchiveMutation({
        baseDir,
        bundle,
        child,
        client,
        desktopDir,
        devToolCli,
        executable,
        height,
        projectCwd,
        timeoutMs,
        width,
      });
      archiveMutation = archiveVerification.outcome;
      child = archiveVerification.child;
      client = archiveVerification.client;
      log = archiveVerification.log;
    }
    let connectionsMutation;
    if (shouldVerifyConnectionsMutation) {
      const connectionsVerification = await verifyConnectionsMutation({
        baseDir,
        bundle,
        child,
        client,
        desktopDir,
        devToolCli,
        executable,
        height,
        projectCwd,
        timeoutMs,
        width,
      });
      connectionsMutation = connectionsVerification.outcome;
      child = connectionsVerification.child;
      client = connectionsVerification.client;
      log = connectionsVerification.log;
    }
    const runtimeCapabilities = shouldVerifyRuntimeCapabilities
      ? await verifyRuntimeCapabilities(client)
      : undefined;
    const branding = runPlan11Outcomes
      ? await captureOutcome(() => verifyDevBranding(client))
      : verifyComposerBranding
        ? await verifyDevBranding(client)
        : undefined;
    // Run the destructive lifecycle recovery last so a failed server restart
    // cannot erase otherwise independent product-outcome evidence.
    const lifecycleRecovery = runPlan11Outcomes
      ? await captureOutcome(() =>
          verifyLifecycleRecovery({ baseDir, child, client, log, timeoutMs }),
        )
      : shouldVerifyLifecycleRecovery
        ? await verifyLifecycleRecovery({ baseDir, child, client, log, timeoutMs })
        : undefined;
    const rendererErrors = readRendererErrors({
      clientId: client.identity.clientId,
      devToolCli,
      sessionId: client.identity.sessionId,
    });
    if (rendererErrors) throw new Error(`Renderer errors:\n${rendererErrors}`);
    const outcomeChecks = [
      sidebarScope,
      sidebarGeometry,
      composerGeometry,
      heroComposerState,
      idleThreadState,
      quickSwitchDefault,
      settingsNavigation,
      sourceControlLoading,
      sourceControlError,
      composer,
      modelPickerFidelity,
      modelSelectionMutation,
      runtimeMenuDismiss,
      modelOptionMenuMutation,
      composerStop,
      composerWorkingState,
      completedTranscriptState,
      failedTranscriptState,
      approvalTranscriptState,
      approvalDeclineMutation,
      questionTranscriptState,
      reviewDiffState,
      reviewCheckpointStates,
      shellInteractions,
      gitPublishDialog,
      betaMutation,
      archiveMutation,
      connectionsMutation,
      runtimeCapabilities,
      branding,
      lifecycleRecovery,
    ].filter(Boolean);
    return {
      index,
      status: outcomeChecks.every((outcome) => outcome.status === "pass") ? "pass" : "fail",
      startedAt,
      processId: child.pid,
      isolatedState: { path: baseDir, disposed: true },
      serverPort: Number(log.read().match(/Listening on http:\/\/127\.0\.0\.1:(\d+)/u)?.[1]),
      client: client.identity,
      transport,
      canonicalState,
      lifecycleRecovery,
      sidebarScope,
      sidebarGeometry,
      composerGeometry,
      heroComposerState,
      idleThreadState,
      quickSwitchDefault,
      composerThemeScreenshot,
      settingsNavigation,
      sourceControlLoading,
      sourceControlError,
      composer,
      modelPickerFidelity,
      modelSelectionMutation,
      runtimeMenuDismiss,
      modelOptionMenuMutation,
      composerStop,
      composerWorkingState,
      completedTranscriptState,
      failedTranscriptState,
      approvalTranscriptState,
      approvalDeclineMutation,
      questionTranscriptState,
      reviewDiffState,
      reviewCheckpointStates,
      shellInteractions,
      gitPublishDialog,
      betaMutation,
      archiveMutation,
      connectionsMutation,
      runtimeCapabilities,
      branding,
      rendererErrors: 0,
    };
  } catch (error) {
    return {
      index,
      status: "fail",
      startedAt,
      processId: child.pid,
      isolatedState: { path: baseDir, disposed: true },
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await client?.close();
    await stopOwnedProcess(child);
    mkdirSync(path.join(outputDirectory, "logs"), { recursive: true });
    writeFileSync(
      path.join(outputDirectory, "logs", `run-${index}.log`),
      redactProcessLog(log.read()),
    );
    rmSync(runRoot, { recursive: true, force: true });
  }
}

const fixtureDir = path.resolve(argumentValue("--fixture-dir") ?? "");
const projectCwd = path.resolve(argumentValue("--project-cwd") ?? "");
const output = path.resolve(argumentValue("--output") ?? "");
const runs = Number(argumentValue("--runs") ?? 3);
const width = Number(argumentValue("--width") ?? 1280);
const height = Number(argumentValue("--height") ?? 820);
const timeoutMs = Number(argumentValue("--timeout-ms") ?? DEFAULT_TIMEOUT_MS);
const expectedTheme = argumentValue("--expected-theme");
const expectedModelLabel = argumentValue("--expected-model-label");
const expectNoComposerContext = process.argv.includes("--expect-no-composer-context");
const verifySettingsNavigation = process.argv.includes("--verify-settings-navigation");
const shouldVerifySourceControlLoading = process.argv.includes("--verify-source-control-loading");
const shouldVerifySourceControlError = process.argv.includes("--verify-source-control-error");
const shouldVerifyComposerGeometry = process.argv.includes("--verify-composer-geometry");
const shouldVerifyHeroComposerState = process.argv.includes("--verify-hero-composer-state");
const shouldVerifyIdleThreadState = process.argv.includes("--verify-idle-thread-state");
const shouldVerifyQuickSwitchDefault = process.argv.includes("--verify-quick-switch-default");
const shouldVerifySidebarGeometry = process.argv.includes("--verify-sidebar-geometry");
const verifySidebarScope = process.argv.includes("--verify-sidebar-scope");
const shouldVerifyLifecycleRecovery = process.argv.includes("--verify-lifecycle-recovery");
const verifyComposerBranding = process.argv.includes("--verify-composer-branding");
const shouldVerifyModelPickerFidelity = process.argv.includes("--verify-model-picker-fidelity");
const shouldVerifyModelSelectionMutation = process.argv.includes(
  "--verify-model-selection-mutation",
);
const shouldVerifyRuntimeMenuDismiss = process.argv.includes("--verify-runtime-menu-dismiss");
const shouldVerifyModelOptionMenuMutation = process.argv.includes(
  "--verify-model-option-menu-mutation",
);
const verifyComposerStop = process.argv.includes("--verify-composer-stop");
const shouldVerifyComposerWorkingState = process.argv.includes("--verify-composer-working-state");
const shouldVerifyCompletedTranscriptState = process.argv.includes(
  "--verify-completed-transcript-state",
);
const shouldVerifyFailedTranscriptState = process.argv.includes("--verify-failed-transcript-state");
const shouldVerifyApprovalTranscriptState = process.argv.includes(
  "--verify-approval-transcript-state",
);
const shouldVerifyApprovalDeclineMutation = process.argv.includes(
  "--verify-approval-decline-mutation",
);
const shouldVerifyQuestionTranscriptState = process.argv.includes(
  "--verify-question-transcript-state",
);
const shouldVerifyReviewDiffState = process.argv.includes("--verify-review-diff-state");
const shouldVerifyReviewCheckpointStates = process.argv.includes(
  "--verify-review-checkpoint-states",
);
const shouldVerifyShellInteractions = process.argv.includes("--verify-shell-interactions");
const shouldVerifyGitPublishDialog = process.argv.includes("--verify-git-publish-dialog");
const shouldVerifyBetaMutation = process.argv.includes("--verify-beta-mutation");
const shouldVerifyArchiveMutation = process.argv.includes("--verify-archive-mutation");
const shouldVerifyConnectionsMutation = process.argv.includes("--verify-connections-mutation");
const composerStopEvidence = argumentValue("--composer-stop-evidence") ?? null;
const shouldVerifyRuntimeCapabilities = process.argv.includes("--verify-runtime-capabilities");
const verifyPlan11SemanticOutcomes = process.argv.includes("--verify-plan11-semantic-outcomes");
const desktopDir = path.resolve(argumentValue("--desktop-dir") ?? DEFAULT_DESKTOP_DIR);
const bundle = path.resolve(argumentValue("--bundle") ?? DEFAULT_BUNDLE);
const devToolCli = path.resolve(
  argumentValue("--devtool-cli") ?? process.env.LYNX_DEVTOOL_CLI ?? DEFAULT_DEVTOOL_CLI,
);
const executable = resolveLynxtronExecutable();

if (
  !argumentValue("--fixture-dir") ||
  !argumentValue("--project-cwd") ||
  !argumentValue("--output")
) {
  throw new Error(
    "Usage: verify-packaged-readiness.mjs --fixture-dir <dir> --project-cwd <dir> --output <report.json>",
  );
}
if (!Number.isInteger(runs) || runs < 1 || runs > 10) throw new Error("--runs must be 1..10.");
if (!Number.isInteger(width) || !Number.isInteger(height)) {
  throw new Error("Readiness viewport must use integer dimensions.");
}
if (expectedTheme && expectedTheme !== "light" && expectedTheme !== "dark") {
  throw new Error("--expected-theme must be light or dark.");
}
if (shouldVerifyHeroComposerState && !expectedModelLabel) {
  throw new Error("--verify-hero-composer-state requires --expected-model-label.");
}
if (verifyPlan11SemanticOutcomes && runs !== 3) {
  throw new Error("--verify-plan11-semantic-outcomes requires exactly three fresh runs.");
}
for (const requiredPath of [fixtureDir, projectCwd, desktopDir, bundle, devToolCli, executable]) {
  if (!existsSync(requiredPath))
    throw new Error(`Required readiness path is missing: ${requiredPath}`);
}

const fixtureManifest = JSON.parse(
  readFileSync(path.join(fixtureDir, "visual-state.json"), "utf8"),
);
const idleFixture = fixtureManifest.idleThreadFixture;
if (
  shouldVerifyIdleThreadState &&
  (typeof idleFixture?.threadId !== "string" ||
    typeof idleFixture?.title !== "string" ||
    idleFixture.sessionStatus !== "idle" ||
    idleFixture.latestTurn !== null ||
    idleFixture.messageCount !== 0 ||
    typeof idleFixture?.modelSelection?.instanceId !== "string" ||
    typeof idleFixture?.modelSelection?.model !== "string")
) {
  throw new Error(
    "--verify-idle-thread-state requires a canonical idleThreadFixture with no turn or messages.",
  );
}
const approvalFixture = fixtureManifest.pendingRequestFixture;
if (
  (shouldVerifyApprovalTranscriptState || shouldVerifyApprovalDeclineMutation) &&
  (approvalFixture?.mode !== "approval" ||
    typeof approvalFixture.threadId !== "string" ||
    typeof approvalFixture.title !== "string" ||
    approvalFixture.sessionStatus !== "running" ||
    typeof approvalFixture.activeTurnId !== "string" ||
    approvalFixture.activity?.kind !== "approval.requested" ||
    typeof approvalFixture.activity?.payload?.detail !== "string")
) {
  throw new Error(
    "--verify-approval-transcript-state requires a real pendingRequestFixture approval.",
  );
}
const questionFixture = fixtureManifest.pendingRequestFixture;
if (
  shouldVerifyQuestionTranscriptState &&
  (questionFixture?.mode !== "question" ||
    typeof questionFixture.threadId !== "string" ||
    questionFixture.sessionStatus !== "running" ||
    typeof questionFixture.activeTurnId !== "string" ||
    questionFixture.activity?.kind !== "user-input.requested" ||
    typeof questionFixture.activity?.payload?.requestId !== "string" ||
    !Array.isArray(questionFixture.activity?.payload?.questions) ||
    questionFixture.activity.payload.questions.length === 0)
) {
  throw new Error(
    "--verify-question-transcript-state requires a real pendingRequestFixture question.",
  );
}
const reviewFixture = fixtureManifest.reviewFixture;
if (
  (shouldVerifyReviewDiffState || shouldVerifyReviewCheckpointStates) &&
  (typeof reviewFixture?.threadId !== "string" ||
    typeof reviewFixture?.title !== "string" ||
    reviewFixture.latestTurnState !== "completed" ||
    typeof reviewFixture?.modelSelection?.instanceId !== "string" ||
    typeof reviewFixture?.modelSelection?.model !== "string" ||
    typeof reviewFixture?.checkpoint?.turnId !== "string" ||
    reviewFixture?.checkpoint?.status !== "ready" ||
    !Array.isArray(reviewFixture?.checkpoint?.files) ||
    reviewFixture.checkpoint.files.length === 0)
) {
  throw new Error("--verify-review-diff-state requires a real completed reviewFixture checkpoint.");
}
const fixtureManifestProjectId = fixtureManifest.project?.projectId;
const transcriptFixture = fixtureManifest.transcriptFixture;
if (
  verifyComposerStop &&
  (typeof fixtureManifestProjectId !== "string" || fixtureManifestProjectId.length === 0)
) {
  throw new Error("--verify-composer-stop requires visual-state.json project.projectId.");
}
const canonicalThreadTitle = shouldVerifyIdleThreadState
  ? idleFixture.title
  : shouldVerifyCompletedTranscriptState || shouldVerifyFailedTranscriptState
    ? transcriptFixture?.title
    : shouldVerifyApprovalTranscriptState ||
        shouldVerifyApprovalDeclineMutation ||
        shouldVerifyQuestionTranscriptState
      ? fixtureManifest.pendingRequestFixture.title
      : shouldVerifyReviewDiffState || shouldVerifyReviewCheckpointStates
        ? reviewFixture.title
        : fixtureManifest.sidebarFixture?.titles?.[0];
const lifecycleOnlyEmptyFixture =
  shouldVerifyLifecycleRecovery &&
  !verifySettingsNavigation &&
  !verifySidebarScope &&
  !verifyComposerBranding &&
  !shouldVerifyModelPickerFidelity &&
  !verifyPlan11SemanticOutcomes;
const heroOnlyEmptyFixture =
  shouldVerifyHeroComposerState &&
  !verifySettingsNavigation &&
  !verifySidebarScope &&
  !verifyComposerBranding &&
  !shouldVerifyModelPickerFidelity &&
  !verifyPlan11SemanticOutcomes;
const sourceControlErrorOnlyEmptyFixture =
  shouldVerifySourceControlError &&
  !verifySettingsNavigation &&
  !verifySidebarScope &&
  !verifyComposerBranding &&
  !shouldVerifyModelPickerFidelity &&
  !verifyPlan11SemanticOutcomes;
const sourceControlLoadingOnlyEmptyFixture =
  shouldVerifySourceControlLoading &&
  !verifySettingsNavigation &&
  !verifySidebarScope &&
  !verifyComposerBranding &&
  !shouldVerifyModelPickerFidelity &&
  !verifyPlan11SemanticOutcomes;
if (
  !lifecycleOnlyEmptyFixture &&
  !heroOnlyEmptyFixture &&
  !sourceControlLoadingOnlyEmptyFixture &&
  !sourceControlErrorOnlyEmptyFixture &&
  (typeof canonicalThreadTitle !== "string" || canonicalThreadTitle.length === 0)
) {
  throw new Error("The readiness fixture must declare sidebarFixture.titles[0].");
}
const modelSelection = shouldVerifyIdleThreadState
  ? idleFixture.modelSelection
  : shouldVerifyCompletedTranscriptState || shouldVerifyFailedTranscriptState
    ? transcriptFixture?.modelSelection
    : shouldVerifyApprovalTranscriptState ||
        shouldVerifyApprovalDeclineMutation ||
        shouldVerifyQuestionTranscriptState
      ? fixtureManifest.pendingRequestFixture.modelSelection
      : shouldVerifyReviewDiffState || shouldVerifyReviewCheckpointStates
        ? reviewFixture.modelSelection
        : JSON.parse(readFileSync(path.join(fixtureDir, "lynxtron-prefs.json"), "utf8"))
            .modelSelection;
if (typeof modelSelection?.instanceId !== "string" || typeof modelSelection?.model !== "string") {
  throw new Error("The readiness fixture must declare a saved modelSelection.");
}
const outputDirectory = path.dirname(output);
mkdirSync(outputDirectory, { recursive: true });
const results = [];
for (let index = 1; index <= runs; index += 1) {
  results.push(
    await runOnce({
      bundle,
      canonicalThreadTitle,
      desktopDir,
      devToolCli,
      executable,
      fixtureManifestProjectId,
      fixtureDir,
      height,
      index,
      isFinalRun: index === runs,
      modelSelection,
      expectedTheme,
      expectNoComposerContext,
      expectedModelLabel,
      outputDirectory,
      projectCwd,
      requireCanonicalThread:
        !lifecycleOnlyEmptyFixture &&
        !heroOnlyEmptyFixture &&
        !sourceControlLoadingOnlyEmptyFixture &&
        !sourceControlErrorOnlyEmptyFixture,
      timeoutMs,
      verifySettingsNavigation,
      verifySourceControlLoading: shouldVerifySourceControlLoading,
      verifySourceControlError: shouldVerifySourceControlError,
      verifyComposerGeometry: shouldVerifyComposerGeometry,
      verifyHeroComposerState: shouldVerifyHeroComposerState,
      verifyIdleThreadState: shouldVerifyIdleThreadState,
      idleFixture,
      verifyQuickSwitchDefault: shouldVerifyQuickSwitchDefault,
      verifySidebarGeometry: shouldVerifySidebarGeometry,
      verifySidebarScope,
      verifyLifecycleRecovery: shouldVerifyLifecycleRecovery,
      verifyComposerBranding,
      verifyModelPickerFidelity: shouldVerifyModelPickerFidelity,
      verifyModelSelectionMutation: shouldVerifyModelSelectionMutation,
      verifyRuntimeMenuDismiss: shouldVerifyRuntimeMenuDismiss,
      verifyModelOptionMenuMutation: shouldVerifyModelOptionMenuMutation,
      verifyComposerStop,
      verifyComposerWorkingState: shouldVerifyComposerWorkingState,
      verifyCompletedTranscriptState: shouldVerifyCompletedTranscriptState,
      verifyFailedTranscriptState: shouldVerifyFailedTranscriptState,
      verifyApprovalTranscriptState: shouldVerifyApprovalTranscriptState,
      verifyApprovalDeclineMutation: shouldVerifyApprovalDeclineMutation,
      approvalFixture,
      verifyQuestionTranscriptState: shouldVerifyQuestionTranscriptState,
      questionFixture,
      verifyReviewDiffState: shouldVerifyReviewDiffState,
      verifyReviewCheckpointStates: shouldVerifyReviewCheckpointStates,
      reviewFixture,
      verifyShellInteractions: shouldVerifyShellInteractions,
      verifyGitPublishDialog: shouldVerifyGitPublishDialog,
      verifyBetaMutation: shouldVerifyBetaMutation,
      verifyArchiveMutation: shouldVerifyArchiveMutation,
      verifyConnectionsMutation: shouldVerifyConnectionsMutation,
      composerStopEvidence,
      verifyRuntimeCapabilities: shouldVerifyRuntimeCapabilities,
      verifyPlan11SemanticOutcomes,
      width,
    }),
  );
}

const report = {
  schemaVersion: 1,
  status: results.every((result) => result.status === "pass") ? "pass" : "fail",
  recordedAt: new Date().toISOString(),
  head: readHead(),
  executable,
  desktopDir,
  bundle: { path: bundle, bytes: statSync(bundle).size, sha256: sha256(bundle) },
  fixture: {
    source: fixtureDir,
    snapshotId: fixtureManifest.snapshotId,
    projectTitle: fixtureManifest.project.title,
    canonicalThreadTitle,
    modelSelection,
    idleThread: shouldVerifyIdleThreadState
      ? {
          threadId: idleFixture.threadId,
          sessionStatus: idleFixture.sessionStatus,
          latestTurn: idleFixture.latestTurn,
          messageCount: idleFixture.messageCount,
        }
      : undefined,
    pendingRequest:
      shouldVerifyApprovalTranscriptState ||
      shouldVerifyApprovalDeclineMutation ||
      shouldVerifyQuestionTranscriptState
        ? {
            mode: fixtureManifest.pendingRequestFixture.mode,
            threadId: fixtureManifest.pendingRequestFixture.threadId,
            requestId: fixtureManifest.pendingRequestFixture.activity.payload.requestId,
            activeTurnId: fixtureManifest.pendingRequestFixture.activeTurnId,
          }
        : undefined,
  },
  viewport: { width, height },
  expectedTheme: expectedTheme ?? null,
  results,
  semanticOutcomes: verifyPlan11SemanticOutcomes
    ? buildPlan11SemanticOutcomes(results.at(-1))
    : undefined,
  certification: verifyPlan11SemanticOutcomes ? buildPlan11SemanticCertification() : undefined,
};
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.status !== "pass") process.exitCode = 1;
