#!/usr/bin/env node
/**
 * Drives one explicitly identified Lynx DevTool session through diagnostic
 * transcript probes. This verifies renderer state wiring, not physical wheel
 * or pointer acceptance.
 *
 *   --step scroll-up   inject user-scroll-away and assert the jump pill appears
 *   --step jump        inject user-scroll-end and assert the pill disappears
 *   --step recycling   prove a long transcript materializes a bounded row set
 *                      and rebinds a native node while scrolling first-to-last
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
const minimumRowCount = Number(readArgument("--minimum-row-count", "100"));
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

async function evaluate(expression) {
  const response = await runCdp("Runtime.evaluate", { expression, returnByValue: true });
  if (response?.error) throw new Error(JSON.stringify(response.error));
  return commandResult(response)?.result?.value ?? commandResult(response)?.value;
}

async function materializedRows() {
  const response = await runCdp("DOM.querySelectorAll", {
    nodeId: rootNodeId,
    selector: "[data-timeline-row-id]",
  });
  const nodeIds = commandResult(response)?.nodeIds ?? [];
  return Promise.all(
    nodeIds.map(async (nodeId) => {
      const attributesResponse = await runCdp("DOM.getAttributes", { nodeId });
      const attributes = commandResult(attributesResponse)?.attributes ?? [];
      const rowIdIndex = attributes.indexOf("data-timeline-row-id");
      return { nodeId, rowId: rowIdIndex >= 0 ? attributes[rowIdIndex + 1] : null };
    }),
  );
}

async function waitForMaterializedRowsDifferentFrom(previousRows) {
  const previousByNode = new Map(previousRows.map((row) => [row.nodeId, row.rowId]));
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const currentRows = await materializedRows();
    if (
      currentRows.some(
        (row) => previousByNode.has(row.nodeId) && previousByNode.get(row.nodeId) !== row.rowId,
      )
    ) {
      return currentRows;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error("Assertion failed: no materialized row node was rebound after scrolling");
}

if (step === "scroll-up") {
  await invokeScrollProbe("user-scroll-away");
  await waitForPill(true, "jump-to-latest pill should appear after a user scroll away");
  process.stdout.write("PASS diagnostic scroll-up: follow detached, jump pill visible\n");
} else if (step === "jump") {
  await invokeScrollProbe("user-scroll-end");
  await waitForPill(false, "jump pill should disappear after tapping it");
  process.stdout.write("PASS diagnostic jump: follow restored, pill dismissed\n");
} else if (step === "recycling") {
  if (!Number.isInteger(minimumRowCount) || minimumRowCount < 2) {
    throw new Error("--minimum-row-count must be an integer greater than one.");
  }
  const rowCount = await evaluate("globalThis.__T3_LYNXTRON_TRANSCRIPT_ROW_COUNT__?.()");
  if (!Number.isInteger(rowCount) || rowCount < minimumRowCount) {
    throw new Error(
      `Long-transcript fixture requires at least ${minimumRowCount} rows; observed ${String(rowCount)}.`,
    );
  }
  await evaluate('globalThis.__T3_LYNXTRON_TRANSCRIPT_LIST_PROBE__?.(0, "top")');
  const firstRows = await materializedRows();
  if (firstRows.length === 0 || firstRows.length >= rowCount) {
    throw new Error(
      `Expected a bounded materialized row set smaller than ${rowCount}; observed ${firstRows.length}.`,
    );
  }
  await evaluate(`globalThis.__T3_LYNXTRON_TRANSCRIPT_LIST_PROBE__?.(${rowCount - 1}, "bottom")`);
  const lastRows = await waitForMaterializedRowsDifferentFrom(firstRows);
  process.stdout.write(
    `PASS recycling: ${rowCount} canonical rows, ${firstRows.length}/${lastRows.length} materialized, node reuse observed\n`,
  );
} else {
  throw new Error(`Unknown step: ${step}`);
}

await transport.close();
