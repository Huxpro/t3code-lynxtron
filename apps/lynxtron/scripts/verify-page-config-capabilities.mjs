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
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { openOwnedDevToolSession, readOwnedListeningTcpPorts } from "./devtool-client-identity.mjs";

const appRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(appRoot, "../..");
const probeEntry = path.join(appRoot, "src/app/probes/page-config-capabilities.tsx");
const defaultDevToolCli = path.join(os.homedir(), ".agents/skills/lynx-devtool/scripts/index.mjs");

const variants = [
  {
    id: "baseline",
    pageConfig: {},
  },
  {
    id: "typed-flags",
    pageConfig: {
      enableCSSInlineVariables: true,
      enableNewTransformOrigin: true,
    },
  },
  {
    id: "legacy-transform-origin",
    pageConfig: {
      enableNewTransformOrigin: false,
    },
  },
  {
    id: "untyped-mouse-align",
    pageConfig: {
      alignMouseEventWithW3C: true,
    },
  },
  {
    id: "untyped-css-rule",
    pageConfig: {
      enableCSSRule: true,
    },
    staticOnly: true,
  },
];

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function commandResult(response) {
  return response?.result?.result ?? response?.result ?? response;
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
  return result;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
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
      throw new Error("Lynxtron exited before the pageConfig probe session was ready.");
    }
    try {
      const client = await openOwnedDevToolSession({
        appName: "@t3tools/lynxtron",
        devToolCli,
        ownedPorts: readOwnedListeningTcpPorts(child.pid),
      });
      if (client.identity.bundleUrl !== expectedBundleUrl) {
        await client.close();
        throw new Error(`Unexpected pageConfig probe bundle ${String(client.identity.bundleUrl)}`);
      }
      return client;
    } catch (error) {
      lastError = error;
      await wait(100);
    }
  }
  throw lastError ?? new Error("Timed out waiting for the pageConfig probe DevTool session.");
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

async function queryNode(client, rootNodeId, selector) {
  const response = await client.runCdp("DOM.querySelector", {
    nodeId: rootNodeId,
    selector,
  });
  const nodeId = commandResult(response)?.nodeId;
  if (!Number.isInteger(nodeId) || nodeId <= 0) {
    throw new Error(`pageConfig probe selector is unavailable: ${selector}`);
  }
  return nodeId;
}

