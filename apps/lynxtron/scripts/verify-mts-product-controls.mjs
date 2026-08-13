#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { openOwnedDevToolSession, readOwnedListeningTcpPorts } from "./devtool-client-identity.mjs";

const appRoot = path.resolve(import.meta.dirname, "..");
const retainedPath = path.join(os.tmpdir(), `t3-mts-product-verify-${process.pid}.json`);
const devToolCli = path.join(process.env.HOME, ".agents/skills/lynx-devtool/scripts/index.mjs");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? appRoot,
    encoding: "utf8",
    env: options.env ?? process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(
      [result.stderr, result.stdout].filter(Boolean).join("\n") ||
        `${command} exited with ${result.status}`,
    );
  }
  return result;
}

function launch() {
  const result = run(process.execPath, ["scripts/retain-mts-product-app.mjs"], {
    env: {
      ...process.env,
      T3_MTS_PRODUCT_RETAINED_PATH: retainedPath,
    },
  });
  return JSON.parse(result.stdout);
}

function stop() {
  if (!existsSync(retainedPath)) return;
  run(process.execPath, ["scripts/retain-mts-product-app.mjs", "--stop"], {
    allowFailure: true,
    env: {
      ...process.env,
      T3_MTS_PRODUCT_RETAINED_PATH: retainedPath,
    },
  });
}

function commandResult(response) {
  return response?.result?.result ?? response?.result ?? response;
}

function evaluate(client, sessionId, thread, expression, awaitPromise = false) {
  const params = JSON.stringify({
    expression,
    awaitPromise,
    returnByValue: true,
  });
  const result = run(process.execPath, [
    devToolCli,
    "cdp",
    "--client",
    client,
    "--session",
    String(sessionId),
    "--thread",
    thread,
    "-m",
    "Runtime.evaluate",
    params,
  ]);
  const response = JSON.parse(result.stdout);
  if (response.exceptionDetails || response.result?.subtype === "error") {
    throw new Error(`MTS product evaluation failed: ${result.stdout}`);
  }
  return response.result?.value ?? null;
}

function background(client, sessionId, expression, awaitPromise = false) {
  return evaluate(client, sessionId, "background", expression, awaitPromise);
}

function mainThread(client, sessionId, expression) {
  return evaluate(client, sessionId, "main", expression);
}

function rendererErrors(client, sessionId) {
  const result = run(
    process.execPath,
    [
      devToolCli,
      "get-console",
      "--client",
      client,
      "--session",
      String(sessionId),
      "--level",
      "error",
      "--limit",
      "200",
      "--include-stack-traces",
    ],
    { allowFailure: true },
  );
  const diagnostic = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
  if (result.status !== 0 && diagnostic.includes("AbortError") && diagnostic.includes("timeout")) {
    return "";
  }
  if (result.status !== 0) throw new Error(diagnostic);
  return result.stdout.trim();
}

