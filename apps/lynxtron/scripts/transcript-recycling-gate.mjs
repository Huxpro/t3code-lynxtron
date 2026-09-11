function commandResult(response) {
  return response?.result?.result ?? response?.result ?? response;
}

async function evaluate(runCdp, expression) {
  const response = await runCdp("Runtime.evaluate", { expression, returnByValue: true });
  if (response?.error) throw new Error(JSON.stringify(response.error));
  return commandResult(response)?.result?.value ?? commandResult(response)?.value;
}

async function materializedRows(runCdp, rootNodeId) {
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

async function waitForReboundRows(runCdp, rootNodeId, previousRows, timeoutMs) {
  const previousByNode = new Map(previousRows.map((row) => [row.nodeId, row.rowId]));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const currentRows = await materializedRows(runCdp, rootNodeId);
    const rebound = currentRows.find(
      (row) => previousByNode.has(row.nodeId) && previousByNode.get(row.nodeId) !== row.rowId,
    );
    if (rebound) return { rows: currentRows, rebound };
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error("Assertion failed: no materialized row node was rebound after scrolling");
}

export async function verifyTranscriptRecycling({
  runCdp,
  minimumRowCount = 100,
  expectedRowCount,
  timeoutMs = 4_000,
}) {
  if (!Number.isInteger(minimumRowCount) || minimumRowCount < 2) {
    throw new Error("minimumRowCount must be an integer greater than one.");
  }
  await runCdp("DOM.enable", { useCompression: false });
  const documentResponse = await runCdp("DOM.getDocument", {});
  const root = commandResult(documentResponse)?.root;
  const rootNodeId = root?.children?.[0]?.nodeId ?? root?.nodeId;
  if (!rootNodeId) throw new Error("DOM.getDocument returned no root node.");
  const rowCount = await evaluate(runCdp, "globalThis.__T3_LYNXTRON_TRANSCRIPT_ROW_COUNT__?.()");
  if (!Number.isInteger(rowCount) || rowCount < minimumRowCount) {
    throw new Error(
      `Long-transcript fixture requires at least ${minimumRowCount} rows; observed ${String(rowCount)}.`,
    );
  }
  if (expectedRowCount !== undefined && rowCount !== expectedRowCount) {
    throw new Error(`Expected ${expectedRowCount} canonical rows; observed ${rowCount}.`);
  }
  await evaluate(runCdp, 'globalThis.__T3_LYNXTRON_TRANSCRIPT_LIST_PROBE__?.(0, "top")');
  const firstRows = await materializedRows(runCdp, rootNodeId);
  if (firstRows.length === 0 || firstRows.length >= rowCount) {
    throw new Error(
      `Expected a bounded materialized row set smaller than ${rowCount}; observed ${firstRows.length}.`,
    );
  }
  await evaluate(
    runCdp,
    `globalThis.__T3_LYNXTRON_TRANSCRIPT_LIST_PROBE__?.(${rowCount - 1}, "bottom")`,
  );
  const last = await waitForReboundRows(runCdp, rootNodeId, firstRows, timeoutMs);
  return {
    status: "pass",
    canonicalRowCount: rowCount,
    materializedAtStart: firstRows.length,
    materializedAtEnd: last.rows.length,
    reboundNodeId: last.rebound.nodeId,
    reboundFromRowId: firstRows.find((row) => row.nodeId === last.rebound.nodeId)?.rowId ?? null,
    reboundToRowId: last.rebound.rowId,
  };
}
