#!/usr/bin/env node
/**
 * Drives the running Lynxtron client through the transcript scroll
 * interactions via Lynx DevTool CDP and asserts the follow/detach contract:
 *
 *   --step scroll-up   drag the timeline content toward older rows and assert
 *                      the "Jump to latest" pill appears (follow detached)
 *   --step jump        tap the pill and assert it disappears (follow restored)
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

const clientName = readArgument("--client-name", "@t3tools/lynxtron");
const step = readArgument("--step", "scroll-up");

const connectorModuleUrl = pathToFileURL(path.join(path.dirname(devToolCli), "connector.mjs")).href;
const { Connector, DaemonTransport } = await import(connectorModuleUrl);
const transport = new DaemonTransport();
const connector = new Connector([transport]);
const clients = await connector.listClients();
const matches = clients.filter((client) => client.info?.App === clientName);
if (matches.length !== 1) {
  throw new Error(`Expected one client named "${clientName}"; found ${matches.length}.`);
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
if (!session) throw new Error("No Lynx DevTool session found.");
const runCdp = (method, params) =>
  connector.sendCDPMessage(clientId, Number(session.session_id), method, params);

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

async function nodeCenter(selector) {
  const nodeId = await queryNodeId(selector);
  if (!nodeId) throw new Error(`Selector did not match: ${selector}`);
  const boxResponse = await runCdp("DOM.getBoxModel", { nodeId });
  const model = commandResult(boxResponse)?.model;
  return quadCenter(model?.border ?? model?.content);
}

async function mouse(type, point, extra = {}) {
  await runCdp("Input.emulateTouchFromMouseEvent", {
    type,
    x: point.x,
    y: point.y,
    timestamp: Date.now() / 1000,
    button: "left",
    ...extra,
  });
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
  const center = await nodeCenter(".timeline-list");
  // A downward drag scrolls the content toward older rows (touch semantics).
  await mouse("mousePressed", center);
  for (let i = 1; i <= 12; i += 1) {
    await mouse("mouseMoved", { x: center.x, y: center.y + i * 30 });
    await new Promise((resolveWait) => setTimeout(resolveWait, 16));
  }
  await mouse("mouseReleased", { x: center.x, y: center.y + 360 });
  await waitForPill(true, "jump-to-latest pill should appear after a user scroll away");
  process.stdout.write("PASS scroll-up: follow detached, jump pill visible\n");
} else if (step === "jump") {
  const pillCenter = await nodeCenter(".timeline-jump--visible");
  await mouse("mouseMoved", pillCenter);
  await mouse("mousePressed", pillCenter);
  await mouse("mouseReleased", pillCenter);
  await waitForPill(false, "jump pill should disappear after tapping it");
  process.stdout.write("PASS jump: follow restored, pill dismissed\n");
} else {
  throw new Error(`Unknown step: ${step}`);
}

await transport.close();
