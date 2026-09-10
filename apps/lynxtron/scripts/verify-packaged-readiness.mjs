#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import {
  chmodSync,
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
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";

import { collectLynxMeasurements } from "./devtool-measurements.mjs";
import { openOwnedDevToolSession, readOwnedListeningTcpPorts } from "./devtool-client-identity.mjs";
import {
  assertComposerGeometry,
  assertComposerRouteState,
  buildPlan11SemanticCertification,
  buildPlan11SemanticOutcomes,
} from "./plan11-semantic-outcomes.mjs";
import {
  floatingRelationResidual,
  measureFloatingRelation,
} from "../../../packages/client-runtime/src/presentation/floatingRelation.ts";
import {
  fileContentRevision,
  projectFileDetailLayout,
} from "../../../packages/client-runtime/src/presentation/files.ts";

const APP_ROOT = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
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

async function moveMouse(client, point) {
  await client.runCdp("Input.emulateTouchFromMouseEvent", {
    type: "mouseMoved",
    x: Math.round(point.x),
    y: Math.round(point.y),
    timestamp: Date.now() / 1000,
    button: "none",
  });
}

function resolveLynxtronExecutable() {
  const configured = process.env.LYNXTRON_EXECUTABLE?.trim();
  if (configured) return path.resolve(configured);
  try {
    const nativePaths = require("@lynx-js/lynxtron/native-paths");
    if (typeof nativePaths.executablePath === "string") {
      return nativePaths.executablePath;
    }
  } catch {
    // Lynxtron before 0.0.21 did not expose runtime-aware native paths.
  }
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

async function waitWhileAlive(child, durationMs) {
  if (await waitForChildExit(child, durationMs)) {
    throw new Error("Lynxtron exited while waiting for the interaction timing window.");
  }
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

async function verifyExpectedTheme({ child, client, expectedTheme, timeoutMs }) {
  if (!expectedTheme) return null;
  const themeRoot = await waitForMeasurement({
    child,
    client,
    selector: ".app-theme-root",
    timeoutMs,
    predicate: (measurement) => measurement?.attributes["data-theme"] === expectedTheme,
  });
  return {
    expected: expectedTheme,
    actual: themeRoot.attributes["data-theme"],
  };
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

async function readSearchOverlayState(client) {
  const response = await client.runCdp("Runtime.evaluate", {
    expression: "JSON.stringify(globalThis.__T3_LYNXTRON_SEARCH_OVERLAY_STATE__?.() ?? null)",
    returnByValue: true,
  });
  const result = commandResult(response);
  return typeof result?.value === "string" ? JSON.parse(result.value) : null;
}

async function waitForSearchOverlayState({ child, client, predicate, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("Lynxtron exited before search overlay state reached its postcondition.");
    }
    latest = await readSearchOverlayState(client);
    if (predicate(latest)) return latest;
    await waitForChildExit(child, 100);
  }
  throw new Error(`Timed out waiting for search overlay state: ${JSON.stringify({ latest })}`);
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

async function waitForRuntimeValue({ child, client, expression, predicate, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("Lynxtron exited before runtime state reached its expected postcondition.");
    }
    const response = await client.runCdp("Runtime.evaluate", { expression, returnByValue: true });
    latest = commandResult(response)?.value ?? null;
    if (predicate(latest)) return latest;
    await waitForChildExit(child, 100);
  }
  throw new Error(`Timed out waiting for runtime state: ${JSON.stringify({ expression, latest })}`);
}

async function waitForFileContents({ child, filePath, predicate, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("Lynxtron exited before the workspace file reached its expected contents.");
    }
    latest = readFileSync(filePath, "utf8");
    if (predicate(latest)) return latest;
    await waitForChildExit(child, 100);
  }
  throw new Error(
    `Timed out waiting for workspace file contents: ${JSON.stringify({
      filePath,
      latestRevision: latest === null ? null : fileContentRevision(latest),
    })}`,
  );
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

async function waitForExplicitThreadState({ child, client, fixture, timeoutMs }) {
  const state = await waitForClientState({
    child,
    client,
    timeoutMs,
    predicate: (candidate) =>
      candidate?.activeThreadId === fixture.threadId &&
      candidate?.activeThread?.title === fixture.title &&
      typeof candidate?.activeThread?.modelSelection?.instanceId === "string" &&
      typeof candidate?.activeThread?.modelSelection?.model === "string",
  });
  return {
    canonicalThreadTitle: fixture.title,
    threadId: state.activeThreadId,
    threadText: state.activeThread.title,
    modelSelection: state.activeThread.modelSelection,
  };
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
      const [attributesResponse, boxResponse, outerHtmlResponse, textResponse] = await Promise.all([
        client.runCdp("DOM.getAttributes", { nodeId }),
        client.runCdp("DOM.getBoxModel", { nodeId }),
        client.runCdp("DOM.getOuterHTML", { nodeId }),
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
      const innerText = commandResult(textResponse)?.innerText ?? "";
      const outerHTML = commandResult(outerHtmlResponse)?.outerHTML ?? "";
      const rawText = [...outerHTML.matchAll(/<raw-text\b[^>]*\btext="([^"]*)"/gu)]
        .map((match) =>
          match[1]
            .replaceAll("&quot;", '"')
            .replaceAll("&apos;", "'")
            .replaceAll("&lt;", "<")
            .replaceAll("&gt;", ">")
            .replaceAll("&amp;", "&"),
        )
        .join("");
      return {
        nodeId,
        rect: quadRect(model?.border ?? model?.content),
        text: innerText || rawText,
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

async function readFirstSelectorStyleValue(client, selector, property) {
  await client.runCdp("DOM.enable", { useCompression: false });
  const documentResponse = await client.runCdp("DOM.getDocument", { depth: 0 });
  const root = commandResult(documentResponse)?.root;
  const rootNodeId = root?.children?.[0]?.nodeId ?? root?.nodeId;
  if (!Number.isInteger(rootNodeId) || rootNodeId <= 0) {
    throw new Error("Lynx DevTool did not return a DOM root node.");
  }
  const nodeResponse = await client.runCdp("DOM.querySelector", {
    nodeId: rootNodeId,
    selector,
  });
  const nodeId = commandResult(nodeResponse)?.nodeId;
  if (!Number.isInteger(nodeId) || nodeId <= 0) return null;
  const styleResponse = await client.runCdp("CSS.getComputedStyleForNode", { nodeId });
  const computedStyle = commandResult(styleResponse)?.computedStyle ?? [];
  return computedStyle.find((entry) => entry.name === property)?.value ?? null;
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

async function verifySidebarGeometry(client, viewportWidth, expectedEnvironmentIdentificationMode) {
  const [sidebar] = await readSelectorRects(client, ".sidebar");
  const [threadList] = await readSelectorRects(client, ".sidebar-v2-thread-list");
  const rows = await readSelectorRects(client, ".sidebar-v2-row-item");
  const cards = await readSelectorRects(client, ".sidebar-v2-row-card");
  const brand = await readOptionalMeasurement(client, ".sidebar-brand");
  const backdrop = await readOptionalMeasurement(client, ".sidebar__brand-bg");
  const clientState = await readClientState(client);
  const activeStatus = await readOptionalMeasurement(
    client,
    ".sidebar-v2-row-item--active .sidebar-v2-row-status",
  );
  const activeCard = await readOptionalMeasurement(
    client,
    ".sidebar-v2-row-item--active .sidebar-v2-row-card",
  );
  const activeStatusContent = await readOptionalMeasurement(
    client,
    ".sidebar-v2-row-item--active .sidebar-v2-row-status-content",
  );
  const workingDuration = await readOptionalMeasurement(
    client,
    ".sidebar-v2-row-item--active .sidebar-v2-working-duration",
  );
  const projectScopeHost = await readOptionalMeasurement(client, ".sidebar-v2-project-scope-host");
  const newProject = await readOptionalMeasurement(client, ".sidebar-v2-new-project");
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
  const leftInset = threadList.x - sidebar.x;
  const rightInset = sidebarRight - listRight;
  if (
    Math.abs(leftInset - rightInset) > 1 ||
    rows.some((row) => Math.abs(row.width - threadList.width) > 1) ||
    cards.some((card) => Math.abs(card.width - threadList.width) > 1)
  ) {
    throw new Error(
      `Sidebar card insets are asymmetric: ${JSON.stringify({
        cards,
        leftInset,
        rightInset,
        rows,
        sidebar,
        threadList,
      })}`,
    );
  }
  const sessionStatus = clientState?.activeThread?.session?.status ?? "idle";
  const workingExpected =
    sessionStatus === "running" &&
    clientState?.activeThread?.hasPendingApprovals !== true &&
    clientState?.activeThread?.hasPendingUserInput !== true;
  const workingVisible = activeStatus?.text.includes("Working") === true;
  const durationText = workingDuration?.text.trim() ?? "";
  const durationVisible = /^(?:\d+s|\d+m|\d+h \d+m)$/u.test(durationText);
  const statusDurationVisible = /Working (?:\d+s|\d+m|\d+h \d+m)/u.test(activeStatus?.text ?? "");
  if (
    workingVisible !== workingExpected ||
    durationVisible !== workingExpected ||
    statusDurationVisible !== workingExpected
  ) {
    throw new Error(
      `Sidebar Working label disagrees with the active session: ${JSON.stringify({
        activeStatus,
        durationText,
        durationVisible,
        pendingApprovals: clientState?.activeThread?.hasPendingApprovals ?? null,
        pendingUserInput: clientState?.activeThread?.hasPendingUserInput ?? null,
        sessionStatus,
        statusDurationVisible,
        workingDuration,
        workingExpected,
        workingVisible,
      })}`,
    );
  }
  if (workingExpected) {
    const statusRect = activeStatusContent?.rect;
    const durationRect = workingDuration?.rect;
    const cardRect = activeCard?.rect;
    const cardRight = (cardRect?.x ?? 0) + (cardRect?.width ?? 0);
    if (
      !cardRect ||
      !statusRect ||
      !durationRect ||
      statusRect.height > 20 ||
      durationRect.height > 20 ||
      Math.abs(statusRect.y - durationRect.y) > 2 ||
      Math.abs(cardRight - (statusRect.x + statusRect.width) - 10) > 2 ||
      durationRect.x < statusRect.x ||
      durationRect.x + durationRect.width > statusRect.x + statusRect.width + 1
    ) {
      throw new Error(
        `Sidebar Working metadata escaped its card anchor: ${JSON.stringify({
          activeCard,
          activeStatusContent,
          workingDuration,
        })}`,
      );
    }
  }
  if (projectScopeHost?.rect && newProject?.rect) {
    const newProjectRightInset = sidebarRight - (newProject.rect.x + newProject.rect.width);
    const controlGap = newProject.rect.x - (projectScopeHost.rect.x + projectScopeHost.rect.width);
    const projectScopeCenterY = projectScopeHost.rect.y + projectScopeHost.rect.height / 2;
    const newProjectCenterY = newProject.rect.y + newProject.rect.height / 2;
    if (
      Math.abs(newProjectRightInset - 8) > 2 ||
      Math.abs(controlGap - 4) > 2 ||
      Math.abs(projectScopeCenterY - newProjectCenterY) > 1
    ) {
      throw new Error(
        `Sidebar project controls drifted from the Sidebar rail: ${JSON.stringify({
          controlGap,
          newProject,
          newProjectCenterY,
          newProjectRightInset,
          projectScopeCenterY,
          projectScopeHost,
          sidebar,
        })}`,
      );
    }
  }
  if (!brand?.rect || Math.abs(brand.rect.x - 130) > 1 || !brand.text.includes("Code")) {
    throw new Error(
      `Sidebar brand drifted from the titlebar inset: ${JSON.stringify({
        brand,
        viewportWidth,
      })}`,
    );
  }
  const artworkExpected = expectedEnvironmentIdentificationMode === "artwork";
  if (
    expectedEnvironmentIdentificationMode &&
    (Boolean(backdrop) !== artworkExpected ||
      (artworkExpected &&
        (!backdrop?.rect ||
          Math.abs(backdrop.rect.x - sidebar.x) > 1 ||
          Math.abs(backdrop.rect.width - sidebar.width) > 1 ||
          Math.abs(backdrop.rect.height - 80) > 1 ||
          !brand.attributes.class?.includes("sidebar-brand--on-backdrop"))) ||
      (!artworkExpected && brand.attributes.class?.includes("sidebar-brand--on-backdrop")))
  ) {
    throw new Error(
      `Sidebar branding mode drifted: ${JSON.stringify({
        backdrop,
        brand,
        expectedEnvironmentIdentificationMode,
        sidebar,
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
    backdrop,
    environmentIdentificationMode: expectedEnvironmentIdentificationMode ?? null,
    insets: { left: leftInset, right: rightInset },
    statusProjection: {
      activeStatusContent,
      durationText,
      durationVisible,
      sessionStatus,
      statusDurationVisible,
      workingExpected,
      workingVisible,
      text: activeStatus?.text ?? null,
      workingDuration,
    },
    projectControls: { projectScopeHost, newProject },
  };
}

function assertFloatingRelation({ anchor, label, placement, popup, viewport }) {
  const metrics = measureFloatingRelation(anchor, popup, placement);
  const residual = floatingRelationResidual(metrics, placement);
  const contained =
    popup.x >= -1 &&
    popup.y >= -1 &&
    popup.x + popup.width <= viewport.width + 1 &&
    popup.y + popup.height <= viewport.height + 1;
  if (residual > 0.01 || !contained) {
    throw new Error(
      `${label} floating relation drifted: ${JSON.stringify({
        anchor,
        contained,
        metrics,
        placement,
        popup,
        residual,
        viewport,
      })}`,
    );
  }
  return { anchor, contained, metrics, placement, popup, residual };
}

async function verifyFloatingRelations({
  child,
  client,
  devToolCli,
  expectedTheme,
  height,
  outputDirectory,
  timeoutMs,
  width,
}) {
  const viewport = { width, height };
  const detailsPlacement = { side: "right", align: "start", sideOffset: 4 };
  const actionTooltipPlacement = { side: "right", align: "center", sideOffset: 4 };
  const modelPlacement = { side: "top", align: "start", sideOffset: 4 };
  const readFirstCard = async () => {
    const cards = await readSelectorMeasurements(client, ".sidebar-v2-row-card");
    if (!cards[0]?.rect) throw new Error("Sidebar floating relation has no row-card anchor.");
    return cards[0];
  };
  const invokeTooltipProbe = async (relationId, action) => {
    const response = await client.runCdp("Runtime.evaluate", {
      expression: `globalThis.__T3_LYNXTRON_TOOLTIP_PROBE__?.[${JSON.stringify(
        relationId,
      )}]?.[${JSON.stringify(action)}]?.().then?.(() => true) ?? false`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (commandResult(response)?.value !== true) {
      throw new Error(
        `Tooltip ${action} probe is unavailable for ${relationId}: ${JSON.stringify(response)}`,
      );
    }
  };
  const verifyActionTooltip = async ({ anchorSelector, expectedText, label, relationId }) => {
    const anchor = await waitForMeasurement({
      child,
      client,
      selector: anchorSelector,
      timeoutMs,
      predicate: (measurement) => measurement?.rect.width > 0,
    });
    await invokeTooltipProbe(relationId, "hover");
    await invokeTooltipProbe(relationId, "leave");
    await waitWhileAlive(child, 650);
    if (await readOptionalMeasurement(client, ".lynx-tooltip-popup")) {
      throw new Error(`${label} opened after hover left before the 600ms delay elapsed.`);
    }
    await invokeTooltipProbe(relationId, "hover");
    const popup = await waitForSelectorAttributeMeasurement({
      attribute: "data-floating-popup",
      child,
      client,
      selector: ".lynx-tooltip-popup",
      timeoutMs,
      value: relationId,
    });
    const content = await waitForStableMeasurement({
      child,
      client,
      selector: ".lynx-tooltip-content-motion",
      timeoutMs,
      predicate: (measurement) =>
        measurement.rect.height >= 24 &&
        (typeof expectedText === "string"
          ? measurement.text.trim() === expectedText
          : expectedText.test(measurement.text.trim())),
    });
    if (
      popup.attributes["data-floating-side"] !== "right" ||
      popup.attributes["data-floating-align"] !== "center" ||
      popup.attributes["data-floating-side-offset"] !== "4"
    ) {
      throw new Error(`${label} placement attributes drifted: ${JSON.stringify(popup)}`);
    }
    const relation = assertFloatingRelation({
      anchor: anchor.rect,
      label,
      placement: actionTooltipPlacement,
      popup: content.rect,
      viewport,
    });
    await invokeTooltipProbe(relationId, "leave");
    await waitForMeasurement({
      child,
      client,
      selector: ".lynx-tooltip-popup",
      timeoutMs,
      predicate: (measurement) => measurement === null,
    });
    return { ...relation, text: content.text.trim() };
  };
  const waitForCardTooltip = async (card) => {
    const relationId = card.attributes["data-floating-anchor"];
    if (typeof relationId !== "string") {
      throw new Error(`Sidebar row has no floating relation id: ${JSON.stringify(card)}`);
    }
    try {
      return await waitForMeasurement({
        child,
        client,
        selector: ".sidebar-v2-details-popover",
        timeoutMs,
        predicate: (measurement) =>
          measurement?.attributes["data-floating-side"] === "right" &&
          measurement.attributes["data-floating-align"] === "start" &&
          measurement.attributes["data-floating-side-offset"] === "4",
      });
    } catch (error) {
      const latestCard = await readFirstCard();
      throw new Error(
        `Sidebar hover did not open details: ${JSON.stringify({
          cause: error instanceof Error ? error.message : String(error),
          card: latestCard,
        })}`,
      );
    }
  };
  const initialCard = await readFirstCard();
  const initialRelationId = initialCard.attributes["data-floating-anchor"];
  if (typeof initialRelationId !== "string") {
    throw new Error(`Sidebar row has no floating relation id: ${JSON.stringify(initialCard)}`);
  }
  await invokeTooltipProbe(initialRelationId, "hover");
  await invokeTooltipProbe(initialRelationId, "leave");
  await waitWhileAlive(child, 200);
  if (await readOptionalMeasurement(client, ".sidebar-v2-details-popover")) {
    throw new Error("Sidebar details opened after a hover left before the delay elapsed.");
  }
  const openedAt = Date.now();
  await invokeTooltipProbe(initialRelationId, "hover");
  await waitWhileAlive(child, 75);
  if (await readOptionalMeasurement(client, ".sidebar-v2-details-popover")) {
    throw new Error("Sidebar details opened before the 150ms authority delay elapsed.");
  }
  const initialPopup = await waitForCardTooltip(initialCard);
  const openedAfterMs = Date.now() - openedAt;
  const [detailTitle, detailRows, clientState, modelControl] = await Promise.all([
    waitForStableMeasurement({
      child,
      client,
      selector: ".sidebar-v2-details-title",
      timeoutMs,
      predicate: (measurement) => measurement.text.trim().length > 0,
    }),
    readSelectorMeasurements(client, ".sidebar-v2-details-row"),
    readClientState(client),
    waitForStableMeasurement({
      child,
      client,
      selector: ".composer-toolbar-control--model",
      timeoutMs,
      predicate: (measurement) => measurement.text.trim().length > 0,
    }),
  ]);
  const expectedDetailRows = [
    clientState?.activeProject?.title,
    clientState?.environmentLabel,
    ...(clientState?.activeThread?.branch ? [clientState.activeThread.branch] : []),
    modelControl.text.trim(),
  ];
  const actualDetailRows = detailRows.map((row) => row.text.trim());
  if (
    detailTitle.text.trim() !== clientState?.activeThread?.title ||
    expectedDetailRows.some((row) => typeof row !== "string" || row.length === 0) ||
    JSON.stringify(actualDetailRows) !== JSON.stringify(expectedDetailRows) ||
    openedAfterMs < 100 ||
    openedAfterMs > 500 ||
    Math.abs(initialPopup.rect.width - 262) > 1 ||
    Math.abs(initialPopup.rect.height - 106) > 1
  ) {
    throw new Error(
      `Sidebar details content or timing drifted: ${JSON.stringify({
        actualDetailRows,
        detailTitle,
        expectedDetailRows,
        initialPopup,
        openedAfterMs,
      })}`,
    );
  }
  const initialDetails = assertFloatingRelation({
    anchor: initialCard.rect,
    label: "Sidebar details",
    placement: detailsPlacement,
    popup: initialPopup.rect,
    viewport,
  });
  const screenshot = captureNativeScreenshot({
    client,
    devToolCli,
    outputDirectory,
    name: `native-sidebar-thread-hover-${expectedTheme ?? "system"}.png`,
  });
  const dismissedAt = Date.now();
  await invokeTooltipProbe(initialRelationId, "leave");
  await waitForMeasurement({
    child,
    client,
    selector: ".sidebar-v2-details-popover",
    timeoutMs,
    predicate: (measurement) => measurement === null,
  });
  const dismissedAfterMs = Date.now() - dismissedAt;

  const newThread = await verifyActionTooltip({
    anchorSelector: ".sidebar-v2-new-thread",
    expectedText: /^New thread(?: \(.+\))?$/u,
    label: "Sidebar New thread tooltip",
    relationId: "sidebar-new-thread-tooltip",
  });
  const newProject = await verifyActionTooltip({
    anchorSelector: ".sidebar-v2-new-project",
    expectedText: "New project",
    label: "Sidebar New project tooltip",
    relationId: "sidebar-new-project-tooltip",
  });

  const resizeResponse = await client.runCdp("Runtime.evaluate", {
    expression: "globalThis.__T3_LYNXTRON_MTS_RESIZE_PROBE__?.sidebar(256,320).then(()=>true)",
    awaitPromise: true,
    returnByValue: true,
  });
  if (commandResult(resizeResponse)?.value !== true) {
    throw new Error(`Sidebar resize probe is unavailable: ${JSON.stringify(resizeResponse)}`);
  }
  const resizedCard = await waitForMeasurement({
    child,
    client,
    selector: ".sidebar-v2-row-card",
    timeoutMs,
    predicate: (measurement) => (measurement?.rect.width ?? 0) > initialCard.rect.width + 40,
  });
  await invokeTooltipProbe(resizedCard.attributes["data-floating-anchor"], "hover");
  const resizedPopup = await waitForCardTooltip(resizedCard);
  const resizedDetails = assertFloatingRelation({
    anchor: resizedCard.rect,
    label: "Resized Sidebar details",
    placement: detailsPlacement,
    popup: resizedPopup.rect,
    viewport,
  });
  if (
    Math.abs(
      resizedPopup.rect.x -
        initialPopup.rect.x -
        (resizedCard.rect.x +
          resizedCard.rect.width -
          (initialCard.rect.x + initialCard.rect.width)),
    ) > 1
  ) {
    throw new Error(
      `Sidebar details did not follow its resized anchor: ${JSON.stringify({
        initialCard: initialCard.rect,
        initialPopup: initialPopup.rect,
        resizedCard: resizedCard.rect,
        resizedPopup: resizedPopup.rect,
      })}`,
    );
  }
  await invokeTooltipProbe(resizedCard.attributes["data-floating-anchor"], "leave");
  await waitForMeasurement({
    child,
    client,
    selector: ".sidebar-v2-details-popover",
    timeoutMs,
    predicate: (measurement) => measurement === null,
  });

  const modelAnchor = await waitForMeasurement({
    child,
    client,
    selector: ".model-picker-anchor",
    timeoutMs,
    predicate: (measurement) => measurement?.rect.width > 0,
  });
  await tapSelector({
    child,
    client,
    selector: ".composer-toolbar-control--model",
    timeoutMs,
  });
  const modelPopup = await waitForMeasurement({
    child,
    client,
    selector: ".model-picker-panel",
    timeoutMs,
    predicate: (measurement) => measurement !== null,
  });
  const model = assertFloatingRelation({
    anchor: modelAnchor.rect,
    label: "Model picker",
    placement: modelPlacement,
    popup: modelPopup.rect,
    viewport,
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
      "relation-scoped background probe calling the real MTS hover handler, Sidebar resize, and model-trigger tap",
    details: {
      initial: {
        ...initialDetails,
        title: detailTitle.text.trim(),
        rows: actualDetailRows,
        openedAfterMs,
        dismissedAfterMs,
        quickLeaveCancelled: true,
      },
      resized: resizedDetails,
      followedAnchor: true,
      openDelayMs: 150,
      closeDelayMs: 0,
      screenshot,
    },
    actionTooltips: {
      newThread,
      newProject,
      openDelayMs: 600,
      closeDelayMs: 0,
      physicalPointer: "pending-user-session",
    },
    model,
  };
}

async function verifyComposerGeometry(client, expectedTheme) {
  const composer = await readComposerOutcome(client);
  assertComposerGeometry(composer);
  const frameShadow = await readFirstSelectorStyleValue(client, ".composer-frame", "box-shadow");
  const frameShadowMatches =
    typeof frameShadow === "string" &&
    frameShadow.includes("12px") &&
    frameShadow.includes("28px") &&
    frameShadow.includes("-18px") &&
    (frameShadow.includes("0.4)") ||
      frameShadow.includes("0.4 ") ||
      frameShadow.includes("#00000066"));
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
  const contextLightBandColors = await readSelectorStyleValues(
    client,
    ".composer-context-light-band",
    "background-color",
  );
  const contextLabels = [composer.typography.contextCheckout, composer.typography.contextBranch];
  const themeRoot = composer.colors.themeRoot;
  const contextBackdrop = composer.colors.contextBackdrop;
  const contextLegacyBand = composer.colors.contextLegacyBand;
  const contextSeam = await readOptionalMeasurement(
    client,
    ".composer-context-backdrop-band--seam",
  );
  const [contextSeamDisplay, contextSeamColor] = await Promise.all([
    readFirstSelectorStyleValue(client, ".composer-context-backdrop-band--seam", "display"),
    readFirstSelectorStyleValue(
      client,
      ".composer-context-backdrop-band--seam",
      "background-color",
    ),
  ]);
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
    contextLightBands.length === 31 &&
    contextLightBands.every(
      (rect, index) =>
        Math.abs(rect.x - (contextBackdrop.rect.x + 1)) <= 0.75 &&
        Math.abs(rect.y - (contextBackdrop.rect.y + index)) <= 0.75 &&
        Math.abs(rect.width - (contextBackdrop.rect.width - 2)) <= 0.75 &&
        Math.abs(rect.height - 1) <= 0.5,
    );
  const expectedThemeMatches =
    !expectedTheme ||
    (themeRoot.attributes["data-theme"] === expectedTheme &&
      (expectedTheme !== "light" ||
        (contextBackdrop.style.backgroundColor === "rgb(254,254,254)" &&
          contextBackdrop.style.borderBottomColor === "rgb(234,234,234)" &&
          contextLegacyBand.style.display === "none" &&
          contextSeam?.rect?.height === 1 &&
          contextSeamDisplay !== "none" &&
          contextSeamColor === "rgb(255,255,255)" &&
          contextLightBandsAligned &&
          contextLightBandColors.length === 31 &&
          contextLightBandColors[0] === "rgb(222,222,222)" &&
          contextLightBandColors[15] === "rgb(250,250,250)" &&
          contextLightBandColors[30] === "rgb(255,255,255)")));
  if (
    !frameShadowMatches ||
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
        frameShadow,
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
        contextSeam,
        contextSeamColor,
        contextSeamDisplay,
        contextLightBands,
        contextLightBandColors,
        contextIcons,
        controlColors,
      })}`,
    );
  }
  return {
    status: "pass",
    input: "read-only Lynx DevTool DOM box models",
    composer,
    frameShadow,
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
    contextSeam,
    contextSeamColor,
    contextSeamDisplay,
    contextLightBands,
    contextLightBandColors,
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

function measurementVisible(measurement) {
  return (measurement?.rect.width ?? 0) > 0 && (measurement?.rect.height ?? 0) > 0;
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

async function waitForSelectorMeasurements({ child, client, predicate, selector, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  let latest = [];
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Lynxtron exited before ${selector} reached its expected collection state.`);
    }
    latest = await readSelectorMeasurements(client, selector);
    if (predicate(latest)) return latest;
    await waitForChildExit(child, 100);
  }
  throw new Error(`Timed out waiting for ${selector} collection: ${JSON.stringify({ latest })}`);
}

function rectsConverged(previous, current, epsilon = 0.05) {
  return (
    previous !== null &&
    current !== null &&
    ["x", "y", "width", "height"].every((key) => Math.abs(previous[key] - current[key]) <= epsilon)
  );
}

async function waitForStableMeasurement({
  child,
  client,
  predicate,
  selector,
  stableSamples = 3,
  timeoutMs,
}) {
  const deadline = Date.now() + timeoutMs;
  let latest;
  let previousRect = null;
  let consecutiveStableSamples = 0;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Lynxtron exited before ${selector} geometry stabilized.`);
    }
    latest = await readOptionalMeasurement(client, selector);
    if (predicate(latest) && rectsConverged(previousRect, latest.rect)) {
      consecutiveStableSamples += 1;
      if (consecutiveStableSamples >= stableSamples) return latest;
    } else {
      consecutiveStableSamples = 0;
    }
    previousRect = latest?.rect ?? null;
    await waitForChildExit(child, 50);
  }
  throw new Error(
    `Timed out waiting for stable ${selector} geometry: ${JSON.stringify({
      consecutiveStableSamples,
      latest,
      previousRect,
    })}`,
  );
}

async function waitForSelectorCount({ child, client, count, selector, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  let latest = [];
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Lynxtron exited before ${selector} reached count ${count}.`);
    }
    latest = await readSelectorMeasurements(client, selector);
    if (latest.length === count) return latest;
    await waitForChildExit(child, 100);
  }
  throw new Error(
    `Timed out waiting for ${selector} count ${count}: ${JSON.stringify({ latest })}`,
  );
}

function composerStateForSessionStatus(sessionStatus) {
  if (sessionStatus === "running") return "working";
  if (sessionStatus === "starting") return "disabled";
  return "idle";
}

async function waitForSessionComposerProjection({
  child,
  client,
  expectedComposerState: expectedComposerStateOverride,
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
    const expectedComposerState =
      expectedComposerStateOverride ?? composerStateForSessionStatus(state?.sessionStatus);
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
              { id: "contextLegacyBand", lynx: ".composer-context-backdrop-band--1" },
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

async function verifyComposerSendMaterial({
  baseDir,
  child,
  client,
  devToolCli,
  outputDirectory,
  timeoutMs,
}) {
  const idleState = await selectSessionlessFixtureThread({
    baseDir,
    child,
    client,
    timeoutMs,
  });
  const fixtureResponse = await client.runCdp("Runtime.evaluate", {
    expression: "globalThis.__T3_LYNXTRON_COMPOSER_INPUT_FIXTURE__?.('hello fidelity') ?? false",
    returnByValue: true,
  });
  if (commandResult(fixtureResponse)?.value !== true) {
    throw new Error(`Composer input fixture was not applied: ${JSON.stringify(fixtureResponse)}`);
  }
  const sendBackgroundMatches = (color) => {
    const match = /^rgba\((\d+),(\d+),(\d+),([0-9.]+)\)$/u.exec(color);
    return (
      match !== null &&
      match
        .slice(1, 4)
        .map(Number)
        .every((channel, index) => channel === [54, 111, 251][index]) &&
      Math.abs(Number(match[4]) - 0.9) <= 1 / 255
    );
  };
  const action = await waitForMeasurement({
    child,
    client,
    selector: ".composer-primary-action",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.attributes["data-composer-primary-state"] === "send" &&
      measurement.attributes.class?.includes("composer-primary-action--send") === true &&
      sendBackgroundMatches(measurement.style.backgroundColor) &&
      Math.abs((measurement.rect?.width ?? 0) - 32) <= 0.5 &&
      Math.abs((measurement.rect?.height ?? 0) - 32) <= 0.5,
  });
  const icon = await waitForMeasurement({
    child,
    client,
    selector: ".composer-primary-action image",
    timeoutMs,
    predicate: (measurement) =>
      Math.abs((measurement?.rect.width ?? 0) - 14) <= 0.5 &&
      Math.abs((measurement?.rect.height ?? 0) - 14) <= 0.5,
  });
  const screenshot = captureNativeScreenshot({
    client,
    devToolCli,
    outputDirectory,
    name: "native-composer-send-material.png",
  });
  return {
    status: "pass",
    input: "test-only Composer state fixture; no turn submitted",
    action: action.rect,
    backgroundColor: action.style.backgroundColor,
    icon: icon.rect,
    state: action.attributes["data-composer-primary-state"],
    threadId: idleState.activeThreadId,
    screenshot,
  };
}

async function verifyHeroComposerState({
  child,
  client,
  devToolCli,
  expectNoComposerContext,
  expectedModelLabel,
  expectedTheme,
  outputDirectory,
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
  const headline = await waitForStableMeasurement({
    child,
    client,
    selector: ".hero__headline",
    timeoutMs,
    predicate: (measurement) =>
      Math.abs((measurement?.rect.width ?? 0) - 768) <= 1 &&
      Math.abs((measurement?.rect.height ?? 0) - 36) <= 1 &&
      Math.abs((measurement?.rect.x ?? 0) - (hero.rect.x + 128)) <= 1 &&
      Math.abs((measurement?.rect.y ?? 0) - (hero.rect.y + 219)) <= 1,
  });
  const composer = await readComposerOutcome(client, {
    allowMissingContext: expectNoComposerContext,
  });
  assertComposerGeometry(composer, {
    allowMissingContext: expectNoComposerContext,
  });
  const [headlineFontSize, headlineLineHeight, headlineLetterSpacing] = await Promise.all([
    readFirstSelectorStyleValue(client, ".hero__headline", "font-size"),
    readFirstSelectorStyleValue(client, ".hero__headline", "line-height"),
    readFirstSelectorStyleValue(client, ".hero__headline", "letter-spacing"),
  ]);
  if (
    headlineFontSize !== "30px" ||
    headlineLineHeight !== "36px" ||
    headlineLetterSpacing !== "-0.75px" ||
    Math.abs(headline.rect.x + headline.rect.width / 2 - (composer.anchors.shell.rect.x + 384)) >
      1 ||
    Math.abs(headline.rect.y + headline.rect.height + 32 - composer.anchors.shell.rect.y) > 1
  ) {
    throw new Error(
      `Hero headline geometry drifted: ${JSON.stringify({
        headline,
        headlineFontSize,
        headlineLetterSpacing,
        headlineLineHeight,
      })}`,
    );
  }
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
    : await waitForSelectorCount({
        child,
        client,
        count: 2,
        selector: ".composer-context-control",
        timeoutMs,
      }).then((controls) => {
        if (
          controls.some(
            (control) =>
              Math.abs((control.rect?.width ?? 0) - 354) > 1 ||
              Math.abs((control.rect?.height ?? 0) - 24) > 1,
          )
        ) {
          throw new Error(`Hero context allocation drifted: ${JSON.stringify(controls)}`);
        }
        return controls.map((control) => control.text.trim());
      });
  const model = composer.anchors.model.text.trim();
  if (model !== expectedModelLabel) {
    throw new Error(
      `Hero Composer model drifted: ${JSON.stringify({ expectedModelLabel, model })}`,
    );
  }
  const screenshot = captureNativeScreenshot({
    client,
    devToolCli,
    outputDirectory,
    name: `native-hero-${expectedTheme ?? "system"}.png`,
  });
  return {
    status: "pass",
    route: "new-thread",
    hero: hero.rect,
    headline: {
      rect: headline.rect,
      fontSize: headlineFontSize,
      lineHeight: headlineLineHeight,
      letterSpacing: headlineLetterSpacing,
    },
    model,
    screenshot,
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

async function setQuickSwitchQuery({ child, client, query, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("Lynxtron exited before the Quick Switch query probe became ready.");
    }
    const response = await client.runCdp("Runtime.evaluate", {
      expression: `(() => {
        if (
          typeof globalThis.__T3_LYNXTRON_QUICK_SWITCH_QUERY__ !== "function" ||
          typeof globalThis.__T3_LYNXTRON_QUICK_SWITCH_STATE__ !== "function"
        ) {
          return JSON.stringify({ ready: false });
        }
        globalThis.__T3_LYNXTRON_QUICK_SWITCH_QUERY__(${JSON.stringify(query)});
        return JSON.stringify({
          ready: true,
          state: JSON.parse(globalThis.__T3_LYNXTRON_QUICK_SWITCH_STATE__()),
        });
      })()`,
      returnByValue: true,
    });
    const result = commandResult(response);
    latest = typeof result?.value === "string" ? JSON.parse(result.value) : null;
    if (latest?.ready === true) break;
    await waitForChildExit(child, 100);
  }
  if (latest?.ready !== true) {
    throw new Error(`Quick Switch query probe was unavailable: ${JSON.stringify({ latest })}`);
  }
  while (Date.now() < deadline) {
    const response = await client.runCdp("Runtime.evaluate", {
      expression:
        'typeof globalThis.__T3_LYNXTRON_QUICK_SWITCH_STATE__ === "function" ? globalThis.__T3_LYNXTRON_QUICK_SWITCH_STATE__() : null',
      returnByValue: true,
    });
    const result = commandResult(response);
    latest = typeof result?.value === "string" ? JSON.parse(result.value) : null;
    if (latest?.query === query) return latest;
    await waitForChildExit(child, 50);
  }
  throw new Error(
    `Quick Switch query did not reach its expected state: ${JSON.stringify({ latest, query })}`,
  );
}

async function readQuickSwitchState({ child, client, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("Lynxtron exited before the Quick Switch state probe became ready.");
    }
    const response = await client.runCdp("Runtime.evaluate", {
      expression:
        'typeof globalThis.__T3_LYNXTRON_QUICK_SWITCH_STATE__ === "function" ? globalThis.__T3_LYNXTRON_QUICK_SWITCH_STATE__() : null',
      returnByValue: true,
    });
    const result = commandResult(response);
    latest = typeof result?.value === "string" ? JSON.parse(result.value) : null;
    if (latest?.view === "root") return latest;
    await waitForChildExit(child, 50);
  }
  throw new Error(`Quick Switch state probe was unavailable: ${JSON.stringify({ latest })}`);
}

function quickSwitchExpectation(query) {
  const actionLabels = [
    "New thread in t3-hero-claude-workspace",
    "New thread in...",
    "Go to file",
    "Search project contents",
    "Add project",
    "Open settings",
  ];
  if (query === "settings") {
    return {
      actionLabels: ["Open settings"],
      actionsOnly: false,
      emptyMessage: null,
      threadLabels: [],
    };
  }
  if (query === ">") {
    return {
      actionLabels,
      actionsOnly: true,
      emptyMessage: null,
      threadLabels: [],
    };
  }
  if (query === "zzzz-no-result") {
    return {
      actionLabels: [],
      actionsOnly: false,
      emptyMessage: "No matching commands, projects, or threads.",
      threadLabels: [],
    };
  }
  return {
    actionLabels,
    actionsOnly: false,
    emptyMessage: null,
    threadLabels: ["Quick Switch idle thread"],
  };
}

async function verifyQuickSwitchState({
  child,
  client,
  devToolCli,
  expectedTheme,
  outputDirectory,
  query,
  timeoutMs,
}) {
  await waitForStableMeasurement({
    child,
    client,
    selector: ".palette-panel",
    timeoutMs,
    predicate: (measurement) => measurement?.attributes["data-search-overlay-mode"] === "command",
  });
  const state = query
    ? await setQuickSwitchQuery({ child, client, query, timeoutMs })
    : await readQuickSwitchState({ child, client, timeoutMs });
  const expected = quickSwitchExpectation(query);
  const expectedActionLabels = query ? expected.actionLabels : state.actionLabels;
  const expectedThreadLabels = query ? expected.threadLabels : state.threadLabels;
  const panel = await waitForStableMeasurement({
    child,
    client,
    selector: ".palette-panel",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.attributes["data-search-overlay-mode"] === "command" &&
      expectedActionLabels.every((label) => measurement.text.includes(label)) &&
      (expected.emptyMessage === null || measurement.text.includes(expected.emptyMessage)),
  });
  const search = await readOptionalMeasurement(client, ".palette-search");
  const results = await readOptionalMeasurement(client, ".palette-results");
  const footer = await readOptionalMeasurement(client, ".palette-footer");
  const rowMeasurements = await readSelectorMeasurements(client, ".palette-row");
  const rows = rowMeasurements.map((measurement) => measurement.rect);
  const empty = await readOptionalMeasurement(client, ".palette-empty");
  const expectedLabels = [...expectedActionLabels, ...expectedThreadLabels];
  const labels = expectedLabels.filter((label) => panel.text.includes(label));
  const requiredDefaultActions = [
    "New thread in...",
    "Go to file",
    "Search project contents",
    "Add project",
    "Open settings",
  ];
  if (
    !search ||
    !results ||
    !footer ||
    rows.length !== expectedLabels.length ||
    JSON.stringify(labels) !== JSON.stringify(expectedLabels) ||
    JSON.stringify(state.actionLabels) !== JSON.stringify(expectedActionLabels) ||
    JSON.stringify(state.threadLabels) !== JSON.stringify(expectedThreadLabels) ||
    (query === "" &&
      (!state.actionLabels.some((label) => label.startsWith("New thread in ")) ||
        !requiredDefaultActions.every((label) => state.actionLabels.includes(label)))) ||
    state.actionsOnly !== expected.actionsOnly ||
    state.empty !== (expected.emptyMessage !== null) ||
    state.normalizedQuery !== (query === ">" ? "" : query) ||
    state.query !== query ||
    state.view !== "root" ||
    (expected.emptyMessage === null ? empty !== null : empty?.text !== expected.emptyMessage) ||
    !footer.text.includes("Enter") ||
    !footer.text.includes("Select") ||
    footer.text.includes("⌘P") ||
    footer.text.includes("Files")
  ) {
    throw new Error(
      `Quick Switch anatomy drifted: ${JSON.stringify({
        panel: panel.rect,
        search: search?.rect,
        results: results?.rect,
        footer: footer?.rect,
        footerText: footer?.text,
        rows,
        labels,
        state,
        empty,
      })}`,
    );
  }
  const stateSlug =
    query === ""
      ? "default"
      : query === ">"
        ? "actions-only"
        : query === "zzzz-no-result"
          ? "empty"
          : "query";
  const screenshot = captureNativeScreenshot({
    client,
    devToolCli,
    outputDirectory,
    name: `native-quick-switch-${stateSlug}-${expectedTheme ?? "system"}.png`,
  });
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
    state: stateSlug,
    query,
    stateProbe: query
      ? "testResize-gated query setter for visual state only"
      : "initialOverlay product state",
    physicalKeyboard: "pending-user-session",
    input: "initialOverlay product state plus measured DevTool outside tap",
    panel: panel.rect,
    search: search.rect,
    results: results.rect,
    footer: footer.rect,
    footerText: footer.text,
    rows,
    labels,
    empty: empty?.rect ?? null,
    emptyText: empty?.text ?? null,
    screenshot,
    dismissed: true,
  };
}

async function openFilePicker({ child, client, timeoutMs }) {
  const response = await client.runCdp("Runtime.evaluate", {
    expression:
      'typeof globalThis.__T3_LYNXTRON_RESPONSIVE_UI_PROBE__ === "function" && (globalThis.__T3_LYNXTRON_RESPONSIVE_UI_PROBE__("open-file-search"), true)',
    returnByValue: true,
  });
  if (response?.exceptionDetails || commandResult(response)?.value !== true) {
    throw new Error(`File Picker test entry was unavailable: ${JSON.stringify(response)}`);
  }
  return waitForStableMeasurement({
    child,
    client,
    selector: ".palette-panel--files",
    timeoutMs,
    predicate: (measurement) => measurement?.attributes["data-search-overlay-mode"] === "files",
  });
}

async function waitForQuickSwitchFileState({ child, client, predicate, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("Lynxtron exited before the File Picker state became ready.");
    }
    const response = await client.runCdp("Runtime.evaluate", {
      expression:
        'typeof globalThis.__T3_LYNXTRON_QUICK_SWITCH_STATE__ === "function" ? globalThis.__T3_LYNXTRON_QUICK_SWITCH_STATE__() : null',
      returnByValue: true,
    });
    const result = commandResult(response);
    latest = typeof result?.value === "string" ? JSON.parse(result.value) : null;
    if (predicate(latest)) return latest;
    await waitForChildExit(child, 100);
  }
  throw new Error(`Timed out waiting for File Picker state: ${JSON.stringify({ latest })}`);
}

async function verifyFilePickerDefault({
  child,
  client,
  devToolCli,
  expectedTheme,
  outputDirectory,
  timeoutMs,
}) {
  const panel = await openFilePicker({ child, client, timeoutMs });
  const initialState = await waitForQuickSwitchFileState({
    child,
    client,
    timeoutMs,
    predicate: (state) =>
      state?.mode === "files" &&
      state.filePending === false &&
      state.fileError === null &&
      Array.isArray(state.filePaths) &&
      state.filePaths.length > 0,
  });
  const search = await readOptionalMeasurement(client, ".palette-search");
  const results = await readOptionalMeasurement(client, ".palette-results");
  const resultsViewport = await readOptionalMeasurement(client, ".qs-results--files");
  const footer = await readOptionalMeasurement(client, ".palette-footer");
  const rows = await waitForSelectorCount({
    child,
    client,
    count: initialState.filePaths.length,
    selector: ".quick-switch-file-row",
    timeoutMs,
  });
  const firstRow = rows[0];
  if (
    !search ||
    !results ||
    !resultsViewport ||
    !footer ||
    !firstRow ||
    Math.abs(panel.rect.width - 574) > 1 ||
    Math.abs(panel.rect.height - 420) > 1 ||
    Math.abs(search.rect.height - 48) > 1 ||
    Math.abs(resultsViewport.rect.height - 330) > 1 ||
    Math.abs(footer.rect.height - 40) > 1 ||
    Math.abs((firstRow.rect?.height ?? 0) - 48) > 1 ||
    !footer.text.includes("Navigate") ||
    !footer.text.includes("Select") ||
    !footer.text.includes("Close") ||
    footer.text.includes("Files")
  ) {
    throw new Error(
      `File Picker default anatomy drifted: ${JSON.stringify({
        panel,
        search,
        results,
        resultsViewport,
        footer,
        rowCount: rows.length,
        firstRow,
      })}`,
    );
  }
  const screenshot = captureNativeScreenshot({
    client,
    devToolCli,
    outputDirectory,
    name: `native-file-picker-default-${expectedTheme ?? "system"}.png`,
  });

  const filterTarget = path.basename(initialState.filePaths[0] ?? "");
  if (!filterTarget) {
    throw new Error(`File Picker first row has no filter target: ${JSON.stringify(firstRow)}`);
  }
  const filteredState = await setQuickSwitchQuery({
    child,
    client,
    query: filterTarget,
    timeoutMs,
  });
  const settledFilteredState = await waitForQuickSwitchFileState({
    child,
    client,
    timeoutMs,
    predicate: (state) =>
      state?.mode === "files" &&
      state.query === filterTarget &&
      state.filePending === false &&
      state.fileError === null &&
      Array.isArray(state.filePaths),
  });
  const filteredRows = await waitForSelectorCount({
    child,
    client,
    count: settledFilteredState.filePaths.length,
    selector: ".quick-switch-file-row",
    timeoutMs,
  });
  if (
    filteredRows.length === 0 ||
    filteredRows.length > rows.length ||
    filteredRows.some((row) => !row.text.toLowerCase().includes(filterTarget.toLowerCase()))
  ) {
    throw new Error(
      `File Picker filter state drifted: ${JSON.stringify({
        filterTarget,
        filteredRows,
        filteredState: settledFilteredState,
      })}`,
    );
  }
  await setQuickSwitchQuery({ child, client, query: "", timeoutMs });
  await waitForQuickSwitchFileState({
    child,
    client,
    timeoutMs,
    predicate: (state) =>
      state?.mode === "files" &&
      state.query === "" &&
      state.filePending === false &&
      state.fileError === null &&
      state.filePaths.length === rows.length,
  });
  await waitForSelectorCount({
    child,
    client,
    count: rows.length,
    selector: ".quick-switch-file-row",
    timeoutMs,
  });
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
    input: "testResize-gated open/filter state plus measured DevTool outside tap",
    physicalKeyboard: "pending-user-session",
    fileActivation: "pending-user-session-external-shell-side-effect",
    panel: panel.rect,
    search: search.rect,
    results: results.rect,
    resultsViewport: resultsViewport.rect,
    footer: footer.rect,
    footerText: footer.text,
    rowCount: rows.length,
    firstRow: { rect: firstRow.rect, text: firstRow.text },
    filter: {
      query: filterTarget,
      rowCount: filteredRows.length,
      rows: filteredRows.map((row) => ({ rect: row.rect, text: row.text })),
      state: settledFilteredState,
      setterState: filteredState,
    },
    screenshot,
    dismissed: true,
  };
}

async function verifyAddProjectSources({
  child,
  client,
  devToolCli,
  expectedTheme,
  outputDirectory,
  timeoutMs,
}) {
  const expectedTitles = [
    "Local folder",
    "Git URL",
    "GitHub repository",
    "Azure DevOps repository",
    "Bitbucket repository",
    "GitLab repository",
  ];
  const panel = await waitForStableMeasurement({
    child,
    client,
    selector: ".palette-panel",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.attributes["data-quick-switch-view"] === "add-project-sources" &&
      expectedTitles.every((title) => measurement.text.includes(title)) &&
      !measurement.text.includes("Checking source control providers"),
  });
  const search = await readOptionalMeasurement(client, ".palette-search");
  const results = await readOptionalMeasurement(client, ".palette-results");
  const footer = await readOptionalMeasurement(client, ".palette-footer");
  const rows = await readSelectorMeasurements(client, ".quick-switch-source-row");
  const setupBadges = await readSelectorMeasurements(client, ".quick-switch-setup-badge");
  const titles = expectedTitles.filter((title) => panel.text.includes(title));
  const disabledRows = rows.filter((row) => row.attributes.class?.includes("opacity-64"));
  const activeRows = rows.filter((row) => row.attributes["data-palette-active"] === "true");
  const disabledOpacity = await readFirstSelectorStyleValue(
    client,
    ".quick-switch-source-row.opacity-64",
    "opacity",
  );
  if (
    !search ||
    !results ||
    !footer ||
    rows.length !== expectedTitles.length ||
    JSON.stringify(titles) !== JSON.stringify(expectedTitles) ||
    rows[0]?.text.includes("Local folder") !== true ||
    activeRows.length !== 1 ||
    activeRows[0]?.text.includes("Local folder") !== true ||
    disabledRows.length === 0 ||
    setupBadges.length !== disabledRows.length ||
    disabledOpacity !== "0.64" ||
    !footer.text.includes("Backspace") ||
    !footer.text.includes("Back")
  ) {
    throw new Error(
      `Add Project sources anatomy drifted: ${JSON.stringify({
        panel: panel.rect,
        search: search?.rect,
        results: results?.rect,
        footer: footer?.rect,
        footerText: footer?.text,
        rows,
        setupBadges,
        titles,
        disabledOpacity,
      })}`,
    );
  }
  const screenshot = captureNativeScreenshot({
    client,
    devToolCli,
    outputDirectory,
    name: `native-add-project-sources-${expectedTheme ?? "system"}.png`,
  });

  await tapSelector({
    child,
    client,
    selector: ".quick-switch-source-row.opacity-64",
    timeoutMs,
  });
  const afterDisabledTap = await waitForStableMeasurement({
    child,
    client,
    selector: ".palette-panel",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.attributes["data-quick-switch-view"] === "add-project-sources",
  });

  await tapSelector({
    child,
    client,
    selector: ".quick-switch-source-row",
    timeoutMs,
  });
  const localFolder = await waitForMeasurement({
    child,
    client,
    selector: ".palette-panel",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.attributes["data-quick-switch-view"] === "add-project-local" &&
      measurement.text.includes("Local folder"),
  });

  await tapSelector({ child, client, selector: ".qs-search__back", timeoutMs });
  const returnedSources = await waitForMeasurement({
    child,
    client,
    selector: ".palette-panel",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.attributes["data-quick-switch-view"] === "add-project-sources",
  });
  await tapSelector({ child, client, selector: ".qs-search__back", timeoutMs });
  const returnedRoot = await waitForMeasurement({
    child,
    client,
    selector: ".palette-panel",
    timeoutMs,
    predicate: (measurement) => measurement?.attributes["data-quick-switch-view"] === "root",
  });
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
    input: "initialOverlay add-project plus measured DevTool taps",
    physicalKeyboard: "pending-user-session",
    panel: panel.rect,
    search: search.rect,
    results: results.rect,
    footer: footer.rect,
    footerText: footer.text,
    rows: rows.map((row) => ({
      active: row.attributes["data-palette-active"] === "true",
      disabled: row.attributes.class?.includes("opacity-64") === true,
      rect: row.rect,
      text: row.text,
    })),
    setupBadges: setupBadges.map((badge) => ({ rect: badge.rect, text: badge.text })),
    disabledOpacity,
    screenshot,
    flow: {
      disabledTapStayedInSources:
        afterDisabledTap.attributes["data-quick-switch-view"] === "add-project-sources",
      localFolderView: localFolder.attributes["data-quick-switch-view"],
      returnedSources: returnedSources.attributes["data-quick-switch-view"],
      returnedRoot: returnedRoot.attributes["data-quick-switch-view"],
      dismissed: true,
    },
  };
}

async function verifyActivePlanModeChip({ child, client, timeoutMs }) {
  const control = await waitForMeasurement({
    child,
    client,
    selector: ".composer-toolbar-control--interaction",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.text.trim() === "Plan" &&
      measurement.attributes.class?.includes("composer-toolbar-control--interaction-plan"),
  });
  const separator = await waitForMeasurement({
    child,
    client,
    selector: ".composer-interaction-mode-separator",
    timeoutMs,
    predicate: (measurement) =>
      Math.abs((measurement?.rect?.width ?? 0) - 1) <= 0.5 &&
      Math.abs((measurement?.rect?.height ?? 0) - 16) <= 0.5,
  });
  const icon = await waitForMeasurement({
    child,
    client,
    selector: ".composer-toolbar-control--interaction-plan .pill__icon-img",
    timeoutMs,
    predicate: (measurement) =>
      Math.abs((measurement?.rect?.width ?? 0) - 16) <= 0.5 &&
      Math.abs((measurement?.rect?.height ?? 0) - 16) <= 0.5,
  });
  const backgroundColor = await readFirstSelectorStyleValue(
    client,
    ".composer-toolbar-control--interaction-plan",
    "background-color",
  );
  const color = await readFirstSelectorStyleValue(
    client,
    ".composer-toolbar-control--interaction-plan",
    "color",
  );
  const iconOpacity = await readFirstSelectorStyleValue(
    client,
    ".composer-toolbar-control--interaction-plan .pill__icon-img",
    "opacity",
  );
  const backgroundMatch = /^rgba\(59,130,246,([0-9.]+)\)$/u.exec(backgroundColor ?? "");
  if (
    backgroundMatch === null ||
    Math.abs(Number(backgroundMatch[1]) - 0.1) > 1 / 255 ||
    color !== "rgb(96,165,250)" ||
    iconOpacity !== "1" ||
    Math.abs(control.rect.height - 28) > 0.5
  ) {
    throw new Error(
      `Native Plan mode material drifted: ${JSON.stringify({
        backgroundColor,
        color,
        iconOpacity,
        control: control.rect,
        icon: icon.rect,
        separator: separator.rect,
      })}`,
    );
  }
  return {
    control: control.rect,
    separator: separator.rect,
    icon: icon.rect,
    backgroundColor,
    color,
    iconOpacity,
  };
}

async function verifyPlanMode({ baseDir, child, client, devToolCli, outputDirectory, timeoutMs }) {
  const state = await selectSessionlessFixtureThread({
    baseDir,
    child,
    client,
    timeoutMs,
  });
  const threadId = state?.activeThreadId;
  if (typeof threadId !== "string" || state?.activeThread?.interactionMode !== "plan") {
    throw new Error(
      `Plan-mode fixture must be a persisted sessionless Plan thread: ${JSON.stringify({
        interactionMode: state?.activeThread?.interactionMode,
        sessionStatus: state?.sessionStatus,
        threadId,
      })}`,
    );
  }
  const persistedInteractionMode = readPersistedThreadInteractionMode(baseDir, threadId);
  if (persistedInteractionMode !== "plan") {
    throw new Error(
      `Plan mode did not persist: ${JSON.stringify({ persistedInteractionMode, threadId })}`,
    );
  }
  const activeChip = await verifyActivePlanModeChip({ child, client, timeoutMs });
  const screenshot = captureNativeScreenshot({
    client,
    devToolCli,
    outputDirectory,
    name: "native-composer-plan-mode.png",
  });
  return {
    status: "pass",
    input: "pre-seeded persisted Plan state; interaction mutation is a separate harness check",
    threadId,
    mode: state.activeThread.interactionMode,
    control: activeChip,
    persistedInteractionMode,
    screenshot,
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
  await tapSelectorByAttribute({
    attribute: "data-model-picker-key",
    child,
    client,
    selector: ".model-picker-row--unselected",
    timeoutMs,
    value: targetKey,
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
      measurement?.text.trim() === "Plan" &&
      measurement.attributes.class?.includes("composer-toolbar-control--interaction-plan"),
  });
  const activeChip = await verifyActivePlanModeChip({ child, client, timeoutMs });

  const beforeNewThreadState = await readClientState(client);
  const beforeNewThreadIds = beforeNewThreadState?.threadIds ?? [];
  const beforeNewThreadSequence = await readRendererReadiness(client);
  await tapSelector({
    child,
    client,
    selector: ".sidebar-v2-new-thread",
    timeoutMs,
  });
  const firstDraftState = await waitForClientState({
    child,
    client,
    timeoutMs,
    predicate: (state) =>
      typeof state?.draftThreadId === "string" &&
      state.activeThreadId === state.draftThreadId &&
      JSON.stringify(state.threadIds ?? []) === JSON.stringify(beforeNewThreadIds),
  });
  const afterNewThreadSequence = await readRendererReadiness(client);
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
  await tapSelector({
    child,
    client,
    selector: ".sidebar-v2-new-thread",
    timeoutMs,
  });
  const reusedDraftState = await waitForClientState({
    child,
    client,
    timeoutMs,
    predicate: (state) =>
      state?.draftThreadId === firstDraftState.draftThreadId &&
      state.activeThreadId === firstDraftState.draftThreadId &&
      JSON.stringify(state.threadIds ?? []) === JSON.stringify(beforeNewThreadIds),
  });

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
      draftLifecycle: {
        canonicalThreadIdsBefore: beforeNewThreadIds,
        canonicalThreadIdsAfter: reusedDraftState.threadIds ?? [],
        firstDraftThreadId: firstDraftState.draftThreadId,
        reusedDraftThreadId: reusedDraftState.draftThreadId,
        serverSequenceBefore: beforeNewThreadSequence.lastSeq,
        serverSequenceAfter: afterNewThreadSequence.lastSeq,
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
      activeChip,
      sequence: {
        before: beforeInteractionSequence.lastSeq,
        after: afterInteractionSequence.lastSeq,
      },
    },
  };
}

function readPersistedThreadIds(baseDir) {
  const database = new DatabaseSync(path.join(baseDir, "userdata", "state.sqlite"), {
    readOnly: true,
  });
  try {
    return database
      .prepare(
        `SELECT thread_id AS threadId
         FROM projection_threads
         WHERE deleted_at IS NULL
         ORDER BY created_at ASC, thread_id ASC`,
      )
      .all()
      .map((row) => row.threadId);
  } finally {
    database.close();
  }
}

function readPersistedProjects(baseDir) {
  const database = new DatabaseSync(path.join(baseDir, "userdata", "state.sqlite"), {
    readOnly: true,
  });
  try {
    return database
      .prepare(
        `SELECT project_id AS projectId, title, workspace_root AS workspaceRoot
         FROM projection_projects
         WHERE deleted_at IS NULL
         ORDER BY updated_at DESC, project_id ASC`,
      )
      .all();
  } finally {
    database.close();
  }
}

function readPersistedEmptyThreadIds(baseDir) {
  const database = new DatabaseSync(path.join(baseDir, "userdata", "state.sqlite"), {
    readOnly: true,
  });
  try {
    return database
      .prepare(
        `SELECT thread.thread_id AS threadId
         FROM projection_threads AS thread
         WHERE thread.deleted_at IS NULL
           AND thread.archived_at IS NULL
           AND thread.title = 'New thread'
           AND thread.pending_approval_count = 0
           AND thread.pending_user_input_count = 0
           AND thread.has_actionable_proposed_plan = 0
           AND NOT EXISTS (
             SELECT 1
             FROM projection_thread_messages AS message
             WHERE message.thread_id = thread.thread_id
           )
           AND NOT EXISTS (
             SELECT 1
             FROM projection_turns AS turn
             WHERE turn.thread_id = thread.thread_id
           )
           AND (
             NOT EXISTS (
               SELECT 1
               FROM projection_thread_sessions AS session
               WHERE session.thread_id = thread.thread_id
             )
             OR EXISTS (
               SELECT 1
               FROM projection_thread_sessions AS session
               WHERE session.thread_id = thread.thread_id
                 AND session.status = 'idle'
                 AND session.active_turn_id IS NULL
                 AND session.last_error IS NULL
             )
           )
         ORDER BY thread.created_at DESC, thread.thread_id ASC`,
      )
      .all()
      .map((row) => row.threadId);
  } finally {
    database.close();
  }
}

function readResolvedUserInputAnswers(baseDir, requestId) {
  const database = new DatabaseSync(path.join(baseDir, "userdata", "state.sqlite"), {
    readOnly: true,
  });
  try {
    const rows = database
      .prepare(
        `SELECT payload_json AS payload
         FROM projection_thread_activities
         WHERE kind = 'user-input.resolved'
         ORDER BY created_at DESC, activity_id DESC`,
      )
      .all();
    for (const row of rows) {
      const payload = JSON.parse(row.payload);
      if (
        payload?.requestId === requestId &&
        payload.answers &&
        typeof payload.answers === "object"
      ) {
        return payload.answers;
      }
    }
    return null;
  } finally {
    database.close();
  }
}

async function verifyNewThreadDraftLifecycle({
  baseDir,
  bundle,
  child,
  client,
  desktopDir,
  devToolCli,
  executable,
  height,
  initialPersistedThreadIds,
  projectId,
  projectCwd,
  recoverableEmptyThreadIds,
  timeoutMs,
  width,
}) {
  const legacyRecovery =
    recoverableEmptyThreadIds.length === 0
      ? {
          status: "skipped",
          reason: "Fixture has no recoverable legacy empty threads.",
        }
      : await (async () => {
          const afterRecoveryState = await waitForClientState({
            child,
            client,
            timeoutMs,
            predicate: (state) =>
              Array.isArray(state?.threadIds) &&
              recoverableEmptyThreadIds.every((threadId) => !state.threadIds.includes(threadId)),
          });
          const persistedThreadIdsAfterRecovery = readPersistedThreadIds(baseDir);
          if (
            recoverableEmptyThreadIds.some((threadId) =>
              persistedThreadIdsAfterRecovery.includes(threadId),
            )
          ) {
            throw new Error(
              `Empty Native threads survived automatic recovery: ${JSON.stringify({
                recoverableEmptyThreadIds,
                initialPersistedThreadIds,
                persistedThreadIdsAfterRecovery,
              })}`,
            );
          }
          return {
            status: "pass",
            threadIds: recoverableEmptyThreadIds,
            canonicalThreadIdsBefore: initialPersistedThreadIds,
            canonicalThreadIdsAfter: afterRecoveryState.threadIds ?? [],
            persistedThreadIdsBefore: initialPersistedThreadIds,
            persistedThreadIdsAfter: persistedThreadIdsAfterRecovery,
            automatic: true,
          };
        })();
  if (typeof projectId !== "string") {
    throw new Error("The Native draft lifecycle fixture has no project for manual cleanup.");
  }
  const freshEmptyThread = await invokeConnector(client, "createThread", { projectId });
  const freshEmptyThreadId = freshEmptyThread?.threadId;
  if (typeof freshEmptyThreadId !== "string") {
    throw new Error("Creating a fresh canonical empty thread did not return an id.");
  }
  const runtimeRecoveryDeadline = Date.now() + timeoutMs;
  let runtimeRecoveryState = await readClientState(client);
  let persistedThreadIdsAfterRuntimeRecovery = readPersistedThreadIds(baseDir);
  let runtimeThreadObserved =
    runtimeRecoveryState?.threadIds?.includes(freshEmptyThreadId) === true;
  while (Date.now() < runtimeRecoveryDeadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("Lynxtron exited before the runtime empty thread was recovered.");
    }
    runtimeRecoveryState = await readClientState(client);
    persistedThreadIdsAfterRuntimeRecovery = readPersistedThreadIds(baseDir);
    runtimeThreadObserved ||=
      runtimeRecoveryState?.threadIds?.includes(freshEmptyThreadId) === true;
    if (
      !runtimeRecoveryState?.threadIds?.includes(freshEmptyThreadId) &&
      !persistedThreadIdsAfterRuntimeRecovery.includes(freshEmptyThreadId)
    ) {
      break;
    }
    await waitForChildExit(child, 100);
  }
  if (runtimeRecoveryState?.threadIds?.includes(freshEmptyThreadId)) {
    throw new Error(
      `A runtime-created empty Native thread remained visible after recovery: ${JSON.stringify({
        freshEmptyThreadId,
        runtimeRecoveryState,
      })}`,
    );
  }
  if (persistedThreadIdsAfterRuntimeRecovery.includes(freshEmptyThreadId)) {
    throw new Error(
      `A runtime-created empty Native thread survived automatic recovery: ${JSON.stringify({
        freshEmptyThreadId,
        persistedThreadIdsAfterRuntimeRecovery,
      })}`,
    );
  }
  const canonicalThreadIdsBefore = runtimeRecoveryState?.threadIds ?? [];
  const persistedThreadIdsBefore = persistedThreadIdsAfterRuntimeRecovery;
  const normalizedThreadIds = (threadIds) => [...threadIds].sort();
  const beforeSequence = await readRendererReadiness(client);
  const canonicalThreadId = canonicalThreadIdsBefore[0];
  const terminalContextEntry =
    typeof canonicalThreadId !== "string"
      ? {
          status: "not-covered",
          reason: "Fixture has no canonical thread for a terminal session.",
        }
      : await (async () => {
          await client.runCdp("Runtime.evaluate", {
            expression: `globalThis.__T3_LYNXTRON_SELECT_THREAD__?.(${JSON.stringify(
              canonicalThreadId,
            )})`,
            returnByValue: true,
          });
          await waitForClientState({
            child,
            client,
            timeoutMs,
            predicate: (state) => state?.activeThreadId === canonicalThreadId,
          });
          await tapSelector({
            child,
            client,
            selector: ".topbar__toggle--terminal",
            timeoutMs,
          });
          await waitForMeasurement({
            child,
            client,
            selector: ".right-panel",
            timeoutMs,
            predicate: (measurement) =>
              measurement?.attributes["data-right-panel-active-kind"] === "terminal",
          });
          const addContext = await waitForMeasurement({
            child,
            client,
            selector: ".terminal-panel__add-context",
            timeoutMs,
            predicate: (measurement) => measurement?.attributes["aria-disabled"] === "false",
          });
          await tapSelector({
            child,
            client,
            selector: ".terminal-panel__add-context",
            timeoutMs,
          });
          const contextState = await waitForClientState({
            child,
            client,
            timeoutMs,
            predicate: (state) => state?.activeComposerTerminalContexts?.length === 1,
          });
          const chip = await waitForMeasurement({
            child,
            client,
            selector: ".composer-terminal-context-chip",
            timeoutMs,
            predicate: (measurement) => measurement?.text.includes("Terminal 1 line") === true,
          });
          await tapSelector({
            child,
            client,
            selector: ".composer-terminal-context-remove",
            timeoutMs,
          });
          await waitForClientState({
            child,
            client,
            timeoutMs,
            predicate: (state) => state?.activeComposerTerminalContexts?.length === 0,
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
          return {
            status: "pass",
            input: "DevTool touch on the measured terminal-context and Composer remove controls",
            control: addContext.rect,
            label: chip.text.trim(),
            context: contextState.activeComposerTerminalContexts[0],
            removed: true,
          };
        })();
  await tapSelector({
    child,
    client,
    selector: ".sidebar-v2-new-thread",
    timeoutMs,
  });
  const firstDraftState = await waitForClientState({
    child,
    client,
    timeoutMs,
    predicate: (state) =>
      typeof state?.draftThreadId === "string" &&
      state.activeThreadId === state.draftThreadId &&
      JSON.stringify(state.threadIds ?? []) === JSON.stringify(canonicalThreadIdsBefore),
  });
  const hero = await waitForMeasurement({
    child,
    client,
    selector: ".hero",
    timeoutMs,
    predicate: (measurement) => measurement !== null,
  });
  const draftText = "Native route-scoped draft";
  const draftFixtureResponse = await client.runCdp("Runtime.evaluate", {
    expression: `globalThis.__T3_LYNXTRON_COMPOSER_INPUT_FIXTURE__?.(${JSON.stringify(
      draftText,
    )}) ?? false`,
    returnByValue: true,
  });
  if (commandResult(draftFixtureResponse)?.value !== true) {
    throw new Error(
      `Native draft text fixture was not applied: ${JSON.stringify(draftFixtureResponse)}`,
    );
  }
  await waitForClientState({
    child,
    client,
    timeoutMs,
    predicate: (state) => state?.activeComposerDraftText === draftText,
  });
  const routeRoundTrip =
    typeof canonicalThreadId !== "string"
      ? {
          status: "not-covered",
          reason: "Fixture has no canonical thread to leave and revisit.",
        }
      : await (async () => {
          await client.runCdp("Runtime.evaluate", {
            expression: `globalThis.__T3_LYNXTRON_SELECT_THREAD__?.(${JSON.stringify(
              canonicalThreadId,
            )})`,
            returnByValue: true,
          });
          await waitForClientState({
            child,
            client,
            timeoutMs,
            predicate: (state) =>
              state?.activeThreadId === canonicalThreadId && state.activeComposerDraftText === "",
          });
          await tapSelector({
            child,
            client,
            selector: ".sidebar-v2-new-thread",
            timeoutMs,
          });
          const restored = await waitForClientState({
            child,
            client,
            timeoutMs,
            predicate: (state) =>
              state?.activeThreadId === firstDraftState.draftThreadId &&
              state.activeComposerDraftText === draftText,
          });
          await waitForMeasurement({
            child,
            client,
            selector: ".composer-primary-action",
            timeoutMs,
            predicate: (measurement) =>
              measurement?.attributes["data-composer-primary-state"] === "send",
          });
          const placeholder = await readOptionalMeasurement(client, ".composer__placeholder");
          if (placeholder !== null) {
            throw new Error(
              `Restored Native draft still rendered its placeholder: ${JSON.stringify(
                placeholder,
              )}`,
            );
          }
          const attachment = {
            type: "image",
            name: "one-pixel.png",
            mimeType: "image/png",
            sizeBytes: 68,
            dataUrl:
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlWQAAAAASUVORK5CYII=",
          };
          const attachmentFixtureResponse = await client.runCdp("Runtime.evaluate", {
            expression: `globalThis.__T3_LYNXTRON_COMPOSER_ATTACHMENT_FIXTURE__?.(${JSON.stringify(
              attachment,
            )}) ?? false`,
            returnByValue: true,
          });
          if (commandResult(attachmentFixtureResponse)?.value !== true) {
            throw new Error(
              `Native attachment fixture was not applied: ${JSON.stringify(
                attachmentFixtureResponse,
              )}`,
            );
          }
          const attachmentList = await waitForMeasurement({
            child,
            client,
            selector: ".composer-attachment-list",
            timeoutMs,
            predicate: (measurement) =>
              measurement?.attributes["data-composer-attachment-count"] === "1",
          });
          const preview = await waitForMeasurement({
            child,
            client,
            selector: ".composer-attachment-preview",
            timeoutMs,
            predicate: (measurement) => measurement !== null,
          });
          await tapSelector({
            child,
            client,
            selector: ".composer-attachment-remove",
            timeoutMs,
          });
          await waitForMeasurement({
            child,
            client,
            selector: ".composer-attachment-list",
            timeoutMs,
            predicate: (measurement) => measurement === null,
          });
          await client.runCdp("Runtime.evaluate", {
            expression: "globalThis.__T3_LYNXTRON_COMPOSER_INPUT_FIXTURE__?.('')",
            returnByValue: true,
          });
          const terminalContext = {
            id: "terminal-1:2:3",
            terminalId: "terminal-1",
            terminalLabel: "Terminal 1",
            lineStart: 2,
            lineEnd: 3,
            text: "two\nthree",
          };
          const terminalContextResponse = await client.runCdp("Runtime.evaluate", {
            expression: `globalThis.__T3_LYNXTRON_COMPOSER_TERMINAL_CONTEXT_FIXTURE__?.(${JSON.stringify(
              terminalContext,
            )}) ?? false`,
            returnByValue: true,
          });
          if (commandResult(terminalContextResponse)?.value !== true) {
            throw new Error(
              `Native terminal context fixture was not applied: ${JSON.stringify(
                terminalContextResponse,
              )}`,
            );
          }
          const terminalContextChip = await waitForMeasurement({
            child,
            client,
            selector: ".composer-terminal-context-chip",
            timeoutMs,
            predicate: (measurement) => measurement?.text.includes("Terminal 1 lines 2-3") === true,
          });
          await waitForMeasurement({
            child,
            client,
            selector: ".composer-primary-action",
            timeoutMs,
            predicate: (measurement) =>
              measurement?.attributes["data-composer-primary-state"] === "send",
          });
          await tapSelector({
            child,
            client,
            selector: ".composer-terminal-context-remove",
            timeoutMs,
          });
          await waitForMeasurement({
            child,
            client,
            selector: ".composer-terminal-context-chip",
            timeoutMs,
            predicate: (measurement) => measurement === null,
          });
          await waitForMeasurement({
            child,
            client,
            selector: ".composer-primary-action",
            timeoutMs,
            predicate: (measurement) =>
              measurement?.attributes["data-composer-primary-state"] === "disabled",
          });
          await client.runCdp("Runtime.evaluate", {
            expression: "globalThis.__T3_LYNXTRON_COMPOSER_INPUT_FIXTURE__?.('@')",
            returnByValue: true,
          });
          await waitForClientState({
            child,
            client,
            timeoutMs,
            predicate: (state) => state?.activeComposerDraftText === "@",
          });
          await client.runCdp("Runtime.evaluate", {
            expression: "globalThis.__T3_LYNXTRON_COMPOSER_CURSOR_FIXTURE__?.(1)",
            returnByValue: true,
          });
          await waitForRuntimeValue({
            child,
            client,
            expression: "JSON.stringify(globalThis.__T3_LYNXTRON_COMPOSER_TRIGGER_STATE__ ?? null)",
            predicate: (value) => {
              if (typeof value !== "string") return false;
              const state = JSON.parse(value);
              return (
                state?.value === "@" &&
                state?.composerCursor === 1 &&
                state?.contextPickerOpen === true
              );
            },
            timeoutMs,
          });
          await waitForMeasurement({
            child,
            client,
            selector: ".composer-context-picker",
            timeoutMs,
            predicate: (measurement) =>
              measurement?.attributes["data-composer-context-picker"] === "path",
          });
          const fileContextPath = "review-fixture.txt";
          await tapSelectorByAttribute({
            attribute: "data-composer-context-path",
            child,
            client,
            selector: ".composer-context-picker__item",
            timeoutMs,
            value: fileContextPath,
          });
          await waitForClientState({
            child,
            client,
            timeoutMs,
            predicate: (state) =>
              state?.activeComposerDraftText === "" &&
              state.activeComposerFileContexts?.[0]?.path === fileContextPath,
          });
          const fileContextChip = await waitForMeasurement({
            child,
            client,
            selector: ".composer-file-context-chip",
            timeoutMs,
            predicate: (measurement) => measurement?.text.includes("review-fixture.txt") === true,
          });
          await waitForMeasurement({
            child,
            client,
            selector: ".composer-primary-action",
            timeoutMs,
            predicate: (measurement) =>
              measurement?.attributes["data-composer-primary-state"] === "send",
          });
          await tapSelector({
            child,
            client,
            selector: ".composer-file-context-remove",
            timeoutMs,
          });
          await waitForMeasurement({
            child,
            client,
            selector: ".composer-file-context-chip",
            timeoutMs,
            predicate: (measurement) => measurement === null,
          });
          await waitForMeasurement({
            child,
            client,
            selector: ".composer-primary-action",
            timeoutMs,
            predicate: (measurement) =>
              measurement?.attributes["data-composer-primary-state"] === "disabled",
          });
          await client.runCdp("Runtime.evaluate", {
            expression: `globalThis.__T3_LYNXTRON_COMPOSER_INPUT_FIXTURE__?.(${JSON.stringify(
              draftText,
            )})`,
            returnByValue: true,
          });
          return {
            status: "pass",
            canonicalThreadId,
            draftThreadId: restored.draftThreadId,
            text: restored.activeComposerDraftText,
            primaryActionState: "send",
            placeholderVisible: false,
            attachmentLifecycle: {
              addedCount: Number(attachmentList.attributes["data-composer-attachment-count"]),
              preview: preview.rect,
              removed: true,
            },
            terminalContextLifecycle: {
              label: terminalContextChip.text.trim(),
              contextOnlySendable: true,
              removed: true,
            },
            fileContextLifecycle: {
              label: fileContextChip.text.trim(),
              canonicalMention: "[review-fixture.txt](review-fixture.txt)",
              entry: "composer @ picker",
              contextOnlySendable: true,
              removed: true,
            },
          };
        })();
  await tapSelector({
    child,
    client,
    selector: ".sidebar-v2-new-thread",
    timeoutMs,
  });
  const reusedDraftState = await waitForClientState({
    child,
    client,
    timeoutMs,
    predicate: (state) =>
      state?.draftThreadId === firstDraftState.draftThreadId &&
      state.activeThreadId === firstDraftState.draftThreadId &&
      JSON.stringify(state.threadIds ?? []) === JSON.stringify(canonicalThreadIdsBefore),
  });
  const persistedTerminalContext = {
    id: "terminal-restart:4:5",
    terminalId: "terminal-restart",
    terminalLabel: "Terminal restart",
    lineStart: 4,
    lineEnd: 5,
    text: "persisted\ncontext",
  };
  const persistedTerminalContextResponse = await client.runCdp("Runtime.evaluate", {
    expression: `globalThis.__T3_LYNXTRON_COMPOSER_TERMINAL_CONTEXT_FIXTURE__?.(${JSON.stringify(
      persistedTerminalContext,
    )}) ?? false`,
    returnByValue: true,
  });
  if (commandResult(persistedTerminalContextResponse)?.value !== true) {
    throw new Error(
      `Native persisted terminal context fixture was not applied: ${JSON.stringify(
        persistedTerminalContextResponse,
      )}`,
    );
  }
  await waitForClientState({
    child,
    client,
    timeoutMs,
    predicate: (state) =>
      state?.activeComposerTerminalContexts?.[0]?.id === persistedTerminalContext.id,
  });
  await client.runCdp("Runtime.evaluate", {
    expression: "globalThis.__T3_LYNXTRON_COMPOSER_INPUT_FIXTURE__?.('@review-fixture')",
    returnByValue: true,
  });
  await waitForClientState({
    child,
    client,
    timeoutMs,
    predicate: (state) => state?.activeComposerDraftText === "@review-fixture",
  });
  await client.runCdp("Runtime.evaluate", {
    expression: "globalThis.__T3_LYNXTRON_COMPOSER_CURSOR_FIXTURE__?.(15)",
    returnByValue: true,
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".composer-context-picker",
    timeoutMs,
    predicate: (measurement) => measurement?.attributes["data-composer-context-picker"] === "path",
  });
  await tapSelectorByAttribute({
    attribute: "data-composer-context-path",
    child,
    client,
    selector: ".composer-context-picker__item",
    timeoutMs,
    value: "review-fixture.txt",
  });
  await client.runCdp("Runtime.evaluate", {
    expression: `globalThis.__T3_LYNXTRON_COMPOSER_INPUT_FIXTURE__?.(${JSON.stringify(draftText)})`,
    returnByValue: true,
  });
  const persistedFileContext = await waitForClientState({
    child,
    client,
    timeoutMs,
    predicate: (state) => state?.activeComposerFileContexts?.[0]?.path === "review-fixture.txt",
  });
  const afterSequence = await readRendererReadiness(client);
  const persistedThreadIdsAfter = readPersistedThreadIds(baseDir);
  if (
    JSON.stringify(normalizedThreadIds(persistedThreadIdsAfter)) !==
      JSON.stringify(normalizedThreadIds(persistedThreadIdsBefore)) ||
    JSON.stringify(normalizedThreadIds(persistedThreadIdsAfter)) !==
      JSON.stringify(normalizedThreadIds(reusedDraftState.threadIds ?? []))
  ) {
    throw new Error(
      `Opening a local Native draft persisted an empty thread: ${JSON.stringify({
        persistedThreadIdsBefore,
        persistedThreadIdsAfter,
        clientThreadIdsAfter: reusedDraftState.threadIds ?? [],
      })}`,
    );
  }
  const outcome = {
    status: "pass",
    input: "DevTool Input.emulateTouchFromMouseEvent on the measured New thread control",
    hero: hero.rect,
    legacyEmptyThreadRecovery: legacyRecovery,
    runtimeEmptyThreadRecovery: {
      threadId: freshEmptyThreadId,
      canonicalThreadIdsAfter: runtimeRecoveryState?.threadIds ?? [],
      persistedThreadIdsAfter: persistedThreadIdsAfterRuntimeRecovery,
      observedInClient: runtimeThreadObserved,
      automatic: true,
    },
    canonicalThreadIdsBefore,
    canonicalThreadIdsAfter: reusedDraftState.threadIds ?? [],
    persistedThreadIdsBefore,
    persistedThreadIdsAfter,
    terminalContextEntry,
    firstDraftThreadId: firstDraftState.draftThreadId,
    reusedDraftThreadId: reusedDraftState.draftThreadId,
    routeRoundTrip,
    serverSequenceBefore: beforeSequence.lastSeq,
    serverSequenceAfter: afterSequence.lastSeq,
  };
  const draftScopeKey = `project:${projectId}`;
  const prefsPath = path.join(baseDir, "lynxtron-prefs.json");
  const persistenceDeadline = Date.now() + timeoutMs;
  let persistedDraftText = null;
  let savedTerminalContexts = null;
  let savedFileContexts = null;
  while (Date.now() < persistenceDeadline) {
    const prefs = JSON.parse(readFileSync(prefsPath, "utf8"));
    persistedDraftText = prefs.composerDraftTextByScopeKey?.[draftScopeKey] ?? null;
    savedTerminalContexts = prefs.composerTerminalContextsByScopeKey?.[draftScopeKey] ?? null;
    savedFileContexts = prefs.composerFileContextsByScopeKey?.[draftScopeKey] ?? null;
    if (
      persistedDraftText === draftText &&
      savedTerminalContexts?.[0]?.id === persistedTerminalContext.id &&
      savedFileContexts?.[0]?.path === "review-fixture.txt"
    )
      break;
    await waitForChildExit(child, 50);
  }
  if (
    persistedDraftText !== draftText ||
    savedTerminalContexts?.[0]?.id !== persistedTerminalContext.id ||
    savedFileContexts?.[0]?.path !== "review-fixture.txt"
  ) {
    throw new Error(
      `Native Composer state did not persist before cold restart: ${JSON.stringify({
        draftScopeKey,
        persistedDraftText,
        savedTerminalContexts,
        savedFileContexts,
      })}`,
    );
  }
  const initialProcessId = child.pid;
  const initialClient = client.identity;
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
      T3_LYNXTRON_VIEWPORT_PROBE: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (!Number.isInteger(restartedChild.pid) || restartedChild.pid <= 0) {
    throw new Error("Composer draft cold restart did not return an owned process id.");
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
    await waitForClientState({
      child: restartedChild,
      client: restartedClient,
      timeoutMs,
      predicate: (state) => state?.composerDraftTextByScopeKey?.[draftScopeKey] === draftText,
    });
    const createDraftResponse = await restartedClient.runCdp("Runtime.evaluate", {
      expression: `globalThis.__T3_LYNXTRON_CREATE_DRAFT_THREAD__?.(${JSON.stringify(projectId)})`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (commandResult(createDraftResponse)?.value !== true) {
      throw new Error(
        `Composer draft cold restart could not create its local draft: ${JSON.stringify(
          createDraftResponse,
        )}`,
      );
    }
    const restartedDraft = await waitForClientState({
      child: restartedChild,
      client: restartedClient,
      timeoutMs,
      predicate: (state) =>
        typeof state?.draftThreadId === "string" &&
        state.activeThreadId === state.draftThreadId &&
        state.activeComposerDraftText === draftText &&
        state.activeComposerTerminalContexts?.[0]?.id === persistedTerminalContext.id &&
        state.activeComposerFileContexts?.[0]?.path === "review-fixture.txt",
    });
    await waitForMeasurement({
      child: restartedChild,
      client: restartedClient,
      selector: ".composer-primary-action",
      timeoutMs,
      predicate: (measurement) => measurement?.attributes["data-composer-primary-state"] === "send",
    });
    return {
      outcome: {
        ...outcome,
        coldRestart: {
          status: "pass",
          draftScopeKey,
          text: restartedDraft.activeComposerDraftText,
          terminalContext: restartedDraft.activeComposerTerminalContexts[0],
          fileContext: restartedDraft.activeComposerFileContexts[0],
          initialProcessId,
          initialClient,
          restartedProcessId: restartedChild.pid,
          restartedClient: restartedClient.identity,
          transport: restartTransport,
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

async function verifyNewThreadProjects({
  baseDir,
  child,
  client,
  devToolCli,
  expectedProjectTitles,
  expectedTheme,
  outputDirectory,
  timeoutMs,
}) {
  const projects = readPersistedProjects(baseDir);
  if (
    projects.length !== 2 ||
    expectedProjectTitles.length !== 2 ||
    !expectedProjectTitles.every((title) => projects.some((project) => project.title === title))
  ) {
    throw new Error(
      `--verify-new-thread-projects requires exactly two declared persisted projects: ${JSON.stringify(
        { expectedProjectTitles, projects },
      )}`,
    );
  }
  const canonicalThreadIdsBefore = (await readClientState(client))?.threadIds ?? [];
  const persistedThreadIdsBefore = readPersistedThreadIds(baseDir);
  if (canonicalThreadIdsBefore.length !== 0 || persistedThreadIdsBefore.length !== 0) {
    throw new Error(
      `New Thread Projects fixture must start without threads: ${JSON.stringify({
        canonicalThreadIdsBefore,
        persistedThreadIdsBefore,
      })}`,
    );
  }

  const openChooser = async () => {
    const trigger = await waitForMeasurement({
      child,
      client,
      selector: ".sidebar-v2-new-thread",
      timeoutMs,
      predicate: (measurement) =>
        measurement !== null && measurement.attributes.class?.includes("opacity-50") !== true,
    });
    await tapMeasurement({ client, measurement: trigger });
    let overlayState;
    try {
      overlayState = await waitForSearchOverlayState({
        child,
        client,
        timeoutMs: Math.min(timeoutMs, 2_000),
        predicate: (state) =>
          state?.open === true &&
          state.mode === "command" &&
          state.openIntent?.kind === "new-thread-in",
      });
    } catch (error) {
      throw new Error(
        `New Thread button did not open the project chooser: ${JSON.stringify({
          cause: error instanceof Error ? error.message : String(error),
          clientState: await readClientState(client),
          overlayState: await readSearchOverlayState(client),
          trigger: await readOptionalMeasurement(client, ".sidebar-v2-new-thread"),
        })}`,
      );
    }
    const panel = await waitForStableMeasurement({
      child,
      client,
      selector: ".palette-panel",
      timeoutMs,
      predicate: (measurement) =>
        measurement?.attributes["data-quick-switch-view"] === "new-thread-projects",
    });
    const [search, results, section, sectionLabel, footer] = await Promise.all([
      readOptionalMeasurement(client, ".palette-search"),
      readOptionalMeasurement(client, ".palette-results"),
      readOptionalMeasurement(client, ".qs-section"),
      readOptionalMeasurement(client, ".palette-section-label"),
      readOptionalMeasurement(client, ".palette-footer"),
    ]);
    const rows = await readSelectorMeasurements(client, ".quick-switch-project-row");
    const projectRows = projects.map((project) =>
      rows.find(
        (row) => row.text.includes(project.title) && row.text.includes(project.workspaceRoot),
      ),
    );
    if (
      !search ||
      !results ||
      !section ||
      !sectionLabel ||
      !footer ||
      rows.length !== 2 ||
      sectionLabel.text.trim() !== "Projects" ||
      projectRows.some((row) => row === undefined) ||
      Math.abs(panel.rect.width - 576) > 1 ||
      Math.abs(panel.rect.height - 230) > 1 ||
      Math.abs(search.rect.height - 48) > 1 ||
      Math.abs(results.rect.height - 140) > 1 ||
      Math.abs(section.rect.height - 124) > 1 ||
      Math.abs(sectionLabel.rect.height - 28) > 1 ||
      rows.some((row) => Math.abs((row.rect?.height ?? 0) - 48) > 1) ||
      Math.abs(footer.rect.height - 40) > 1 ||
      !footer.text.includes("Navigate") ||
      !footer.text.includes("Select") ||
      !footer.text.includes("Back") ||
      !footer.text.includes("Close")
    ) {
      throw new Error(
        `Native New Thread Projects anatomy drifted from Web authority: ${JSON.stringify({
          expectedProjectTitles,
          footer,
          panel,
          projectRows,
          results,
          rows,
          search,
          section,
          sectionLabel,
        })}`,
      );
    }
    return {
      footer,
      overlayState,
      panel,
      results,
      rows,
      search,
      section,
      sectionLabel,
    };
  };

  const selectProject = async (project) => {
    const chooser = await openChooser();
    const row = chooser.rows.find((candidate) => candidate.text.includes(project.title));
    if (!row) {
      throw new Error(
        `New Thread Projects did not expose ${project.title}: ${JSON.stringify(
          chooser.rows.map((candidate) => candidate.text),
        )}`,
      );
    }
    await tapMeasurement({ client, measurement: row });
    await waitForMeasurement({
      child,
      client,
      selector: ".palette-panel",
      timeoutMs,
      predicate: (measurement) => measurement === null,
    });
    const state = await waitForClientState({
      child,
      client,
      timeoutMs,
      predicate: (candidate) =>
        typeof candidate?.draftThreadId === "string" &&
        candidate.activeThreadId === candidate.draftThreadId &&
        candidate.activeThread?.projectId === project.projectId &&
        candidate.draftThreadIdsByProjectId?.[project.projectId] === candidate.draftThreadId &&
        Array.isArray(candidate.threadIds) &&
        candidate.threadIds.length === 0,
    });
    const persistedThreadIds = readPersistedThreadIds(baseDir);
    if (persistedThreadIds.length !== 0) {
      throw new Error(
        `Selecting ${project.title} persisted an empty thread: ${JSON.stringify(
          persistedThreadIds,
        )}`,
      );
    }
    return { chooser, persistedThreadIds, state };
  };

  const firstProject = projects[0];
  const secondProject = projects[1];
  const firstSelection = await selectProject(firstProject);
  const secondSelection = await selectProject(secondProject);
  if (firstSelection.state.draftThreadId === secondSelection.state.draftThreadId) {
    throw new Error("Different projects reused the same local draft identity.");
  }
  const firstSelectionAgain = await selectProject(firstProject);
  if (firstSelectionAgain.state.draftThreadId !== firstSelection.state.draftThreadId) {
    throw new Error(
      `Returning to ${firstProject.title} did not reuse its local draft: ${JSON.stringify({
        first: firstSelection.state.draftThreadId,
        returned: firstSelectionAgain.state.draftThreadId,
      })}`,
    );
  }

  const backChooser = await openChooser();
  await tapSelector({ child, client, selector: ".qs-search__back", timeoutMs });
  await waitForMeasurement({
    child,
    client,
    selector: ".palette-panel",
    timeoutMs,
    predicate: (measurement) => measurement?.attributes["data-quick-switch-view"] === "root",
  });
  await tapSelector({ child, client, selector: ".palette-backdrop", timeoutMs });
  await waitForMeasurement({
    child,
    client,
    selector: ".palette-panel",
    timeoutMs,
    predicate: (measurement) => measurement === null,
  });

  await openChooser();
  const backdrop = await waitForMeasurement({
    child,
    client,
    selector: ".palette-backdrop",
    timeoutMs,
    predicate: (measurement) => measurement !== null,
  });
  const screenshot = captureNativeScreenshot({
    client,
    devToolCli,
    outputDirectory,
    name: `native-new-thread-projects-${expectedTheme ?? "system"}.png`,
  });
  await tapSelector({
    child,
    client,
    point: "bottom-right",
    selector: ".palette-backdrop",
    timeoutMs,
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".palette-panel",
    timeoutMs,
    predicate: (measurement) => measurement === null,
  });
  const finalState = await readClientState(client);
  const persistedThreadIdsAfter = readPersistedThreadIds(baseDir);
  if (
    (finalState?.threadIds?.length ?? -1) !== 0 ||
    persistedThreadIdsAfter.length !== 0 ||
    Object.keys(finalState?.draftThreadIdsByProjectId ?? {}).length !== 2
  ) {
    throw new Error(
      `New Thread Projects left incorrect canonical or draft state: ${JSON.stringify({
        finalState,
        persistedThreadIdsAfter,
      })}`,
    );
  }

  return {
    status: "pass",
    authority: {
      panel: [352, 82, 576, 230],
      search: [353, 83, 574, 48],
      results: [353, 131, 574, 140],
      section: [361, 139, 558, 124],
      sectionLabel: [361, 139, 558, 28],
      rowHeight: 48,
      footer: [353, 271, 574, 40],
    },
    geometry: {
      panel: firstSelection.chooser.panel.rect,
      search: firstSelection.chooser.search.rect,
      results: firstSelection.chooser.results.rect,
      section: firstSelection.chooser.section.rect,
      sectionLabel: firstSelection.chooser.sectionLabel.rect,
      rows: firstSelection.chooser.rows.map((row) => ({
        rect: row.rect,
        text: row.text,
      })),
      footer: firstSelection.chooser.footer.rect,
    },
    projects: projects.map((project) => ({
      ...project,
      draftThreadId:
        finalState.draftThreadIdsByProjectId?.[project.projectId] ??
        firstSelection.state.draftThreadIdsByProjectId?.[project.projectId] ??
        secondSelection.state.draftThreadIdsByProjectId?.[project.projectId],
    })),
    draftLifecycle: {
      firstProject: firstSelection.state.draftThreadId,
      secondProject: secondSelection.state.draftThreadId,
      firstProjectReused: firstSelectionAgain.state.draftThreadId,
      registry: finalState.draftThreadIdsByProjectId,
    },
    canonicalThreadIdsBefore,
    canonicalThreadIdsAfter: finalState.threadIds,
    persistedThreadIdsBefore,
    persistedThreadIdsAfter,
    dismissal: {
      backToRoot: true,
      backdrop: backdrop.rect,
      outsideTapClosed: true,
    },
    screenshot,
    physicalKeyboard: "pending-user-session",
    physicalHover: "pending-user-session",
    input: "DevTool taps on measured Sidebar, project rows, Back, and backdrop",
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

function readPersistedThreadInteractionMode(baseDir, threadId) {
  const escapedThreadId = threadId.replaceAll("'", "''");
  const query = spawnSync(
    process.env.T3_NODE_BIN?.trim() || "node",
    [
      path.join(REPO_ROOT, "apps/server/scripts/t3-sqlite-state.ts"),
      "query",
      "--base-dir",
      baseDir,
      "--sql",
      `SELECT interaction_mode FROM projection_threads WHERE thread_id = '${escapedThreadId}'`,
    ],
    { cwd: REPO_ROOT, encoding: "utf8" },
  );
  if (query.status !== 0) {
    throw new Error(
      `Could not read persisted interaction mode: ${query.stderr || query.stdout || "unknown"}`,
    );
  }
  const report = JSON.parse(query.stdout);
  return report.rows?.[0]?.interaction_mode ?? null;
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
  expectSocketRecovery,
  requireRunningSession,
  log,
  outputDirectory,
  timeoutMs,
}) {
  const beforeState = requireRunningSession
    ? await waitForClientState({
        child,
        client,
        timeoutMs,
        predicate: (state) =>
          state?.sessionStatus === "running" &&
          state?.activeThread?.session != null &&
          typeof state?.activeTurnId === "string",
      })
    : await selectSessionlessFixtureThread({
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
  const targetDeadline = Date.now() + timeoutMs;
  let target = null;
  while (Date.now() < targetDeadline && target === null) {
    const rows = await readSelectorMeasurements(client, ".model-picker-row--unselected");
    target =
      rows.find((row) => {
        const key = row.attributes["data-model-picker-key"];
        return (
          typeof key === "string" &&
          key.includes(":") &&
          row.attributes["data-model-picker-disabled"] !== "true"
        );
      }) ?? null;
    if (target === null) await waitForChildExit(child, 100);
  }
  if (target === null) {
    throw new Error("Timed out waiting for an enabled unselected model row.");
  }
  const targetKey = target.attributes["data-model-picker-key"];
  const separator = targetKey.indexOf(":");
  const targetSelection = {
    instanceId: targetKey.slice(0, separator),
    model: targetKey.slice(separator + 1),
  };
  await tapSelectorByAttribute({
    attribute: "data-model-picker-key",
    child,
    client,
    selector: ".model-picker-row--unselected",
    timeoutMs,
    value: targetKey,
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
      state?.activeThread?.modelSelection?.model === targetSelection.model &&
      state?.modelSelectionPending === false &&
      state?.modelSelectionError === null,
  });
  const afterModel = await waitForMeasurement({
    child,
    client,
    selector: ".composer-toolbar-control--model",
    timeoutMs,
    predicate: (measurement) =>
      Boolean(measurement?.text.trim()) && measurement.text.trim() !== beforeModel.text.trim(),
  });
  if (expectSocketRecovery) {
    await waitForLogText(
      child,
      log,
      "[main-connector] setModelSelection hit a stale transport; reconnecting once",
      timeoutMs,
    );
  }
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
    sessionState: requireRunningSession ? "running" : "sessionless-idle",
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
      pending: afterState.modelSelectionPending,
      error: afterState.modelSelectionError,
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
    socketRecovery: expectSocketRecovery ? "reconnected-and-retried-once" : "not-injected",
    screenshot,
  };
}

async function verifySidebarProjectGroups({
  child,
  client,
  devToolCli,
  expectedProjectTitles,
  expectedTheme,
  outputDirectory,
  timeoutMs,
}) {
  const sidebar = await waitForStableMeasurement({
    child,
    client,
    selector: ".sidebar",
    timeoutMs,
    predicate: (measurement) => measurement?.attributes["data-sidebar-version"] === "legacy",
  });
  const projectList = await waitForStableMeasurement({
    child,
    client,
    selector: ".lynx-sidebar-project-list",
    timeoutMs,
    predicate: (measurement) =>
      expectedProjectTitles.every((title) => measurement?.text.includes(title)),
  });
  const group = await readOptionalMeasurement(client, ".lynx-sidebar-projects-group");
  const rows = await readSelectorMeasurements(client, ".sidebar-project-row-reference");
  const titles = await readSelectorMeasurements(client, ".sidebar-project-title-reference");
  const emptyThreadsBefore = await readSelectorMeasurements(client, ".lynx-sidebar-thread-empty");
  const sidebarRight = sidebar.rect.x + sidebar.rect.width;
  const leftInset = projectList.rect.x - sidebar.rect.x;
  const rightInset = sidebarRight - (projectList.rect.x + projectList.rect.width);
  const titleText = titles.map((title) => title.text.trim());
  if (
    !group ||
    sidebar.rect.width !== 256 ||
    projectList.rect.width !== 239 ||
    Math.abs(leftInset - 8) > 1 ||
    Math.abs(rightInset - 9) > 1 ||
    rows.length !== expectedProjectTitles.length ||
    titles.length !== expectedProjectTitles.length ||
    JSON.stringify(titleText) !== JSON.stringify(expectedProjectTitles) ||
    rows.some(
      (row, index) =>
        Math.abs((row.rect?.width ?? 0) - 239) > 1 ||
        Math.abs((row.rect?.height ?? 0) - 32) > 1 ||
        (index > 0 && (row.rect?.y ?? 0) <= (rows[index - 1]?.rect?.y ?? 0)),
    ) ||
    emptyThreadsBefore.length !== expectedProjectTitles.length
  ) {
    throw new Error(
      `Sidebar project groups drifted: ${JSON.stringify({
        emptyThreadsBefore,
        expectedProjectTitles,
        group,
        leftInset,
        projectList,
        rightInset,
        rows,
        sidebar,
        titles,
      })}`,
    );
  }
  const screenshot = captureNativeScreenshot({
    client,
    devToolCli,
    outputDirectory,
    name: `native-sidebar-project-groups-${expectedTheme ?? "system"}.png`,
  });

  await tapSelector({
    child,
    client,
    selector: ".sidebar-project-row-reference",
    timeoutMs,
  });
  const emptyThreadsCollapsed = await waitForSelectorCount({
    child,
    client,
    count: expectedProjectTitles.length - 1,
    selector: ".lynx-sidebar-thread-empty",
    timeoutMs,
  });
  await tapSelector({
    child,
    client,
    selector: ".sidebar-project-row-reference",
    timeoutMs,
  });
  const emptyThreadsRestored = await waitForSelectorCount({
    child,
    client,
    count: expectedProjectTitles.length,
    selector: ".lynx-sidebar-thread-empty",
    timeoutMs,
  });

  return {
    status: "pass",
    sidebar: sidebar.rect,
    group: group.rect,
    projectList: projectList.rect,
    rows: rows.map((row, index) => ({
      rect: row.rect,
      text: row.text,
      title: titleText[index],
    })),
    insets: { left: leftInset, right: rightInset },
    emptyThreadCount: {
      expanded: emptyThreadsBefore.length,
      collapsed: expectedProjectTitles.length - 1,
      restored: expectedProjectTitles.length,
    },
    collapseProbe: {
      collapsedRows: emptyThreadsCollapsed.map((row) => row.rect),
      restoredRows: emptyThreadsRestored.map((row) => row.rect),
    },
    screenshot,
    interaction: "measured first-project collapse and re-expand taps",
    physicalHover: "pending-user-session",
  };
}

async function verifySidebarInlineSearch({ child, client, timeoutMs }) {
  const beforeState = await readClientState(client);
  const beforeThreadId = beforeState?.activeThreadId;
  if (typeof beforeThreadId !== "string") {
    throw new Error(`Sidebar search baseline has no active thread: ${JSON.stringify(beforeState)}`);
  }
  const beforeSequence = await readRendererReadiness(client);
  const probeResponse = await client.runCdp("Runtime.evaluate", {
    expression:
      'typeof globalThis.__T3_LYNXTRON_SIDEBAR_SEARCH_PROBE__ === "function" && (globalThis.__T3_LYNXTRON_SIDEBAR_SEARCH_PROBE__("New"), true)',
    returnByValue: true,
  });
  if (probeResponse?.exceptionDetails || commandResult(probeResponse)?.value !== true) {
    throw new Error(`Sidebar search probe failed: ${JSON.stringify(probeResponse)}`);
  }

  const deadline = Date.now() + timeoutMs;
  let rows = [];
  while (Date.now() < deadline) {
    rows = await readSelectorMeasurements(client, ".sidebar-v2-search-result");
    if (
      rows.length >= 2 &&
      rows.every((row) => Math.abs((row.rect?.height ?? 0) - 36) <= 1) &&
      rows[0]?.attributes.role === "option" &&
      rows[0]?.attributes["aria-selected"] === "true"
    ) {
      break;
    }
    await waitForChildExit(child, 100);
  }
  if (
    rows.length < 2 ||
    rows.some((row) => Math.abs((row.rect?.height ?? 0) - 36) > 1) ||
    rows.some((row) => row.attributes.role !== "option") ||
    rows[0]?.attributes["aria-selected"] !== "true"
  ) {
    throw new Error(
      `Sidebar search rows did not reach the expected state: ${JSON.stringify(rows)}`,
    );
  }
  const target = rows[1];
  const targetThreadId = target.attributes["data-sidebar-search-result"];
  if (typeof targetThreadId !== "string" || targetThreadId === beforeThreadId) {
    throw new Error(`Sidebar search target is invalid: ${JSON.stringify(target)}`);
  }
  await tapSelectorByAttribute({
    attribute: "data-sidebar-search-result",
    child,
    client,
    selector: ".sidebar-v2-search-result",
    timeoutMs,
    value: targetThreadId,
  });
  const afterState = await waitForClientState({
    child,
    client,
    timeoutMs,
    predicate: (state) => state?.activeThreadId === targetThreadId,
  });
  const afterSequence = await waitForSequenceAdvance({
    child,
    client,
    initial: beforeSequence,
    timeoutMs,
  });
  const clearedSearch = await waitForMeasurement({
    child,
    client,
    selector: ".sidebar-inline-search__input",
    timeoutMs,
    predicate: (measurement) =>
      measurement !== null &&
      (measurement.attributes.value === "" || measurement.attributes.value === undefined),
  });
  const remainingRows = await readSelectorMeasurements(client, ".sidebar-v2-search-result");
  if (remainingRows.length !== 0) {
    throw new Error(
      `Sidebar search rows remained after selection: ${JSON.stringify(remainingRows)}`,
    );
  }

  return {
    status: "pass",
    queryInput: "Dev-only state probe; physical keyboard remains pending-user-session",
    selectionInput: "DevTool Input.emulateTouchFromMouseEvent on the measured second result",
    list: {
      sourceContract: 'listId="sidebar-thread-search-results" role="listbox"',
      runtimeSemantics: "option rows",
    },
    rows: rows.map((row) => ({
      threadId: row.attributes["data-sidebar-search-result"],
      title: row.text.trim(),
      rect: row.rect,
      ariaSelected: row.attributes["aria-selected"],
      ariaCurrent: row.attributes["aria-current"] ?? null,
    })),
    selection: {
      before: beforeThreadId,
      target: targetThreadId,
      after: afterState.activeThreadId,
      queryValue: clearedSearch.attributes.value ?? "",
      queryCleared: (clearedSearch.attributes.value ?? "") === "",
      rowsDismissed: true,
    },
    sequence: { before: beforeSequence.lastSeq, after: afterSequence.lastSeq },
    keyboard: "pending-user-session",
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

async function readModelOptionTracking({ client, expectedLabel, expectedLetterSpacing, trigger }) {
  const label = await readOptionalMeasurement(
    client,
    ".composer-toolbar-control--model-option .composer-toolbar-control-label",
  );
  const computedLetterSpacing = await readFirstSelectorStyleValue(
    client,
    ".composer-toolbar-control--model-option .composer-toolbar-control-label",
    "letter-spacing",
  );
  if (
    trigger.text.trim() !== expectedLabel ||
    label?.text.trim() !== expectedLabel ||
    computedLetterSpacing !== expectedLetterSpacing ||
    !label.rect ||
    label.rect.width >= trigger.rect.width
  ) {
    throw new Error(
      `Native model-option tracking drifted: ${JSON.stringify({
        expectedLabel,
        expectedLetterSpacing,
        trigger,
        label,
        computedLetterSpacing,
      })}`,
    );
  }
  return {
    text: label.text.trim(),
    rect: label.rect,
    controlRect: trigger.rect,
    letterSpacing: computedLetterSpacing,
  };
}

async function verifyWorkspaceMenu({ baseDir, child, client, height, timeoutMs, width }) {
  await selectSessionlessFixtureThread({
    baseDir,
    child,
    client,
    timeoutMs,
  });
  const trigger = await waitForMeasurement({
    child,
    client,
    selector: ".composer-context-control--checkout",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.attributes["aria-disabled"] !== "true" &&
      measurement?.text.includes("Current checkout"),
  });
  await tapSelector({
    child,
    client,
    selector: ".composer-context-control--checkout",
    timeoutMs,
  });
  const menu = await waitForMeasurement({
    child,
    client,
    selector: ".composer-workspace-menu",
    timeoutMs,
    predicate: (measurement) => measurement?.text.includes("New worktree"),
  });
  const workspaceControl = await waitForMeasurement({
    child,
    client,
    selector: ".composer-workspace-control-wrap--open",
    timeoutMs,
    predicate: (measurement) => measurement !== null,
  });
  const modelOptionControl = await readOptionalMeasurement(
    client,
    ".composer-model-option-control-wrap",
  );
  const workspaceZIndex = Number(
    await readFirstSelectorStyleValue(client, ".composer-workspace-control-wrap--open", "z-index"),
  );
  const modelOptionZIndex = modelOptionControl
    ? Number(
        await readFirstSelectorStyleValue(client, ".composer-model-option-control-wrap", "z-index"),
      )
    : 0;
  if (
    !Number.isFinite(workspaceZIndex) ||
    !Number.isFinite(modelOptionZIndex) ||
    workspaceZIndex <= modelOptionZIndex
  ) {
    throw new Error(
      `Workspace menu stacking is not above model options: ${JSON.stringify({
        workspaceZIndex,
        modelOptionZIndex,
      })}`,
    );
  }
  const rows = await readSelectorMeasurements(client, ".composer-workspace-menu__item");
  const rowLabels = await readSelectorMeasurements(client, ".composer-workspace-menu__label");
  const relation = assertFloatingRelation({
    anchor: trigger.rect,
    label: "Workspace menu",
    placement: { side: "top", align: "start", sideOffset: 4 },
    popup: menu.rect,
    viewport: { width, height },
  });
  if (
    rows.length !== 2 ||
    rowLabels.length !== 2 ||
    rowLabels[0]?.text.trim() !== "Current checkout" ||
    rowLabels[1]?.text.trim() !== "New worktree"
  ) {
    throw new Error(`Workspace menu content drifted: ${JSON.stringify({ rowLabels, rows })}`);
  }

  await tapSelector({
    child,
    client,
    selector: ".composer-workspace-menu__item--worktree",
    timeoutMs,
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".composer-workspace-menu",
    timeoutMs,
    predicate: (measurement) => measurement === null,
  });
  const selectedTrigger = await waitForMeasurement({
    child,
    client,
    selector: ".composer-context-control--checkout",
    timeoutMs,
    predicate: (measurement) => measurement?.text.includes("New worktree"),
  });

  await tapSelector({
    child,
    client,
    selector: ".composer-context-control--checkout",
    timeoutMs,
  });
  const worktreeMenu = await waitForMeasurement({
    child,
    client,
    selector: ".composer-workspace-menu--worktree",
    timeoutMs,
    predicate: (measurement) => measurement?.text.includes("Start from origin"),
  });
  const dismissLayer = await waitForMeasurement({
    child,
    client,
    selector: ".composer-workspace-menu-dismiss",
    timeoutMs,
    predicate: (measurement) =>
      (measurement?.rect?.width ?? 0) >= width && (measurement?.rect?.height ?? 0) >= height,
  });
  await tapSelector({
    child,
    client,
    point: "center",
    selector: ".composer-workspace-menu-dismiss",
    timeoutMs,
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".composer-workspace-menu",
    timeoutMs,
    predicate: (measurement) => measurement === null,
  });
  const afterDismiss = await waitForMeasurement({
    child,
    client,
    selector: ".composer-context-control--checkout",
    timeoutMs,
    predicate: (measurement) => measurement?.text.includes("New worktree"),
  });

  return {
    status: "pass",
    input: "DevTool taps on the measured Workspace trigger, row, and outside dismiss layer",
    trigger: trigger.rect,
    menu: menu.rect,
    rows: rows.map((row, index) => ({
      rect: row.rect,
      text: rowLabels[index]?.text.trim() ?? "",
    })),
    relation,
    stacking: {
      workspaceZIndex,
      modelOptionZIndex,
      menuAboveModelOptions: true,
    },
    selectedLabel: selectedTrigger.text.trim(),
    worktreeMenu: worktreeMenu.rect,
    dismissLayer: dismissLayer.rect,
    outsideTapClosed: true,
    valueRetainedAfterDismiss: afterDismiss.text.includes("New worktree"),
  };
}

async function verifyModelOptionMenuMutation({
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
  const initialTracking = await readModelOptionTracking({
    client,
    expectedLabel: "Extra High · 1M · Thinking Off",
    expectedLetterSpacing: "-0.33px",
    trigger,
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
  const thinkingBeforeScroll = await waitForSelectorAttributeMeasurement({
    attribute: "data-composer-model-option-descriptor",
    child,
    client,
    selector: ".composer-model-option-menu__item--unselected",
    timeoutMs,
    value: "thinking",
  });
  const wheelProbe = await client.runCdp("Runtime.evaluate", {
    expression: "globalThis.__T3_LYNXTRON_MODEL_OPTION_MENU_WHEEL_PROBE__?.(120)",
    awaitPromise: true,
    returnByValue: true,
  });
  if (commandResult(wheelProbe)?.exceptionDetails) {
    throw new Error(`Model-option wheel probe failed: ${JSON.stringify(wheelProbe)}`);
  }
  const scrollDeadline = Date.now() + timeoutMs;
  let thinkingAfterScroll = null;
  let scrolledMenu = null;
  while (Date.now() < scrollDeadline) {
    thinkingAfterScroll = await readSelectorAttributeMeasurement(client, {
      attribute: "data-composer-model-option-descriptor",
      selector: ".composer-model-option-menu__item--unselected",
      value: "thinking",
    });
    scrolledMenu = await readOptionalMeasurement(client, ".composer-model-option-menu");
    if (
      thinkingAfterScroll &&
      scrolledMenu &&
      thinkingAfterScroll.rect.y < thinkingBeforeScroll.rect.y &&
      Number(scrolledMenu.attributes["data-wheel-offset"] ?? 0) > 0
    ) {
      break;
    }
    await waitForChildExit(child, 100);
  }
  if (
    !thinkingAfterScroll ||
    !scrolledMenu ||
    thinkingAfterScroll.rect.y >= thinkingBeforeScroll.rect.y ||
    Number(scrolledMenu.attributes["data-wheel-offset"] ?? 0) <= 0
  ) {
    throw new Error(
      `Model-option menu did not scroll: ${JSON.stringify({
        thinkingBeforeScroll,
        thinkingAfterScroll,
        scrolledMenu,
      })}`,
    );
  }
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
  const effortTracking = await readModelOptionTracking({
    client,
    expectedLabel: "High · 1M · Thinking Off",
    expectedLetterSpacing: "-0.42px",
    trigger: afterTrigger,
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
  const thinkingTracking = await readModelOptionTracking({
    client,
    expectedLabel: "High · 1M · Thinking On",
    expectedLetterSpacing: "-0.44px",
    trigger: thinkingTrigger,
  });
  const screenshot = captureNativeScreenshot({
    client,
    devToolCli,
    outputDirectory,
    name: "native-composer-model-option-tracking.png",
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
    tracking: {
      initial: initialTracking,
      effort: effortTracking,
      thinking: thinkingTracking,
    },
    menu: {
      rect: menu.rect,
      text: menu.text.trim(),
      scroll: {
        beforeThinkingY: thinkingBeforeScroll.rect.y,
        afterThinkingY: thinkingAfterScroll.rect.y,
        wheelOffset: Number(scrolledMenu.attributes["data-wheel-offset"] ?? 0),
      },
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
    screenshot,
  };
}

async function verifyComposerStopBehavior({
  child,
  client,
  devToolCli,
  expectedEnvironmentIdentificationMode,
  outputDirectory,
  projectId,
  timeoutMs,
  viewportWidth,
}) {
  const modelSelection = {
    instanceId: "opencode",
    model: "opencode/big-pickle",
  };
  const refreshedConfig = await invokeConnector(client, "refreshProviders", {
    instanceId: modelSelection.instanceId,
  });
  const refreshedProvider = refreshedConfig?.providers?.find(
    (provider) => provider.instanceId === modelSelection.instanceId,
  );
  if (refreshedProvider?.status !== "ready" || refreshedProvider.auth?.status !== "authenticated") {
    throw new Error(
      `OpenCode provider did not become ready after refresh: ${JSON.stringify(refreshedProvider)}`,
    );
  }
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
  let beforeStop;
  try {
    beforeStop = await waitForMeasurement({
      child,
      client,
      selector: ".composer-primary-action",
      timeoutMs,
      predicate: (measurement) => measurement?.attributes["data-composer-primary-state"] === "stop",
    });
  } catch (error) {
    const clientState = await readClientState(client).catch((stateError) => ({
      error: stateError instanceof Error ? stateError.message : String(stateError),
    }));
    const readiness = await readRendererReadiness(client).catch((readinessError) => ({
      error: readinessError instanceof Error ? readinessError.message : String(readinessError),
    }));
    throw new Error(
      `Native working session did not render Stop: ${
        error instanceof Error ? error.message : String(error)
      }; clientState=${JSON.stringify(clientState)}; readiness=${JSON.stringify(readiness)}`,
    );
  }
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
  const runningSidebarGeometry =
    runningState.sessionStatus === "running"
      ? await verifySidebarGeometry(client, viewportWidth, expectedEnvironmentIdentificationMode)
      : null;
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
    refreshedProvider,
    screenshot: {
      path: screenshotPath,
      bytes: statSync(screenshotPath).size,
      sha256: sha256(screenshotPath),
    },
    selectedState,
    runningState,
    runningSidebarGeometry,
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

async function verifyTerminalContextProviderSend({ child, client, projectId, timeoutMs }) {
  const modelSelection = { instanceId: "opencode", model: "opencode/big-pickle" };
  const refreshedConfig = await invokeConnector(client, "refreshProviders", {
    instanceId: modelSelection.instanceId,
  });
  const provider = refreshedConfig?.providers?.find(
    (candidate) => candidate.instanceId === modelSelection.instanceId,
  );
  if (provider?.status !== "ready" || provider.auth?.status !== "authenticated") {
    throw new Error(
      `OpenCode provider is not ready for terminal context acceptance: ${JSON.stringify(provider)}`,
    );
  }
  await invokeConnector(client, "setModelSelection", { selection: modelSelection });
  await tapSelector({ child, client, selector: ".sidebar-v2-new-thread", timeoutMs });
  const draft = await waitForClientState({
    child,
    client,
    timeoutMs,
    predicate: (state) =>
      typeof state?.draftThreadId === "string" && state.activeThreadId === state.draftThreadId,
  });
  const threadId = draft.draftThreadId;
  try {
    const modelFixture = await client.runCdp("Runtime.evaluate", {
      expression: `globalThis.__T3_LYNXTRON_MODEL_SELECTION_FIXTURE__?.(${JSON.stringify(
        modelSelection.instanceId,
      )}, ${JSON.stringify(modelSelection.model)}) ?? false`,
      returnByValue: true,
    });
    if (commandResult(modelFixture)?.value !== true) {
      throw new Error(`OpenCode model fixture was not applied: ${JSON.stringify(modelFixture)}`);
    }
    await waitForClientState({
      child,
      client,
      timeoutMs,
      predicate: (state) =>
        state?.activeThread?.modelSelection?.instanceId === modelSelection.instanceId &&
        state.activeThread.modelSelection.model === modelSelection.model,
    });
    await waitForMeasurement({
      child,
      client,
      selector: ".composer-primary-action",
      timeoutMs,
      predicate: (measurement) => measurement !== null,
    });
    await waitForRuntimeValue({
      child,
      client,
      expression:
        "[typeof globalThis.__T3_LYNXTRON_COMPOSER_INPUT_FIXTURE__, typeof globalThis.__T3_LYNXTRON_COMPOSER_TERMINAL_CONTEXT_FIXTURE__, typeof globalThis.__T3_LYNXTRON_COMPOSER_SEND_FIXTURE__].join(':')",
      predicate: (value) => value === "function:function:function",
      timeoutMs,
    });
    const promptToken = `T3_TERMINAL_CONTEXT_${Date.now()}`;
    const responseToken = `${promptToken}_ACCEPTED`;
    const prompt = `Reply exactly ${responseToken}. Do not use tools or modify files.`;
    const context = {
      id: `${promptToken}:1:1`,
      terminalId: promptToken,
      terminalLabel: "Terminal provider acceptance",
      lineStart: 1,
      lineEnd: 1,
      text: promptToken,
    };
    const inputResponse = await client.runCdp("Runtime.evaluate", {
      expression: `globalThis.__T3_LYNXTRON_COMPOSER_INPUT_FIXTURE__?.(${JSON.stringify(prompt)}) ?? false`,
      returnByValue: true,
    });
    const contextResponse = await client.runCdp("Runtime.evaluate", {
      expression: `globalThis.__T3_LYNXTRON_COMPOSER_TERMINAL_CONTEXT_FIXTURE__?.(${JSON.stringify(
        context,
      )}) ?? false`,
      returnByValue: true,
    });
    if (
      commandResult(inputResponse)?.value !== true ||
      commandResult(contextResponse)?.value !== true
    ) {
      throw new Error(
        `Terminal context acceptance fixtures were not applied: ${JSON.stringify({ inputResponse, contextResponse })}`,
      );
    }
    await waitForMeasurement({
      child,
      client,
      selector: ".composer-primary-action",
      timeoutMs,
      predicate: (measurement) => measurement?.attributes["data-composer-primary-state"] === "send",
    });
    const beforeSend = await readRendererReadiness(client);
    const sendResponse = await client.runCdp("Runtime.evaluate", {
      expression: "globalThis.__T3_LYNXTRON_COMPOSER_SEND_FIXTURE__?.() ?? false",
      awaitPromise: true,
      returnByValue: true,
    });
    if (commandResult(sendResponse)?.value !== true) {
      const diagnostics = await readComposerPrimaryActionDiagnostics(client);
      const state = await readClientState(client);
      throw new Error(
        `Terminal context acceptance send hook failed: ${JSON.stringify({ sendResponse, diagnostics, sessionError: state?.sessionError ?? null })}`,
      );
    }
    const completed = await waitForClientState({
      child,
      client,
      timeoutMs,
      predicate: (state) => {
        const user = state?.messages?.find(
          (message) =>
            message.role === "user" &&
            message.text.includes(promptToken) &&
            message.text.includes("<terminal_context>"),
        );
        const assistant = state?.messages?.find(
          (message) =>
            message.role === "assistant" &&
            message.streaming === false &&
            message.text.includes(responseToken),
        );
        return (
          state?.activeThreadId === threadId &&
          state?.threadIds?.includes(threadId) &&
          (state?.sessionStatus === "idle" || state?.sessionStatus === "ready") &&
          state?.activeTurnId == null &&
          user &&
          assistant
        );
      },
    });
    const afterSend = await readRendererReadiness(client);
    const canonicalUserMessage = completed.messages.find(
      (message) => message.role === "user" && message.text.includes(promptToken),
    );
    const canonicalAssistantMessage = completed.messages.find(
      (message) => message.role === "assistant" && message.text.includes(responseToken),
    );
    return {
      status: "pass",
      input:
        "test-only invocation of the same Native Composer handleSend callback; real OS click is a separate acceptance",
      threadId,
      provider: modelSelection,
      promptToken,
      canonicalUserMessage: {
        id: canonicalUserMessage.id,
        hasTerminalContextBlock: canonicalUserMessage.text.includes("<terminal_context>"),
        hasTerminalLine: canonicalUserMessage.text.includes(`1 | ${promptToken}`),
      },
      canonicalAssistantMessage: {
        id: canonicalAssistantMessage.id,
        responseToken,
      },
      sessionStatus: completed.sessionStatus,
      sequence: { before: beforeSend.lastSeq, after: afterSend.lastSeq },
    };
  } finally {
    await invokeConnector(client, "deleteThread", { threadId }).catch(() => undefined);
  }
}

async function verifyModelPickerFidelity({
  baseDir,
  child,
  client,
  devToolCli,
  expectedTheme,
  outputDirectory,
  timeoutMs,
  viewportHeight,
  viewportWidth,
}) {
  await selectSessionlessFixtureThread({
    baseDir,
    child,
    client,
    timeoutMs,
  });
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
  const dismissLayer = await waitForMeasurement({
    child,
    client,
    selector: ".model-picker-dismiss-layer",
    timeoutMs,
    predicate: (measurement) =>
      measurement !== null &&
      Math.abs((measurement.rect?.x ?? -1) - 0) <= 1 &&
      Math.abs((measurement.rect?.y ?? -1) - 0) <= 1 &&
      Math.abs((measurement.rect?.width ?? 0) - viewportWidth) <= 1 &&
      Math.abs((measurement.rect?.height ?? 0) - viewportHeight) <= 1 &&
      measurement.style.backgroundColor === "rgba(0,0,0,0)",
  });
  const expectedColors =
    expectedTheme === "light"
      ? {
          panel: "rgba(255,255,255,0.835294)",
          content: "rgba(250,250,250,0.4)",
          rail: "rgba(250,250,250,0.298039)",
        }
      : {
          panel: "rgba(25,25,25,0.835294)",
          content: "rgba(255,255,255,0.0156863)",
          rail: "rgba(255,255,255,0.0117647)",
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
    predicate: (measurement) =>
      measurement !== null &&
      ["Current checkout", "Local checkout"].includes(measurement.text.trim()),
  });
  const providerItems = await readSelectorMeasurements(client, ".model-picker-rail-item");
  if (
    Math.abs(rail.rect.width - 44) > 1 ||
    Math.abs(rail.rect.height - 344) > 1 ||
    Math.abs(content.rect.width - 314) > 1 ||
    Math.abs(content.rect.height - 344) > 1 ||
    providerItems.some(
      (item) =>
        Math.abs((item.rect?.width ?? 0) - 36) > 1 || Math.abs((item.rect?.height ?? 0) - 36) > 1,
    )
  ) {
    throw new Error(
      `Native model-picker provider rail geometry drifted: ${JSON.stringify({
        content,
        providerItems,
        rail,
      })}`,
    );
  }
  const beforeProvider = content.attributes["data-model-picker-selected-provider"];
  const targetProvider = providerItems.find(
    (item) =>
      item.attributes["data-model-picker-provider"] !== "favorites" &&
      item.attributes["data-model-picker-provider"] !== beforeProvider &&
      item.attributes["data-model-picker-provider-active"] !== "true" &&
      item.attributes["data-model-picker-provider-disabled"] !== "true",
  );
  const targetProviderId = targetProvider?.attributes["data-model-picker-provider"];
  if (!targetProvider || typeof targetProviderId !== "string") {
    throw new Error(
      `Native model picker has no enabled inactive provider rail: ${JSON.stringify(providerItems)}`,
    );
  }
  await tapSelectorByAttribute({
    attribute: "data-model-picker-provider",
    child,
    client,
    selector: ".model-picker-rail-item",
    timeoutMs,
    value: targetProviderId,
  });
  const switchedContent = await waitForMeasurement({
    child,
    client,
    selector: ".model-picker-content",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.attributes["data-model-picker-selected-provider"] === targetProviderId,
  });
  const switchedProvider = await waitForMeasurement({
    child,
    client,
    selector: ".model-picker-rail-item--active",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.attributes["data-model-picker-provider"] === targetProviderId,
  });
  const switchedRowsDeadline = Date.now() + timeoutMs;
  let switchedRows = [];
  while (Date.now() < switchedRowsDeadline) {
    switchedRows = await readSelectorMeasurements(client, ".model-picker-row");
    if (
      switchedRows.length > 0 &&
      switchedRows.every((measurement) =>
        measurement.attributes["data-model-picker-key"]?.startsWith(`${targetProviderId}:`),
      )
    ) {
      break;
    }
    await waitForChildExit(child, 50);
  }
  if (
    switchedRows.length === 0 ||
    switchedRows.some(
      (measurement) =>
        !measurement.attributes["data-model-picker-key"]?.startsWith(`${targetProviderId}:`),
    )
  ) {
    throw new Error(
      `Native model picker rows did not switch provider: ${JSON.stringify(switchedRows)}`,
    );
  }
  const setSearch = async (value) => {
    const response = await client.runCdp("Runtime.evaluate", {
      expression: `(() => {
        const setSearch = globalThis.__T3_LYNXTRON_MODEL_PICKER_SEARCH__;
        if (typeof setSearch !== "function") return false;
        setSearch(${JSON.stringify(value)});
        return true;
      })()`,
      returnByValue: true,
    });
    if (commandResult(response)?.value === false) {
      throw new Error("Native model-picker search probe is unavailable.");
    }
  };
  const readPickerState = async () => {
    const response = await client.runCdp("Runtime.evaluate", {
      expression: "globalThis.__T3_LYNXTRON_MODEL_PICKER_STATE__?.() ?? null",
      returnByValue: true,
    });
    const value = commandResult(response)?.value;
    return typeof value === "string" ? JSON.parse(value) : null;
  };
  const waitForPickerState = async (predicate) => {
    const deadline = Date.now() + timeoutMs;
    let latest = null;
    while (Date.now() < deadline) {
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error("Lynxtron exited before model-picker state reached its postcondition.");
      }
      latest = await readPickerState();
      if (predicate(latest)) return latest;
      await waitForChildExit(child, 50);
    }
    throw new Error(`Timed out waiting for model-picker state: ${JSON.stringify({ latest })}`);
  };
  await waitForMeasurement({
    child,
    client,
    selector: ".model-picker-panel",
    timeoutMs,
    predicate: (measurement) => measurement !== null,
  });
  const providerScreenshot = captureNativeScreenshot({
    client,
    devToolCli,
    outputDirectory,
    name: `native-model-picker-provider-${expectedTheme ?? "system"}.png`,
  });
  await setSearch("pickle");
  const queryState = await waitForPickerState(
    (state) =>
      state?.search === "pickle" &&
      JSON.stringify(state.filteredModelKeys) === JSON.stringify(["opencode:opencode/big-pickle"]),
  );
  const queryPanel = await waitForMeasurement({
    child,
    client,
    selector: ".model-picker-panel",
    timeoutMs,
    predicate: (measurement) => measurement !== null,
  });
  const queryContent = await waitForMeasurement({
    child,
    client,
    selector: ".model-picker-content",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.attributes.class?.includes("model-picker-content--with-rail") !== true,
  });
  const queryRows = await readSelectorMeasurements(client, ".model-picker-row");
  const queryRail = await readOptionalMeasurement(client, ".model-picker-rail-scroll");
  const queryList = await readOptionalMeasurement(client, ".picker-list");
  if (
    queryRail !== null ||
    queryRows.length !== 1 ||
    !queryRows[0]?.text.includes("Big Pickle") ||
    Math.abs(queryPanel.rect.width - 360) > 1 ||
    Math.abs(queryPanel.rect.height - 346) > 1 ||
    Math.abs(queryContent.rect.width - 358) > 1 ||
    Math.abs((queryList?.rect.width ?? 0) - 358) > 1 ||
    Math.abs((queryRows[0]?.rect.width ?? 0) - 349) > 1 ||
    Math.abs((queryRows[0]?.rect.height ?? 0) - 53) > 1
  ) {
    throw new Error(
      `Native model-picker query state drifted: ${JSON.stringify({
        queryContent,
        queryList,
        queryPanel,
        queryRail,
        queryRows,
        queryState,
      })}`,
    );
  }
  const queryScreenshot = captureNativeScreenshot({
    client,
    devToolCli,
    outputDirectory,
    name: `native-model-picker-query-${expectedTheme ?? "system"}.png`,
  });
  await setSearch("__t3_no_models__");
  const emptyState = await waitForPickerState(
    (state) => state?.search === "__t3_no_models__" && state.filteredModelKeys?.length === 0,
  );
  const emptyPanel = await waitForMeasurement({
    child,
    client,
    selector: ".model-picker-panel",
    timeoutMs,
    predicate: (measurement) => measurement !== null,
  });
  const emptyContent = await waitForMeasurement({
    child,
    client,
    selector: ".model-picker-content",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.attributes.class?.includes("model-picker-content--with-rail") !== true,
  });
  const empty = await waitForMeasurement({
    child,
    client,
    selector: ".model-picker-empty",
    timeoutMs,
    predicate: (measurement) => measurement?.text.trim() === "No models found",
  });
  const emptyRows = await readSelectorMeasurements(client, ".model-picker-row");
  const emptyRail = await readOptionalMeasurement(client, ".model-picker-rail-scroll");
  if (
    emptyRows.length !== 0 ||
    emptyRail !== null ||
    Math.abs(emptyPanel.rect.width - 360) > 1 ||
    Math.abs(emptyPanel.rect.height - 346) > 1 ||
    Math.abs(emptyContent.rect.width - 358) > 1 ||
    Math.abs(empty.rect.width - 342) > 1
  ) {
    throw new Error(
      `Native model-picker empty state drifted: ${JSON.stringify({
        empty,
        emptyContent,
        emptyPanel,
        emptyRail,
        emptyRows,
        emptyState,
      })}`,
    );
  }
  const emptyScreenshot = captureNativeScreenshot({
    client,
    devToolCli,
    outputDirectory,
    name: `native-model-picker-empty-${expectedTheme ?? "system"}.png`,
  });
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
      "DevTool Input.emulateTouchFromMouseEvent on measured Native trigger, provider rail, Close control, and outside dismiss layer",
    panel: {
      rect: panel.rect,
      attributes: panel.attributes,
    },
    dismissLayer: {
      rect: dismissLayer.rect,
      backgroundColor: dismissLayer.style.backgroundColor,
    },
    colors: resolvedColors,
    checkoutLabel: checkout.text.trim(),
    providerNavigation: {
      before: beforeProvider,
      target: targetProviderId,
      after: switchedContent.attributes["data-model-picker-selected-provider"],
      active: switchedProvider.attributes["data-model-picker-provider"],
      rows: switchedRows.map((row) => row.attributes["data-model-picker-key"]),
      pickerRemainedOpen: true,
    },
    providerGeometry: {
      rail: rail.rect,
      content: content.rect,
      items: providerItems.map((item) => ({
        provider: item.attributes["data-model-picker-provider"],
        rect: item.rect,
      })),
      firstRow: switchedRows[0]?.rect ?? null,
    },
    query: {
      value: queryState.search,
      filteredModelKeys: queryState.filteredModelKeys,
      panel: queryPanel.rect,
      content: queryContent.rect,
      list: queryList?.rect ?? null,
      rows: queryRows.map((row) => ({ rect: row.rect, text: row.text })),
      railHidden: queryRail === null,
      screenshot: queryScreenshot,
      physicalKeyboard: "pending-user-session",
    },
    empty: {
      value: emptyState.search,
      filteredModelKeys: emptyState.filteredModelKeys,
      panel: emptyPanel.rect,
      content: emptyContent.rect,
      empty: empty.rect,
      rowCount: emptyRows.length,
      railHidden: emptyRail === null,
      screenshot: emptyScreenshot,
      physicalKeyboard: "pending-user-session",
    },
    dismissed: {
      closeButton: true,
      outsideTap: true,
    },
    screenshot: providerScreenshot,
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

async function verifyCompletedTranscriptState({ child, client, devToolCli, outputDirectory }) {
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
  const timelineTopInset = Number.parseFloat(
    await readFirstSelectorStyleValue(client, ".timeline-list", "padding-top"),
  );
  const rowRoots = await readSelectorRects(client, ".timeline-row-root");
  const assistantRowRoot = rowRoots[1];
  const assistantRowMeasurement = await readOptionalMeasurement(
    client,
    ".transcript-assistant-row",
  );
  const assistantRow = assistantRowMeasurement?.rect;
  const assistantText = assistantRowMeasurement?.text.trim();
  const checkoutLabel = composer.typography.contextCheckout.text.trim();
  await waitWhileAlive(child, 1_000);
  const scrollToEnd = await readOptionalMeasurement(client, ".timeline-jump");
  const scrollToEndOpacity = await readFirstSelectorStyleValue(client, ".timeline-jump", "opacity");
  const scrollToEndHidden =
    scrollToEnd?.attributes["data-transcript-jump-visible"] === "false" &&
    Number.parseFloat(scrollToEndOpacity) === 0;
  const transcriptGeometryMatches =
    timelineHost &&
    timelineList &&
    Number.isFinite(timelineTopInset) &&
    rowRoots.length === 2 &&
    assistantRowRoot &&
    assistantRow &&
    Math.abs(rowRoots[0].y - (timelineList.y + timelineTopInset)) <= 1 &&
    Math.abs(assistantRowRoot.y - (rowRoots[0].y + rowRoots[0].height)) <= 1 &&
    Math.abs(assistantRowRoot.height - (assistantRow.height + 16)) <= 0.5;
  if (
    !transcriptGeometryMatches ||
    !scrollToEndHidden ||
    assistantText !== "fidelity loop complete" ||
    checkoutLabel !== "Local checkout"
  ) {
    throw new Error(
      `Canonical completed transcript drifted: ${JSON.stringify({
        timelineHost,
        timelineList,
        timelineTopInset,
        rowRoots,
        assistantRowRoot,
        assistantRow,
        assistantText,
        checkoutLabel,
        scrollToEnd,
        scrollToEndOpacity,
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
      scrollToEnd,
      scrollToEndOpacity,
    },
    screenshot,
  };
}

async function verifyFailedTranscriptState({
  child,
  client,
  devToolCli,
  outputDirectory,
  timeoutMs,
}) {
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
    Math.abs(rowRoots[0].y - (timelineHost.y + 20)) <= 1 &&
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
  await tapSelector({
    child,
    client,
    selector: ".thread-error-dismiss",
    timeoutMs,
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".thread-error-banner",
    timeoutMs,
    predicate: (measurement) => measurement === null,
  });
  const dismissedComposer = await readComposerOutcome(client, { allowMissingInteraction: true });
  const dismissedRows = await readSelectorRects(client, ".timeline-row-root");
  if (
    dismissedComposer.anchors.primaryAction.attributes["data-composer-primary-state"] !==
      "disabled" ||
    dismissedRows.length !== 2
  ) {
    throw new Error(
      `Native failed-thread dismiss changed session content: ${JSON.stringify({
        dismissedComposer,
        dismissedRows,
      })}`,
    );
  }
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
    dismissal: {
      localOnly: true,
      dismissed: true,
      retainedFailedRows: dismissedRows.length,
      retainedPrimaryState:
        dismissedComposer.anchors.primaryAction.attributes["data-composer-primary-state"] ?? null,
    },
  };
}

async function verifyApprovalTranscriptState({
  approvalFixture,
  client,
  devToolCli,
  expectedTheme,
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
  const materialMatches =
    expectedTheme !== "light" ||
    [actions[1], actions[2]].every(
      (action) =>
        action.measurement?.style.backgroundColor === "rgb(255,255,255)" &&
        action.measurement.style.borderBottomColor === "rgb(212,212,216)",
    );
  if (!stateMatches || !contentMatches || !geometryMatches || !materialMatches) {
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
        materialMatches,
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
    material: {
      outlineActions: [actions[1], actions[2]].map((action) => ({
        backgroundColor: action.measurement.style.backgroundColor,
        borderBottomColor: action.measurement.style.borderBottomColor,
      })),
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
  baseDir,
  child,
  client,
  devToolCli,
  outputDirectory,
  questionFixture,
  timeoutMs,
}) {
  const questions = questionFixture.activity.payload.questions;
  const question = questions[0];
  const multiStep = questionFixture.mode === "question-multi-step";
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
  if (multiStep) {
    const next = await waitForMeasurement({
      child,
      client,
      selector: ".composer-question-submit",
      timeoutMs,
      predicate: (measurement) =>
        measurement?.attributes["aria-disabled"] === "false" && measurement.text.trim() === "Next",
    });
    await tapMeasurement({ client, measurement: next });
    const secondQuestion = questions[1];
    const secondPending = await waitForMeasurement({
      child,
      client,
      selector: ".composer-pending-question",
      timeoutMs,
      predicate: (measurement) =>
        measurement?.text.includes(secondQuestion.header) &&
        measurement.text.includes(secondQuestion.question) &&
        /2\s*\/\s*2/u.test(measurement.text),
    });
    const previous = await waitForMeasurement({
      child,
      client,
      selector: ".composer-question-previous",
      timeoutMs,
      predicate: (measurement) =>
        measurement?.attributes["aria-label"] === "Previous question" &&
        measurement.attributes["aria-disabled"] === "false",
    });
    await tapMeasurement({ client, measurement: previous });
    await waitForMeasurement({
      child,
      client,
      selector: ".composer-pending-question",
      timeoutMs,
      predicate: (measurement) =>
        measurement?.text.includes(question.header) && /1\s*\/\s*2/u.test(measurement.text),
    });
    await waitForSelectorAttributeMeasurement({
      attribute: "data-question-option-selected",
      child,
      client,
      selector: ".composer-pending-question__option",
      timeoutMs,
      value: "true",
    });
    const nextAgain = await waitForMeasurement({
      child,
      client,
      selector: ".composer-question-submit",
      timeoutMs,
      predicate: (measurement) =>
        measurement?.attributes["aria-disabled"] === "false" && measurement.text.trim() === "Next",
    });
    await tapMeasurement({ client, measurement: nextAgain });
    await waitForMeasurement({
      child,
      client,
      selector: ".composer-pending-question",
      timeoutMs,
      predicate: (measurement) => measurement?.text.includes(secondQuestion.question),
    });
    for (const option of secondQuestion.options) {
      const optionMeasurement = (
        await readSelectorMeasurements(client, ".composer-pending-question__option")
      ).find((measurement) => measurement.text.includes(option.label));
      if (!optionMeasurement) {
        throw new Error(`Native multi-step question omitted option ${option.label}.`);
      }
      await tapMeasurement({ client, measurement: optionMeasurement });
      const selectedDeadline = Date.now() + timeoutMs;
      let selectedMeasurement = null;
      while (Date.now() < selectedDeadline) {
        if (child.exitCode !== null || child.signalCode !== null) {
          throw new Error(`Lynxtron exited before ${option.label} became selected.`);
        }
        selectedMeasurement = (
          await readSelectorMeasurements(client, ".composer-pending-question__option")
        ).find(
          (measurement) =>
            measurement.text.includes(option.label) &&
            measurement.attributes["data-question-option-selected"] === "true",
        );
        if (selectedMeasurement) break;
        await waitForChildExit(child, 100);
      }
      if (!selectedMeasurement) {
        throw new Error(`Native multi-step question did not select ${option.label}.`);
      }
    }
    const customAnswer = "All supported surfaces";
    const customAnswerResponse = await client.runCdp("Runtime.evaluate", {
      expression: `globalThis.__T3_LYNXTRON_COMPOSER_INPUT_FIXTURE__?.(${JSON.stringify(
        customAnswer,
      )}) ?? false`,
      returnByValue: true,
    });
    if (commandResult(customAnswerResponse)?.value !== true) {
      throw new Error("Native question custom-answer fixture hook was unavailable.");
    }
    for (const option of secondQuestion.options) {
      const clearedDeadline = Date.now() + timeoutMs;
      let clearedMeasurement = null;
      while (Date.now() < clearedDeadline) {
        if (child.exitCode !== null || child.signalCode !== null) {
          throw new Error(`Lynxtron exited before ${option.label} selection cleared.`);
        }
        clearedMeasurement = (
          await readSelectorMeasurements(client, ".composer-pending-question__option")
        ).find(
          (measurement) =>
            measurement.text.includes(option.label) &&
            measurement.attributes["data-question-option-selected"] === "false",
        );
        if (clearedMeasurement) break;
        await waitForChildExit(child, 100);
      }
      if (!clearedMeasurement) {
        throw new Error(`Native custom answer did not clear ${option.label}.`);
      }
    }
    const submit = await waitForMeasurement({
      child,
      client,
      selector: ".composer-question-submit",
      timeoutMs,
      predicate: (measurement) =>
        measurement?.attributes["aria-disabled"] === "false" &&
        measurement.text.trim() === "Submit",
    });
    const screenshot = captureNativeScreenshot({
      client,
      devToolCli,
      outputDirectory,
      name: "native-question-multi-step.png",
    });
    const beforeSubmit = await readRendererReadiness(client);
    await tapMeasurement({ client, measurement: submit });
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
    const expectedAnswers = {
      [question.id]: selectedLabel,
      [secondQuestion.id]: customAnswer,
    };
    const resolvedState = await waitForClientState({
      child,
      client,
      timeoutMs,
      predicate: (state) =>
        state?.activeThreadId === questionFixture.threadId &&
        state?.activeThread?.hasPendingUserInput === false &&
        state?.lastUserInputResponse?.threadId === questionFixture.threadId &&
        state.lastUserInputResponse.requestId === questionFixture.activity.payload.requestId &&
        JSON.stringify(state.lastUserInputResponse.answers) === JSON.stringify(expectedAnswers),
    });
    const resolvedAnswers = readResolvedUserInputAnswers(
      baseDir,
      questionFixture.activity.payload.requestId,
    );
    const userInputReceipt = resolvedState.userInputReceipts?.find(
      (receipt) => receipt.requestId === questionFixture.activity.payload.requestId,
    );
    if (
      resolvedAnswers !== null &&
      JSON.stringify(resolvedAnswers) !== JSON.stringify(expectedAnswers)
    ) {
      throw new Error(
        `Native multi-step answers did not persist canonically: ${JSON.stringify({
          expectedAnswers,
          resolvedAnswers,
        })}`,
      );
    }
    if (
      resolvedAnswers === null &&
      userInputReceipt?.kind !== "provider.user-input.respond.failed"
    ) {
      throw new Error(
        `Native multi-step response reached neither provider resolution nor a stale-fixture receipt: ${JSON.stringify(
          {
            expectedAnswers,
            lastUserInputResponse: resolvedState.lastUserInputResponse,
            userInputReceipt,
          },
        )}`,
      );
    }
    return {
      status: "pass",
      fixture: {
        threadId: questionFixture.threadId,
        requestId: questionFixture.activity.payload.requestId,
        activeTurnId: questionFixture.activeTurnId,
        questionIds: questions.map((entry) => entry.id),
      },
      content: {
        firstQuestion: question.question,
        secondQuestion: secondQuestion.question,
        selectedLabel,
        multiSelectLabels: secondQuestion.options.map((option) => option.label),
        customAnswer,
        submitLabel: submit.text.trim(),
      },
      navigation: {
        next: next.rect,
        secondQuestion: secondPending.rect,
        previous: previous.rect,
        nextAgain: nextAgain.rect,
      },
      sequence: {
        beforeSubmit: beforeSubmit.lastSeq,
        afterSubmit: afterSubmit.lastSeq,
      },
      bridgeResponse: resolvedState.lastUserInputResponse,
      providerResolution:
        resolvedAnswers === null
          ? {
              status: "stale-fixture",
              receipt: userInputReceipt,
            }
          : {
              status: "resolved",
              answers: resolvedAnswers,
            },
      screenshot,
    };
  }
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
  const clientState = await waitForClientState({
    child,
    client,
    timeoutMs,
    predicate: (state) =>
      state?.activeThreadId === reviewFixture.threadId &&
      state?.latestTurn?.state === "completed" &&
      state?.activeThread?.modelSelection?.instanceId === reviewFixture.modelSelection.instanceId &&
      state?.activeThread?.modelSelection?.model === reviewFixture.modelSelection.model,
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
  const checkpointStatus = await readOptionalMeasurement(client, ".turn-diff-card__status");
  const checkpointHint = await readOptionalMeasurement(client, ".turn-diff-card__hint");
  const checkpointOpenLabel = await readOptionalMeasurement(client, ".turn-diff-card__open-label");
  const checkpointFileName = await readOptionalMeasurement(client, ".file-tree-row__name");
  const checkpointFileStat = await readOptionalMeasurement(client, ".file-tree-row__stat");
  const checkpointTypography = {
    status: {
      fontSize: await readFirstSelectorStyleValue(client, ".turn-diff-card__status", "font-size"),
      lineHeight: await readFirstSelectorStyleValue(
        client,
        ".turn-diff-card__status",
        "line-height",
      ),
    },
    hint: {
      fontSize: await readFirstSelectorStyleValue(client, ".turn-diff-card__hint", "font-size"),
      lineHeight: await readFirstSelectorStyleValue(client, ".turn-diff-card__hint", "line-height"),
    },
    openLabel: {
      fontSize: await readFirstSelectorStyleValue(
        client,
        ".turn-diff-card__open-label",
        "font-size",
      ),
      lineHeight: await readFirstSelectorStyleValue(
        client,
        ".turn-diff-card__open-label",
        "line-height",
      ),
    },
    fileName: {
      fontSize: await readFirstSelectorStyleValue(client, ".file-tree-row__name", "font-size"),
      lineHeight: await readFirstSelectorStyleValue(client, ".file-tree-row__name", "line-height"),
    },
    fileStat: {
      fontSize: await readFirstSelectorStyleValue(client, ".file-tree-row__stat", "font-size"),
      lineHeight: await readFirstSelectorStyleValue(client, ".file-tree-row__stat", "line-height"),
    },
  };
  const checkpointTypographyMatches =
    checkpointStatus?.text.trim() === "1 changed file" &&
    checkpointHint?.text.trim() === "Hide files" &&
    checkpointOpenLabel?.text.trim() === "Open diff" &&
    checkpointFileName?.text.trim() === checkpoint.files[0].path &&
    checkpointFileStat?.text.replaceAll(" ", "") === "+1−1" &&
    checkpointTypography.status.fontSize === "12px" &&
    checkpointTypography.status.lineHeight === "16px" &&
    checkpointTypography.hint.fontSize === "11px" &&
    checkpointTypography.hint.lineHeight === "16px" &&
    checkpointTypography.openLabel.fontSize === "12px" &&
    checkpointTypography.openLabel.lineHeight === "16px" &&
    checkpointTypography.fileName.fontSize === "11px" &&
    checkpointTypography.fileName.lineHeight === "16px" &&
    checkpointTypography.fileStat.fontSize === "10px" &&
    checkpointTypography.fileStat.lineHeight === "16px";
  const canonicalModelLabel = await waitForMeasurement({
    child,
    client,
    selector: ".composer-toolbar-control--model",
    timeoutMs,
    predicate: (measurement) => measurement?.text.trim() === "GPT-5.6-Sol",
  });
  if (!checkpointTypographyMatches || canonicalModelLabel.text.trim() !== "GPT-5.6-Sol") {
    throw new Error(
      `Review checkpoint typography drifted: ${JSON.stringify({
        checkpointStatus,
        checkpointHint,
        checkpointOpenLabel,
        checkpointFileName,
        checkpointFileStat,
        checkpointTypography,
        canonicalModelLabel,
      })}`,
    );
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
      modelSelection: reviewFixture.modelSelection,
    },
    clientState: {
      activeThreadId: clientState.activeThreadId,
      latestTurnState: clientState.latestTurn.state,
      modelSelection: clientState.activeThread.modelSelection,
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
      typography: checkpointTypography,
      modelLabel: canonicalModelLabel.text.trim(),
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

async function verifyRightPanelAddMenu({
  child,
  client,
  devToolCli,
  height,
  outputDirectory,
  timeoutMs,
  width,
}) {
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
  }
  await tapSelector({
    child,
    client,
    selector: ".topbar__toggle--terminal",
    timeoutMs,
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".right-panel",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.attributes["data-right-panel-active-kind"] === "terminal",
  });

  const openMenu = async () => {
    await tapSelector({
      child,
      client,
      selector: ".right-panel__add-btn",
      timeoutMs,
    });
    return waitForMeasurement({
      child,
      client,
      selector: ".right-panel__add-menu",
      timeoutMs,
      predicate: (measurement) =>
        Math.abs((measurement?.rect.width ?? 0) - 176) <= 0.5 &&
        Math.abs((measurement?.rect.height ?? 0) - 122) <= 0.5,
    });
  };

  const menu = await openMenu();
  const dismissLayer = await waitForMeasurement({
    child,
    client,
    selector: ".right-panel__add-menu-dismiss",
    timeoutMs,
    predicate: (measurement) =>
      Math.abs((measurement?.rect.width ?? 0) - width) <= 1 &&
      Math.abs((measurement?.rect.height ?? 0) - height) <= 1,
  });
  const rows = await readSelectorMeasurements(client, ".right-panel__add-item");
  const expectedRows = [
    { kind: "browser", label: "Browser" },
    { kind: "terminal", label: "Terminal" },
    { kind: "files", label: "Files" },
    { kind: "diff", label: "Diff" },
  ];
  if (
    rows.length !== expectedRows.length ||
    rows.some(
      (row, index) =>
        row.attributes["data-right-panel-add-kind"] !== expectedRows[index].kind ||
        row.text.trim() !== expectedRows[index].label ||
        Math.abs((row.rect?.width ?? 0) - 166) > 0.5 ||
        Math.abs((row.rect?.height ?? 0) - 28) > 0.5,
    )
  ) {
    throw new Error(`Native right-panel add menu rows drifted: ${JSON.stringify(rows)}`);
  }
  const screenshot = captureNativeScreenshot({
    client,
    devToolCli,
    outputDirectory,
    name: "native-right-panel-add-menu.png",
  });

  await tapSelector({
    child,
    client,
    point: "bottom-right",
    selector: ".right-panel__add-menu-dismiss",
    timeoutMs,
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".right-panel__add-menu",
    timeoutMs,
    predicate: (measurement) => measurement === null,
  });

  await openMenu();
  await tapSelectorByAttribute({
    attribute: "data-right-panel-add-kind",
    child,
    client,
    selector: ".right-panel__add-item",
    timeoutMs,
    value: "files",
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".right-panel",
    timeoutMs,
    predicate: (measurement) => measurement?.attributes["data-right-panel-active-kind"] === "files",
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".right-panel__add-menu",
    timeoutMs,
    predicate: (measurement) => measurement === null,
  });

  await openMenu();
  await tapSelectorByAttribute({
    attribute: "data-right-panel-add-kind",
    child,
    client,
    selector: ".right-panel__add-item",
    timeoutMs,
    value: "terminal",
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
  await waitForMeasurement({
    child,
    client,
    selector: ".right-panel__add-menu",
    timeoutMs,
    predicate: (measurement) => measurement === null,
  });

  return {
    status: "pass",
    input: "DevTool touch on measured add-menu trigger, dismiss layer, Files row, and Terminal row",
    menu: menu.rect,
    dismissLayer: dismissLayer.rect,
    rows: rows.map((row) => ({
      kind: row.attributes["data-right-panel-add-kind"],
      label: row.text.trim(),
      rect: row.rect,
    })),
    screenshot,
    dismissed: true,
    filesSelected: true,
    terminalSelected: true,
    terminal: {
      panel: terminalPanel.rect,
      placeholder: terminal.rect,
    },
  };
}

async function verifyDiffScopeMenu({
  child,
  client,
  devToolCli,
  height,
  outputDirectory,
  reviewFixture,
  timeoutMs,
  width,
}) {
  const checkpoint = reviewFixture.checkpoint;
  const expectedFile = checkpoint.files[0];
  await waitForClientState({
    child,
    client,
    timeoutMs,
    predicate: (state) =>
      state?.activeThreadId === reviewFixture.threadId && state?.latestTurn?.state === "completed",
  });
  await waitForMeasurement({
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
  await waitForMeasurement({
    child,
    client,
    selector: ".right-panel",
    timeoutMs,
    predicate: (measurement) => measurement?.attributes["data-right-panel-active-kind"] === "diff",
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".diff-code-file",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.attributes["data-review-file-path"] === expectedFile.path &&
      measurement.text.includes("original review fixture") &&
      measurement.text.includes("updated by T3 review fixture"),
  });

  const openMenu = async () => {
    await tapSelector({
      child,
      client,
      selector: ".diff-panel-header__scope",
      timeoutMs,
    });
    return waitForMeasurement({
      child,
      client,
      selector: ".diff-panel-header__scope-menu",
      timeoutMs,
      predicate: (measurement) =>
        Math.abs((measurement?.rect.width ?? 0) - 240) <= 0.5 &&
        Math.abs((measurement?.rect.height ?? 0) - 122) <= 0.5,
    });
  };

  const trigger = await waitForMeasurement({
    child,
    client,
    selector: ".diff-panel-header__scope",
    timeoutMs,
    predicate: (measurement) => measurement?.text.trim() === "Latest turn",
  });
  const menu = await openMenu();
  const dismissLayer = await waitForMeasurement({
    child,
    client,
    selector: ".diff-panel-header__scope-dismiss",
    timeoutMs,
    predicate: (measurement) =>
      Math.abs((measurement?.rect.width ?? 0) - width) <= 1 &&
      Math.abs((measurement?.rect.height ?? 0) - height) <= 1,
  });
  const rows = await readSelectorMeasurements(client, ".diff-panel-header__scope-item");
  const rowLabels = await readSelectorMeasurements(client, ".diff-panel-header__scope-item-label");
  const expectedRows = [
    { scope: "working-tree", label: "Working tree" },
    { scope: "branch", label: "Branch changes" },
    { scope: "latest-turn", label: "Latest turn" },
    { scope: "turn", label: "Turn" },
  ];
  if (
    rows.length !== expectedRows.length ||
    rowLabels.length !== expectedRows.length ||
    rows.some(
      (row, index) =>
        row.attributes["data-diff-scope"] !== expectedRows[index].scope ||
        Math.abs((row.rect?.width ?? 0) - 230) > 0.5 ||
        Math.abs((row.rect?.height ?? 0) - 28) > 0.5,
    ) ||
    rowLabels.some(
      (label, index) =>
        (label.text.trim() || label.attributes.text?.trim()) !== expectedRows[index].label,
    )
  ) {
    throw new Error(`Native Diff scope menu rows drifted: ${JSON.stringify({ rows, rowLabels })}`);
  }
  const screenshot = captureNativeScreenshot({
    client,
    devToolCli,
    outputDirectory,
    name: "native-diff-scope-menu.png",
  });

  await tapSelector({
    child,
    client,
    point: "bottom-right",
    selector: ".diff-panel-header__scope-dismiss",
    timeoutMs,
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".diff-panel-header__scope-menu",
    timeoutMs,
    predicate: (measurement) => measurement === null,
  });

  await openMenu();
  await tapSelectorByAttribute({
    attribute: "data-diff-scope",
    child,
    client,
    selector: ".diff-panel-header__scope-item",
    timeoutMs,
    value: "working-tree",
  });
  const workingTreeTrigger = await waitForMeasurement({
    child,
    client,
    selector: ".diff-panel-header__scope",
    timeoutMs,
    predicate: (measurement) => measurement?.text.trim() === "Working tree",
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".diff-panel-header__scope-menu",
    timeoutMs,
    predicate: (measurement) => measurement === null,
  });

  return {
    status: "pass",
    input:
      "DevTool touch on measured checkpoint Open diff, scope trigger, fullscreen dismiss layer, and Working tree row",
    fixture: {
      threadId: reviewFixture.threadId,
      turnId: checkpoint.turnId,
      file: expectedFile,
    },
    trigger: {
      initial: trigger.rect,
      initialLabel: "Latest turn",
      selected: workingTreeTrigger.rect,
      selectedLabel: "Working tree",
    },
    menu: menu.rect,
    dismissLayer: dismissLayer.rect,
    rows: rows.map((row, index) => ({
      scope: row.attributes["data-diff-scope"],
      label: rowLabels[index]?.text.trim() || rowLabels[index]?.attributes.text?.trim() || "",
      rect: row.rect,
    })),
    screenshot,
    dismissed: true,
    workingTreeSelected: true,
  };
}

async function verifyFilesBrowser({
  child,
  client,
  devToolCli,
  height,
  outputDirectory,
  projectCwd,
  timeoutMs,
  verifyFileEditingSave,
  fileEditorRelativePath,
  verifyFileSheetBack,
  verifyResponsiveSidebarFooterOnly,
  verifyResponsiveSettledBanner,
  width,
}) {
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
  }
  await tapSelector({
    child,
    client,
    selector: ".topbar__toggle--terminal",
    timeoutMs,
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".right-panel",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.attributes["data-right-panel-active-kind"] === "terminal",
  });
  await tapSelector({
    child,
    client,
    selector: ".right-panel__add-btn",
    timeoutMs,
  });
  await waitForSelectorAttributeMeasurement({
    attribute: "data-right-panel-add-kind",
    child,
    client,
    selector: ".right-panel__add-item",
    timeoutMs,
    value: "files",
  });
  await tapSelectorByAttribute({
    attribute: "data-right-panel-add-kind",
    child,
    client,
    selector: ".right-panel__add-item",
    timeoutMs,
    value: "files",
  });
  const panel = await waitForMeasurement({
    child,
    client,
    selector: ".right-panel",
    timeoutMs,
    predicate: (measurement) => measurement?.attributes["data-right-panel-active-kind"] === "files",
  });
  const responsiveSidebarFooter =
    width === 1280 && height === 820
      ? { mode: "authority-viewport" }
      : await (async () => {
          const [footer, settingsRow, settingsAuthority, settingsRowBoxSizing] = await Promise.all([
            readOptionalMeasurement(client, ".sidebar-footer"),
            readOptionalMeasurement(client, ".sidebar-settings-row"),
            readOptionalMeasurement(client, ".sidebar-settings-authority"),
            readFirstSelectorStyleValue(client, ".sidebar-settings-row", "box-sizing"),
          ]);
          if (
            !measurementVisible(footer) &&
            !measurementVisible(settingsRow) &&
            !measurementVisible(settingsAuthority)
          ) {
            return {
              mode: "sidebar-hidden",
              footer: null,
              settingsRow: null,
              settingsRowBoxSizing: null,
              settingsAuthorityHidden: true,
            };
          }
          if (
            !footer ||
            !settingsRow ||
            Math.abs(footer.rect.height - 48) > 0.5 ||
            Math.abs(settingsRow.rect.height - 32) > 0.5 ||
            settingsRowBoxSizing !== "border-box" ||
            settingsRow.rect.y < footer.rect.y ||
            settingsRow.rect.y + settingsRow.rect.height >
              footer.rect.y + footer.rect.height + 0.5 ||
            measurementVisible(settingsAuthority)
          ) {
            throw new Error(
              `Native responsive Sidebar footer drifted: ${JSON.stringify({
                footer,
                settingsAuthority,
                settingsRow,
                settingsRowBoxSizing,
              })}`,
            );
          }
          return {
            mode: "responsive",
            footer: footer.rect,
            settingsRow: settingsRow.rect,
            settingsRowBoxSizing,
            settingsAuthorityHidden: true,
          };
        })();
  const toolbar = await waitForMeasurement({
    child,
    client,
    selector: ".files-panel__toolbar",
    timeoutMs,
    predicate: (measurement) => Math.abs((measurement?.rect.height ?? 0) - 40) <= 0.5,
  });
  const refresh = await waitForMeasurement({
    child,
    client,
    selector: ".files-panel__refresh",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.attributes["aria-label"] === "Refresh workspace files" &&
      Math.abs((measurement?.rect.width ?? 0) - 28) <= 0.5 &&
      Math.abs((measurement?.rect.height ?? 0) - 28) <= 0.5,
  });
  const search = await waitForMeasurement({
    child,
    client,
    selector: ".files-panel__search-input",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.attributes.placeholder === "Search files" &&
      Math.abs((measurement?.rect.height ?? 0) - 28) <= 0.5,
  });
  const browser = await waitForMeasurement({
    child,
    client,
    selector: ".files-panel__browser",
    timeoutMs,
    predicate: (measurement) => (measurement?.rect.height ?? 0) > 0,
  });
  const row = await waitForMeasurement({
    child,
    client,
    selector: ".files-panel .file-tree-row",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.text.trim().length > 0 && Math.abs((measurement?.rect.height ?? 0) - 24) <= 0.5,
  });
  const [rowTopLeftRadius, rowTopRightRadius, rowBottomRightRadius, rowBottomLeftRadius] =
    await Promise.all([
      readFirstSelectorStyleValue(client, ".files-panel .file-tree-row", "border-top-left-radius"),
      readFirstSelectorStyleValue(client, ".files-panel .file-tree-row", "border-top-right-radius"),
      readFirstSelectorStyleValue(
        client,
        ".files-panel .file-tree-row",
        "border-bottom-right-radius",
      ),
      readFirstSelectorStyleValue(
        client,
        ".files-panel .file-tree-row",
        "border-bottom-left-radius",
      ),
    ]);
  const [rowFontFamily, rowFontSize] = await Promise.all([
    readFirstSelectorStyleValue(client, ".files-panel .file-tree-row__name", "font-family"),
    readFirstSelectorStyleValue(client, ".files-panel .file-tree-row__name", "font-size"),
  ]);
  const rowRadii = [rowTopLeftRadius, rowTopRightRadius, rowBottomRightRadius, rowBottomLeftRadius];
  if (
    rowRadii.some((radius) => radius !== "5px") ||
    rowFontSize !== "12px" ||
    typeof rowFontFamily !== "string" ||
    rowFontFamily.length === 0
  ) {
    throw new Error(
      `Native Files row styling drifted: ${JSON.stringify({
        rowRadii,
        rowFontFamily,
        rowFontSize,
      })}`,
    );
  }
  const treeScreenshot = captureNativeScreenshot({
    client,
    devToolCli,
    outputDirectory,
    name: "native-files-browser.png",
  });
  let responsiveSettledBanner;
  if (verifyResponsiveSettledBanner) {
    const [banner, copy, action, composer] = await Promise.all([
      readOptionalMeasurement(client, ".composer-settled-banner"),
      readOptionalMeasurement(client, ".composer-settled-banner__copy"),
      readOptionalMeasurement(client, ".composer-settled-banner__action"),
      readOptionalMeasurement(client, ".composer-frame"),
    ]);
    if (
      !banner ||
      !copy ||
      !action ||
      !composer ||
      banner.rect.y + banner.rect.height > composer.rect.y - 7.5 ||
      copy.rect.y < banner.rect.y ||
      copy.rect.y + copy.rect.height > banner.rect.y + banner.rect.height ||
      Math.abs(action.rect.width - 70) > 0.5 ||
      Math.abs(action.rect.height - 24) > 0.5 ||
      action.rect.x < banner.rect.x ||
      action.rect.x + action.rect.width > banner.rect.x + banner.rect.width
    ) {
      throw new Error(
        `Native responsive settled banner drifted: ${JSON.stringify({
          action,
          banner,
          composer,
          copy,
        })}`,
      );
    }
    responsiveSettledBanner = {
      banner: banner.rect,
      copy: copy.rect,
      action: action.rect,
      composer: composer.rect,
      composerGap: composer.rect.y - (banner.rect.y + banner.rect.height),
    };
  }
  const browserEvidence = {
    status: "pass",
    input: "DevTool touch on measured right-panel controls; search typing pending-user-session",
    panel: panel.rect,
    responsiveSidebarFooter,
    responsiveSettledBanner,
    toolbar: toolbar.rect,
    refresh: refresh.rect,
    search: {
      rect: search.rect,
      placeholder: search.attributes.placeholder,
      filtering: "source-contract",
      typing: "pending-user-session",
    },
    browser: browser.rect,
    firstVisibleRow: {
      rect: row.rect,
      text: row.text,
      borderRadii: rowRadii,
      fontFamily: rowFontFamily,
      fontSize: rowFontSize,
    },
  };
  if (verifyResponsiveSidebarFooterOnly) {
    return {
      ...browserEvidence,
      fileSelection: "not-required",
      fileSheetBack: undefined,
      screenshots: {
        tree: treeScreenshot,
      },
    };
  }
  const fileRow = await waitForMeasurement({
    child,
    client,
    selector: ".files-panel .file-tree-row--file",
    timeoutMs,
    predicate: (measurement) => measurement?.text.trim().length > 0,
  });
  await tapSelector({
    child,
    client,
    selector: ".files-panel .file-tree-row--file",
    timeoutMs,
  });
  const filePanel = await waitForMeasurement({
    child,
    client,
    selector: ".right-panel",
    timeoutMs,
    predicate: (measurement) => measurement?.attributes["data-right-panel-active-kind"] === "file",
  });
  const filePath = await waitForMeasurement({
    child,
    client,
    selector: ".file-panel__breadcrumb--current",
    timeoutMs,
    predicate: (measurement) => measurement?.text.trim().length > 0,
  });
  const editorPreview = await waitForMeasurement({
    child,
    client,
    selector: ".file-editor-preview",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.attributes["data-file-editor-mode"] === "preview" &&
      (measurement?.rect.height ?? 0) > 0,
  });
  const editorLine = await waitForMeasurement({
    child,
    client,
    selector: ".file-editor-line",
    timeoutMs,
    predicate: (measurement) => (measurement?.rect.height ?? 0) > 0,
  });
  const editorLineNumber = await waitForMeasurement({
    child,
    client,
    selector: ".file-editor-line__number",
    timeoutMs,
    predicate: (measurement) => measurement?.text.trim() === "1",
  });
  const editorTokens = await readSelectorMeasurements(client, ".file-editor-token");
  const [editorFontFamily, editorFontSize, editorLineHeight, editorGutterWidth] = await Promise.all(
    [
      readFirstSelectorStyleValue(client, ".file-editor-line__content", "font-family"),
      readFirstSelectorStyleValue(client, ".file-editor-line__content", "font-size"),
      readFirstSelectorStyleValue(client, ".file-editor-line__content", "line-height"),
      readFirstSelectorStyleValue(client, ".file-editor-line__number", "width"),
    ],
  );
  if (
    typeof editorFontFamily !== "string" ||
    !editorFontFamily.includes("SF Mono") ||
    editorFontSize !== "13px" ||
    editorLineHeight !== "20px" ||
    Math.abs(editorLineNumber.rect.width - 49) > 0.5 ||
    editorTokens.length === 0 ||
    new Set(
      editorTokens
        .map(({ attributes }) => attributes.class)
        .filter((className) => className?.includes("file-editor-token--")),
    ).size < 2
  ) {
    throw new Error(
      `Native file editor typography drifted: ${JSON.stringify({
        editorFontFamily,
        editorFontSize,
        editorGutterWidth,
        editorLineHeight,
        editorLineNumber: editorLineNumber.rect,
        editorTokens: editorTokens.slice(0, 12),
      })}`,
    );
  }
  const [explorer, legacyInlinePreview] = await Promise.all([
    readOptionalMeasurement(client, ".file-panel__explorer"),
    readOptionalMeasurement(client, ".files-panel__preview"),
  ]);
  const panelMode = filePanel.attributes["data-right-panel-mode"];
  const explorerVisible = measurementVisible(explorer);
  const detailLayout = projectFileDetailLayout(filePanel.rect.width);
  if (
    measurementVisible(legacyInlinePreview) ||
    (detailLayout.showExplorer &&
      (!explorerVisible || Math.abs((explorer?.rect.width ?? 0) - 256) > 0.5)) ||
    (!detailLayout.showExplorer && explorerVisible)
  ) {
    throw new Error(
      `Native file detail explorer ownership drifted: ${JSON.stringify({
        explorer,
        explorerVisible,
        detailLayout,
        filePanel,
        filePath,
        legacyInlinePreview,
        panelMode,
      })}`,
    );
  }
  const fileScreenshot = captureNativeScreenshot({
    client,
    devToolCli,
    outputDirectory,
    name: "native-file-surface.png",
  });
  let fileEditingSave;
  if (verifyFileEditingSave) {
    const targetPath = path.resolve(projectCwd, fileEditorRelativePath);
    const relativeTarget = path.relative(projectCwd, targetPath);
    if (
      relativeTarget.startsWith(`..${path.sep}`) ||
      relativeTarget === ".." ||
      path.isAbsolute(relativeTarget) ||
      filePath.text.trim() !== path.basename(fileEditorRelativePath)
    ) {
      throw new Error(
        `Native file editor target escaped its disposable workspace: ${JSON.stringify({
          fileEditorRelativePath,
          filePath: filePath.text.trim(),
          projectCwd,
          relativeTarget,
          targetPath,
        })}`,
      );
    }
    const initialContents = readFileSync(targetPath, "utf8");
    const sentinel = "\n// Native file save fidelity\n";
    if (initialContents.includes(sentinel.trim())) {
      throw new Error("Native file editor fixture already contains the save sentinel.");
    }
    const expectedContents = `${initialContents}${sentinel}`;
    const expectedRevision = fileContentRevision(expectedContents);
    const originalMode = statSync(targetPath).mode & 0o777;
    let permissionsRestored = false;
    try {
      chmodSync(targetPath, 0o444);
      await tapSelector({
        child,
        client,
        selector: ".file-editor-preview",
        timeoutMs,
      });
      const editor = await waitForMeasurement({
        child,
        client,
        selector: ".files-panel__editor",
        timeoutMs,
        predicate: (measurement) =>
          measurement?.attributes["data-file-editor-mode"] === "editing" &&
          (measurement?.rect.height ?? 0) > 0,
      });
      const mutationResponse = await client.runCdp("Runtime.evaluate", {
        expression: `globalThis.__T3_LYNXTRON_FILE_EDITOR_PROBE__?.change(${JSON.stringify(
          expectedContents,
        )}) ?? false`,
        returnByValue: true,
      });
      if (commandResult(mutationResponse)?.value !== true) {
        throw new Error(
          `Native file editor test seam did not accept contents: ${JSON.stringify(mutationResponse)}`,
        );
      }
      const pending = await waitForMeasurement({
        child,
        client,
        selector: ".file-panel__editor-surface",
        timeoutMs,
        predicate: (measurement) =>
          measurement?.attributes["data-file-save-status"] === "pending" &&
          measurement?.attributes["data-file-content-revision"] === expectedRevision,
      });
      const failure = await waitForMeasurement({
        child,
        client,
        selector: ".file-panel__statusbar",
        timeoutMs,
        predicate: (measurement) =>
          measurement?.attributes["data-file-save-error"] === "true" &&
          measurement?.text.includes("Retry save") &&
          Math.abs((measurement?.rect.height ?? 0) - 33) <= 0.5,
      });
      const retry = await waitForMeasurement({
        child,
        client,
        selector: "[data-file-save-retry]",
        timeoutMs,
        predicate: (measurement) =>
          measurement?.text.trim() === "Retry save" &&
          Math.abs((measurement?.rect.width ?? 0) - 75) <= 0.5 &&
          Math.abs((measurement?.rect.height ?? 0) - 24) <= 0.5,
      });
      const failureScreenshot = captureNativeScreenshot({
        client,
        devToolCli,
        outputDirectory,
        name: "native-file-save-error.png",
      });
      if (readFileSync(targetPath, "utf8") !== initialContents) {
        throw new Error("Failed Native file write changed disk contents before Retry.");
      }

      chmodSync(targetPath, originalMode);
      permissionsRestored = true;
      await tapSelector({
        child,
        client,
        selector: "[data-file-save-retry]",
        timeoutMs,
      });
      const persistedContents = await waitForFileContents({
        child,
        filePath: targetPath,
        predicate: (contents) => contents === expectedContents,
        timeoutMs,
      });
      const confirmed = await waitForMeasurement({
        child,
        client,
        selector: ".file-panel__editor-surface",
        timeoutMs,
        predicate: (measurement) =>
          measurement?.attributes["data-file-save-status"] === "saved" &&
          measurement?.attributes["data-file-content-revision"] === expectedRevision,
      });
      await waitForMeasurement({
        child,
        client,
        selector: ".file-panel__statusbar",
        timeoutMs,
        predicate: (measurement) => measurement === null,
      });

      await tapSelector({
        child,
        client,
        selector: ".file-panel__back",
        timeoutMs,
      });
      await waitForMeasurement({
        child,
        client,
        selector: ".files-panel__browser",
        timeoutMs,
        predicate: (measurement) => (measurement?.rect.height ?? 0) > 0,
      });
      await tapSelector({
        child,
        client,
        selector: ".files-panel .file-tree-row--file",
        timeoutMs,
      });
      const reopened = await waitForMeasurement({
        child,
        client,
        selector: ".file-panel__editor-surface",
        timeoutMs,
        predicate: (measurement) =>
          measurement?.attributes["data-file-save-status"] === "saved" &&
          measurement?.attributes["data-file-content-revision"] === expectedRevision,
      });
      const reopenedPreview = await waitForMeasurement({
        child,
        client,
        selector: ".file-editor-preview",
        timeoutMs,
        predicate: (measurement) => measurement?.attributes["data-file-editor-mode"] === "preview",
      });
      fileEditingSave = {
        status: "pass",
        target: {
          relativePath: fileEditorRelativePath,
          initialRevision: fileContentRevision(initialContents),
          expectedRevision,
          persistedRevision: fileContentRevision(persistedContents),
        },
        input: {
          enterEditing: "DevTool touch on measured preview",
          contentMutation:
            "test-only handler seam through the shipping React input callback; not physical keyboard evidence",
          retry: "DevTool touch on measured Retry save control",
          backAndReopen: "DevTool touch on measured Back and file-row controls",
          physicalKeyboard: "pending-user-session",
        },
        editor: editor.rect,
        pending: {
          surface: pending.rect,
          revision: pending.attributes["data-file-content-revision"],
        },
        failure: {
          statusbar: failure.rect,
          text: failure.text.trim(),
          retry: retry.rect,
          diskUnchanged: true,
          screenshot: failureScreenshot,
        },
        recovery: {
          surface: confirmed.rect,
          errorDismissed: true,
          persistedBytes: Buffer.byteLength(persistedContents),
          persistedSha256: createHash("sha256").update(persistedContents).digest("hex"),
        },
        reopen: {
          surface: reopened.rect,
          preview: reopenedPreview.rect,
          revision: reopened.attributes["data-file-content-revision"],
        },
      };
    } finally {
      if (!permissionsRestored) chmodSync(targetPath, originalMode);
    }
  }
  let fileSheetBack;
  if (verifyFileSheetBack) {
    const [back, sheetExplorer] = await Promise.all([
      waitForMeasurement({
        child,
        client,
        selector: ".file-panel__back",
        timeoutMs,
        predicate: (measurement) =>
          measurement?.attributes["aria-label"] === "Back to workspace files" &&
          Math.abs((measurement?.rect.width ?? 0) - 28) <= 0.5 &&
          Math.abs((measurement?.rect.height ?? 0) - 28) <= 0.5,
      }),
      readOptionalMeasurement(client, ".file-panel__explorer"),
    ]);
    if (measurementVisible(sheetExplorer)) {
      throw new Error(
        `Native file sheet kept the desktop explorer visible: ${JSON.stringify(sheetExplorer)}`,
      );
    }
    await tapSelector({
      child,
      client,
      selector: ".file-panel__back",
      timeoutMs,
    });
    const returnedPanel = await waitForMeasurement({
      child,
      client,
      selector: ".right-panel",
      timeoutMs,
      predicate: (measurement) =>
        measurement?.attributes["data-right-panel-active-kind"] === "files",
    });
    const returnedBrowser = await waitForMeasurement({
      child,
      client,
      selector: ".files-panel__browser",
      timeoutMs,
      predicate: (measurement) => (measurement?.rect.height ?? 0) > 0,
    });
    fileSheetBack = {
      back: back.rect,
      explorerHidden: true,
      returnedPanel: returnedPanel.rect,
      returnedBrowser: returnedBrowser.rect,
    };
  }

  return {
    ...browserEvidence,
    input:
      "DevTool touch on measured right-panel controls and the first file row; search typing pending-user-session",
    fileSelection: {
      selectedRow: fileRow,
      panel: filePanel.rect,
      path: filePath.text.trim(),
      editor: {
        preview: editorPreview.rect,
        firstLine: editorLine.rect,
        firstLineNumber: editorLineNumber.rect,
        fontFamily: editorFontFamily,
        fontSize: editorFontSize,
        gutterWidth: editorGutterWidth,
        lineHeight: editorLineHeight,
        tokenCount: editorTokens.length,
        tokenToneCount: new Set(
          editorTokens
            .map(({ attributes }) => attributes.class)
            .filter((className) => className?.includes("file-editor-token--")),
        ).size,
      },
      explorer: explorer?.rect ?? null,
      explorerVisible,
      detailLayout,
      panelMode,
      legacyInlinePreview: !measurementVisible(legacyInlinePreview),
    },
    fileEditingSave,
    fileSheetBack,
    screenshots: {
      tree: treeScreenshot,
      file: fileScreenshot,
    },
  };
}

async function verifyCompactControls({
  child,
  client,
  devToolCli,
  height,
  outputDirectory,
  timeoutMs,
  width,
}) {
  let rightPanel = await readOptionalMeasurement(client, ".right-panel");
  if (rightPanel?.attributes["data-right-panel-active-kind"] !== "files") {
    if (!rightPanel) {
      await tapSelector({
        child,
        client,
        selector: ".topbar__toggle--terminal",
        timeoutMs,
      });
      rightPanel = await waitForMeasurement({
        child,
        client,
        selector: ".right-panel",
        timeoutMs,
        predicate: (measurement) =>
          measurement?.attributes["data-right-panel-active-kind"] === "terminal",
      });
    }
    await tapSelector({
      child,
      client,
      selector: ".right-panel__add-btn",
      timeoutMs,
    });
    await waitForMeasurement({
      child,
      client,
      selector: ".right-panel__add-menu",
      timeoutMs,
      predicate: (measurement) => measurementVisible(measurement),
    });
    await tapSelectorByAttribute({
      attribute: "data-right-panel-add-kind",
      child,
      client,
      selector: ".right-panel__add-item",
      timeoutMs,
      value: "files",
    });
    rightPanel = await waitForMeasurement({
      child,
      client,
      selector: ".right-panel",
      timeoutMs,
      predicate: (measurement) =>
        measurement?.attributes["data-right-panel-active-kind"] === "files",
    });
  }
  const context = await waitForMeasurement({
    child,
    client,
    selector: ".composer-context-strip",
    timeoutMs,
    predicate: (measurement) => measurementVisible(measurement),
  });
  const composer = await waitForMeasurement({
    child,
    client,
    selector: ".composer-frame",
    timeoutMs,
    predicate: (measurement) => measurementVisible(measurement),
  });
  await tapSelector({
    child,
    client,
    selector: ".composer-compact-controls-trigger",
    timeoutMs,
  });
  const panel = await waitForMeasurement({
    child,
    client,
    selector: ".composer-compact-controls-menu",
    timeoutMs,
    predicate: (measurement) =>
      measurementVisible(measurement) && Math.abs((measurement?.rect.width ?? 0) - 148) <= 1,
  });
  const scroll = await waitForMeasurement({
    child,
    client,
    selector: ".composer-compact-controls-menu__scroll",
    timeoutMs,
    predicate: (measurement) => measurementVisible(measurement),
  });
  const content = await waitForMeasurement({
    child,
    client,
    selector: ".composer-compact-controls-menu__content",
    timeoutMs,
    predicate: (measurement) => measurementVisible(measurement),
  });
  const dismiss = await waitForMeasurement({
    child,
    client,
    selector: ".composer-compact-controls-dismiss",
    timeoutMs,
    predicate: (measurement) =>
      measurement !== null &&
      Math.abs((measurement.rect?.x ?? -1) - 0) <= 1 &&
      Math.abs((measurement.rect?.y ?? -1) - 0) <= 1 &&
      Math.abs((measurement.rect?.width ?? 0) - width) <= 1 &&
      Math.abs((measurement.rect?.height ?? 0) - height) <= 1,
  });
  const rows = await readSelectorMeasurements(client, ".composer-compact-controls-menu__item");
  const requiredTail = ["Chat", "Plan", "Supervised", "Auto-accept edits", "Auto", "Full access"];
  const rowLabels = rows.map(({ text }) => text.replace(/\s*Default\s*$/u, "").trim());
  const tailLabels = rowLabels.slice(-requiredTail.length);
  const traitLabels = rowLabels.slice(0, -requiredTail.length);
  const lastRow = rows.at(-1);
  const panelRight = panel.rect.x + panel.rect.width;
  const contextRight = context.rect.x + context.rect.width;
  const composerRight = composer.rect.x + composer.rect.width;
  const scrollBottom = scroll.rect.y + scroll.rect.height;
  const lastRowBottom =
    (lastRow?.rect?.y ?? Number.POSITIVE_INFINITY) + (lastRow?.rect?.height ?? 0);
  const contentOverflows = content.rect.height > scroll.rect.height;
  const initialLastRowVisible = lastRowBottom <= scrollBottom + 1;
  if (
    JSON.stringify(tailLabels) !== JSON.stringify(requiredTail) ||
    traitLabels.length === 0 ||
    new Set(rowLabels).size !== rowLabels.length ||
    rows.some(({ rect }) => !rect || rect.height < 27 || rect.height > 29) ||
    scroll.rect.x < panel.rect.x ||
    scroll.rect.y < panel.rect.y ||
    scroll.rect.x + scroll.rect.width > panelRight + 1 ||
    scroll.rect.y + scroll.rect.height > panel.rect.y + panel.rect.height + 1 ||
    content.rect.height < rows.length * 28 ||
    !lastRow?.rect ||
    (!contentOverflows && !initialLastRowVisible) ||
    panelRight > rightPanel.rect.x + 1 ||
    context.rect.x < composer.rect.x - 1 ||
    contextRight > composerRight + 1 ||
    contextRight > rightPanel.rect.x + 1
  ) {
    throw new Error(
      `Native compact Composer controls drifted: ${JSON.stringify({
        content,
        composer,
        context,
        panel,
        requiredTail,
        rightPanel,
        rowLabels,
        rows,
        scroll,
      })}`,
    );
  }

  let scrollEvidence = { status: "not-required" };
  let finalLastRow = lastRow;
  if (contentOverflows) {
    const response = await client.runCdp("Runtime.evaluate", {
      expression:
        "globalThis.__T3_LYNXTRON_COMPACT_CONTROLS_SCROLL_PROBE__?.(120).then((value) => JSON.stringify(value ?? null))",
      awaitPromise: true,
      returnByValue: true,
    });
    const result = commandResult(response);
    if (response?.exceptionDetails || typeof result?.value !== "string") {
      throw new Error(`Native compact controls scroll probe failed: ${JSON.stringify(response)}`);
    }
    const scrolled = await waitForMeasurement({
      child,
      client,
      selector: ".composer-compact-controls-menu__scroll",
      timeoutMs,
      predicate: (measurement) => measurement?.attributes["data-scroll-offset"] === "120",
    });
    const scrolledRows = await readSelectorMeasurements(
      client,
      ".composer-compact-controls-menu__item",
    );
    finalLastRow = scrolledRows.at(-1);
    const finalLastRowBottom =
      (finalLastRow?.rect?.y ?? Number.POSITIVE_INFINITY) + (finalLastRow?.rect?.height ?? 0);
    if (
      !finalLastRow?.rect ||
      finalLastRow.rect.y >= lastRow.rect.y ||
      finalLastRowBottom > scrollBottom + 1
    ) {
      throw new Error(
        `Native compact controls did not reveal the final row after scrolling: ${JSON.stringify({
          before: lastRow,
          after: finalLastRow,
          scroll,
        })}`,
      );
    }
    scrollEvidence = {
      status: "pass",
      input: "main-thread scroll seam; physical wheel pending-user-session",
      requestedOffset: 120,
      appliedOffset: Number(scrolled.attributes["data-scroll-offset"]),
      beforeLastRowY: lastRow.rect.y,
      afterLastRowY: finalLastRow.rect.y,
      finalLastRowVisible: true,
    };
  }

  const screenshot = captureNativeScreenshot({
    client,
    devToolCli,
    outputDirectory,
    name: "native-compact-controls.png",
  });
  await tapSelector({
    child,
    client,
    selector: ".composer-compact-controls-dismiss",
    point: "top-right",
    timeoutMs,
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".composer-compact-controls-menu",
    timeoutMs,
    predicate: (measurement) => measurement === null,
  });
  return {
    status: "pass",
    input: "DevTool touch on the measured ellipsis trigger and fullscreen dismiss layer",
    panel: panel.rect,
    scroll: scroll.rect,
    content: content.rect,
    composer: composer.rect,
    dismiss: dismiss.rect,
    rowLabels,
    lastRow: finalLastRow?.rect ?? null,
    initialLastRowVisible,
    traitLabels,
    containment: {
      panelRight,
      contextRight,
      composerRight,
      rightPanelLeft: rightPanel.rect.x,
    },
    scrollEvidence,
    screenshot,
    dismissed: true,
  };
}

async function verifyGitInitialize({
  child,
  client,
  devToolCli,
  outputDirectory,
  projectCwd,
  timeoutMs,
}) {
  const gitDirectory = path.join(projectCwd, ".git");
  if (existsSync(gitDirectory)) {
    throw new Error(`Git initialization fixture is already a repository: ${projectCwd}`);
  }
  const headerAction = await waitForMeasurement({
    child,
    client,
    selector: ".action-btn--commit",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.attributes["data-git-quick-action-kind"] === "initialize_repo" &&
      measurement.attributes["data-git-quick-action-label"] === "Initialize Git" &&
      measurement.attributes["aria-disabled"] === "false",
  });
  const beforeState = await waitForClientState({
    child,
    client,
    timeoutMs,
    predicate: (state) =>
      state?.vcsStatusCwd === projectCwd &&
      state?.vcsStatusPending === false &&
      state?.vcsStatus?.isRepo === false,
  });
  const beforeTransport = await readRendererReadiness(client);
  if (beforeTransport.kind !== "main" || !Number.isInteger(beforeTransport.lastSeq)) {
    throw new Error(`Git initialization lacks main transport: ${JSON.stringify(beforeTransport)}`);
  }
  const screenshot = captureNativeScreenshot({
    client,
    devToolCli,
    outputDirectory,
    name: "native-git-initialize.png",
  });

  await tapSelector({
    child,
    client,
    selector: ".action-btn--commit",
    timeoutMs,
  });
  const afterState = await waitForClientState({
    child,
    client,
    timeoutMs,
    predicate: (state) =>
      state?.vcsStatusCwd === projectCwd &&
      state?.vcsStatusPending === false &&
      state?.vcsStatus?.isRepo === true,
  });
  const nextAction = await waitForMeasurement({
    child,
    client,
    selector: ".action-btn--commit",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.attributes["data-git-quick-action-kind"] !== "initialize_repo" &&
      measurement?.attributes["data-git-quick-action-label"] !== "Initialize Git",
  });
  if (!existsSync(gitDirectory)) {
    throw new Error(`Git initialization did not create ${gitDirectory}`);
  }

  return {
    status: "pass",
    input: "DevTool Input.emulateTouchFromMouseEvent on the measured Initialize Git action",
    projectCwd,
    headerAction,
    screenshot,
    before: {
      isRepo: beforeState.vcsStatus.isRepo,
      transport: beforeTransport,
    },
    after: {
      isRepo: afterState.vcsStatus.isRepo,
      gitDirectory,
      nextAction: {
        kind: nextAction.attributes["data-git-quick-action-kind"] ?? null,
        label: nextAction.attributes["data-git-quick-action-label"] ?? null,
        rect: nextAction.rect,
      },
    },
  };
}

async function verifyGitPublishDialog({ child, client, timeoutMs }) {
  const approximately = (actual, expected, tolerance = 1) =>
    typeof actual === "number" && Math.abs(actual - expected) <= tolerance;
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
  const anatomy = {
    header: await readOptionalMeasurement(client, ".git-publish-header"),
    title: await readOptionalMeasurement(client, ".git-publish-title"),
    description: await readOptionalMeasurement(client, ".git-publish-description"),
    steps: await readOptionalMeasurement(client, ".git-publish-steps"),
    body: await readOptionalMeasurement(client, ".git-publish-body"),
    providerGrid: await readOptionalMeasurement(client, ".git-publish-provider-grid"),
    footer: await readOptionalMeasurement(client, ".git-publish-footer"),
  };
  const steps = await readSelectorRects(client, "[data-git-publish-step-label]");
  const providers = await readSelectorRects(client, "[data-git-publish-provider]");
  const dismiss = await waitForMeasurement({
    child,
    client,
    selector: ".git-publish-dismiss",
    timeoutMs,
    predicate: (measurement) =>
      approximately(measurement?.rect?.x, 0) &&
      approximately(measurement?.rect?.y, 0) &&
      approximately(measurement?.rect?.width, 1280) &&
      approximately(measurement?.rect?.height, 820),
  });
  const expectedSteps = [
    { x: 377, y: 309, width: 170, height: 49 },
    { x: 555, y: 309, width: 170, height: 49 },
    { x: 733, y: 309, width: 170, height: 49 },
  ];
  const expectedProviders = [
    { x: 377, y: 399, width: 258, height: 50 },
    { x: 645, y: 399, width: 258, height: 50 },
    { x: 377, y: 459, width: 258, height: 50 },
    { x: 645, y: 459, width: 258, height: 50 },
  ];
  const geometryMatches = (rect, expected) =>
    Object.entries(expected).every(([key, value]) => approximately(rect?.[key], value));
  if (
    !geometryMatches(dialog.rect, { x: 352, y: 228, width: 576, height: 364 }) ||
    steps.length !== 3 ||
    providers.length !== 4 ||
    !steps.every((rect, index) => geometryMatches(rect, expectedSteps[index])) ||
    !providers.every((rect, index) => geometryMatches(rect, expectedProviders[index]))
  ) {
    throw new Error(
      `Native Publish wizard anatomy drifted: ${JSON.stringify({
        dialog: dialog.rect,
        dismiss: dismiss.rect,
        anatomy: Object.fromEntries(
          Object.entries(anatomy).map(([key, measurement]) => [key, measurement?.rect ?? null]),
        ),
        steps,
        providers,
      })}`,
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
    dismiss,
    activeProvider,
    anatomy,
    steps,
    providers,
    sequence: { beforeOpen: beforeOpen.lastSeq, afterOpen: afterOpen.lastSeq },
    dismissed: true,
  };
}

async function verifyProjectActionDialog({ child, client, height, timeoutMs, width }) {
  const approximately = (actual, expected, tolerance = 2) =>
    typeof actual === "number" && Math.abs(actual - expected) <= tolerance;
  await tapSelector({
    child,
    client,
    selector: ".action-btn--add",
    timeoutMs,
  });
  const dialog = await waitForMeasurement({
    child,
    client,
    selector: ".project-action-dialog",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.text.includes("Add Action") &&
      measurement.text.includes("Actions are project-scoped commands"),
  });
  const anatomy = {
    backdrop: await readOptionalMeasurement(client, ".project-action-overlay"),
    header: await readOptionalMeasurement(client, ".project-action-dialog__header"),
    title: await readOptionalMeasurement(client, ".project-action-dialog__title"),
    description: await readOptionalMeasurement(client, ".project-action-dialog__description"),
    body: await readOptionalMeasurement(client, ".project-action-dialog__body"),
    footer: await readOptionalMeasurement(client, ".project-action-dialog__footer"),
  };
  const inputMeasurements = await readSelectorMeasurements(client, ".project-action-field__input");
  const fields = {
    name: await readOptionalMeasurement(client, ".project-action-field__input--name"),
    keybinding: inputMeasurements[1],
    command: await readOptionalMeasurement(client, ".project-action-field__textarea"),
    previewUrl: inputMeasurements[2],
  };
  const options = await readSelectorMeasurements(client, ".project-action-option");
  const buttons = await readSelectorMeasurements(client, ".project-action-dialog__button");
  if (
    !approximately(dialog.rect?.width, 504) ||
    !approximately(dialog.rect?.height, 664) ||
    !approximately(anatomy.backdrop?.rect?.width, width) ||
    !approximately(anatomy.backdrop?.rect?.height, height) ||
    !approximately(anatomy.header?.rect?.width, 502) ||
    !approximately(anatomy.header?.rect?.height, 104) ||
    !approximately(anatomy.body?.rect?.width, 502) ||
    !approximately(anatomy.footer?.rect?.width, 502) ||
    !approximately(anatomy.footer?.rect?.height, 66) ||
    !measurementVisible(fields.name) ||
    !measurementVisible(fields.keybinding) ||
    !measurementVisible(fields.command) ||
    !measurementVisible(fields.previewUrl) ||
    fields.keybinding?.attributes["data-keybinding-input-mode"] !== "canonical-text" ||
    options.length !== 2 ||
    options[0]?.attributes.class?.includes("project-action-option--disabled") === true ||
    options[1]?.attributes.class?.includes("project-action-option--disabled") !== true ||
    buttons.length !== 2 ||
    !buttons[0]?.attributes.class?.includes("project-action-dialog__button") ||
    !buttons[1]?.attributes.class?.includes("project-action-dialog__button--primary")
  ) {
    throw new Error(
      `Native Project Action dialog anatomy drifted: ${JSON.stringify({
        dialog: dialog.rect,
        anatomy: Object.fromEntries(
          Object.entries(anatomy).map(([key, measurement]) => [key, measurement?.rect ?? null]),
        ),
        fields: Object.fromEntries(
          Object.entries(fields).map(([key, measurement]) => [
            key,
            {
              rect: measurement?.rect ?? null,
              attributes: measurement?.attributes ?? null,
            },
          ]),
        ),
        options,
        buttons,
      })}`,
    );
  }
  await tapSelector({
    child,
    client,
    selector: ".project-action-overlay",
    point: "bottom-right",
    timeoutMs,
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".project-action-dialog",
    timeoutMs,
    predicate: (measurement) => measurement === null,
  });
  return {
    status: "pass",
    input: "DevTool touch on measured Add action trigger and fullscreen outside dismiss",
    dialog: dialog.rect,
    anatomy: Object.fromEntries(
      Object.entries(anatomy).map(([key, measurement]) => [key, measurement?.rect ?? null]),
    ),
    fields: Object.fromEntries(
      Object.entries(fields).map(([key, measurement]) => [
        key,
        {
          rect: measurement?.rect ?? null,
          attributes: measurement?.attributes ?? null,
        },
      ]),
    ),
    options: options.map(({ attributes, rect, text }) => ({ attributes, rect, text })),
    buttons: buttons.map(({ rect, text }) => ({ rect, text })),
    dismissed: true,
  };
}

async function verifyProjectSettingsDialog({
  child,
  client,
  devToolCli,
  height,
  outputDirectory,
  timeoutMs,
  width,
}) {
  const approximately = (actual, expected, tolerance = 3) =>
    typeof actual === "number" && Math.abs(actual - expected) <= tolerance;
  await tapSelector({
    child,
    client,
    selector: ".sidebar-v2-project-scope-trigger",
    timeoutMs,
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".sidebar-v2-scope-popup",
    timeoutMs,
    predicate: (measurement) => measurement !== null,
  });
  const projectAction = await waitForMeasurement({
    child,
    client,
    selector: ".sidebar-v2-project-action",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.attributes["aria-label"]?.startsWith("Project actions for ") === true,
  });
  await tapSelector({
    child,
    client,
    selector: ".sidebar-v2-project-action",
    timeoutMs,
  });
  const dialog = await waitForMeasurement({
    child,
    client,
    selector: ".project-settings-dialog",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.text.includes("Project settings") &&
      measurement.text.includes("Project name") &&
      measurement.text.includes("Grouping rule"),
  });
  const anatomy = {
    backdrop: await readOptionalMeasurement(client, ".project-settings-overlay"),
    header: await readOptionalMeasurement(client, ".project-settings-dialog__header"),
    body: await readOptionalMeasurement(client, ".project-settings-dialog__body"),
    footer: await readOptionalMeasurement(client, ".project-settings-dialog__footer"),
  };
  const name = await readOptionalMeasurement(client, ".project-settings-name-input");
  const grouping = await readOptionalMeasurement(client, ".project-settings-grouping-trigger");
  const buttons = await readSelectorMeasurements(client, ".project-settings-dialog__button");
  const removeLabel = await readOptionalMeasurement(
    client,
    ".project-settings-dialog__button-label--danger",
  );
  const closeLabel = await readOptionalMeasurement(
    client,
    ".project-settings-dialog__button-label--primary",
  );
  if (
    !approximately(dialog.rect?.width, 576) ||
    !approximately(dialog.rect?.height, 251, 8) ||
    !approximately(anatomy.backdrop?.rect?.width, width) ||
    !approximately(anatomy.backdrop?.rect?.height, height) ||
    !approximately(anatomy.header?.rect?.width, 576) ||
    !approximately(anatomy.body?.rect?.width, 576) ||
    !approximately(anatomy.footer?.rect?.width, 576) ||
    !measurementVisible(name) ||
    !measurementVisible(grouping) ||
    buttons.length !== 2 ||
    removeLabel?.text.trim() !== "Remove project" ||
    closeLabel?.text.trim() !== "Close"
  ) {
    throw new Error(
      `Native Project settings anatomy drifted: ${JSON.stringify({
        projectAction,
        dialog,
        anatomy,
        name,
        grouping,
        buttons,
        removeLabel,
        closeLabel,
      })}`,
    );
  }
  await tapSelector({
    child,
    client,
    selector: ".project-settings-grouping-trigger",
    timeoutMs,
  });
  const groupingOptions = await readSelectorMeasurements(
    client,
    ".project-settings-grouping-option",
  );
  const groupingOptionLabels = await readSelectorMeasurements(
    client,
    ".project-settings-grouping-option__label",
  );
  if (
    groupingOptions.length !== 4 ||
    groupingOptionLabels.map(({ text }) => text.trim()).join("|") !==
      [
        "Use global default",
        "Group by repository",
        "Group by repository and path",
        "Keep projects separate",
      ].join("|")
  ) {
    throw new Error(
      `Native Project settings grouping options drifted: ${JSON.stringify({
        groupingOptions,
        groupingOptionLabels,
      })}`,
    );
  }
  await tapSelectorByAttribute({
    attribute: "data-project-grouping-option",
    child,
    client,
    descendantSelector: null,
    selector: ".project-settings-grouping-option",
    timeoutMs,
    value: "separate",
  });
  const separate = await waitForMeasurement({
    child,
    client,
    selector: ".project-settings-grouping-trigger",
    timeoutMs,
    predicate: (measurement) => measurement?.text.includes("Keep projects separate"),
  });
  await tapSelector({
    child,
    client,
    selector: ".project-settings-dialog__button--danger",
    timeoutMs,
  });
  const confirmation = await waitForMeasurement({
    child,
    client,
    selector: ".project-settings-remove-confirm",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.text.includes("This action cannot be undone") &&
      measurement.text.includes("Confirm remove"),
  });
  await tapSelector({
    child,
    client,
    selector: ".project-settings-remove-confirm .project-settings-dialog__button",
    timeoutMs,
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".project-settings-remove-confirm",
    timeoutMs,
    predicate: (measurement) => measurement === null,
  });
  const screenshot = captureNativeScreenshot({
    client,
    devToolCli,
    outputDirectory,
    name: "native-project-settings.png",
  });
  await tapSelector({
    child,
    client,
    selector: ".project-settings-overlay",
    point: "bottom-right",
    timeoutMs,
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".project-settings-dialog",
    timeoutMs,
    predicate: (measurement) => measurement === null,
  });
  return {
    status: "pass",
    input:
      "DevTool touches on measured project scope, project action, grouping option, remove confirmation, cancel, and fullscreen outside dismiss",
    projectAction,
    dialog: dialog.rect,
    anatomy: Object.fromEntries(
      Object.entries(anatomy).map(([key, measurement]) => [key, measurement?.rect ?? null]),
    ),
    fields: {
      name: { rect: name.rect, text: name.text, attributes: name.attributes },
      grouping: {
        rect: grouping.rect,
        before: grouping.text.trim(),
        after: separate.text.trim(),
      },
    },
    groupingOptions: groupingOptions.map(({ rect }, index) => ({
      rect,
      text: groupingOptionLabels[index]?.text.trim() ?? "",
    })),
    removeConfirmation: {
      rect: confirmation.rect,
      text: confirmation.text.trim(),
      cancelled: true,
    },
    screenshot,
    dismissed: true,
    keyboardRename: "pending-user-session",
  };
}

async function verifyProjectActionKeybindingMutation({
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
  const actionName = "Fidelity KB Action";
  const actionId = "fidelity-kb-action";
  const actionCommand = "printf fidelity-keybinding";
  const keybinding = "mod+shift+y";
  const keybindingCommand = `script.${actionId}.run`;
  const keybindingsPath = path.join(baseDir, "userdata", "keybindings.json");
  const beforeState = await waitForClientState({
    child,
    client,
    timeoutMs,
    predicate: (state) =>
      typeof state?.activeProject?.id === "string" && Array.isArray(state?.activeProject?.scripts),
  });
  const beforeScripts = beforeState.activeProject.scripts;
  const beforeKeybindings = JSON.parse(readFileSync(keybindingsPath, "utf8"));
  if (
    beforeScripts.some((script) => script.id === actionId) ||
    beforeKeybindings.some((binding) => binding.command === keybindingCommand)
  ) {
    throw new Error(
      `Project Action mutation fixture is not pristine: ${JSON.stringify({
        actionId,
        beforeKeybindings,
        beforeScripts,
      })}`,
    );
  }

  await tapSelector({
    child,
    client,
    selector: ".action-btn--add",
    timeoutMs,
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".project-action-dialog",
    timeoutMs,
    predicate: (measurement) => measurement?.text.includes("Add Action"),
  });
  const invalidResponse = await client.runCdp("Runtime.evaluate", {
    expression: `String(globalThis.__T3_LYNXTRON_PROJECT_ACTION_PROBE__?.(${JSON.stringify({
      name: actionName,
      command: actionCommand,
      keybinding: "mod+shift",
    })}))`,
    returnByValue: true,
  });
  const invalidResult = commandResult(invalidResponse);
  if (invalidResponse?.exceptionDetails || invalidResult?.value !== "undefined") {
    throw new Error(
      `Native Project Action invalid fixture failed: ${JSON.stringify(invalidResponse)}`,
    );
  }
  await tapSelector({
    child,
    client,
    selector: ".project-action-dialog__button--primary",
    timeoutMs,
  });
  const invalidError = await waitForMeasurement({
    child,
    client,
    selector: ".project-action-dialog__error",
    timeoutMs,
    predicate: (measurement) => measurement?.text.trim() === "Invalid keybinding.",
  });
  const invalidState = await readClientState(client);
  const invalidKeybindings = JSON.parse(readFileSync(keybindingsPath, "utf8"));
  if (
    invalidState?.activeProject?.scripts?.some((script) => script.id === actionId) ||
    invalidKeybindings.some((binding) => binding.command === keybindingCommand)
  ) {
    throw new Error(
      `Invalid Project Action keybinding changed persisted state: ${JSON.stringify({
        invalidKeybindings,
        invalidState,
      })}`,
    );
  }
  const fixtureResponse = await client.runCdp("Runtime.evaluate", {
    expression: `String(globalThis.__T3_LYNXTRON_PROJECT_ACTION_PROBE__?.(${JSON.stringify({
      name: actionName,
      command: actionCommand,
      keybinding,
    })}))`,
    returnByValue: true,
  });
  const fixtureResult = commandResult(fixtureResponse);
  if (fixtureResponse?.exceptionDetails || fixtureResult?.value !== "undefined") {
    throw new Error(
      `Native Project Action mutation fixture failed: ${JSON.stringify(fixtureResponse)}`,
    );
  }
  await waitForMeasurement({
    child,
    client,
    selector: ".project-action-field__input--name",
    timeoutMs,
    predicate: (measurement) => measurement?.attributes.value === actionName,
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".project-action-field__textarea",
    timeoutMs,
    predicate: (measurement) => measurement?.attributes.value === actionCommand,
  });
  const keybindingInputs = await readSelectorMeasurements(client, ".project-action-field__input");
  const keybindingInput = keybindingInputs[1];
  if (keybindingInput?.attributes.value !== keybinding) {
    throw new Error(
      `Native Project Action keybinding fixture did not render: ${JSON.stringify({
        keybinding,
        keybindingInput,
      })}`,
    );
  }

  await tapSelector({
    child,
    client,
    selector: ".project-action-dialog__button--primary",
    timeoutMs,
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".project-action-dialog",
    timeoutMs,
    predicate: (measurement) => measurement === null,
  });
  const afterState = await waitForClientState({
    child,
    client,
    timeoutMs,
    predicate: (state) =>
      state?.activeProject?.scripts?.some(
        (script) =>
          script.id === actionId && script.name === actionName && script.command === actionCommand,
      ) === true && state?.keybindingCommands?.includes(keybindingCommand) === true,
  });
  const afterScripts = afterState.activeProject.scripts;
  const afterKeybindings = JSON.parse(readFileSync(keybindingsPath, "utf8"));
  const persistedBinding = afterKeybindings.find(
    (binding) => binding.command === keybindingCommand,
  );
  if (persistedBinding?.key !== keybinding) {
    throw new Error(
      `Native Project Action saved the script without its keybinding: ${JSON.stringify({
        actionId,
        afterKeybindings,
        afterScripts,
        expected: {
          key: keybinding,
          command: keybindingCommand,
        },
        persistedBinding: persistedBinding ?? null,
      })}`,
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
    throw new Error(
      `Renderer errors before Project Action cold restart:\n${initialRendererErrors}`,
    );
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
      T3_LYNXTRON_VIEWPORT_PROBE: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (!Number.isInteger(restartedChild.pid) || restartedChild.pid <= 0) {
    throw new Error("Project Action cold restart did not return an owned process id.");
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
        state?.activeProject?.scripts?.some(
          (script) =>
            script.id === actionId &&
            script.name === actionName &&
            script.command === actionCommand,
        ) === true && state?.keybindingCommands?.includes(keybindingCommand) === true,
    });
    const restartedKeybindings = JSON.parse(readFileSync(keybindingsPath, "utf8"));
    const restartedBinding = restartedKeybindings.find(
      (binding) => binding.command === keybindingCommand,
    );
    if (restartedBinding?.key !== keybinding) {
      throw new Error(
        `Project Action keybinding changed across cold restart: ${JSON.stringify({
          expected: { key: keybinding, command: keybindingCommand },
          restartedBinding: restartedBinding ?? null,
          restartedKeybindings,
          restartedState,
        })}`,
      );
    }
    return {
      outcome: {
        status: "pass",
        input: "Runtime fixture values and DevTool touch on the measured Save action",
        projectId: afterState.activeProject.id,
        invalid: {
          error: invalidError.text.trim(),
          scriptPersisted: false,
          keybindingPersisted: false,
        },
        script: afterScripts.find((script) => script.id === actionId),
        keybinding: persistedBinding,
        keybindingsPath,
        coldRestart: {
          initialProcessId,
          initialClient,
          restartedProcessId: restartedChild.pid,
          restartedClient: restartedClient.identity,
          transport: restartTransport,
          script: restartedState.activeProject.scripts.find((script) => script.id === actionId),
          keybinding: restartedBinding,
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

async function readBetaSettingsGeometry(client) {
  const rows = await readSelectorRects(client, ".settings-content--beta .settings-row");
  const descriptions = await readSelectorRects(
    client,
    ".settings-content--beta .settings-row__desc",
  );
  const [rowStack] = await readSelectorRects(
    client,
    ".settings-content--beta .settings-section__rows",
  );
  const expectedRowHeights = [103, 84, 65];
  if (
    rows.length !== expectedRowHeights.length ||
    descriptions.length !== expectedRowHeights.length ||
    !rowStack ||
    Math.abs(rowStack.height - 264) > 1 ||
    rows.some((row, index) => Math.abs(row.height - expectedRowHeights[index]) > 1) ||
    descriptions.some((description) => Math.abs(description.width - 576) > 1)
  ) {
    throw new Error(
      `Beta Settings geometry drifted: ${JSON.stringify({
        expectedRowHeights,
        expectedDescriptionWidth: 576,
        expectedRowStackHeight: 264,
        rows,
        descriptions,
        rowStack,
      })}`,
    );
  }
  return { rows, descriptions, rowStack };
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
  const beforeGeometry = await readBetaSettingsGeometry(client);

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
  const restoredGeometry = await readBetaSettingsGeometry(client);
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
    const restartedGeometry = await readBetaSettingsGeometry(restartedClient);
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
        beforeGeometry,
        disabled,
        disabledDiskValue: disabledPrefs.clientSettings.sidebarAutoSettleAfterDays,
        enabled,
        restoredDays,
        restoredGeometry,
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
          geometry: restartedGeometry,
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

async function verifyFixedNetworkAccessRow({ checked, child, client, description, timeoutMs }) {
  const row = await waitForMeasurement({
    child,
    client,
    selector: ".settings-connections-network-access",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.text.includes("Network access") === true &&
      measurement.text.includes(description) &&
      !measurement.text.includes("Access inventory"),
  });
  const control = await waitForMeasurement({
    child,
    client,
    selector: ".settings-connections-network-access .ui-switch",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.attributes["aria-checked"] === String(checked) &&
      measurement.attributes.class?.includes("ui-switch--disabled") === true,
  });
  return { row, control };
}

async function verifyConnectionsLocalPolicy({
  child,
  client,
  devToolCli,
  outputDirectory,
  timeoutMs,
}) {
  const route = await openConnectionsSettings({ child, client, timeoutMs });
  const content = await waitForMeasurement({
    child,
    client,
    selector: ".settings-content--connections",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.text.includes("This environment") === true &&
      measurement.text.includes("Remote environments") &&
      !measurement.text.includes("Authorized clients"),
  });
  const panel = await waitForMeasurement({
    child,
    client,
    selector: ".settings-connections-panel",
    timeoutMs,
    predicate: (measurement) =>
      Math.abs((measurement?.rect.x ?? 0) - 320) <= 1 &&
      Math.abs((measurement?.rect.y ?? 0) - 88) <= 1 &&
      Math.abs((measurement?.rect.width ?? 0) - 896) <= 1,
  });
  const networkAccess = await verifyFixedNetworkAccessRow({
    checked: false,
    child,
    client,
    description:
      "This backend is only reachable on this machine. Restart it with a non-loopback host to enable remote pairing.",
    timeoutMs,
  });
  const createButton = await readOptionalMeasurement(
    client,
    ".settings-connections-create-pairing",
  );
  if (createButton !== null) {
    throw new Error(
      `Loopback Connections exposed pairing creation: ${JSON.stringify(createButton)}`,
    );
  }
  const sections = await readSelectorMeasurements(
    client,
    ".settings-connections-panel > .settings-section",
  );
  const empty = await waitForMeasurement({
    child,
    client,
    selector: ".settings-remote-empty",
    timeoutMs,
    predicate: (measurement) =>
      Math.abs((measurement?.rect.width ?? 0) - 896) <= 1 &&
      Math.abs((measurement?.rect.height ?? 0) - 232) <= 1 &&
      measurement?.text.includes("No saved remote environments") &&
      measurement.text.includes("Click “Add environment” to pair another environment."),
  });
  const emptyMedia = await waitForMeasurement({
    child,
    client,
    selector: ".settings-remote-empty__media",
    timeoutMs,
    predicate: (measurement) =>
      Math.abs((measurement?.rect.width ?? 0) - 36) <= 1 &&
      Math.abs((measurement?.rect.height ?? 0) - 36) <= 1,
  });
  const emptyTitle = await waitForMeasurement({
    child,
    client,
    selector: ".settings-remote-empty__title",
    timeoutMs,
    predicate: (measurement) => measurement?.text.trim() === "No saved remote environments",
  });
  const emptyDescription = await waitForMeasurement({
    child,
    client,
    selector: ".settings-remote-empty__description",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.text.trim() === "Click “Add environment” to pair another environment.",
  });
  if (
    Math.abs(emptyMedia.rect.x - (empty.rect.x + 430)) > 1 ||
    Math.abs(emptyMedia.rect.y - (empty.rect.y + 48)) > 1 ||
    Math.abs(emptyTitle.rect.x - (empty.rect.x + 275)) > 1 ||
    Math.abs(emptyTitle.rect.y - (empty.rect.y + 132)) > 1 ||
    Math.abs(emptyTitle.rect.width - 346) > 1 ||
    Math.abs(emptyTitle.rect.height - 28) > 1 ||
    Math.abs(emptyDescription.rect.x - emptyTitle.rect.x) > 1 ||
    Math.abs(emptyDescription.rect.y - (emptyTitle.rect.y + emptyTitle.rect.height + 4)) > 1 ||
    Math.abs(emptyDescription.rect.width - 346) > 1 ||
    Math.abs(emptyDescription.rect.height - 20) > 1
  ) {
    throw new Error(
      `Native Connections empty-state anatomy drifted: ${JSON.stringify({
        empty: empty.rect,
        media: emptyMedia.rect,
        title: emptyTitle.rect,
        description: emptyDescription.rect,
      })}`,
    );
  }
  const addEnvironment = await waitForMeasurement({
    child,
    client,
    selector: ".settings-connections-add-environment",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.attributes["aria-disabled"] === "true" &&
      measurement.attributes.class?.includes("ui-button--disabled") === true &&
      measurement?.text.trim() === "Add environment" &&
      Math.abs((measurement?.rect.height ?? 0) - 20) <= 1,
  });
  const addEnvironmentOpacity = await readFirstSelectorStyleValue(
    client,
    ".settings-connections-add-environment",
    "opacity",
  );
  if (Math.abs(Number(addEnvironmentOpacity) - 0.64) > 1 / 255) {
    throw new Error(
      `Native disabled Add environment affordance drifted: ${JSON.stringify({
        addEnvironment,
        opacity: addEnvironmentOpacity,
      })}`,
    );
  }
  if (
    sections.length !== 2 ||
    sections[0]?.text.includes("This environment") !== true ||
    sections[1]?.text.includes("Remote environments") !== true ||
    Math.abs((sections[0]?.rect.y ?? 0) - panel.rect.y) > 1 ||
    Math.abs(
      (sections[1]?.rect.y ?? 0) -
        ((sections[0]?.rect.y ?? 0) + (sections[0]?.rect.height ?? 0) + 48),
    ) > 1 ||
    Math.abs((sections[1]?.rect.height ?? 0) - 276) > 1
  ) {
    throw new Error(
      `Native Connections section flow drifted: ${JSON.stringify({ panel, sections })}`,
    );
  }
  await tapSelector({
    child,
    client,
    selector: ".settings-connections-add-environment",
    timeoutMs,
  });
  const afterDisabledTap = await waitForMeasurement({
    child,
    client,
    selector: ".settings-connections-panel",
    timeoutMs,
    predicate: (measurement) =>
      Math.abs((measurement?.rect.x ?? 0) - 320) <= 1 &&
      Math.abs((measurement?.rect.y ?? 0) - 88) <= 1,
  });
  const screenshot = captureNativeScreenshot({
    client,
    devToolCli,
    outputDirectory,
    name: "native-settings-connections-local.png",
  });
  return {
    status: "pass",
    input: "DevTool touch on measured Settings, Connections, and disabled Add environment controls",
    route,
    content: content.rect,
    panel: panel.rect,
    sections: sections.map((section) => ({ rect: section.rect, text: section.text.trim() })),
    networkAccess,
    remoteEnvironments: {
      addEnvironment: {
        ...addEnvironment,
        opacity: addEnvironmentOpacity,
      },
      empty: empty.rect,
      media: emptyMedia.rect,
      title: emptyTitle.rect,
      description: emptyDescription.rect,
      disabledActionStayedOnRoute: afterDisabledTap.rect,
    },
    authorizedClientsVisible: false,
    createPairingVisible: false,
    screenshot,
  };
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
  const networkAccess = await verifyFixedNetworkAccessRow({
    checked: true,
    child,
    client,
    description:
      "This backend is already configured for remote access. Network exposure changes must be made where the server is launched.",
    timeoutMs,
  });
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
      T3CODE_HOST: "0.0.0.0",
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
    const restartedNetworkAccess = await verifyFixedNetworkAccessRow({
      checked: true,
      child: restartedChild,
      client: restartedClient,
      description:
        "This backend is already configured for remote access. Network exposure changes must be made where the server is launched.",
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
        networkAccess,
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
          networkAccess: restartedNetworkAccess,
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

async function tapMeasurement({ client, measurement, point = "center" }) {
  if (!Number.isInteger(measurement?.nodeId) || !measurement?.rect) {
    throw new Error(`Cannot tap an invalid measurement: ${JSON.stringify(measurement)}`);
  }
  const tapPoint =
    point === "top-left"
      ? { x: measurement.rect.x + 2, y: measurement.rect.y + 2 }
      : point === "bottom-right"
        ? {
            x: measurement.rect.x + measurement.rect.width - 2,
            y: measurement.rect.y + measurement.rect.height - 2,
          }
        : {
            x: measurement.rect.x + measurement.rect.width / 2,
            y: measurement.rect.y + measurement.rect.height / 2,
          };
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

async function tapMeasurementDescendant({ client, measurement, selector }) {
  if (!Number.isInteger(measurement?.nodeId)) {
    throw new Error(`Cannot query an invalid measurement: ${JSON.stringify(measurement)}`);
  }
  const response = await client.runCdp("DOM.querySelector", {
    nodeId: measurement.nodeId,
    selector,
  });
  const nodeId = commandResult(response)?.nodeId;
  if (!Number.isInteger(nodeId) || nodeId <= 0) {
    throw new Error(`Could not find ${selector} inside measurement ${measurement.nodeId}.`);
  }
  const boxResponse = await client.runCdp("DOM.getBoxModel", { nodeId });
  const model = commandResult(boxResponse)?.model;
  const point = quadPoint(model?.border ?? model?.content);
  const timestamp = Date.now() / 1000;
  for (const [type, offset] of [
    ["mouseMoved", 0],
    ["mousePressed", 0.01],
    ["mouseReleased", 0.02],
  ]) {
    await client.runCdp("Input.emulateTouchFromMouseEvent", {
      type,
      x: point.x,
      y: point.y,
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

function assertSettingsTopOrigin(label, rect, expectedY) {
  if (
    !rect ||
    Math.abs(rect.x - 320) > 1 ||
    Math.abs(rect.y - expectedY) > 1 ||
    Math.abs(rect.width - 896) > 1
  ) {
    throw new Error(
      `${label} did not reset to the Settings top origin: ${JSON.stringify({
        expected: { x: 320, y: expectedY, width: 896 },
        rect,
      })}`,
    );
  }
}

async function assertSettingsNavigationSelection(client, expectedSuffix) {
  const items = await readSelectorMeasurements(client, ".settings-nav__item");
  const backgrounds = await readSelectorStyleValues(
    client,
    ".settings-nav__item",
    "background-color",
  );
  const expectedClass = `settings-nav__item--${expectedSuffix}`;
  const activeItems = items.filter((item) =>
    item.attributes.class?.split(/\s+/u).includes("settings-nav__item--active"),
  );
  const visuallySelectedItems = items.filter((item, index) => {
    const background = backgrounds[index] ?? "";
    return (
      activeItems.includes(item) ||
      (background !== "" &&
        background !== "transparent" &&
        background !== "rgba(0, 0, 0, 0)" &&
        background !== "rgba(0,0,0,0)")
    );
  });
  if (
    activeItems.length !== 1 ||
    !activeItems[0]?.attributes.class?.split(/\s+/u).includes(expectedClass) ||
    visuallySelectedItems.length !== 1 ||
    !visuallySelectedItems[0]?.attributes.class?.split(/\s+/u).includes(expectedClass)
  ) {
    throw new Error(
      `Settings navigation selection is not truthful: ${JSON.stringify({
        expectedClass,
        activeItems,
        visuallySelectedItems,
        backgrounds,
      })}`,
    );
  }
  return {
    expectedClass,
    activeClass: activeItems[0].attributes.class,
    visuallySelectedClass: visuallySelectedItems[0].attributes.class,
  };
}

async function readGeneralBetaSettingsEvidence(client) {
  const rows = await readSelectorMeasurements(client, ".settings-content--general .settings-row");
  const autoSettle = rows.find(
    (row) => row.attributes.idSelector === "auto-settle-inactive-threads",
  );
  const days = rows.find((row) => row.text.includes("Days of inactivity before auto-settle"));
  const legacySidebar = rows.find((row) => row.attributes.idSelector === "legacy-sidebar");
  const rowStack = await readSelectorMeasurements(
    client,
    ".settings-content--general .settings-section__rows",
  );
  const legacySidebarStack = rowStack.find(
    (stack) =>
      stack.attributes["aria-hidden"] === "true" && stack.text.includes("Sidebar (legacy)"),
  );
  const legacySidebarCollapsed =
    legacySidebar?.rect.width === 0 &&
    legacySidebar.rect.height === 0 &&
    legacySidebarStack?.rect.width === 0 &&
    legacySidebarStack.rect.height === 0;
  const legacySidebarVisible =
    Math.abs((legacySidebar?.rect.width ?? 0) - 896) <= 1 && (legacySidebar?.rect.height ?? 0) > 0;
  if (
    !autoSettle?.text.includes("Auto-settle inactive threads") ||
    !days?.text.includes("Any new activity un-settles a thread automatically.") ||
    !legacySidebar?.text.includes("Sidebar (legacy)") ||
    Math.abs(autoSettle.rect.width - 896) > 1 ||
    Math.abs(days.rect.width - 896) > 1 ||
    (!legacySidebarCollapsed && !legacySidebarVisible) ||
    rowStack.length < 2
  ) {
    throw new Error(
      `General Beta settings drifted: ${JSON.stringify({
        autoSettle,
        days,
        legacySidebar,
        rowStack,
      })}`,
    );
  }
  return {
    mergedIntoGeneral: true,
    autoSettle,
    days,
    legacySidebar,
    legacySidebarCollapsed,
    legacySidebarStack,
    sectionRowStacks: rowStack.map((measurement) => measurement.rect),
  };
}

async function readArchiveSettingsEvidence({ child, client, timeoutMs }) {
  const panel = await waitForMeasurement({
    child,
    client,
    selector: ".settings-content--archive",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.text.includes("Archived threads") === true &&
      measurement.text.includes("No archived threads") &&
      measurement.text.includes("Archived threads will appear here."),
  });
  const [section] = await readSelectorRects(client, ".settings-content--archive .settings-section");
  const [row] = await readSelectorMeasurements(client, ".settings-content--archive .settings-row");
  const [text] = await readSelectorRects(client, ".settings-content--archive .settings-row__text");
  assertSettingsTopOrigin("Archive first section", section, 88);
  if (!row || !text || Math.abs(row.rect.width - 896) > 1 || Math.abs(text.width - 832) > 1) {
    throw new Error(
      `Archive empty-state geometry drifted: ${JSON.stringify({ panel, row, section, text })}`,
    );
  }
  return {
    panel: panel.rect,
    section,
    row,
    text,
  };
}

async function readAppearanceSettingsEvidence({
  child,
  client,
  devToolCli,
  outputDirectory,
  timeoutMs,
}) {
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
  const unavailableTitles = [
    "Glass opacity",
    ...(appearancePanel.text.includes("Environment identification")
      ? ["Environment identification"]
      : []),
    "Word wrap",
  ];
  const unavailableRows = rows.filter(
    (row) => row.attributes["data-settings-unavailable"] === "true",
  );
  const availableRows = rows.filter(
    (row) => row.attributes["data-settings-unavailable"] !== "true",
  );
  const [theme] = availableRows;
  assertSettingsTopOrigin("Appearance Theme row", theme?.rect, 132);
  if (
    rows.length !== unavailableTitles.length + 1 ||
    availableRows.length !== 1 ||
    theme.attributes["aria-disabled"] === "true" ||
    theme.attributes["data-settings-unavailable"] === "true"
  ) {
    throw new Error(
      `Appearance row availability is inconsistent: ${JSON.stringify({
        availableRows,
        rows,
        unavailableTitles,
      })}`,
    );
  }
  if (
    unavailableRows.length !== unavailableTitles.length ||
    unavailableRows.some((row) => row.attributes["aria-disabled"] !== "true")
  ) {
    throw new Error(
      `Appearance unavailable rows lost disabled semantics: ${JSON.stringify({
        unavailableRows,
        unavailableTitles,
      })}`,
    );
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
  return {
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
}

async function verifySettingsAppearance({ child, client, devToolCli, outputDirectory, timeoutMs }) {
  await tapSelector({ child, client, selector: ".sidebar-settings-row", timeoutMs });
  await waitForRoutePanel({
    child,
    client,
    panel: "general",
    route: "/settings/general",
    timeoutMs,
  });
  const generalSelection = await assertSettingsNavigationSelection(client, "general");
  await tapSelector({
    child,
    client,
    selector: ".settings-nav__item--appearance",
    timeoutMs,
  });
  await waitForRoutePanel({
    child,
    client,
    panel: "appearance",
    route: "/settings/appearance",
    timeoutMs,
  });
  const appearanceSelection = await assertSettingsNavigationSelection(client, "appearance");
  const appearance = await readAppearanceSettingsEvidence({
    child,
    client,
    devToolCli,
    outputDirectory,
    timeoutMs,
  });
  await tapSelector({ child, client, selector: ".settings-nav__back", timeoutMs });
  await waitForChatRoute({ child, client, timeoutMs });
  return {
    status: "pass",
    input: "DevTool taps on measured Settings, Appearance, and Back controls",
    routeTransition: {
      sourceAuthority:
        "Web replaces Settings route content immediately; only titlebar/sidebar inset changes use the shared 200ms linear reduced-motion-aware transition.",
      generalSelection,
      appearanceSelection,
      finalRoute: "/",
    },
    appearance,
    physicalKeyboard: "pending-user-session",
  };
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
  const navigationSelections = [];
  let appearance = null;
  let archive = null;
  let keybindings = null;
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
  navigationSelections.push(await assertSettingsNavigationSelection(client, "general"));
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
  assertSettingsTopOrigin("General first section", generalSections[0], 88);
  const generalRows = await readSelectorMeasurements(
    client,
    ".settings-content--general .settings-row",
  );
  const beta = await readGeneralBetaSettingsEvidence(client);
  const expectedGeneralUnavailableIds = ["background-activity", "text-generation-model"];
  const generalUnavailableRows = generalRows.filter(
    (row) => row.attributes["data-settings-unavailable"] === "true",
  );
  const generalUnavailableIds = generalUnavailableRows.map(
    (row) => row.attributes.idSelector ?? null,
  );
  if (
    JSON.stringify(generalUnavailableIds) !== JSON.stringify(expectedGeneralUnavailableIds) ||
    generalUnavailableRows.some((row) => row.attributes["aria-disabled"] !== "true") ||
    generalRows.some(
      (row) =>
        !expectedGeneralUnavailableIds.includes(row.attributes.idSelector) &&
        (row.attributes["aria-disabled"] === "true" ||
          row.attributes["data-settings-unavailable"] === "true"),
    )
  ) {
    throw new Error(
      `General row availability is inconsistent: ${JSON.stringify({
        expectedGeneralUnavailableIds,
        generalRows,
        generalUnavailableIds,
      })}`,
    );
  }
  const generalUnavailableOpacities = await readSelectorStyleValues(
    client,
    ".settings-content--general .settings-row--unavailable",
    "opacity",
  );
  if (
    generalUnavailableOpacities.length !== expectedGeneralUnavailableIds.length ||
    generalUnavailableOpacities.some(
      (opacity) => opacity === null || Math.abs(Number(opacity) - 0.48) > 1 / 255,
    )
  ) {
    throw new Error(
      `General unavailable rows are not visibly muted: ${JSON.stringify({
        generalUnavailableOpacities,
        generalUnavailableRows,
      })}`,
    );
  }
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
    ["/settings/archived", "archive"],
  ]) {
    await tapSelector({
      child,
      client,
      selector: `.settings-nav__item--${route.slice("/settings/".length)}`,
      timeoutMs,
    });
    observed.push(await waitForRoutePanel({ child, client, panel, route, timeoutMs }));
    navigationSelections.push(
      await assertSettingsNavigationSelection(client, route.slice("/settings/".length)),
    );
    if (route === "/settings/appearance") {
      appearance = await readAppearanceSettingsEvidence({
        child,
        client,
        devToolCli,
        outputDirectory,
        timeoutMs,
      });
    } else if (route === "/settings/keybindings") {
      const keybindingsPanel = await waitForMeasurement({
        child,
        client,
        selector: ".settings-content--keybindings",
        timeoutMs,
        predicate: (measurement) =>
          measurement?.text.includes("Keybindings") === true &&
          measurement.text.includes("Keybindings are read-only on Lynxtron") &&
          measurement.text.includes("Command") &&
          measurement.text.includes("Keybinding") &&
          measurement.text.includes("When") &&
          measurement.text.includes("Status"),
      });
      const header = await waitForMeasurement({
        child,
        client,
        selector: "[data-keybindings-table-header]",
        timeoutMs,
        predicate: (measurement) => measurement?.text.includes("Command") === true,
      });
      const rows = await readSelectorMeasurements(client, ".keybindings-table__row");
      const conflicts = rows.filter(
        (row) =>
          typeof row.attributes["data-keybinding-conflicts"] === "string" &&
          row.attributes["data-keybinding-conflicts"] !== "[]",
      );
      const conflictIndicators = await readSelectorMeasurements(
        client,
        ".keybindings-table__status--conflict",
      );
      const first = rows[0];
      const last = rows.at(-1);
      if (
        rows.length !== 45 ||
        conflicts.length !== 18 ||
        conflictIndicators.length !== conflicts.length ||
        !header.rect ||
        Math.abs(header.rect.x - 294) > 1 ||
        Math.abs(header.rect.width - 948) > 1 ||
        Math.abs(header.rect.height - 34) > 1 ||
        rows.some((row, index) => {
          const expectedHeight = index === rows.length - 1 ? 40 : 41;
          return (
            !row.rect ||
            Math.abs(row.rect.x - 294) > 1 ||
            Math.abs(row.rect.width - 948) > 1 ||
            Math.abs(row.rect.height - expectedHeight) > 1
          );
        }) ||
        first?.attributes["data-keybinding-command"] !== "chat.new" ||
        first.attributes["data-keybinding-shortcut"] !== "⌘N" ||
        first.attributes["data-keybinding-when"] !== "!terminalFocus" ||
        last?.attributes["data-keybinding-command"] !== "thread.previous" ||
        last.attributes["data-keybinding-shortcut"] !== "⇧⌘[" ||
        last.attributes["data-keybinding-when"] !== "Always"
      ) {
        throw new Error(
          `Keybindings read-only table drifted: ${JSON.stringify({
            conflicts,
            conflictIndicators,
            first,
            header,
            last,
            rowCount: rows.length,
          })}`,
        );
      }
      keybindings = {
        panel: keybindingsPanel.rect,
        header,
        rows,
        conflictCount: conflicts.length,
        first,
        last,
        scrollInteraction: "pending-user-session",
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
      assertSettingsTopOrigin("Source Control first section", sourceControl.sections[0], 88);
    } else if (route === "/settings/archived") {
      archive = await readArchiveSettingsEvidence({ child, client, timeoutMs });
    }
  }

  const expectedObservedRoutes = [
    "/settings/general",
    "/settings/appearance",
    "/settings/keybindings",
    "/settings/providers",
    "/settings/connections",
    "/settings/source-control",
    "/settings/archived",
  ];
  if (
    JSON.stringify(observed.map((entry) => entry.route)) !==
      JSON.stringify(expectedObservedRoutes) ||
    navigationSelections.length !== expectedObservedRoutes.length
  ) {
    throw new Error(
      `Settings route coverage drifted: ${JSON.stringify({
        expectedObservedRoutes,
        navigationSelections,
        observed,
      })}`,
    );
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
    let cycledGeneralSection;
    try {
      cycledGeneralSection = await waitForMeasurement({
        child,
        client,
        selector: ".settings-content--general .settings-section",
        timeoutMs,
        predicate: (measurement) =>
          measurement !== null &&
          Math.abs(measurement.rect.x - 320) <= 1 &&
          Math.abs(measurement.rect.y - 88) <= 1 &&
          Math.abs(measurement.rect.width - 896) <= 1,
      });
    } catch (error) {
      const layout = Object.fromEntries(
        await Promise.all(
          [
            ".settings-root",
            ".settings-main",
            ".settings-topbar",
            ".settings-scroll",
            ".settings-content--general",
            ".settings-content--general .settings-section",
          ].map(async (selector) => [selector, await readSelectorMeasurements(client, selector)]),
        ),
      );
      throw new Error(
        `General cycle ${cycle} did not reset: ${JSON.stringify({
          cause: error instanceof Error ? error.message : String(error),
          layout,
        })}`,
      );
    }
    assertSettingsTopOrigin(`General cycle ${cycle}`, cycledGeneralSection.rect, 88);
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
      unavailableRows: generalUnavailableRows,
      unavailableOpacities: generalUnavailableOpacities,
      screenshot: generalScreenshot,
    },
    appearance,
    beta,
    archive,
    keybindings,
    sourceControl,
    resync: { beforeSeq: beforeResync.lastSeq, afterSeq: afterResync.lastSeq },
    navigationSelections,
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

async function verifyProvidersSettings({ child, client, devToolCli, outputDirectory, timeoutMs }) {
  const beforeSequence = await readRendererReadiness(client);
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
  const route = await waitForRoutePanel({
    child,
    client,
    panel: "providers",
    route: "/settings/providers",
    timeoutMs,
  });
  const navigation = await assertSettingsNavigationSelection(client, "providers");
  const panel = await waitForMeasurement({
    child,
    client,
    selector: ".settings-content--providers .settings-panel",
    timeoutMs,
    predicate: (measurement) => measurement?.text.includes("Providers") === true,
  });
  const clientState = await readClientState(client);
  const cards = await readSelectorMeasurements(client, ".provider-instance-card");
  const headers = await readSelectorRects(client, ".provider-instance-card__header");
  const layouts = await readSelectorRects(client, ".provider-instance-card__layout");
  const copies = await readSelectorRects(client, ".provider-instance-card__copy");
  const actions = await readSelectorRects(client, ".provider-instance-card__actions");
  const healthRow = await waitForMeasurement({
    child,
    client,
    selector: "#provider-health-check-interval",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.text.includes("Health check interval") === true &&
      measurement.text.includes("Refresh provider availability"),
  });
  const headerActions = await readSelectorRects(
    client,
    ".provider-settings-header-actions .ui-button",
  );
  const expectedCardCount = clientState?.providerEntryCount;
  if (
    !Number.isInteger(expectedCardCount) ||
    expectedCardCount <= 0 ||
    cards.length !== expectedCardCount ||
    headers.length !== expectedCardCount ||
    layouts.length !== expectedCardCount ||
    copies.length !== expectedCardCount ||
    actions.length !== expectedCardCount ||
    headerActions.length !== 2 ||
    Math.abs(panel.rect.x - 320) > 1 ||
    Math.abs(panel.rect.y - 88) > 1 ||
    Math.abs(panel.rect.width - 896) > 1 ||
    Math.abs(healthRow.rect.width - panel.rect.width) > 1 ||
    cards.some(
      (card, index) =>
        !card.text.trim() ||
        Math.abs((card.rect?.width ?? 0) - panel.rect.width) > 1 ||
        Math.abs((headers[index]?.width ?? 0) - panel.rect.width) > 1 ||
        Math.abs((layouts[index]?.width ?? 0) - (panel.rect.width - 32)) > 1 ||
        (copies[index]?.width ?? 0) <= 0 ||
        (actions[index]?.width ?? 0) <= 0,
    )
  ) {
    throw new Error(
      `Native Providers layout drifted: ${JSON.stringify({
        expectedCardCount,
        panel: panel.rect,
        healthRow: healthRow.rect,
        cards,
        headers,
        layouts,
        copies,
        actions,
        headerActions,
      })}`,
    );
  }
  const screenshot = captureNativeScreenshot({
    client,
    devToolCli,
    outputDirectory,
    name: "native-settings-providers.png",
  });
  const afterOpenSequence = await readRendererReadiness(client);
  await tapSelector({ child, client, selector: ".settings-nav__back", timeoutMs });
  await waitForChatRoute({ child, client, timeoutMs });
  return {
    status: "pass",
    input: "DevTool Input.emulateTouchFromMouseEvent on measured Settings and Providers controls",
    route,
    navigation,
    panel: panel.rect,
    healthRow: healthRow.rect,
    cards: cards.map((card, index) => ({
      text: card.text.trim(),
      card: card.rect,
      header: headers[index],
      layout: layouts[index],
      copy: copies[index],
      actions: actions[index],
    })),
    controls: {
      add: headerActions[0],
      refresh: headerActions[1],
    },
    sequence: {
      before: beforeSequence.lastSeq,
      afterOpen: afterOpenSequence.lastSeq,
    },
    screenshot,
    dismissed: true,
  };
}

async function verifyProviderInstanceDialog({ baseDir, child, client, height, timeoutMs, width }) {
  const instanceId = "codex_fidelity_20260825";
  const displayName = "Fidelity Codex";
  const approximately = (actual, expected, tolerance = 3) =>
    typeof actual === "number" && Math.abs(actual - expected) <= tolerance;
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
  const headerActions = await readSelectorMeasurements(
    client,
    ".provider-settings-header-actions .ui-button",
  );
  const addProvider = headerActions.find(
    (measurement) => measurement.attributes["aria-label"] === "Add provider instance",
  );
  if (!addProvider) {
    throw new Error(
      `Native Providers page did not expose Add provider: ${JSON.stringify(headerActions)}`,
    );
  }
  await tapMeasurement({ client, measurement: addProvider });
  const dialog = await waitForMeasurement({
    child,
    client,
    selector: ".provider-instance-dialog",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.text.includes("Add provider instance") === true &&
      measurement.text.includes("Driver") &&
      measurement.attributes["data-provider-wizard-step"] === "0" &&
      measurement.attributes["data-provider-dialog-motion"] === "open",
  });
  const overlay = await readOptionalMeasurement(client, ".provider-instance-dialog-overlay");
  const steps = await readSelectorMeasurements(client, ".provider-instance-dialog__step");
  const drivers = await readSelectorMeasurements(client, ".provider-instance-dialog__driver");
  const footer = await readOptionalMeasurement(client, ".provider-instance-dialog__footer");
  const next = await readSelectorMeasurements(client, ".provider-instance-dialog__save");
  if (
    !approximately(dialog.rect?.width, 576) ||
    !measurementVisible(overlay) ||
    !approximately(overlay.rect?.width, width) ||
    !approximately(overlay.rect?.height, height) ||
    steps.length !== 3 ||
    drivers.length === 0 ||
    !measurementVisible(footer) ||
    next.length !== 1
  ) {
    throw new Error(
      `Native Provider Instance dialog anatomy drifted: ${JSON.stringify({
        dialog,
        drivers,
        footer,
        next,
        overlay,
        steps,
      })}`,
    );
  }
  await tapMeasurement({ client, measurement: next[0] });
  const identity = await waitForMeasurement({
    child,
    client,
    selector: ".provider-instance-dialog",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.attributes["data-provider-wizard-step"] === "1" &&
      measurement.text.includes("Instance ID") &&
      measurement.text.includes("Accent color"),
  });
  await tapSelector({ child, client, selector: ".provider-instance-dialog__save", timeoutMs });
  const requiredError = await waitForMeasurement({
    child,
    client,
    selector: ".provider-instance-dialog__error",
    timeoutMs,
    predicate: (measurement) => measurement?.text.trim() === "Instance ID is required.",
  });
  const invalidFixture = await client.runCdp("Runtime.evaluate", {
    expression: `String(globalThis.__T3_LYNXTRON_PROVIDER_INSTANCE_PROBE__?.(${JSON.stringify({
      instanceId: "1 invalid",
      label: displayName,
    })}))`,
    returnByValue: true,
  });
  if (invalidFixture?.exceptionDetails || commandResult(invalidFixture)?.value !== "undefined") {
    throw new Error(
      `Native Provider Instance invalid fixture failed: ${JSON.stringify(invalidFixture)}`,
    );
  }
  await tapSelector({ child, client, selector: ".provider-instance-dialog__save", timeoutMs });
  const invalidError = await waitForMeasurement({
    child,
    client,
    selector: ".provider-instance-dialog__error",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.text.trim() ===
      "Instance ID must start with a letter and use only letters, digits, '-', or '_'.",
  });
  const validFixture = await client.runCdp("Runtime.evaluate", {
    expression: `String(globalThis.__T3_LYNXTRON_PROVIDER_INSTANCE_PROBE__?.(${JSON.stringify({
      accentColor: "#2563eb",
      instanceId,
      label: displayName,
    })}))`,
    returnByValue: true,
  });
  if (validFixture?.exceptionDetails || commandResult(validFixture)?.value !== "undefined") {
    throw new Error(
      `Native Provider Instance valid fixture failed: ${JSON.stringify(validFixture)}`,
    );
  }
  await tapSelector({ child, client, selector: ".provider-instance-dialog__save", timeoutMs });
  const config = await waitForMeasurement({
    child,
    client,
    selector: ".provider-instance-dialog",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.attributes["data-provider-wizard-step"] === "2" &&
      measurement.text.includes("Add instance"),
  });
  const configFields = await readSelectorMeasurements(client, ".provider-card__config-field");
  await tapSelector({ child, client, selector: ".provider-instance-dialog__save", timeoutMs });
  await waitForMeasurement({
    child,
    client,
    selector: ".provider-instance-dialog",
    timeoutMs,
    predicate: (measurement) => measurement === null,
  });
  const createdState = await waitForClientState({
    child,
    client,
    timeoutMs,
    predicate: (state) => state?.providerInstanceIds?.includes(instanceId) === true,
  });
  const createdCards = await waitForSelectorMeasurements({
    child,
    client,
    selector: ".provider-instance-card",
    timeoutMs,
    predicate: (measurements) =>
      measurements.some((measurement) => measurement.text.includes(displayName)),
  });
  const createdCard = createdCards.find((measurement) => measurement.text.includes(displayName));
  if (!createdCard)
    throw new Error(`Created provider card was not rendered: ${JSON.stringify(createdState)}`);
  await tapMeasurementDescendant({
    client,
    measurement: createdCard,
    selector: ".provider-instance-card__chevron",
  });
  const expandedCard = await waitForMeasurement({
    child,
    client,
    selector: ".provider-instance-card",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.text.includes(displayName) === true &&
      measurement.text.includes("Delete instance"),
  });
  await tapMeasurementDescendant({
    client,
    measurement: expandedCard,
    selector: ".provider-card__delete-instance",
  });
  const deletedState = await waitForClientState({
    child,
    client,
    timeoutMs,
    predicate: (state) => state?.providerInstanceIds?.includes(instanceId) === false,
  });
  await waitForSelectorMeasurements({
    child,
    client,
    selector: ".provider-instance-card",
    timeoutMs,
    predicate: (measurements) =>
      measurements.every((measurement) => !measurement.text.includes(displayName)),
  });
  const settingsPath = path.join(baseDir, "userdata", "settings.json");
  const persistedSettings = JSON.parse(
    await waitForFileContents({
      child,
      filePath: settingsPath,
      timeoutMs,
      predicate: (contents) =>
        Object.hasOwn(JSON.parse(contents).providerInstances ?? {}, instanceId) === false,
    }),
  );
  return {
    status: "pass",
    input:
      "testResize-gated form fixture plus DevTool touches on visible wizard, save, expand, and delete controls",
    dialog: dialog.rect,
    overlay: overlay?.rect ?? null,
    stepZero: {
      drivers: drivers.map(({ rect, text }) => ({ rect, text })),
      steps: steps.map(({ rect, text }) => ({ rect, text })),
    },
    stepOne: {
      rect: identity.rect,
      requiredError: requiredError.text.trim(),
      invalidError: invalidError.text.trim(),
    },
    stepTwo: { rect: config.rect, configFieldCount: configFields.length },
    mutation: {
      instanceId,
      displayName,
      created: createdState.providerInstanceIds.includes(instanceId),
      card: createdCard.rect,
      expanded: expandedCard.rect,
      deleted: deletedState.providerInstanceIds.includes(instanceId) === false,
      persistedAfterDelete:
        Object.hasOwn(persistedSettings.providerInstances ?? {}, instanceId) === false,
    },
    dismissed: true,
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
    Math.abs(sections[2].height - 290) > 2 ||
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

async function verifySidebarScopeBehavior({ child, client, height, timeoutMs, width }) {
  const viewport = { width, height };
  const placement = { side: "bottom", align: "start", sideOffset: 4 };
  const floatingAnchorRect = (measurement) => {
    const runtimeRect = measurement.attributes["data-floating-anchor-rect"];
    return typeof runtimeRect === "string" ? JSON.parse(runtimeRect) : measurement.rect;
  };
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
  const initialRelation = assertFloatingRelation({
    anchor: floatingAnchorRect(opened.trigger),
    label: "Sidebar project scope",
    placement,
    popup: popupRect,
    viewport,
  });

  const projectOption = await waitForMeasurement({
    child,
    client,
    selector: "[data-sidebar-project-scope-option]",
    timeoutMs,
    predicate: (measurement) =>
      typeof measurement?.attributes["data-sidebar-project-scope-option"] === "string",
  });
  await tapSelectorByAttribute({
    attribute: "data-sidebar-project-scope-option",
    child,
    client,
    selector: "[data-sidebar-project-scope-option]",
    timeoutMs,
    value: projectOption.attributes["data-sidebar-project-scope-option"],
  });
  const selected = await waitForSidebarPopup({ child, client, open: false, timeoutMs });
  if (selected.trigger.text.trim() === "All projects") {
    throw new Error(
      `Selecting the project scope did not update the trigger: ${JSON.stringify({
        dismissLayer: opened.dismissLayer,
        popup: opened.popup,
        projectOption,
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
  const reopened = await waitForSidebarPopup({ child, client, open: true, timeoutMs });
  const reopenedRelation = assertFloatingRelation({
    anchor: floatingAnchorRect(reopened.trigger),
    label: "Reopened Sidebar project scope",
    placement,
    popup: reopened.popup.rect,
    viewport,
  });
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
      relation: initialRelation,
    },
    reopenedRelation,
    selectedScope: selected.trigger.text,
    outsideTapClosed: true,
  };
}

async function verifyLifecycleRecovery({
  baseDir,
  child,
  client,
  log,
  projectId,
  timeoutMs,
  verifyComposerReconnect,
}) {
  await waitForLifecycleBannerToClear({ child, client, timeoutMs });
  const reconnectFixture = verifyComposerReconnect
    ? await (async () => {
        await tapSelector({ child, client, selector: ".sidebar-v2-new-thread", timeoutMs });
        const draft = await waitForClientState({
          child,
          client,
          timeoutMs,
          predicate: (state) =>
            typeof state?.draftThreadId === "string" &&
            state.activeThreadId === state.draftThreadId &&
            state.activeThread?.projectId === projectId,
        });
        await waitForRuntimeValue({
          child,
          client,
          expression:
            "[typeof globalThis.__T3_LYNXTRON_COMPOSER_INPUT_FIXTURE__, typeof globalThis.__T3_LYNXTRON_COMPOSER_TERMINAL_CONTEXT_FIXTURE__].join(':')",
          predicate: (value) => value === "function:function",
          timeoutMs,
        });
        const text = "Reconnect-scoped Native draft";
        const context = {
          id: "terminal-reconnect:7:8",
          terminalId: "terminal-reconnect",
          terminalLabel: "Terminal reconnect",
          lineStart: 7,
          lineEnd: 8,
          text: "before reconnect\nafter reconnect",
        };
        const fixtureResponse = await client.runCdp("Runtime.evaluate", {
          expression: `JSON.stringify({text:globalThis.__T3_LYNXTRON_COMPOSER_INPUT_FIXTURE__?.(${JSON.stringify(
            text,
          )}) ?? false,context:globalThis.__T3_LYNXTRON_COMPOSER_TERMINAL_CONTEXT_FIXTURE__?.(${JSON.stringify(
            context,
          )}) ?? false})`,
          returnByValue: true,
        });
        const fixtureResult = JSON.parse(commandResult(fixtureResponse)?.value ?? "null");
        if (fixtureResult?.text !== true || fixtureResult?.context !== true) {
          throw new Error(
            `Reconnect Composer fixtures were not applied: ${JSON.stringify(fixtureResponse)}`,
          );
        }
        const state = await waitForClientState({
          child,
          client,
          timeoutMs,
          predicate: (candidate) =>
            candidate?.activeThreadId === draft.draftThreadId &&
            candidate.activeComposerDraftText === text &&
            candidate.activeComposerTerminalContexts?.[0]?.id === context.id,
        });
        const route = await readRoutePanel(client);
        return { threadId: state.activeThreadId, text, context, route: route.route };
      })()
    : null;
  const connectedProjection = await waitForSessionComposerProjection({
    child,
    client,
    expectedComposerState: reconnectFixture ? "sendable" : undefined,
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
      (reconnectFixture
        ? "disabled"
        : connectedProjection.composer.attributes["data-composer-state"]),
  });
  const disabledPrimaryAction = await waitForMeasurement({
    child,
    client,
    selector: ".composer-primary-action",
    timeoutMs,
    predicate: (measurement) =>
      measurement?.attributes["data-composer-primary-state"] === "disabled",
  });
  const failedReconnectState = reconnectFixture
    ? await waitForClientState({
        child,
        client,
        timeoutMs,
        predicate: (state) =>
          state?.activeThreadId === reconnectFixture.threadId &&
          state.activeComposerDraftText === reconnectFixture.text &&
          state.activeComposerTerminalContexts?.[0]?.id === reconnectFixture.context.id,
      })
    : null;
  const failedRoute = reconnectFixture ? await readRoutePanel(client) : null;

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
    expectedComposerState: reconnectFixture ? "sendable" : undefined,
    expectedSessionStatus: connectedProjection.sessionStatus,
    timeoutMs,
  });
  const recoveredReconnectState = reconnectFixture
    ? await waitForClientState({
        child,
        client,
        timeoutMs,
        predicate: (state) =>
          state?.activeThreadId === reconnectFixture.threadId &&
          state.activeComposerDraftText === reconnectFixture.text &&
          state.activeComposerTerminalContexts?.[0]?.id === reconnectFixture.context.id,
      })
    : null;
  const recoveredRoute = reconnectFixture ? await readRoutePanel(client) : null;
  if (
    reconnectFixture &&
    (failedRoute?.route !== reconnectFixture.route ||
      recoveredRoute?.route !== reconnectFixture.route)
  ) {
    throw new Error(
      `Reconnect changed the Native route: ${JSON.stringify({ reconnectFixture, failedRoute, recoveredRoute })}`,
    );
  }

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
    composerReconnect: reconnectFixture
      ? {
          status: "pass",
          threadId: reconnectFixture.threadId,
          route: reconnectFixture.route,
          draftText: reconnectFixture.text,
          terminalContextId: reconnectFixture.context.id,
          failureStatePreserved: failedReconnectState !== null,
          recoveredStatePreserved: recoveredReconnectState !== null,
        }
      : undefined,
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
  expectedEnvironmentIdentificationMode,
  expectNoComposerContext,
  expectedModelLabel,
  outputDirectory,
  pairingUrl,
  projectCwd,
  requireCanonicalThread,
  timeoutMs,
  verifySettingsNavigation,
  verifySettingsAppearance: shouldVerifySettingsAppearance,
  verifyProvidersSettings: shouldVerifyProvidersSettings,
  verifyProviderInstanceDialog: shouldVerifyProviderInstanceDialog,
  verifySourceControlLoading: shouldVerifySourceControlLoading,
  verifySourceControlError: shouldVerifySourceControlError,
  verifyComposerGeometry: shouldVerifyComposerGeometry,
  verifyComposerSendMaterial: shouldVerifyComposerSendMaterial,
  verifyHeroComposerState: shouldVerifyHeroComposerState,
  verifyIdleThreadState: shouldVerifyIdleThreadState,
  idleFixture,
  verifyQuickSwitchDefault: shouldVerifyQuickSwitchDefault,
  verifyAddProjectSources: shouldVerifyAddProjectSources,
  verifyFilePickerDefault: shouldVerifyFilePickerDefault,
  verifyNewThreadProjects: shouldVerifyNewThreadProjects,
  verifySidebarProjectGroups: shouldVerifySidebarProjectGroups,
  expectedProjectTitles,
  verifySidebarGeometry: shouldVerifySidebarGeometry,
  verifySidebarInlineSearch: shouldVerifySidebarInlineSearch,
  verifyFloatingRelations: shouldVerifyFloatingRelations,
  verifySidebarScope,
  verifyLifecycleRecovery: shouldVerifyLifecycleRecovery,
  verifyComposerReconnect: shouldVerifyComposerReconnect,
  verifyComposerBranding,
  verifyNewThreadDraftLifecycle: shouldVerifyNewThreadDraftLifecycle,
  verifyModelPickerFidelity: shouldVerifyModelPickerFidelity,
  verifyModelSelectionMutation: shouldVerifyModelSelectionMutation,
  verifyModelSelectionSocketRecovery: shouldVerifyModelSelectionSocketRecovery,
  verifyModelSelectionRunningSession: shouldVerifyModelSelectionRunningSession,
  verifyRuntimeMenuDismiss: shouldVerifyRuntimeMenuDismiss,
  verifyWorkspaceMenu: shouldVerifyWorkspaceMenu,
  verifyPlanMode: shouldVerifyPlanMode,
  verifyModelOptionMenuMutation: shouldVerifyModelOptionMenuMutation,
  verifyComposerStop,
  verifyTerminalContextProviderSend: shouldVerifyTerminalContextProviderSend,
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
  verifyRightPanelAddMenu: shouldVerifyRightPanelAddMenu,
  verifyDiffScopeMenu: shouldVerifyDiffScopeMenu,
  verifyFilesBrowser: shouldVerifyFilesBrowser,
  verifyFileEditingSave: shouldVerifyFileEditingSave,
  fileEditorRelativePath,
  verifyFileSheetBack,
  verifyCompactControls: shouldVerifyCompactControls,
  verifyGitInitialize: shouldVerifyGitInitialize,
  verifyGitPublishDialog: shouldVerifyGitPublishDialog,
  verifyProjectActionDialog: shouldVerifyProjectActionDialog,
  verifyProjectSettingsDialog: shouldVerifyProjectSettingsDialog,
  verifyProjectActionKeybindingMutation: shouldVerifyProjectActionKeybindingMutation,
  verifyBetaMutation: shouldVerifyBetaMutation,
  verifyArchiveMutation: shouldVerifyArchiveMutation,
  verifyConnectionsMutation: shouldVerifyConnectionsMutation,
  verifyConnectionsLocalPolicy: shouldVerifyConnectionsLocalPolicy,
  composerStopEvidence,
  verifyRuntimeCapabilities: shouldVerifyRuntimeCapabilities,
  verifyPlan11SemanticOutcomes,
  settledBannerFixture,
  width,
}) {
  const runRoot = mkdtempSync(path.join(os.tmpdir(), `t3code-packaged-readiness-${index}-`));
  const baseDir = path.join(runRoot, "state");
  cpSync(fixtureDir, baseDir, { recursive: true });
  const initialPersistedThreadIds = shouldVerifyNewThreadDraftLifecycle
    ? readPersistedThreadIds(baseDir)
    : [];
  const recoverableEmptyThreadIds = shouldVerifyNewThreadDraftLifecycle
    ? readPersistedEmptyThreadIds(baseDir)
    : [];
  const draftLifecycleProjectId = shouldVerifyNewThreadDraftLifecycle
    ? readPersistedProjects(baseDir)[0]?.projectId
    : undefined;
  if (
    expectedEnvironmentIdentificationMode ||
    expectedTheme ||
    shouldVerifyAddProjectSources ||
    shouldVerifyNewThreadProjects ||
    shouldVerifySidebarProjectGroups
  ) {
    const prefsPath = path.join(baseDir, "lynxtron-prefs.json");
    const prefs = JSON.parse(readFileSync(prefsPath, "utf8"));
    writeFileSync(
      prefsPath,
      `${JSON.stringify(
        {
          ...prefs,
          ...(expectedTheme ? { themePreference: expectedTheme } : {}),
          ...(shouldVerifyAddProjectSources
            ? { initialOverlay: "add-project" }
            : shouldVerifyQuickSwitchDefault
              ? { initialOverlay: "quick-switch" }
              : {}),
          clientSettings: {
            ...prefs.clientSettings,
            ...(shouldVerifyNewThreadProjects ? { legacySidebarEnabled: false } : {}),
            ...(shouldVerifySidebarProjectGroups
              ? {
                  legacySidebarEnabled: true,
                  sidebarProjectGroupingMode: "separate",
                }
              : {}),
            ...(expectedEnvironmentIdentificationMode
              ? { environmentIdentificationMode: expectedEnvironmentIdentificationMode }
              : {}),
          },
        },
        null,
        2,
      )}\n`,
    );
  }
  let child = spawn(executable, [desktopDir], {
    cwd: APP_ROOT,
    env: {
      ...process.env,
      NODE_ENV: "production",
      T3_LYNXTRON_BASE_DIR: baseDir,
      T3_LYNXTRON_PROJECT_CWD: projectCwd,
      T3_LYNXTRON_VIEWPORT_WIDTH: String(width),
      T3_LYNXTRON_VIEWPORT_HEIGHT: String(height),
      ...(pairingUrl ? { T3_LYNXTRON_PAIRING_URL: pairingUrl } : {}),
      ...(shouldVerifyConnectionsMutation ? { T3CODE_HOST: "0.0.0.0" } : {}),
      ...(shouldVerifyModelOptionMenuMutation ||
      shouldVerifyComposerSendMaterial ||
      shouldVerifySidebarInlineSearch ||
      shouldVerifyCompactControls ||
      shouldVerifyProjectActionKeybindingMutation ||
      shouldVerifyFileEditingSave ||
      shouldVerifyFilePickerDefault ||
      shouldVerifyNewThreadProjects ||
      shouldVerifyNewThreadDraftLifecycle ||
      shouldVerifyComposerReconnect ||
      shouldVerifyTerminalContextProviderSend ||
      shouldVerifyModelPickerFidelity ||
      shouldVerifyQuestionTranscriptState ||
      shouldVerifyCompletedTranscriptState ||
      shouldVerifyQuickSwitchDefault ||
      shouldVerifyProviderInstanceDialog
        ? { T3_LYNXTRON_VIEWPORT_PROBE: "1" }
        : {}),
      ...(shouldVerifyFloatingRelations ? { T3_LYNXTRON_VIEWPORT_PROBE: "1" } : {}),
      ...(shouldVerifyModelSelectionSocketRecovery
        ? { T3_TEST_MODEL_SELECTION_SOCKET_OPEN_ERROR_ONCE: "1" }
        : {}),
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
    if (!pairingUrl) {
      await waitForLogText(child, log, "T3 Code server is ready", timeoutMs);
    }
    const beforeProbe = await waitForMainTransport({ child, client, timeoutMs });
    const theme = await verifyExpectedTheme({
      child,
      client,
      expectedTheme,
      timeoutMs,
    });
    if (settledBannerFixture) {
      await client.runCdp("Runtime.evaluate", {
        expression: `globalThis.__T3_LYNXTRON_SELECT_THREAD__?.(${JSON.stringify(
          settledBannerFixture.threadId,
        )})`,
        returnByValue: true,
      });
      await waitForClientState({
        child,
        client,
        timeoutMs,
        predicate: (state) => state?.activeThreadId === settledBannerFixture.threadId,
      });
    }
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
        : settledBannerFixture
          ? await waitForExplicitThreadState({
              child,
              client,
              fixture: settledBannerFixture,
              timeoutMs,
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
                skipped: "Outcome uses an explicit empty-thread fixture.",
              };
    const runPlan11Outcomes = verifyPlan11SemanticOutcomes && isFinalRun;
    const cleanupOutcome = () => restoreOutcomeSurface({ child, client, timeoutMs });
    const sidebarScope = runPlan11Outcomes
      ? await captureOutcome(
          () => verifySidebarScopeBehavior({ child, client, height, timeoutMs, width }),
          cleanupOutcome,
        )
      : verifySidebarScope
        ? await verifySidebarScopeBehavior({ child, client, height, timeoutMs, width })
        : undefined;
    const sidebarProjectGroups = shouldVerifySidebarProjectGroups
      ? await verifySidebarProjectGroups({
          child,
          client,
          devToolCli,
          expectedProjectTitles,
          expectedTheme,
          outputDirectory,
          timeoutMs,
        })
      : undefined;
    const sidebarGeometry = shouldVerifySidebarGeometry
      ? await verifySidebarGeometry(client, width, expectedEnvironmentIdentificationMode)
      : undefined;
    const sidebarInlineSearch = shouldVerifySidebarInlineSearch
      ? await verifySidebarInlineSearch({ child, client, timeoutMs })
      : undefined;
    const floatingRelations = shouldVerifyFloatingRelations
      ? await verifyFloatingRelations({
          child,
          client,
          devToolCli,
          expectedTheme,
          height,
          outputDirectory,
          timeoutMs,
          width,
        })
      : undefined;
    const composerGeometry = shouldVerifyComposerGeometry
      ? await verifyComposerGeometry(client, expectedTheme)
      : undefined;
    const composerSendMaterial = shouldVerifyComposerSendMaterial
      ? await verifyComposerSendMaterial({
          baseDir,
          child,
          client,
          devToolCli,
          expectSocketRecovery: shouldVerifyModelSelectionSocketRecovery,
          log,
          outputDirectory,
          timeoutMs,
        })
      : undefined;
    const heroComposerState = shouldVerifyHeroComposerState
      ? await verifyHeroComposerState({
          child,
          client,
          devToolCli,
          expectNoComposerContext,
          expectedModelLabel,
          expectedTheme,
          outputDirectory,
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
      ? await verifyQuickSwitchState({
          child,
          client,
          devToolCli,
          expectedTheme,
          outputDirectory,
          query: quickSwitchQuery,
          timeoutMs,
        })
      : undefined;
    const addProjectSources = shouldVerifyAddProjectSources
      ? await verifyAddProjectSources({
          child,
          client,
          devToolCli,
          expectedTheme,
          outputDirectory,
          timeoutMs,
        })
      : undefined;
    const newThreadProjects = shouldVerifyNewThreadProjects
      ? await verifyNewThreadProjects({
          baseDir,
          child,
          client,
          devToolCli,
          expectedProjectTitles,
          expectedTheme,
          outputDirectory,
          timeoutMs,
        })
      : undefined;
    const filePickerDefault = shouldVerifyFilePickerDefault
      ? await verifyFilePickerDefault({
          child,
          client,
          devToolCli,
          expectedTheme,
          outputDirectory,
          timeoutMs,
        })
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
    const settingsAppearance = shouldVerifySettingsAppearance
      ? await verifySettingsAppearance({
          child,
          client,
          devToolCli,
          outputDirectory,
          timeoutMs,
        })
      : undefined;
    const providersSettings = shouldVerifyProvidersSettings
      ? await verifyProvidersSettings({
          child,
          client,
          devToolCli,
          outputDirectory,
          timeoutMs,
        })
      : undefined;
    const providerInstanceDialog = shouldVerifyProviderInstanceDialog
      ? await verifyProviderInstanceDialog({
          baseDir,
          child,
          client,
          height,
          timeoutMs,
          width,
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
    const connectionsLocalPolicy = shouldVerifyConnectionsLocalPolicy
      ? await verifyConnectionsLocalPolicy({
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
    let newThreadDraftLifecycle;
    if (shouldVerifyNewThreadDraftLifecycle) {
      const draftLifecycleVerification = await verifyNewThreadDraftLifecycle({
        baseDir,
        bundle,
        child,
        client,
        desktopDir,
        devToolCli,
        executable,
        height,
        initialPersistedThreadIds,
        projectId: draftLifecycleProjectId,
        projectCwd,
        recoverableEmptyThreadIds,
        timeoutMs,
        width,
      });
      newThreadDraftLifecycle = draftLifecycleVerification.outcome;
      child = draftLifecycleVerification.child;
      client = draftLifecycleVerification.client;
      log = draftLifecycleVerification.log;
    }
    const modelPickerFidelity = shouldVerifyModelPickerFidelity
      ? await verifyModelPickerFidelity({
          baseDir,
          child,
          client,
          devToolCli,
          expectedTheme,
          outputDirectory,
          timeoutMs,
          viewportHeight: height,
          viewportWidth: width,
        })
      : undefined;
    const modelSelectionMutation = shouldVerifyModelSelectionMutation
      ? await verifyModelSelectionMutation({
          baseDir,
          child,
          client,
          devToolCli,
          expectSocketRecovery: shouldVerifyModelSelectionSocketRecovery,
          requireRunningSession: shouldVerifyModelSelectionRunningSession,
          log,
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
    const workspaceMenu = shouldVerifyWorkspaceMenu
      ? await verifyWorkspaceMenu({
          baseDir,
          child,
          client,
          height,
          timeoutMs,
          width,
        })
      : undefined;
    const planMode = shouldVerifyPlanMode
      ? await verifyPlanMode({
          baseDir,
          child,
          client,
          devToolCli,
          outputDirectory,
          timeoutMs,
        })
      : undefined;
    const modelOptionMenuMutation = shouldVerifyModelOptionMenuMutation
      ? await verifyModelOptionMenuMutation({
          baseDir,
          child,
          client,
          devToolCli,
          outputDirectory,
          timeoutMs,
        })
      : undefined;
    const composerStop = verifyComposerStop
      ? await verifyComposerStopBehavior({
          child,
          client,
          devToolCli,
          expectedEnvironmentIdentificationMode,
          outputDirectory,
          projectId: fixtureManifestProjectId,
          timeoutMs,
          viewportWidth: width,
        })
      : undefined;
    const terminalContextProviderSend = shouldVerifyTerminalContextProviderSend
      ? await verifyTerminalContextProviderSend({
          child,
          client,
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
          child,
          client,
          devToolCli,
          outputDirectory,
        })
      : undefined;
    const failedTranscriptState = shouldVerifyFailedTranscriptState
      ? await verifyFailedTranscriptState({
          child,
          client,
          devToolCli,
          outputDirectory,
          timeoutMs,
        })
      : undefined;
    const approvalTranscriptState =
      shouldVerifyApprovalTranscriptState || shouldVerifyApprovalDeclineMutation
        ? await verifyApprovalTranscriptState({
            approvalFixture,
            client,
            devToolCli,
            expectedTheme,
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
          baseDir,
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
    const rightPanelAddMenu = shouldVerifyRightPanelAddMenu
      ? await verifyRightPanelAddMenu({
          child,
          client,
          devToolCli,
          height,
          outputDirectory,
          timeoutMs,
          width,
        })
      : undefined;
    const diffScopeMenu = shouldVerifyDiffScopeMenu
      ? await verifyDiffScopeMenu({
          child,
          client,
          devToolCli,
          height,
          outputDirectory,
          reviewFixture,
          timeoutMs,
          width,
        })
      : undefined;
    const filesBrowser = shouldVerifyFilesBrowser
      ? await verifyFilesBrowser({
          child,
          client,
          devToolCli,
          height,
          outputDirectory,
          projectCwd,
          timeoutMs,
          verifyFileEditingSave: shouldVerifyFileEditingSave,
          fileEditorRelativePath,
          verifyFileSheetBack,
          verifyResponsiveSidebarFooterOnly: shouldVerifyResponsiveSidebarFooter,
          verifyResponsiveSettledBanner: shouldVerifyResponsiveSettledBanner,
          width,
        })
      : undefined;
    const compactControls = shouldVerifyCompactControls
      ? await verifyCompactControls({
          child,
          client,
          devToolCli,
          height,
          outputDirectory,
          timeoutMs,
          width,
        })
      : undefined;
    const gitInitialize = shouldVerifyGitInitialize
      ? await verifyGitInitialize({
          child,
          client,
          devToolCli,
          outputDirectory,
          projectCwd,
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
    const projectActionDialog = shouldVerifyProjectActionDialog
      ? await verifyProjectActionDialog({
          child,
          client,
          height,
          timeoutMs,
          width,
        })
      : undefined;
    const projectSettingsDialog = shouldVerifyProjectSettingsDialog
      ? await verifyProjectSettingsDialog({
          child,
          client,
          devToolCli,
          height,
          outputDirectory,
          timeoutMs,
          width,
        })
      : undefined;
    let projectActionKeybindingMutation;
    if (shouldVerifyProjectActionKeybindingMutation) {
      const projectActionKeybindingVerification = await verifyProjectActionKeybindingMutation({
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
      projectActionKeybindingMutation = projectActionKeybindingVerification.outcome;
      child = projectActionKeybindingVerification.child;
      client = projectActionKeybindingVerification.client;
      log = projectActionKeybindingVerification.log;
    }
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
        ? await verifyLifecycleRecovery({
            baseDir,
            child,
            client,
            log,
            projectId: fixtureManifestProjectId,
            timeoutMs,
            verifyComposerReconnect: shouldVerifyComposerReconnect,
          })
        : undefined;
    const rendererErrors = readRendererErrors({
      clientId: client.identity.clientId,
      devToolCli,
      sessionId: client.identity.sessionId,
    });
    if (rendererErrors) throw new Error(`Renderer errors:\n${rendererErrors}`);
    const outcomeChecks = [
      sidebarScope,
      sidebarProjectGroups,
      sidebarGeometry,
      sidebarInlineSearch,
      floatingRelations,
      composerGeometry,
      composerSendMaterial,
      heroComposerState,
      idleThreadState,
      quickSwitchDefault,
      addProjectSources,
      newThreadProjects,
      filePickerDefault,
      settingsNavigation,
      settingsAppearance,
      providersSettings,
      providerInstanceDialog,
      sourceControlLoading,
      sourceControlError,
      composer,
      newThreadDraftLifecycle,
      modelPickerFidelity,
      modelSelectionMutation,
      runtimeMenuDismiss,
      workspaceMenu,
      planMode,
      modelOptionMenuMutation,
      composerStop,
      terminalContextProviderSend,
      composerWorkingState,
      completedTranscriptState,
      failedTranscriptState,
      approvalTranscriptState,
      approvalDeclineMutation,
      questionTranscriptState,
      reviewDiffState,
      reviewCheckpointStates,
      shellInteractions,
      rightPanelAddMenu,
      diffScopeMenu,
      filesBrowser,
      compactControls,
      gitInitialize,
      gitPublishDialog,
      projectActionDialog,
      projectSettingsDialog,
      projectActionKeybindingMutation,
      betaMutation,
      archiveMutation,
      connectionsMutation,
      connectionsLocalPolicy,
      runtimeCapabilities,
      branding,
      lifecycleRecovery,
    ].filter(Boolean);
    return {
      index,
      status: outcomeChecks.every((outcome) => outcome.status === "pass") ? "pass" : "fail",
      startedAt,
      processId: child.pid,
      isolatedState: { path: pairingUrl ? null : baseDir, disposed: true },
      connection: {
        mode: pairingUrl ? "existing-environment" : "owned-local",
        serverOwned: !pairingUrl,
      },
      serverPort: Number(log.read().match(/Listening on http:\/\/127\.0\.0\.1:(\d+)/u)?.[1]),
      client: client.identity,
      transport,
      theme,
      canonicalState,
      lifecycleRecovery,
      sidebarScope,
      sidebarProjectGroups,
      sidebarGeometry,
      sidebarInlineSearch,
      floatingRelations,
      composerGeometry,
      composerSendMaterial,
      heroComposerState,
      idleThreadState,
      quickSwitchDefault,
      addProjectSources,
      newThreadProjects,
      filePickerDefault,
      composerThemeScreenshot,
      settingsNavigation,
      settingsAppearance,
      providersSettings,
      providerInstanceDialog,
      sourceControlLoading,
      sourceControlError,
      composer,
      newThreadDraftLifecycle,
      modelPickerFidelity,
      modelSelectionMutation,
      runtimeMenuDismiss,
      workspaceMenu,
      planMode,
      modelOptionMenuMutation,
      composerStop,
      terminalContextProviderSend,
      composerWorkingState,
      completedTranscriptState,
      failedTranscriptState,
      approvalTranscriptState,
      approvalDeclineMutation,
      questionTranscriptState,
      reviewDiffState,
      reviewCheckpointStates,
      shellInteractions,
      rightPanelAddMenu,
      diffScopeMenu,
      filesBrowser,
      compactControls,
      gitInitialize,
      gitPublishDialog,
      projectActionDialog,
      projectSettingsDialog,
      projectActionKeybindingMutation,
      betaMutation,
      archiveMutation,
      connectionsMutation,
      connectionsLocalPolicy,
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
      isolatedState: { path: pairingUrl ? null : baseDir, disposed: true },
      connection: {
        mode: pairingUrl ? "existing-environment" : "owned-local",
        serverOwned: !pairingUrl,
      },
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
const pairingUrlFile = argumentValue("--pairing-url-file");
const pairingUrl = pairingUrlFile
  ? readFileSync(path.resolve(pairingUrlFile), "utf8").trim()
  : null;
const expectedTheme = argumentValue("--expected-theme");
const expectedEnvironmentIdentificationMode = argumentValue(
  "--expected-environment-identification-mode",
);
const expectedModelLabel = argumentValue("--expected-model-label");
const expectNoComposerContext = process.argv.includes("--expect-no-composer-context");
const verifySettingsNavigation = process.argv.includes("--verify-settings-navigation");
const shouldVerifySettingsAppearance = process.argv.includes("--verify-settings-appearance");
const shouldVerifyProvidersSettings = process.argv.includes("--verify-providers-settings");
const shouldVerifyProviderInstanceDialog = process.argv.includes(
  "--verify-provider-instance-dialog",
);
const shouldVerifySourceControlLoading = process.argv.includes("--verify-source-control-loading");
const shouldVerifySourceControlError = process.argv.includes("--verify-source-control-error");
const shouldVerifyComposerGeometry = process.argv.includes("--verify-composer-geometry");
const shouldVerifyComposerSendMaterial = process.argv.includes("--verify-composer-send-material");
const shouldVerifyHeroComposerState = process.argv.includes("--verify-hero-composer-state");
const shouldVerifyIdleThreadState = process.argv.includes("--verify-idle-thread-state");
const shouldVerifyQuickSwitchDefault = process.argv.includes("--verify-quick-switch-default");
const shouldVerifyAddProjectSources = process.argv.includes("--verify-add-project-sources");
const shouldVerifyNewThreadProjects = process.argv.includes("--verify-new-thread-projects");
const shouldVerifyFilePickerDefault = process.argv.includes("--verify-file-picker-default");
const shouldVerifySidebarProjectGroups = process.argv.includes("--verify-sidebar-project-groups");
const quickSwitchQuery = argumentValue("--quick-switch-query") ?? "";
const shouldVerifySidebarGeometry = process.argv.includes("--verify-sidebar-geometry");
const shouldVerifySidebarInlineSearch = process.argv.includes("--verify-sidebar-inline-search");
const shouldVerifyFloatingRelations = process.argv.includes("--verify-floating-relations");
const verifySidebarScope = process.argv.includes("--verify-sidebar-scope");
const shouldVerifyLifecycleRecovery = process.argv.includes("--verify-lifecycle-recovery");
const shouldVerifyComposerReconnect = process.argv.includes("--verify-composer-reconnect");
const verifyComposerBranding = process.argv.includes("--verify-composer-branding");
const shouldVerifyNewThreadDraftLifecycle = process.argv.includes(
  "--verify-new-thread-draft-lifecycle",
);
const shouldVerifyModelPickerFidelity = process.argv.includes("--verify-model-picker-fidelity");
const shouldVerifyModelSelectionMutation = process.argv.includes(
  "--verify-model-selection-mutation",
);
const shouldVerifyModelSelectionSocketRecovery = process.argv.includes(
  "--verify-model-selection-socket-recovery",
);
const shouldVerifyModelSelectionRunningSession = process.argv.includes(
  "--verify-model-selection-running-session",
);
const shouldVerifyRuntimeMenuDismiss = process.argv.includes("--verify-runtime-menu-dismiss");
const shouldVerifyWorkspaceMenu = process.argv.includes("--verify-workspace-menu");
const shouldVerifyPlanMode = process.argv.includes("--verify-plan-mode");
const shouldVerifyModelOptionMenuMutation = process.argv.includes(
  "--verify-model-option-menu-mutation",
);
const verifyComposerStop = process.argv.includes("--verify-composer-stop");
const shouldVerifyTerminalContextProviderSend = process.argv.includes(
  "--verify-terminal-context-provider-send",
);
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
const shouldVerifyRightPanelAddMenu = process.argv.includes("--verify-right-panel-add-menu");
const shouldVerifyDiffScopeMenu = process.argv.includes("--verify-diff-scope-menu");
const shouldVerifyFilesBrowser = process.argv.includes("--verify-files-browser");
const shouldVerifyFileEditingSave = process.argv.includes("--verify-file-editing-save");
const fileEditorRelativePath = argumentValue("--file-editor-relative-path") ?? "";
const shouldVerifyFileSheetBack = process.argv.includes("--verify-file-sheet-back");
const shouldVerifyCompactControls = process.argv.includes("--verify-compact-controls");
const shouldVerifyResponsiveSidebarFooter = process.argv.includes(
  "--verify-responsive-sidebar-footer",
);
const shouldVerifyResponsiveSettledBanner = process.argv.includes(
  "--verify-responsive-settled-banner",
);
const shouldVerifyGitInitialize = process.argv.includes("--verify-git-initialize");
const shouldVerifyGitPublishDialog = process.argv.includes("--verify-git-publish-dialog");
const shouldVerifyProjectActionDialog = process.argv.includes("--verify-project-action-dialog");
const shouldVerifyProjectSettingsDialog = process.argv.includes("--verify-project-settings-dialog");
const shouldVerifyProjectActionKeybindingMutation = process.argv.includes(
  "--verify-project-action-keybinding-mutation",
);
const shouldVerifyBetaMutation = process.argv.includes("--verify-beta-mutation");
const shouldVerifyArchiveMutation = process.argv.includes("--verify-archive-mutation");
const shouldVerifyConnectionsMutation = process.argv.includes("--verify-connections-mutation");
const shouldVerifyConnectionsLocalPolicy = process.argv.includes(
  "--verify-connections-local-policy",
);
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
if (
  expectedEnvironmentIdentificationMode &&
  expectedEnvironmentIdentificationMode !== "artwork" &&
  expectedEnvironmentIdentificationMode !== "none"
) {
  throw new Error("--expected-environment-identification-mode must be artwork or none.");
}
if (shouldVerifyHeroComposerState && !expectedModelLabel) {
  throw new Error("--verify-hero-composer-state requires --expected-model-label.");
}
if (shouldVerifyComposerReconnect && !shouldVerifyLifecycleRecovery) {
  throw new Error("--verify-composer-reconnect requires --verify-lifecycle-recovery.");
}
if (quickSwitchQuery.length > 0 && !shouldVerifyQuickSwitchDefault) {
  throw new Error("--quick-switch-query requires --verify-quick-switch-default.");
}
if (shouldVerifyModelSelectionSocketRecovery && !shouldVerifyModelSelectionMutation) {
  throw new Error(
    "--verify-model-selection-socket-recovery requires --verify-model-selection-mutation.",
  );
}
if (shouldVerifyFileSheetBack && !shouldVerifyFilesBrowser) {
  throw new Error("--verify-file-sheet-back requires --verify-files-browser.");
}
if (
  shouldVerifyFileEditingSave &&
  (!shouldVerifyFilesBrowser || fileEditorRelativePath.length === 0)
) {
  throw new Error(
    "--verify-file-editing-save requires --verify-files-browser and --file-editor-relative-path.",
  );
}
if (shouldVerifyResponsiveSidebarFooter && !shouldVerifyFilesBrowser) {
  throw new Error("--verify-responsive-sidebar-footer requires --verify-files-browser.");
}
if (shouldVerifyResponsiveSettledBanner && !shouldVerifyFilesBrowser) {
  throw new Error("--verify-responsive-settled-banner requires --verify-files-browser.");
}
if (shouldVerifyModelSelectionRunningSession && !shouldVerifyModelSelectionMutation) {
  throw new Error(
    "--verify-model-selection-running-session requires --verify-model-selection-mutation.",
  );
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
const expectedProjectTitles = fixtureManifest.projectGroupTitles;
if (
  (shouldVerifySidebarProjectGroups || shouldVerifyNewThreadProjects) &&
  (!Array.isArray(expectedProjectTitles) ||
    expectedProjectTitles.length < 2 ||
    expectedProjectTitles.some((title) => typeof title !== "string" || title.length === 0))
) {
  throw new Error(
    "--verify-sidebar-project-groups and --verify-new-thread-projects require visual-state.json projectGroupTitles.",
  );
}
const settledBannerFixture = fixtureManifest.settledBannerFixture;
if (
  shouldVerifyResponsiveSettledBanner &&
  (typeof settledBannerFixture?.threadId !== "string" ||
    typeof settledBannerFixture?.title !== "string" ||
    typeof settledBannerFixture?.activeTurnId !== "string")
) {
  throw new Error(
    "--verify-responsive-settled-banner requires a settledBannerFixture with explicit thread and turn identity.",
  );
}
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
  questionFixture?.mode !== "question" &&
  questionFixture?.mode !== "question-multi-step"
) {
  throw new Error(
    "--verify-question-transcript-state requires a real pendingRequestFixture question.",
  );
}
if (
  shouldVerifyQuestionTranscriptState &&
  (typeof questionFixture.threadId !== "string" ||
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
if (
  shouldVerifyQuestionTranscriptState &&
  questionFixture.mode === "question-multi-step" &&
  (questionFixture.activity.payload.questions.length !== 2 ||
    questionFixture.activity.payload.questions[0]?.multiSelect === true ||
    questionFixture.activity.payload.questions[1]?.multiSelect !== true)
) {
  throw new Error(
    "--verify-question-transcript-state requires a two-question single-select then multi-select fixture.",
  );
}
const reviewFixture = fixtureManifest.reviewFixture;
if (
  (shouldVerifyReviewDiffState ||
    shouldVerifyReviewCheckpointStates ||
    shouldVerifyDiffScopeMenu) &&
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
if (shouldVerifyComposerReconnect && typeof fixtureManifestProjectId !== "string") {
  throw new Error("--verify-composer-reconnect requires visual-state.json project.projectId.");
}
const transcriptFixture = fixtureManifest.transcriptFixture;
if (
  verifyComposerStop &&
  (typeof fixtureManifestProjectId !== "string" || fixtureManifestProjectId.length === 0)
) {
  throw new Error("--verify-composer-stop requires visual-state.json project.projectId.");
}
if (shouldVerifyTerminalContextProviderSend && typeof fixtureManifestProjectId !== "string") {
  throw new Error(
    "--verify-terminal-context-provider-send requires visual-state.json project.projectId.",
  );
}
const canonicalThreadTitle = shouldVerifyIdleThreadState
  ? idleFixture.title
  : shouldVerifyCompletedTranscriptState || shouldVerifyFailedTranscriptState
    ? transcriptFixture?.title
    : shouldVerifyApprovalTranscriptState ||
        shouldVerifyApprovalDeclineMutation ||
        shouldVerifyQuestionTranscriptState
      ? fixtureManifest.pendingRequestFixture.title
      : shouldVerifyReviewDiffState ||
          shouldVerifyReviewCheckpointStates ||
          shouldVerifyDiffScopeMenu
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
const gitInitializeOnlyEmptyFixture =
  shouldVerifyGitInitialize &&
  !verifySettingsNavigation &&
  !verifySidebarScope &&
  !verifyComposerBranding &&
  !shouldVerifyModelPickerFidelity &&
  !verifyPlan11SemanticOutcomes;
const rightPanelAddMenuOnlyEmptyFixture =
  shouldVerifyRightPanelAddMenu &&
  !verifySettingsNavigation &&
  !verifySidebarScope &&
  !verifyComposerBranding &&
  !shouldVerifyModelPickerFidelity &&
  !verifyPlan11SemanticOutcomes;
const projectSettingsOnlyEmptyFixture =
  shouldVerifyProjectSettingsDialog &&
  !verifySettingsNavigation &&
  !verifySidebarScope &&
  !verifyComposerBranding &&
  !shouldVerifyModelPickerFidelity &&
  !verifyPlan11SemanticOutcomes;
const fileEditingSaveOnlyEmptyFixture =
  shouldVerifyFileEditingSave &&
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
  !gitInitializeOnlyEmptyFixture &&
  !rightPanelAddMenuOnlyEmptyFixture &&
  !projectSettingsOnlyEmptyFixture &&
  !fileEditingSaveOnlyEmptyFixture &&
  !shouldVerifySettingsAppearance &&
  !shouldVerifySidebarProjectGroups &&
  !shouldVerifyNewThreadProjects &&
  !shouldVerifyFilePickerDefault &&
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
      : shouldVerifyReviewDiffState ||
          shouldVerifyReviewCheckpointStates ||
          shouldVerifyDiffScopeMenu
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
      expectedEnvironmentIdentificationMode,
      expectNoComposerContext,
      expectedModelLabel,
      outputDirectory,
      pairingUrl,
      projectCwd,
      requireCanonicalThread:
        !lifecycleOnlyEmptyFixture &&
        !heroOnlyEmptyFixture &&
        !sourceControlLoadingOnlyEmptyFixture &&
        !sourceControlErrorOnlyEmptyFixture &&
        !gitInitializeOnlyEmptyFixture &&
        !rightPanelAddMenuOnlyEmptyFixture &&
        !projectSettingsOnlyEmptyFixture &&
        !fileEditingSaveOnlyEmptyFixture &&
        !shouldVerifySettingsAppearance &&
        !shouldVerifySidebarProjectGroups &&
        !shouldVerifyNewThreadProjects &&
        !shouldVerifyFilePickerDefault &&
        !shouldVerifyFileSheetBack,
      timeoutMs,
      verifySettingsNavigation,
      verifySettingsAppearance: shouldVerifySettingsAppearance,
      verifyProvidersSettings: shouldVerifyProvidersSettings,
      verifyProviderInstanceDialog: shouldVerifyProviderInstanceDialog,
      verifySourceControlLoading: shouldVerifySourceControlLoading,
      verifySourceControlError: shouldVerifySourceControlError,
      verifyComposerGeometry: shouldVerifyComposerGeometry,
      verifyComposerSendMaterial: shouldVerifyComposerSendMaterial,
      verifyHeroComposerState: shouldVerifyHeroComposerState,
      verifyIdleThreadState: shouldVerifyIdleThreadState,
      idleFixture,
      verifyQuickSwitchDefault: shouldVerifyQuickSwitchDefault,
      verifyAddProjectSources: shouldVerifyAddProjectSources,
      verifyNewThreadProjects: shouldVerifyNewThreadProjects,
      verifyFilePickerDefault: shouldVerifyFilePickerDefault,
      verifySidebarProjectGroups: shouldVerifySidebarProjectGroups,
      expectedProjectTitles,
      verifySidebarGeometry: shouldVerifySidebarGeometry,
      verifySidebarInlineSearch: shouldVerifySidebarInlineSearch,
      verifyFloatingRelations: shouldVerifyFloatingRelations,
      verifySidebarScope,
      verifyLifecycleRecovery: shouldVerifyLifecycleRecovery,
      verifyComposerReconnect: shouldVerifyComposerReconnect,
      verifyComposerBranding,
      verifyNewThreadDraftLifecycle: shouldVerifyNewThreadDraftLifecycle,
      verifyModelPickerFidelity: shouldVerifyModelPickerFidelity,
      verifyModelSelectionMutation: shouldVerifyModelSelectionMutation,
      verifyModelSelectionSocketRecovery: shouldVerifyModelSelectionSocketRecovery,
      verifyModelSelectionRunningSession: shouldVerifyModelSelectionRunningSession,
      verifyRuntimeMenuDismiss: shouldVerifyRuntimeMenuDismiss,
      verifyWorkspaceMenu: shouldVerifyWorkspaceMenu,
      verifyPlanMode: shouldVerifyPlanMode,
      verifyModelOptionMenuMutation: shouldVerifyModelOptionMenuMutation,
      verifyComposerStop,
      verifyTerminalContextProviderSend: shouldVerifyTerminalContextProviderSend,
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
      verifyRightPanelAddMenu: shouldVerifyRightPanelAddMenu,
      verifyDiffScopeMenu: shouldVerifyDiffScopeMenu,
      verifyFilesBrowser: shouldVerifyFilesBrowser,
      verifyFileEditingSave: shouldVerifyFileEditingSave,
      fileEditorRelativePath,
      verifyFileSheetBack: shouldVerifyFileSheetBack,
      verifyCompactControls: shouldVerifyCompactControls,
      verifyGitInitialize: shouldVerifyGitInitialize,
      verifyGitPublishDialog: shouldVerifyGitPublishDialog,
      verifyProjectActionDialog: shouldVerifyProjectActionDialog,
      verifyProjectSettingsDialog: shouldVerifyProjectSettingsDialog,
      verifyProjectActionKeybindingMutation: shouldVerifyProjectActionKeybindingMutation,
      verifyBetaMutation: shouldVerifyBetaMutation,
      verifyArchiveMutation: shouldVerifyArchiveMutation,
      verifyConnectionsMutation: shouldVerifyConnectionsMutation,
      verifyConnectionsLocalPolicy: shouldVerifyConnectionsLocalPolicy,
      composerStopEvidence,
      verifyRuntimeCapabilities: shouldVerifyRuntimeCapabilities,
      verifyPlan11SemanticOutcomes,
      settledBannerFixture: shouldVerifyResponsiveSettledBanner ? settledBannerFixture : undefined,
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
  expectedEnvironmentIdentificationMode: expectedEnvironmentIdentificationMode ?? null,
  results,
  semanticOutcomes: verifyPlan11SemanticOutcomes
    ? buildPlan11SemanticOutcomes(results.at(-1))
    : undefined,
  certification: verifyPlan11SemanticOutcomes ? buildPlan11SemanticCertification() : undefined,
};
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.status !== "pass") process.exitCode = 1;
