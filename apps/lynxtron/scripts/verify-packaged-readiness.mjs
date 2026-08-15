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
  if (includePopup) anchors.push({ id: "popup", lynx: ".sidebar-v2-scope-popup" });
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

async function verifySidebarGeometry(client) {
  const [sidebar] = await readSelectorRects(client, ".sidebar");
  const [threadList] = await readSelectorRects(client, ".sidebar-v2-thread-list");
  const rows = await readSelectorRects(client, ".sidebar-v2-row-item");
  const cards = await readSelectorRects(client, ".sidebar-v2-row-card");
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
  return {
    status: "pass",
    input: "read-only Lynx DevTool DOM box models",
    sidebar,
    threadList,
    rows,
    cards,
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

async function readComposerOutcome(client, options = {}) {
  const includeInteraction = options.allowMissingInteraction !== true;
  const measurements = await collectLynxMeasurements({
    runCdp: client.runCdp,
    spec: {
      route: "packaged-composer",
      anchors: [
        { id: "shell", lynx: ".composer-shell" },
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
        { id: "context", lynx: ".composer-context-strip" },
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
        { id: "contextCheckout", lynx: ".composer-context-label--checkout" },
        { id: "contextBranch", lynx: ".composer-context-label--branch" },
      ],
      colors: [
        { id: "themeRoot", lynx: ".app-theme-root" },
        { id: "surface", lynx: ".composer-surface" },
        { id: "primaryAction", lynx: ".composer-primary-action" },
        { id: "context", lynx: ".composer-context-strip" },
        { id: "contextBackdrop", lynx: ".composer-context-backdrop" },
        { id: "contextLegacyBand", lynx: ".composer-context-backdrop-band" },
        { id: "contextLightBandFirst", lynx: ".composer-context-light-band--0" },
        { id: "contextLightBandLast", lynx: ".composer-context-light-band--15" },
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

async function verifyHeroComposerState({ child, client, expectedModelLabel, timeoutMs }) {
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
  const composer = await readComposerOutcome(client);
  assertComposerGeometry(composer);
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
      context: [
        composer.typography.contextCheckout.text.trim(),
        composer.typography.contextBranch.text.trim(),
      ],
    },
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
  const [assistantRowRoot] = await readSelectorRects(client, ".timeline-row-root--assistant");
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
    if (route === "/settings/source-control") {
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
    sourceControl,
    resync: { beforeSeq: beforeResync.lastSeq, afterSeq: afterResync.lastSeq },
    observed,
    repeatedCycles: 2,
    finalRoute: "/",
  };
}

async function verifySidebarScopeBehavior({ child, client, timeoutMs }) {
  const initialThreadRoute = await readRoutePanel(client);
  await tapSelector({
    child,
    client,
    selector: '[data-thread-item][data-thread-active="false"]',
    timeoutMs,
  });
  const selectedThreadRoute = await waitForRouteChange({
    child,
    client,
    initialRoute: initialThreadRoute.route,
    timeoutMs,
  });

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
      `Selecting the project scope did not update the trigger: ${JSON.stringify(selected.trigger)}`,
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
    threadSelection: {
      beforeRoute: initialThreadRoute.route,
      afterRoute: selectedThreadRoute.route,
    },
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
  const connectedComposer = await waitForMeasurement({
    child,
    client,
    selector: ".composer-frame",
    timeoutMs,
    predicate: (measurement) => measurement?.attributes["data-composer-state"] === "idle",
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
    predicate: (measurement) => measurement?.attributes["data-composer-state"] === "disabled",
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
  const recoveredComposer = await waitForMeasurement({
    child,
    client,
    selector: ".composer-frame",
    timeoutMs,
    predicate: (measurement) => measurement?.attributes["data-composer-state"] === "idle",
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
      state: connectedComposer.attributes["data-composer-state"],
      rect: connectedComposer.rect,
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
      state: recoveredComposer.attributes["data-composer-state"],
      rect: recoveredComposer.rect,
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
  expectedModelLabel,
  outputDirectory,
  projectCwd,
  requireCanonicalThread,
  timeoutMs,
  verifySettingsNavigation,
  verifyComposerGeometry: shouldVerifyComposerGeometry,
  verifyHeroComposerState: shouldVerifyHeroComposerState,
  verifySidebarGeometry: shouldVerifySidebarGeometry,
  verifySidebarScope,
  verifyLifecycleRecovery: shouldVerifyLifecycleRecovery,
  verifyComposerBranding,
  verifyModelPickerFidelity: shouldVerifyModelPickerFidelity,
  verifyComposerStop,
  verifyComposerWorkingState: shouldVerifyComposerWorkingState,
  verifyCompletedTranscriptState: shouldVerifyCompletedTranscriptState,
  verifyFailedTranscriptState: shouldVerifyFailedTranscriptState,
  verifyApprovalTranscriptState: shouldVerifyApprovalTranscriptState,
  approvalFixture,
  verifyQuestionTranscriptState: shouldVerifyQuestionTranscriptState,
  questionFixture,
  verifyReviewDiffState: shouldVerifyReviewDiffState,
  reviewFixture,
  verifyShellInteractions: shouldVerifyShellInteractions,
  composerStopEvidence,
  verifyRuntimeCapabilities: shouldVerifyRuntimeCapabilities,
  verifyPlan11SemanticOutcomes,
  width,
}) {
  const runRoot = mkdtempSync(path.join(os.tmpdir(), `t3code-packaged-readiness-${index}-`));
  const baseDir = path.join(runRoot, "state");
  cpSync(fixtureDir, baseDir, { recursive: true });
  const child = spawn(executable, [desktopDir], {
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
  if (!Number.isInteger(child.pid) || child.pid <= 0) {
    throw new Error("Lynxtron did not return an owned process id.");
  }
  const log = createLogCapture(child);
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
      shouldVerifyQuestionTranscriptState ||
      shouldVerifyReviewDiffState
        ? await waitForClientState({
            child,
            client,
            timeoutMs,
            predicate: (state) =>
              state?.activeThreadId ===
                (shouldVerifyApprovalTranscriptState
                  ? approvalFixture.threadId
                  : shouldVerifyQuestionTranscriptState
                    ? questionFixture.threadId
                    : reviewFixture.threadId) &&
              (shouldVerifyApprovalTranscriptState
                ? state?.activeThread?.hasPendingApprovals === true
                : shouldVerifyQuestionTranscriptState
                  ? state?.activeThread?.hasPendingUserInput === true
                  : state?.latestTurn?.state === "completed") &&
              state?.activeThread?.modelSelection?.instanceId ===
                (shouldVerifyApprovalTranscriptState
                  ? approvalFixture.modelSelection?.instanceId
                  : shouldVerifyQuestionTranscriptState
                    ? questionFixture.modelSelection?.instanceId
                    : reviewFixture.modelSelection?.instanceId) &&
              state?.activeThread?.modelSelection?.model ===
                (shouldVerifyApprovalTranscriptState
                  ? approvalFixture.modelSelection?.model
                  : shouldVerifyQuestionTranscriptState
                    ? questionFixture.modelSelection?.model
                    : reviewFixture.modelSelection?.model) &&
              (shouldVerifyReviewDiffState ||
                (state?.sessionStatus === "running" &&
                  state?.activeTurnId ===
                    (shouldVerifyApprovalTranscriptState
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
      ? await verifySidebarGeometry(client)
      : undefined;
    const composerGeometry = shouldVerifyComposerGeometry
      ? await verifyComposerGeometry(client, expectedTheme)
      : undefined;
    const heroComposerState = shouldVerifyHeroComposerState
      ? await verifyHeroComposerState({
          child,
          client,
          expectedModelLabel,
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
    const approvalTranscriptState = shouldVerifyApprovalTranscriptState
      ? await verifyApprovalTranscriptState({
          approvalFixture,
          client,
          devToolCli,
          outputDirectory,
        })
      : undefined;
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
    const shellInteractions = shouldVerifyShellInteractions
      ? await verifyShellInteractions({
          child,
          client,
          timeoutMs,
        })
      : undefined;
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
      settingsNavigation,
      composer,
      modelPickerFidelity,
      composerStop,
      composerWorkingState,
      completedTranscriptState,
      failedTranscriptState,
      approvalTranscriptState,
      questionTranscriptState,
      reviewDiffState,
      shellInteractions,
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
      composerThemeScreenshot,
      settingsNavigation,
      composer,
      modelPickerFidelity,
      composerStop,
      composerWorkingState,
      completedTranscriptState,
      failedTranscriptState,
      approvalTranscriptState,
      questionTranscriptState,
      reviewDiffState,
      shellInteractions,
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
const verifySettingsNavigation = process.argv.includes("--verify-settings-navigation");
const shouldVerifyComposerGeometry = process.argv.includes("--verify-composer-geometry");
const shouldVerifyHeroComposerState = process.argv.includes("--verify-hero-composer-state");
const shouldVerifySidebarGeometry = process.argv.includes("--verify-sidebar-geometry");
const verifySidebarScope = process.argv.includes("--verify-sidebar-scope");
const shouldVerifyLifecycleRecovery = process.argv.includes("--verify-lifecycle-recovery");
const verifyComposerBranding = process.argv.includes("--verify-composer-branding");
const shouldVerifyModelPickerFidelity = process.argv.includes("--verify-model-picker-fidelity");
const verifyComposerStop = process.argv.includes("--verify-composer-stop");
const shouldVerifyComposerWorkingState = process.argv.includes("--verify-composer-working-state");
const shouldVerifyCompletedTranscriptState = process.argv.includes(
  "--verify-completed-transcript-state",
);
const shouldVerifyFailedTranscriptState = process.argv.includes("--verify-failed-transcript-state");
const shouldVerifyApprovalTranscriptState = process.argv.includes(
  "--verify-approval-transcript-state",
);
const shouldVerifyQuestionTranscriptState = process.argv.includes(
  "--verify-question-transcript-state",
);
const shouldVerifyReviewDiffState = process.argv.includes("--verify-review-diff-state");
const shouldVerifyShellInteractions = process.argv.includes("--verify-shell-interactions");
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
const approvalFixture = fixtureManifest.pendingRequestFixture;
if (
  shouldVerifyApprovalTranscriptState &&
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
  shouldVerifyReviewDiffState &&
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
if (
  verifyComposerStop &&
  (typeof fixtureManifestProjectId !== "string" || fixtureManifestProjectId.length === 0)
) {
  throw new Error("--verify-composer-stop requires visual-state.json project.projectId.");
}
const canonicalThreadTitle =
  shouldVerifyApprovalTranscriptState || shouldVerifyQuestionTranscriptState
    ? fixtureManifest.pendingRequestFixture.title
    : shouldVerifyReviewDiffState
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
if (
  !lifecycleOnlyEmptyFixture &&
  !heroOnlyEmptyFixture &&
  (typeof canonicalThreadTitle !== "string" || canonicalThreadTitle.length === 0)
) {
  throw new Error("The readiness fixture must declare sidebarFixture.titles[0].");
}
const modelSelection =
  shouldVerifyApprovalTranscriptState || shouldVerifyQuestionTranscriptState
    ? fixtureManifest.pendingRequestFixture.modelSelection
    : shouldVerifyReviewDiffState
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
      expectedModelLabel,
      outputDirectory,
      projectCwd,
      requireCanonicalThread: !lifecycleOnlyEmptyFixture && !heroOnlyEmptyFixture,
      timeoutMs,
      verifySettingsNavigation,
      verifyComposerGeometry: shouldVerifyComposerGeometry,
      verifyHeroComposerState: shouldVerifyHeroComposerState,
      verifySidebarGeometry: shouldVerifySidebarGeometry,
      verifySidebarScope,
      verifyLifecycleRecovery: shouldVerifyLifecycleRecovery,
      verifyComposerBranding,
      verifyModelPickerFidelity: shouldVerifyModelPickerFidelity,
      verifyComposerStop,
      verifyComposerWorkingState: shouldVerifyComposerWorkingState,
      verifyCompletedTranscriptState: shouldVerifyCompletedTranscriptState,
      verifyFailedTranscriptState: shouldVerifyFailedTranscriptState,
      verifyApprovalTranscriptState: shouldVerifyApprovalTranscriptState,
      approvalFixture,
      verifyQuestionTranscriptState: shouldVerifyQuestionTranscriptState,
      questionFixture,
      verifyReviewDiffState: shouldVerifyReviewDiffState,
      reviewFixture,
      verifyShellInteractions: shouldVerifyShellInteractions,
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
    pendingRequest:
      shouldVerifyApprovalTranscriptState || shouldVerifyQuestionTranscriptState
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
