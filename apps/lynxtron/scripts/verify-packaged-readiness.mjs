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
  const [contextStrip] = await readSelectorRects(client, ".composer-context-strip");
  const contextControls = await readSelectorRects(client, ".composer-context-control");
  const contextIcons = await readSelectorRects(client, ".composer-context-icon");
  const contextLabels = [composer.typography.contextCheckout, composer.typography.contextBranch];
  const themeRoot = composer.colors.themeRoot;
  const contextBackdrop = composer.colors.contextBackdrop;
  const contextBand = composer.colors.contextBand;
  const wrongSize = (rect, size) =>
    Math.abs(rect.width - size) > 0.5 || Math.abs(rect.height - size) > 0.5;
  const wrongContextSize = (rect) =>
    Math.abs(rect.width - 12) > 0.75 || Math.abs(rect.height - 12) > 0.75;
  const wrongMutedAlpha = (color) => {
    const match = /^rgba\(113,113,122,([0-9.]+)\)$/u.exec(color);
    return !match || Math.abs(Number(match[1]) - 0.7) > 1 / 255;
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
      !wrongMutedAlpha(label.style.color),
  );
  const expectedThemeMatches =
    !expectedTheme ||
    (themeRoot.attributes["data-theme"] === expectedTheme &&
      (expectedTheme !== "light" ||
        (contextBackdrop.style.backgroundColor === "rgb(254,254,254)" &&
          contextBackdrop.style.borderBottomColor === "rgb(234,234,234)" &&
          contextBand.style.display === "none")));
  if (
    chevrons.length < 2 ||
    chevrons.length > 3 ||
    chevrons.some((rect) => wrongSize(rect, 14)) ||
    runtimeIcons.length !== 1 ||
    wrongSize(runtimeIcons[0], 16) ||
    interactionIcons.length !== 1 ||
    wrongSize(interactionIcons[0], 18) ||
    !contextControlsAligned ||
    !contextLabelsAligned ||
    !expectedThemeMatches ||
    contextIcons.length !== 4 ||
    contextIcons.some(wrongContextSize) ||
    Object.values(controlColors).some(wrongMutedAlpha)
  ) {
    throw new Error(
      `Composer Footer icon geometry drifted: ${JSON.stringify({
        chevrons,
        runtimeIcons,
        interactionIcons,
        contextStrip,
        contextControls,
        contextLabels,
        themeRoot,
        contextBackdrop,
        contextBand,
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
    contextStrip,
    contextControls,
    contextLabels,
    themeRoot,
    contextBackdrop,
    contextBand,
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

async function readComposerOutcome(client) {
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
        { id: "model", lynx: ".composer-toolbar-control--model" },
        { id: "runtime", lynx: ".composer-toolbar-control--runtime" },
        { id: "interaction", lynx: ".composer-toolbar-control--interaction" },
        { id: "primaryAction", lynx: ".composer-primary-action" },
        { id: "context", lynx: ".composer-context-strip" },
      ],
      typography: [
        { id: "model", lynx: ".composer-toolbar-control--model" },
        { id: "runtime", lynx: ".composer-toolbar-control--runtime" },
        { id: "interaction", lynx: ".composer-toolbar-control--interaction" },
        { id: "contextCheckout", lynx: ".composer-context-label--checkout" },
        { id: "contextBranch", lynx: ".composer-context-label--branch" },
      ],
      colors: [
        { id: "themeRoot", lynx: ".app-theme-root" },
        { id: "surface", lynx: ".composer-surface" },
        { id: "primaryAction", lynx: ".composer-primary-action" },
        { id: "context", lynx: ".composer-context-strip" },
        { id: "contextBackdrop", lynx: ".composer-context-backdrop" },
        { id: "contextBand", lynx: ".composer-context-backdrop-band" },
      ],
    },
  });
  const modelOption = await readOptionalMeasurement(
    client,
    ".composer-toolbar-control--model-option",
  );
  if (modelOption) measurements.anchors.modelOption = modelOption;
  return measurements;
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
  return {
    status: "pass",
    input:
      "DevTool Input.emulateTouchFromMouseEvent on measured Native model-picker trigger and Close control",
    panel: {
      rect: panel.rect,
      attributes: panel.attributes,
    },
    checkoutLabel: checkout.text.trim(),
    dismissed: true,
    screenshot: {
      path: screenshotPath,
      bytes: statSync(screenshotPath).size,
      sha256: sha256(screenshotPath),
    },
  };
}

async function verifyComposerWorkingState({ client, devToolCli, outputDirectory, stopEvidence }) {
  const composer = await readComposerOutcome(client);
  assertComposerGeometry(composer);
  const primaryAction = composer.anchors.primaryAction;
  if (primaryAction.attributes["data-composer-primary-state"] !== "stop") {
    throw new Error(
      `Canonical working Composer did not render Stop: ${JSON.stringify(primaryAction)}`,
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
    screenshot: {
      path: screenshotPath,
      bytes: statSync(screenshotPath).size,
      sha256: sha256(screenshotPath),
    },
    stopEvidence,
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

async function verifySettingsRouteBehavior({ child, client, modelSelection, timeoutMs }) {
  const observed = [];
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
    resync: { beforeSeq: beforeResync.lastSeq, afterSeq: afterResync.lastSeq },
    observed,
    repeatedCycles: 2,
    finalRoute: "/",
  };
}

async function verifySidebarScopeBehavior({ child, client, timeoutMs }) {
  const initialThreadRoute = await readRoutePanel(client);
  await tapSelector({ child, client, selector: ".sidebar-v2-search", timeoutMs });
  const quickSwitch = await waitForMeasurement({
    child,
    client,
    selector: ".qs-panel",
    timeoutMs,
    predicate: (measurement) => measurement !== null,
  });
  await tapSelector({
    child,
    client,
    selector: ".quick-switch-thread-row--other",
    timeoutMs,
  });
  await waitForMeasurement({
    child,
    client,
    selector: ".qs-panel",
    timeoutMs,
    predicate: (measurement) => measurement === null,
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
    search: { opened: quickSwitch !== null, closedByThreadSelection: true },
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
    interruptedServer: server,
    failure,
    recoveryInput: "DevTool Input.emulateTouchFromMouseEvent on measured semantic selector",
    reconnecting,
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
  outputDirectory,
  projectCwd,
  requireCanonicalThread,
  timeoutMs,
  verifySettingsNavigation,
  verifyComposerGeometry: shouldVerifyComposerGeometry,
  verifySidebarGeometry: shouldVerifySidebarGeometry,
  verifySidebarScope,
  verifyLifecycleRecovery: shouldVerifyLifecycleRecovery,
  verifyComposerBranding,
  verifyModelPickerFidelity: shouldVerifyModelPickerFidelity,
  verifyComposerStop,
  verifyComposerWorkingState: shouldVerifyComposerWorkingState,
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
    const canonicalState = requireCanonicalThread
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
          () => verifySettingsRouteBehavior({ child, client, modelSelection, timeoutMs }),
          cleanupOutcome,
        )
      : verifySettingsNavigation
        ? await verifySettingsRouteBehavior({ child, client, modelSelection, timeoutMs })
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
      composerThemeScreenshot,
      settingsNavigation,
      composer,
      modelPickerFidelity,
      composerStop,
      composerWorkingState,
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
      settingsNavigation,
      composer,
      modelPickerFidelity,
      composerStop,
      composerWorkingState,
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
const verifySettingsNavigation = process.argv.includes("--verify-settings-navigation");
const shouldVerifyComposerGeometry = process.argv.includes("--verify-composer-geometry");
const shouldVerifySidebarGeometry = process.argv.includes("--verify-sidebar-geometry");
const verifySidebarScope = process.argv.includes("--verify-sidebar-scope");
const shouldVerifyLifecycleRecovery = process.argv.includes("--verify-lifecycle-recovery");
const verifyComposerBranding = process.argv.includes("--verify-composer-branding");
const shouldVerifyModelPickerFidelity = process.argv.includes("--verify-model-picker-fidelity");
const verifyComposerStop = process.argv.includes("--verify-composer-stop");
const shouldVerifyComposerWorkingState = process.argv.includes("--verify-composer-working-state");
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
const fixtureManifestProjectId = fixtureManifest.project?.projectId;
if (
  verifyComposerStop &&
  (typeof fixtureManifestProjectId !== "string" || fixtureManifestProjectId.length === 0)
) {
  throw new Error("--verify-composer-stop requires visual-state.json project.projectId.");
}
const canonicalThreadTitle = fixtureManifest.sidebarFixture?.titles?.[0];
const lifecycleOnlyEmptyFixture =
  shouldVerifyLifecycleRecovery &&
  !verifySettingsNavigation &&
  !verifySidebarScope &&
  !verifyComposerBranding &&
  !shouldVerifyModelPickerFidelity &&
  !verifyPlan11SemanticOutcomes;
if (
  !lifecycleOnlyEmptyFixture &&
  (typeof canonicalThreadTitle !== "string" || canonicalThreadTitle.length === 0)
) {
  throw new Error("The readiness fixture must declare sidebarFixture.titles[0].");
}
const fixturePreferences = JSON.parse(
  readFileSync(path.join(fixtureDir, "lynxtron-prefs.json"), "utf8"),
);
const modelSelection = fixturePreferences.modelSelection;
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
      outputDirectory,
      projectCwd,
      requireCanonicalThread: !lifecycleOnlyEmptyFixture,
      timeoutMs,
      verifySettingsNavigation,
      verifyComposerGeometry: shouldVerifyComposerGeometry,
      verifySidebarGeometry: shouldVerifySidebarGeometry,
      verifySidebarScope,
      verifyLifecycleRecovery: shouldVerifyLifecycleRecovery,
      verifyComposerBranding,
      verifyModelPickerFidelity: shouldVerifyModelPickerFidelity,
      verifyComposerStop,
      verifyComposerWorkingState: shouldVerifyComposerWorkingState,
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
