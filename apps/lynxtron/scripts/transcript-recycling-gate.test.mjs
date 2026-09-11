import { assert, describe, expect, it } from "vite-plus/test";

import { verifyTranscriptRecycling } from "./transcript-recycling-gate.mjs";

function fakeCdp({ rowCount = 240, bounded = true, rebind = true } = {}) {
  let atEnd = false;
  const rowIds = () => (atEnd ? ["row-230", "row-231"] : ["row-1", "row-2"]);
  return async (method, params) => {
    if (method === "DOM.enable") return {};
    if (method === "DOM.getDocument") return { result: { root: { nodeId: 1 } } };
    if (method === "DOM.querySelectorAll") {
      return {
        result: {
          nodeIds: bounded ? [11, 12] : Array.from({ length: rowCount }, (_, index) => index + 11),
        },
      };
    }
    if (method === "DOM.getAttributes") {
      const index = Number(params.nodeId) - 11;
      const rowId = bounded ? rowIds()[index] : `row-${index + 1}`;
      return {
        result: { attributes: ["data-timeline-row-id", rebind ? rowId : `row-${index + 1}`] },
      };
    }
    if (method === "Runtime.evaluate") {
      if (String(params.expression).includes("ROW_COUNT")) {
        return { result: { result: { value: rowCount } } };
      }
      if (String(params.expression).includes("bottom")) atEnd = true;
      return { result: { result: { value: true } } };
    }
    throw new Error(`Unexpected CDP method ${method}`);
  };
}

describe("transcript recycling gate", () => {
  it("proves bounded materialization and node rebinding", async () => {
    const result = await verifyTranscriptRecycling({
      runCdp: fakeCdp(),
      expectedRowCount: 240,
      timeoutMs: 100,
    });
    assert.equal(result.status, "pass");
    assert.equal(result.materializedAtStart, 2);
    assert.equal(result.reboundNodeId, 11);
    assert.equal(result.reboundFromRowId, "row-1");
    assert.equal(result.reboundToRowId, "row-230");
  });

  it("rejects short or fully materialized transcripts", async () => {
    await expect(
      verifyTranscriptRecycling({ runCdp: fakeCdp({ rowCount: 20 }), timeoutMs: 100 }),
    ).rejects.toThrow(/requires at least 100 rows/u);
    await expect(
      verifyTranscriptRecycling({ runCdp: fakeCdp({ bounded: false }), timeoutMs: 100 }),
    ).rejects.toThrow(/bounded materialized row set/u);
  });
});