function quadRect(quad) {
  if (!Array.isArray(quad) || quad.length < 8) return null;
  const x = [quad[0], quad[2], quad[4], quad[6]];
  const y = [quad[1], quad[3], quad[5], quad[7]];
  const left = Math.min(...x);
  const top = Math.min(...y);
  const right = Math.max(...x);
  const bottom = Math.max(...y);
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

function attributesRecord(response) {
  const attributes = commandResult(response)?.attributes ?? [];
  const pairs = [];
  for (let index = 0; index + 1 < attributes.length; index += 2) {
    pairs.push([attributes[index], attributes[index + 1]]);
  }
  return Object.fromEntries(pairs);
}

function styleRecord(response) {
  const properties = commandResult(response)?.computedStyle ?? [];
  return Object.fromEntries(properties.map((property) => [property.name, property.value]));
}

async function measureNode(client, rootNodeId, selector) {
  const nodeId = await queryNode(client, rootNodeId, selector);
  const [boxResponse, styleResponse, attributesResponse] = await Promise.all([
    client.runCdp("DOM.getBoxModel", { nodeId }),
    client.runCdp("CSS.getComputedStyleForNode", { nodeId }),
    client.runCdp("DOM.getAttributes", { nodeId }),
  ]);
  const box = commandResult(boxResponse)?.model;
  return {
    selector,
    nodeId,
    rect: quadRect(box?.border ?? box?.content),
    style: styleRecord(styleResponse),
    attributes: attributesRecord(attributesResponse),
  };
}

async function waitForMeasurement(client, rootNodeId, selector, predicate, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  let latest;
  while (Date.now() < deadline) {
    latest = await measureNode(client, rootNodeId, selector);
    if (predicate(latest)) return latest;
    await wait(50);
  }
  throw new Error(`Timed out waiting for ${selector}: ${JSON.stringify(latest)}`);
}

async function invokeProbeAction(client, action) {
  const response = await client.runCdp("Runtime.evaluate", {
    expression: `globalThis.__T3_PAGE_CONFIG_CAPABILITIES__(${JSON.stringify(action)})`,
    awaitPromise: true,
    returnByValue: true,
  });
  return commandResult(response)?.value === true;
}

function center(rect) {
  if (!rect) throw new Error("Cannot interact with an unmeasured probe node.");
  return {
    x: Math.round(rect.x + rect.width / 2),
    y: Math.round(rect.y + rect.height / 2),
  };
}

async function injectMouseSequence(client, target, outside) {
  const targetPoint = center(target.rect);
  const outsidePoint = center(outside.rect);
  const timestamp = Date.now() / 1000;
  const steps = [
    { type: "mouseMoved", ...outsidePoint, timestamp, button: "none" },
    { type: "mouseMoved", ...targetPoint, timestamp: timestamp + 0.01, button: "none" },
    { type: "mousePressed", ...targetPoint, timestamp: timestamp + 0.02, button: "left" },
    {
      type: "mouseMoved",
      x: targetPoint.x + 8,
      y: targetPoint.y + 3,
      timestamp: timestamp + 0.03,
      button: "left",
    },
    { type: "mouseReleased", ...targetPoint, timestamp: timestamp + 0.04, button: "left" },
    { type: "mouseMoved", ...outsidePoint, timestamp: timestamp + 0.05, button: "none" },
  ];
  for (const step of steps) {
    await client.runCdp("Input.emulateTouchFromMouseEvent", step);
  }
}

function rounded(value) {
  return typeof value === "number" ? Math.round(value * 10) / 10 : null;
}

function relativeRect(child, parent) {
  if (!child?.rect || !parent?.rect) return null;
  return {
    x: rounded(child.rect.x - parent.rect.x),
    y: rounded(child.rect.y - parent.rect.y),
    width: rounded(child.rect.width),
    height: rounded(child.rect.height),
  };
}

function numericAttribute(attributes, name) {
  const value = Number(attributes[name]);
  return Number.isFinite(value) ? value : 0;
}

async function collectRuntimeResults(client, rootNodeId, options = {}) {
  const mouseTarget = await measureNode(client, rootNodeId, ".mouse-probe-target");
  const mouseOutside = await measureNode(client, rootNodeId, ".mouse-probe-outside");
  await injectMouseSequence(client, mouseTarget, mouseOutside);
  const mouseResult = await measureNode(client, rootNodeId, ".mouse-probe-result");

  const themeClassInitial = await measureNode(client, rootNodeId, ".theme-probe-class-value");
  const themeSetInitial = await measureNode(client, rootNodeId, ".theme-probe-set-value");
  let themeClassDark = themeClassInitial;
  let themeSetChanged = themeSetInitial;
  if (!options.staticOnly) {
    await invokeProbeAction(client, "theme-class-dark");
    themeClassDark = await waitForMeasurement(
      client,
      rootNodeId,
      ".theme-probe-class-value",
      (measurement) =>
        measurement.style["background-color"] !== themeClassInitial.style["background-color"] ||
        rounded(measurement.rect?.width) !== rounded(themeClassInitial.rect?.width),
    ).catch(() => measureNode(client, rootNodeId, ".theme-probe-class-value"));
    await invokeProbeAction(client, "theme-set-property");
    themeSetChanged = await waitForMeasurement(
      client,
      rootNodeId,
      ".theme-probe-set-value",
      (measurement) =>
        measurement.style["background-color"] !== themeSetInitial.style["background-color"] ||
        rounded(measurement.rect?.width) !== rounded(themeSetInitial.rect?.width),
    ).catch(() => measureNode(client, rootNodeId, ".theme-probe-set-value"));
  }
  const themeInline = await measureNode(client, rootNodeId, ".theme-probe-inline-value");

  const gridBasic = await measureNode(client, rootNodeId, ".grid-probe-basic");
  const gridBasicA = await measureNode(client, rootNodeId, ".grid-basic-a");
  const gridBasicB = await measureNode(client, rootNodeId, ".grid-basic-b");
  const gridBasicC = await measureNode(client, rootNodeId, ".grid-basic-c");
  const gridBasicD = await measureNode(client, rootNodeId, ".grid-basic-d");
  const gridSpan = await measureNode(client, rootNodeId, ".grid-probe-span");
  const gridSpanWide = await measureNode(client, rootNodeId, ".grid-span-wide");
  const gridSpanNext = await measureNode(client, rootNodeId, ".grid-span-next");
  const gridSpanLast = await measureNode(client, rootNodeId, ".grid-span-last");
  const gridFlow = await measureNode(client, rootNodeId, ".grid-probe-column-flow");
  const gridFlowA = await measureNode(client, rootNodeId, ".grid-flow-a");
  const gridFlowB = await measureNode(client, rootNodeId, ".grid-flow-b");
  const gridFlowC = await measureNode(client, rootNodeId, ".grid-flow-c");
  const gridFlowD = await measureNode(client, rootNodeId, ".grid-flow-d");
  const gridArbitrary = await measureNode(client, rootNodeId, ".grid-probe-arbitrary");
  const gridArbitraryA = await measureNode(client, rootNodeId, ".grid-arbitrary-a");
  const gridArbitraryB = await measureNode(client, rootNodeId, ".grid-arbitrary-b");
  const gridArbitraryC = await measureNode(client, rootNodeId, ".grid-arbitrary-c");
  const gridArbitraryD = await measureNode(client, rootNodeId, ".grid-arbitrary-d");

  const transformLeftStage = await measureNode(client, rootNodeId, ".transform-left-stage");
  const transformCenterStage = await measureNode(client, rootNodeId, ".transform-center-stage");
  const transformLeft = await measureNode(client, rootNodeId, ".transform-probe-left");
  const transformCenter = await measureNode(client, rootNodeId, ".transform-probe-center");

  const fontFace = await measureNode(client, rootNodeId, ".font-probe-face");
  const fontFallback = await measureNode(client, rootNodeId, ".font-probe-fallback");

  const mouseCounts = Object.fromEntries(
    ["mousedown", "mouseenter", "mouseleave", "mousemove", "mouseover", "mouseup"].map((name) => [
      name,
      numericAttribute(mouseResult.attributes, `data-${name}`),
    ]),
  );
  const mouseEventCount = Object.values(mouseCounts).reduce((sum, value) => sum + value, 0);

  const basicRects = [
    relativeRect(gridBasicA, gridBasic),
    relativeRect(gridBasicB, gridBasic),
    relativeRect(gridBasicC, gridBasic),
    relativeRect(gridBasicD, gridBasic),
  ];
  const spanRects = [
    relativeRect(gridSpanWide, gridSpan),
    relativeRect(gridSpanNext, gridSpan),
    relativeRect(gridSpanLast, gridSpan),
  ];
  const flowRects = [
    relativeRect(gridFlowA, gridFlow),
    relativeRect(gridFlowB, gridFlow),
    relativeRect(gridFlowC, gridFlow),
    relativeRect(gridFlowD, gridFlow),
  ];
  const arbitraryRects = [
    relativeRect(gridArbitraryA, gridArbitrary),
    relativeRect(gridArbitraryB, gridArbitrary),
    relativeRect(gridArbitraryC, gridArbitrary),
    relativeRect(gridArbitraryD, gridArbitrary),
  ];
  const basicPassed =
    gridBasic.style.display === "grid" &&
    basicRects[0]?.width === 100 &&
    basicRects[1]?.x === 110 &&
    basicRects[2]?.width === 80 &&
    basicRects[3]?.y === 48;
  const spanPassed =
    gridSpan.style.display === "grid" &&
    spanRects[0]?.width === 206 &&
    spanRects[1]?.x === 212 &&
    spanRects[2]?.y === 50;
  const columnFlowPassed =
    gridFlow.style.display === "grid" &&
    flowRects[1]?.y > flowRects[0]?.y &&
    flowRects[2]?.x > flowRects[0]?.x &&
    flowRects[2]?.y === flowRects[0]?.y;
  const arbitraryPassed =
    gridArbitrary.style.display === "grid" &&
    arbitraryRects.every((rect) => rect && rect.width > 0) &&
    arbitraryRects[0]?.width >= 190 &&
    arbitraryRects[1]?.width >= 220 &&
    arbitraryRects[2]?.width >= 210 &&
    arbitraryRects[3]?.width === 60;

  const leftTransform = relativeRect(transformLeft, transformLeftStage);
  const centerTransform = relativeRect(transformCenter, transformCenterStage);
  const transformPassed =
    leftTransform?.x === 60 &&
    leftTransform?.width === 160 &&
    centerTransform?.x === 20 &&
    centerTransform?.width === 160;

  return {
    mouse: {
      input:
        "DevTool Input.emulateTouchFromMouseEvent; this API documents touch conversion, so zero mouse handlers is tooling-inconclusive.",
      counts: mouseCounts,
      total: mouseEventCount,
      lastEvent: mouseResult.attributes["data-last-event"] ?? null,
      lastButton: mouseResult.attributes["data-last-button"] ?? null,
      lastButtons: mouseResult.attributes["data-last-buttons"] ?? null,
      status: mouseEventCount > 0 ? "runtime-dispatched" : "tooling-inconclusive",
    },
    cssVariables: {
      runtimeActions: options.staticOnly ? "skipped" : "executed",
      classSwap: {
        initial: {
          backgroundColor: themeClassInitial.style["background-color"] ?? null,
          width: rounded(themeClassInitial.rect?.width),
        },
        changed: {
          backgroundColor: themeClassDark.style["background-color"] ?? null,
          width: rounded(themeClassDark.rect?.width),
        },
        colorChanged:
          themeClassInitial.style["background-color"] !== themeClassDark.style["background-color"],
        widthChanged:
          rounded(themeClassInitial.rect?.width) !== rounded(themeClassDark.rect?.width),
      },
      setProperty: {
        initial: {
          backgroundColor: themeSetInitial.style["background-color"] ?? null,
          width: rounded(themeSetInitial.rect?.width),
        },
        changed: {
          backgroundColor: themeSetChanged.style["background-color"] ?? null,
          width: rounded(themeSetChanged.rect?.width),
        },
        colorChanged:
          themeSetInitial.style["background-color"] !== themeSetChanged.style["background-color"],
        widthChanged: rounded(themeSetInitial.rect?.width) !== rounded(themeSetChanged.rect?.width),
      },
      inlineVariables: {
        backgroundColor: themeInline.style["background-color"] ?? null,
        width: rounded(themeInline.rect?.width),
        passed:
          themeInline.style["background-color"] === "rgb(236, 72, 153)" &&
          rounded(themeInline.rect?.width) === 130,
      },
    },
    grid: {
      basic: { display: gridBasic.style.display ?? null, rects: basicRects, passed: basicPassed },
      span: { display: gridSpan.style.display ?? null, rects: spanRects, passed: spanPassed },
      columnFlow: {
        display: gridFlow.style.display ?? null,
        rects: flowRects,
        passed: columnFlowPassed,
      },
      arbitraryMinmaxFr: {
        display: gridArbitrary.style.display ?? null,
        rects: arbitraryRects,
        passed: arbitraryPassed,
      },
      passed: basicPassed && spanPassed && columnFlowPassed && arbitraryPassed,
    },
    transformOrigin: {
      left: leftTransform,
      center: centerTransform,
      passed: transformPassed,
    },
    fontFace: {
      requestedFamily: fontFace.style["font-family"] ?? null,
      fallbackFamily: fontFallback.style["font-family"] ?? null,
      requestedWidth: rounded(fontFace.rect?.width),
      fallbackWidth: rounded(fontFallback.rect?.width),
      familyApplied: (fontFace.style["font-family"] ?? "").includes("Issue2 Probe Font"),
      metricsDiffer: rounded(fontFace.rect?.width) !== rounded(fontFallback.rect?.width),
    },
  };
}

function stageDesktop(buildOutput, desktopOutput) {
  mkdirSync(desktopOutput, { recursive: true });
  for (const file of ["main.js", "preload.js", "connector.bundle.cjs", "package.json"]) {
    cpSync(path.join(appRoot, "dist/desktop", file), path.join(desktopOutput, file));
  }
  cpSync(path.join(buildOutput, "main.lynx.bundle"), path.join(desktopOutput, "main.lynx.bundle"));
  const staticDirectory = path.join(buildOutput, "static");
  if (existsSync(staticDirectory)) {
    cpSync(staticDirectory, path.join(desktopOutput, "static"), { recursive: true });
  }
}

async function runVariant(variant, options) {
  const runRoot = mkdtempSync(path.join(os.tmpdir(), `t3-pageconfig-${variant.id}-`));
  const buildOutput = path.join(runRoot, "bundle");
  const desktopOutput = path.join(runRoot, "desktop");
  const stateDirectory = path.join(runRoot, "state");
  mkdirSync(buildOutput, { recursive: true });

  const env = {
    ...process.env,
    T3_LYNXTRON_PROBE_ENTRY: probeEntry,
    T3_LYNXTRON_PROBE_OUTPUT: buildOutput,
    ...(Object.keys(variant.pageConfig).length > 0
      ? { T3_LYNXTRON_PROBE_PAGE_CONFIG: JSON.stringify(variant.pageConfig) }
      : {}),
  };
  run("./node_modules/.bin/rspeedy", ["build"], { env });
  stageDesktop(buildOutput, desktopOutput);
  const bundle = path.join(desktopOutput, "main.lynx.bundle");
  const bundleBytes = readFileSync(bundle);
  const injectedFlags = Object.fromEntries(
    Object.keys(variant.pageConfig).map((key) => [
      key,
      bundleBytes.includes(Buffer.from(`"${key}":true`)),
    ]),
  );

  const executable = resolveLynxtronExecutable();
  const child = spawn(executable, [desktopOutput], {
    cwd: appRoot,
    env: {
      ...process.env,
      NODE_ENV: "production",
      T3_LYNXTRON_BACKGROUND: process.env.T3_LYNXTRON_BACKGROUND ?? "1",
      T3_LYNXTRON_BASE_DIR: stateDirectory,
      T3_LYNXTRON_BUNDLE_PATH: bundle,
      T3_LYNXTRON_PROJECT_CWD: repoRoot,
      T3_LYNXTRON_SERVER_STDIO: "ignore",
      T3_LYNXTRON_VIEWPORT_WIDTH: "1000",
      T3_LYNXTRON_VIEWPORT_HEIGHT: "900",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (!child.pid) throw new Error(`Lynxtron did not return an owned PID for ${variant.id}.`);
  let logs = "";
  child.stdout?.on("data", (chunk) => {
    logs += String(chunk);
  });
  child.stderr?.on("data", (chunk) => {
    logs += String(chunk);
  });

  let client;
  try {
    client = await waitForOwnedClient(
      child,
      options.devToolCli,
      pathToFileURL(bundle).href,
      options.timeoutMs,
    );
    await client.runCdp("DOM.enable", { useCompression: false });
    const documentResponse = await client.runCdp("DOM.getDocument", {});
    const root = commandResult(documentResponse)?.root;
    const rootNodeId = root?.children?.[0]?.nodeId ?? root?.nodeId;
    if (!rootNodeId) throw new Error(`pageConfig ${variant.id} document has no root node.`);
    await waitForMeasurement(
      client,
      rootNodeId,
      ".page-config-probe",
      (measurement) => measurement.rect?.width > 0,
      options.timeoutMs,
    );
    const capabilities = await collectRuntimeResults(client, rootNodeId, {
      staticOnly: variant.staticOnly === true,
    });
    const rendererErrors = readRendererErrors({
      clientId: client.identity.clientId,
      devToolCli: options.devToolCli,
      sessionId: client.identity.sessionId,
    });
    return {
      id: variant.id,
      status: "pass",
      processId: child.pid,
      pageConfig: variant.pageConfig,
      injectedFlags,
      bundle: {
        path: bundle,
        bytes: statSync(bundle).size,
        sha256: sha256(bundle),
      },
      client: client.identity,
      capabilities,
      rendererErrors,
      passed: rendererErrors.length === 0,
    };
  } catch (error) {
    return {
      id: variant.id,
      status: "runtime-session-failed",
      processId: child.pid,
      pageConfig: variant.pageConfig,
      injectedFlags,
      bundle: {
        bytes: statSync(bundle).size,
        sha256: sha256(bundle),
      },
      client: client?.identity ?? null,
      error: error instanceof Error ? error.stack : String(error),
      logs: logs
        .replace(/^Token:.*$/gmu, "Token: <redacted>")
        .replace(/(wsTicket=)[^ ]+/gu, "$1<redacted>"),
      passed: false,
    };
  } finally {
    await client?.close();
    await stopOwnedProcess(child);
    rmSync(runRoot, { recursive: true, force: true });
  }
}

const timeoutMs = Number(argumentValue("--timeout-ms") ?? 45_000);
const outputPath = argumentValue("--output") ? path.resolve(argumentValue("--output")) : undefined;
const devToolCli = path.resolve(
  process.env.LYNX_DEVTOOL_CLI ?? argumentValue("--devtool-cli") ?? defaultDevToolCli,
);
if (!existsSync(devToolCli)) {
  throw new Error(`Lynx DevTool CLI is missing: ${devToolCli}`);
}

const results = [];
const requestedVariants = argumentValue("--variants")
  ?.split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const selectedVariants = requestedVariants
  ? variants.filter((variant) => requestedVariants.includes(variant.id))
  : variants;
if (requestedVariants && selectedVariants.length !== requestedVariants.length) {
  throw new Error(`Unknown pageConfig variants: ${requestedVariants.join(", ")}`);
}
for (const variant of selectedVariants) {
  results.push(await runVariant(variant, { devToolCli, timeoutMs }));
}
const baseline = results.find((result) => result.id === "baseline");
const typedFlags = results.find((result) => result.id === "typed-flags");
const mouseAlign = results.find((result) => result.id === "untyped-mouse-align");
const cssRule = results.find((result) => result.id === "untyped-css-rule");
const report = {
  schemaVersion: 1,
  recordedAt: new Date().toISOString(),
  stack: {
    lynxtron: "0.0.8",
    reactLynx: "0.120.0",
    reactRspeedyPlugin: "0.16.3",
    rspeedy: "0.14.5",
    typeConfig: "3.6.0",
    lynxTypes: "3.8.0",
  },
  flagSurfaces: {
    reactRspeedyPlugin: {
      alignMouseEventWithW3C: false,
      enableCSSInlineVariables: false,
      enableNewTransformOrigin: false,
      enableCSSRule: false,
    },
    typeConfig: {
      alignMouseEventWithW3C: false,
      enableCSSInlineVariables: true,
      enableNewTransformOrigin: true,
      enableCSSRule: false,
    },
    rawProbeInjection: Object.fromEntries(
      results.map((result) => [result.id, result.injectedFlags]),
    ),
  },
  results,
  comparison: {
    mouse:
      (baseline?.capabilities.mouse.counts.mouseenter ?? 0) > 0 &&
      (baseline?.capabilities.mouse.counts.mouseleave ?? 0) > 0
        ? "mouseenter-leave-dispatched-by-default"
        : (mouseAlign?.capabilities.mouse.counts.mouseenter ?? 0) > 0 &&
            (mouseAlign?.capabilities.mouse.counts.mouseleave ?? 0) > 0
          ? "mouseenter-leave-dispatched-with-raw-flag"
          : (baseline?.capabilities.mouse.total ?? 0) > 0 ||
              (mouseAlign?.capabilities.mouse.total ?? 0) > 0
            ? "partial-mouse-dispatch"
            : "pending-physical-mouse-session",
    cssVariables: {
      classSwap: baseline?.capabilities.cssVariables.classSwap ?? null,
      setProperty: baseline?.capabilities.cssVariables.setProperty ?? null,
      inlineBaseline: baseline?.capabilities.cssVariables.inlineVariables.passed === true,
      inlineWithFlag: typedFlags?.capabilities.cssVariables.inlineVariables.passed === true,
    },
    grid: {
      baseline: baseline?.capabilities.grid.passed === true,
      typedFlags: typedFlags?.capabilities.grid.passed === true,
    },
    transformOrigin: {
      baseline: baseline?.capabilities.transformOrigin.passed === true,
      typedFlags: typedFlags?.capabilities.transformOrigin.passed === true,
      legacyFalse:
        results.find((result) => result.id === "legacy-transform-origin")?.capabilities
          .transformOrigin.passed === true,
    },
    fontFace: {
      baseline: baseline?.capabilities.fontFace ?? null,
      typedFlags: typedFlags?.capabilities.fontFace ?? null,
      cssRule: cssRule?.capabilities?.fontFace ?? null,
    },
  },
  passed: results.every((result) => result.passed),
};

const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath) {
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, serialized);
}
process.stdout.write(serialized);
if (!report.passed) process.exitCode = 1;