async function waitFor(read, predicate, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  let latest;
  while (Date.now() < deadline) {
    latest = await read();
    if (predicate(latest)) return latest;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for MTS product state: ${JSON.stringify(latest)}`);
}

async function queryNode(client, rootNodeId, selector) {
  const response = await client.runCdp("DOM.querySelector", {
    nodeId: rootNodeId,
    selector,
  });
  const nodeId = commandResult(response)?.nodeId;
  if (!Number.isInteger(nodeId) || nodeId <= 0) {
    throw new Error(`MTS product selector is unavailable: ${selector}`);
  }
  return nodeId;
}

async function boxForNode(client, nodeId) {
  const response = await client.runCdp("DOM.getBoxModel", { nodeId });
  const quad = commandResult(response)?.model?.border ?? commandResult(response)?.model?.content;
  if (!Array.isArray(quad) || quad.length < 8) {
    throw new Error(`MTS product node ${nodeId} has no box.`);
  }
  return {
    left: Math.min(quad[0], quad[2], quad[4], quad[6]),
    right: Math.max(quad[0], quad[2], quad[4], quad[6]),
    top: Math.min(quad[1], quad[3], quad[5], quad[7]),
    bottom: Math.max(quad[1], quad[3], quad[5], quad[7]),
  };
}

async function dragNode(
  client,
  nodeId,
  deltaX,
  afterPress,
  measureWidth,
  widthDirection,
  moveCount = 120,
) {
  const box = await boxForNode(client, nodeId);
  const startWidth = await measureWidth();
  const startX = Math.round((box.left + box.right) / 2);
  const endX = Math.round(startX + deltaX);
  const y = Math.round((box.top + box.bottom) / 2);
  const timestamp = Date.now() / 1000;
  await client.runCdp("Input.emulateTouchFromMouseEvent", {
    type: "mouseMoved",
    x: startX,
    y,
    timestamp,
    button: "left",
  });
  await client.runCdp("Input.emulateTouchFromMouseEvent", {
    type: "mousePressed",
    x: startX,
    y,
    timestamp: timestamp + 0.001,
    button: "left",
  });
  await afterPress();
  const samples = [];
  for (let index = 1; index <= moveCount; index += 1) {
    const currentX = Math.round(startX + (deltaX * index) / moveCount);
    await client.runCdp("Input.emulateTouchFromMouseEvent", {
      type: "mouseMoved",
      x: currentX,
      y,
      timestamp: timestamp + 0.001 + index * 0.001,
      button: "left",
    });
    if (index % 12 === 0 || index === moveCount) {
      const actualWidth = await measureWidth();
      const expectedWidth = startWidth + widthDirection * (currentX - startX);
      samples.push({
        index,
        currentX,
        expectedWidth,
        actualWidth,
        error: actualWidth - expectedWidth,
      });
    }
  }
  await client.runCdp("Input.emulateTouchFromMouseEvent", {
    type: "mouseReleased",
    x: endX,
    y,
    timestamp: timestamp + 0.002 + moveCount * 0.001,
    button: "left",
  });
  return {
    startX,
    endX,
    y,
    moveCount,
    samples,
    maxAbsoluteError: Math.max(...samples.map((sample) => Math.abs(sample.error))),
  };
}

async function readResizeState(directClient, rootNodeId, client, sessionId, target) {
  const panelSelector = target === "sidebar" ? ".sidebar-container" : ".right-panel";
  const handleSelector =
    target === "sidebar" ? ".sidebar-resize-rail" : ".right-panel__resize-handle";
  const panelNodeId = await queryNode(directClient, rootNodeId, panelSelector);
  const box = await boxForNode(directClient, panelNodeId);
  const hitSlop = mainThread(
    client,
    sessionId,
    `lynx.querySelector(${JSON.stringify(handleSelector)})?.getAttribute("hit-slop")??null`,
  );
  const transitionDuration =
    target === "sidebar"
      ? mainThread(
          client,
          sessionId,
          'lynx.querySelector(".sidebar-container")?.getComputedStyleProperty("transition-duration")??null',
        )
      : null;
  return {
    width: `${Math.round(box.right - box.left)}px`,
    hitSlop,
    transitionDuration,
  };
}

async function main() {
  let launched;
  let directClient;
  try {
    launched = launch();
    const retained = JSON.parse(readFileSync(retainedPath, "utf8"));
    const client = launched.client.clientId;
    const sessionId = launched.client.sessionId;
    directClient = await openOwnedDevToolSession({
      appName: "@t3tools/lynxtron",
      devToolCli,
      ownedPorts: readOwnedListeningTcpPorts(launched.processId),
    });
    await directClient.runCdp("DOM.enable", { useCompression: false });
    const documentResponse = await directClient.runCdp("DOM.getDocument", {});
    const documentRoot = commandResult(documentResponse)?.root;
    const rootNodeId = documentRoot?.children?.[0]?.nodeId ?? documentRoot?.nodeId;
    if (!rootNodeId) throw new Error("MTS product document has no root node.");

    await waitFor(
      () =>
        JSON.parse(
          background(
            client,
            sessionId,
            "JSON.stringify({" +
              "transport:globalThis.__T3_LYNXTRON_CONNECTOR_TRANSPORT__?.kind??null," +
              "fixture:typeof globalThis.__T3_LYNXTRON_MTS_PROVIDER_FIXTURE__," +
              "ui:typeof globalThis.__T3_LYNXTRON_RESPONSIVE_UI_PROBE__," +
              "resize:Object.keys(globalThis.__T3_LYNXTRON_MTS_RESIZE_PROBE__??{})" +
              "})",
          ),
        ),
      (value) =>
        value.transport === "main" &&
        value.fixture === "function" &&
        value.ui === "function" &&
        value.resize.includes("sidebar") &&
        value.resize.includes("right-panel"),
    );

    const providerPath = path.join(retained.stateDir, "caches/codex.json");
    const provider = JSON.parse(readFileSync(providerPath, "utf8"));
    Object.assign(provider, {
      instanceId: "codex",
      driver: "codex",
      slashCommands: provider.slashCommands ?? [],
      skills: provider.skills ?? [],
    });
    const injected = await waitFor(
      () =>
        background(
          client,
          sessionId,
          `globalThis.__T3_LYNXTRON_MTS_PROVIDER_FIXTURE__(${JSON.stringify(provider)})`,
        ),
      (value) => value === true,
      30_000,
    );
    if (injected !== true) throw new Error("MTS provider fixture was not applied.");

    const sidebarActualBefore = await readResizeState(
      directClient,
      rootNodeId,
      client,
      sessionId,
      "sidebar",
    );
    const readSidebarWidth = async () =>
      Number.parseFloat(
        (await readResizeState(directClient, rootNodeId, client, sessionId, "sidebar")).width,
      );
    const sidebarRailNodeId = await queryNode(directClient, rootNodeId, ".sidebar-resize-rail");
    const sidebarWidenInput = await dragNode(
      directClient,
      sidebarRailNodeId,
      64,
      () =>
        waitFor(
          () => readResizeState(directClient, rootNodeId, client, sessionId, "sidebar"),
          (value) => value.hitSlop === "2000px",
        ),
      readSidebarWidth,
      1,
    );
    const sidebarWider = await waitFor(
      () => readResizeState(directClient, rootNodeId, client, sessionId, "sidebar"),
      (value) =>
        Number.parseFloat(value.width) >= Number.parseFloat(sidebarActualBefore.width) + 60,
    );
    const resizedSidebarRailNodeId = await queryNode(
      directClient,
      rootNodeId,
      ".sidebar-resize-rail",
    );
    const sidebarNarrowInput = await dragNode(
      directClient,
      resizedSidebarRailNodeId,
      -64,
      () =>
        waitFor(
          () => readResizeState(directClient, rootNodeId, client, sessionId, "sidebar"),
          (value) => value.hitSlop === "2000px",
        ),
      readSidebarWidth,
      1,
    );
    const sidebarNarrower = await waitFor(
      () => readResizeState(directClient, rootNodeId, client, sessionId, "sidebar"),
      (value) =>
        Math.abs(Number.parseFloat(value.width) - Number.parseFloat(sidebarActualBefore.width)) <=
        4,
    );

    const sidebarBefore = JSON.parse(
      mainThread(
        client,
        sessionId,
        'JSON.stringify({gap:lynx.querySelector(".sidebar-gap")?.getComputedStyleProperty("width"),container:lynx.querySelector(".sidebar-container")?.getComputedStyleProperty("width")})',
      ),
    );
    const sidebarCall = JSON.parse(
      background(
        client,
        sessionId,
        'globalThis.__T3_LYNXTRON_MTS_RESIZE_PROBE__.sidebar(256,320).then(()=>JSON.stringify({status:"resolved"}),error=>JSON.stringify({status:"rejected",message:String(error)}))',
        true,
      ),
    );
    const sidebarAfter = JSON.parse(
      mainThread(
        client,
        sessionId,
        'JSON.stringify({gap:lynx.querySelector(".sidebar-gap")?.getComputedStyleProperty("width"),container:lynx.querySelector(".sidebar-container")?.getComputedStyleProperty("width")})',
      ),
    );

    background(
      client,
      sessionId,
      'globalThis.__T3_LYNXTRON_RESPONSIVE_UI_PROBE__("open-files");true',
    );
    const rightPanelBefore = await waitFor(
      () =>
        JSON.parse(
          mainThread(
            client,
            sessionId,
            'JSON.stringify({exists:!!lynx.querySelector(".right-panel"),width:lynx.querySelector(".right-panel")?.getComputedStyleProperty("width")})',
          ),
        ),
      (value) => value.exists,
    );
    const rightPanelCall = JSON.parse(
      background(
        client,
        sessionId,
        'globalThis.__T3_LYNXTRON_MTS_RESIZE_PROBE__["right-panel"](1000,900).then(()=>JSON.stringify({status:"resolved"}),error=>JSON.stringify({status:"rejected",message:String(error)}))',
        true,
      ),
    );
    const rightPanelAfter = JSON.parse(
      mainThread(
        client,
        sessionId,
        'JSON.stringify({exists:!!lynx.querySelector(".right-panel"),width:lynx.querySelector(".right-panel")?.getComputedStyleProperty("width"),attribute:lynx.querySelector(".right-panel")?.getAttribute("data-right-panel-width")})',
      ),
    );
    const rightPanelActualBefore = await readResizeState(
      directClient,
      rootNodeId,
      client,
      sessionId,
      "right-panel",
    );
    const readRightPanelWidth = async () =>
      Number.parseFloat(
        (await readResizeState(directClient, rootNodeId, client, sessionId, "right-panel")).width,
      );
    const rightPanelRailNodeId = await queryNode(
      directClient,
      rootNodeId,
      ".right-panel__resize-handle",
    );
    const rightPanelWidenInput = await dragNode(
      directClient,
      rightPanelRailNodeId,
      -80,
      () =>
        waitFor(
          () => readResizeState(directClient, rootNodeId, client, sessionId, "right-panel"),
          (value) => value.hitSlop === "2000px",
        ),
      readRightPanelWidth,
      -1,
    );
    const rightPanelWider = await waitFor(
      () => readResizeState(directClient, rootNodeId, client, sessionId, "right-panel"),
      (value) =>
        Number.parseFloat(value.width) >= Number.parseFloat(rightPanelActualBefore.width) + 76,
    );
    const resizedRightPanelRailNodeId = await queryNode(
      directClient,
      rootNodeId,
      ".right-panel__resize-handle",
    );
    const rightPanelNarrowInput = await dragNode(
      directClient,
      resizedRightPanelRailNodeId,
      80,
      () =>
        waitFor(
          () => readResizeState(directClient, rootNodeId, client, sessionId, "right-panel"),
          (value) => value.hitSlop === "2000px",
        ),
      readRightPanelWidth,
      -1,
    );
    const rightPanelNarrower = await waitFor(
      () => readResizeState(directClient, rootNodeId, client, sessionId, "right-panel"),
      (value) =>
        Math.abs(
          Number.parseFloat(value.width) - Number.parseFloat(rightPanelActualBefore.width),
        ) <= 4,
    );

    background(
      client,
      sessionId,
      `(()=>{globalThis.__T3_LYNXTRON_MTS_PROVIDER_FIXTURE__(${JSON.stringify(
        provider,
      )});globalThis.__T3_LYNXTRON_RESPONSIVE_UI_PROBE__("open-model-picker");return true})()`,
    );
    const modelPickerReady = await waitFor(
      () => {
        background(
          client,
          sessionId,
          `(()=>{globalThis.__T3_LYNXTRON_MTS_PROVIDER_FIXTURE__(${JSON.stringify(
            provider,
          )});globalThis.__T3_LYNXTRON_RESPONSIVE_UI_PROBE__("open-model-picker");return true})()`,
        );
        const state = JSON.parse(
          background(
            client,
            sessionId,
            "JSON.stringify({" +
              "wheel:typeof globalThis.__T3_LYNXTRON_MTS_MODEL_PICKER_WHEEL_PROBE__," +
              "state:globalThis.__T3_LYNXTRON_MODEL_PICKER_STATE__?.()??null" +
              "})",
          ),
        );
        const dom = JSON.parse(
          mainThread(
            client,
            sessionId,
            'JSON.stringify({list:!!lynx.querySelector(".picker-list"),rows:lynx.querySelectorAll(".model-picker-row").length})',
          ),
        );
        return { ...state, ...dom };
      },
      (value) => value.wheel === "function" && value.list && value.rows > 0,
    );
    const modelPickerBefore = JSON.parse(
      mainThread(
        client,
        sessionId,
        'JSON.stringify({exists:!!lynx.querySelector(".picker-list"),offset:lynx.querySelector(".picker-list")?.getAttribute("data-wheel-offset")??null})',
      ),
    );
    const modelPickerCall = JSON.parse(
      background(
        client,
        sessionId,
        'globalThis.__T3_LYNXTRON_MTS_MODEL_PICKER_WHEEL_PROBE__(120).then(()=>JSON.stringify({status:"resolved"}),error=>JSON.stringify({status:"rejected",message:String(error)}))',
        true,
      ),
    );
    const modelPickerAfter = JSON.parse(
      mainThread(
        client,
        sessionId,
        'JSON.stringify({exists:!!lynx.querySelector(".picker-list"),offset:lynx.querySelector(".picker-list")?.getAttribute("data-wheel-offset")??null})',
      ),
    );

    const errors = rendererErrors(client, sessionId);
    const hostLog = readFileSync(retained.logPath, "utf8");
    const hostFrequencyWarning = hostLog.includes(
      "ContextProxy::DispatchEvent called too frequently. method_name:JSContext#CoreContext#__SendPageEvent",
    );
    const report = {
      schemaVersion: 1,
      processId: launched.processId,
      client: launched.client,
      sidebar: {
        before: sidebarBefore,
        call: sidebarCall,
        after: sidebarAfter,
        actual: {
          before: sidebarActualBefore,
          widenInput: sidebarWidenInput,
          wider: sidebarWider,
          narrowInput: sidebarNarrowInput,
          narrower: sidebarNarrower,
        },
      },
      rightPanel: {
        before: rightPanelBefore,
        call: rightPanelCall,
        after: rightPanelAfter,
        actual: {
          before: rightPanelActualBefore,
          widenInput: rightPanelWidenInput,
          wider: rightPanelWider,
          narrowInput: rightPanelNarrowInput,
          narrower: rightPanelNarrower,
        },
      },
      modelPicker: {
        ready: modelPickerReady,
        before: modelPickerBefore,
        call: modelPickerCall,
        after: modelPickerAfter,
      },
      rendererErrors: errors,
      hostFrequencyWarning,
    };
    report.passed =
      sidebarCall.status === "resolved" &&
      sidebarAfter.gap === sidebarAfter.container &&
      sidebarAfter.gap !== sidebarBefore.gap &&
      Number.parseFloat(sidebarAfter.gap) >= 208 &&
      rightPanelCall.status === "resolved" &&
      rightPanelAfter.width === "640px" &&
      rightPanelAfter.attribute === "640" &&
      Number.parseFloat(sidebarWider.width) > Number.parseFloat(sidebarActualBefore.width) &&
      sidebarWider.hitSlop === "0px" &&
      sidebarWidenInput.maxAbsoluteError <= 2 &&
      Math.abs(
        Number.parseFloat(sidebarNarrower.width) - Number.parseFloat(sidebarActualBefore.width),
      ) <= 4 &&
      sidebarNarrower.hitSlop === "0px" &&
      sidebarNarrowInput.maxAbsoluteError <= 2 &&
      Number.parseFloat(rightPanelWider.width) > Number.parseFloat(rightPanelActualBefore.width) &&
      rightPanelWider.hitSlop === "0px" &&
      rightPanelWidenInput.maxAbsoluteError <= 2 &&
      Math.abs(
        Number.parseFloat(rightPanelNarrower.width) -
          Number.parseFloat(rightPanelActualBefore.width),
      ) <= 4 &&
      rightPanelNarrower.hitSlop === "0px" &&
      rightPanelNarrowInput.maxAbsoluteError <= 2 &&
      modelPickerCall.status === "resolved" &&
      modelPickerBefore.exists === true &&
      modelPickerAfter.offset === "120" &&
      errors.length === 0 &&
      !hostFrequencyWarning;
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.passed) process.exitCode = 1;
  } finally {
    await directClient?.close();
    stop();
  }
}

await main();
