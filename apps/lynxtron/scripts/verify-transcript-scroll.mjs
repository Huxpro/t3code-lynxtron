#!/usr/bin/env node
/**
 * Drives one explicitly identified Lynx DevTool session through diagnostic
 * transcript probes. This verifies renderer state wiring, not physical wheel
 * or pointer acceptance.
 *
 *   --step scroll-up   inject user-scroll-away and assert the jump pill appears
 *   --step jump        inject user-scroll-end and assert the pill disappears
 *
 * Exits non-zero when an assertion fails.
 */
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const defaultCli = path.join(os.homedir(), ".agents/skills/lynx-devtool/scripts/index.mjs");
const devToolCli = process.env.LYNX_DEVTOOL_CLI ?? defaultCli;

function readArgument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const clientId = readArgument("--client-id", null);
const sessionId = Number(readArgument("--session-id", ""));
const step = readArgument("--step", "scroll-up");
if (!clientId || !Number.isInteger(sessionId) || sessionId <= 0) {
  throw new Error("Explicit --client-id and --session-id are required.");
}

const connectorModuleUrl = pathToFileURL(path.join(path.dirname(devToolCli), "connector.mjs")).href;
const { Connector, DaemonTransport } = await import(connectorModuleUrl);
const transport = new DaemonTransport();
const connector = new Connector([transport]);
const sessions = await connector.sendListSessionMessage(clientId);
const session = sessions.find((candidate) => Number(candidate.session_id) === sessionId);
if (!session) throw new Error(`Session ${sessionId} does not belong to client ${clientId}.`);
const runCdp = (method, params) => connector.sendCDPMessage(clientId, sessionId, method, params);

function commandResult(response) {
  return response?.result?.result ?? response?.result ?? response;
}

await runCdp("DOM.enable", { useCompression: false });
const documentResponse = await runCdp("DOM.getDocument", {});
const root = commandResult(documentResponse)?.root;
const rootNodeId = root?.children?.[0]?.nodeId ?? root?.nodeId;
if (!rootNodeId) throw new Error("DOM.getDocument returned no root node.");

async function queryNodeId(selector) {
  const response = await runCdp("DOM.querySelector", { nodeId: rootNodeId, selector });
  const nodeId = commandResult(response)?.nodeId;
  return Number.isInteger(nodeId) && nodeId > 0 ? nodeId : null;
}

async function invokeScrollProbe(action) {
  const response = await runCdp("Runtime.evaluate", {
    expression: `globalThis.__T3_LYNXTRON_TRANSCRIPT_SCROLL_PROBE__?.(${JSON.stringify(action)})`,
    returnByValue: true,
  });
  if (response?.error) throw new Error(JSON.stringify(response.error));
}

async function waitForPill(present, label) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const nodeId = await queryNodeId(".timeline-jump--visible");
    if ((nodeId !== null) === present) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Assertion failed: ${label}`);
}

if (step === "scroll-up") {
  await invokeScrollProbe("user-scroll-away");
  await waitForPill(true, "jump-to-latest pill should appear after a user scroll away");
  process.stdout.write("PASS diagnostic scroll-up: follow detached, jump pill visible\n");
} else if (step === "jump") {
  await invokeScrollProbe("user-scroll-end");
  await waitForPill(false, "jump pill should disappear after tapping it");
  process.stdout.write("PASS diagnostic jump: follow restored, pill dismissed\n");
} else {
  throw new Error(`Unknown step: ${step}`);
}

await transport.close();
