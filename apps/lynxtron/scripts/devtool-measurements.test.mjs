import { assert, describe, expect, it } from "vite-plus/test";

import { collectLynxMeasurements } from "./devtool-measurements.mjs";

describe("Lynx DevTool visual measurements", () => {
  it("collects canonical box, type, color, and text fields for every selector", async () => {
    let nextNodeId = 10;
    const selectorIds = new Map();
    const calls = [];
    const runCdp = async (method, params) => {
      calls.push({ method, params });
      if (method === "DOM.enable") return { result: {} };
      if (method === "DOM.getDocument") {
        return { result: { root: { nodeId: 1, children: [{ nodeId: 2 }] } } };
      }
      if (method === "DOM.querySelector") {
        const nodeId = nextNodeId++;
        selectorIds.set(params.selector, nodeId);
        return { result: { nodeId } };
      }
      if (method === "DOM.getBoxModel") {
        return {
          result: {
            model: {
              border: [20, 40, 220, 40, 220, 140, 20, 140],
              width: 200,
              height: 100,
            },
          },
        };
      }
      if (method === "CSS.getComputedStyleForNode") {
        return {
          result: {
            computedStyle: [
              { name: "font-size", value: "14px" },
              { name: "font-weight", value: "500" },
              { name: "color", value: "rgb(1, 2, 3)" },
              { name: "background-color", value: "rgb(4, 5, 6)" },
            ],
          },
        };
      }
      if (method === "DOM.innerText") return { result: { text: "Measured" } };
      if (method === "DOM.getOuterHTML") {
        return { result: { outerHTML: '<text text="Fallback"></text>' } };
      }
      throw new Error(`Unexpected method ${method}`);
    };
    const entry = { id: "sample", web: ".web", lynx: ".lynx" };
    const measurements = await collectLynxMeasurements({
      runCdp,
      spec: {
        route: "new-thread",
        anchors: [entry],
        typography: [entry],
        colors: [entry],
      },
    });

    assert.deepEqual(measurements.anchors.sample.rect, {
      x: 20,
      y: 40,
      width: 200,
      height: 100,
    });
    assert.equal(measurements.typography.sample.style.fontSize, "14px");
    assert.equal(measurements.colors.sample.style.backgroundColor, "rgb(4, 5, 6)");
    assert.equal(measurements.anchors.sample.text, "Measured");
    assert.equal(selectorIds.get(".lynx") > 0, true);
    assert.equal(calls[0].method, "DOM.enable");
    assert.deepEqual(calls[0].params, { useCompression: false });
    assert.equal(
      calls.some(
        ({ method, params }) =>
          method === "DOM.querySelector" && params.nodeId === 2 && params.selector === ".lynx",
      ),
      true,
    );
  });

  it.each([0, -1])("fails when a required selector returns nodeId %s", async (nodeId) => {
    const runCdp = async (method) => {
      if (method === "DOM.enable") return { result: {} };
      if (method === "DOM.getDocument") return { result: { root: { nodeId: 1 } } };
      if (method === "DOM.querySelector") return { result: { nodeId } };
      throw new Error(`Unexpected ${method}`);
    };
    await expect(
      collectLynxMeasurements({
        runCdp,
        spec: {
          route: "new-thread",
          anchors: [{ id: "missing", lynx: ".missing" }],
          typography: [],
          colors: [],
        },
      }),
    ).rejects.toThrow(/did not match/u);
  });

  it("falls back to text attributes in Lynx outer HTML", async () => {
    const runCdp = async (method) => {
      if (method === "DOM.enable") return { result: {} };
      if (method === "DOM.getDocument") return { result: { root: { nodeId: 1 } } };
      if (method === "DOM.querySelector") return { result: { nodeId: 3 } };
      if (method === "DOM.getBoxModel") {
        return { result: { model: { border: [0, 0, 1, 0, 1, 1, 0, 1] } } };
      }
      if (method === "CSS.getComputedStyleForNode") {
        return { result: { computedStyle: [] } };
      }
      if (method === "DOM.innerText") {
        return { result: { text: "[object Object]", rawTextValues: [] } };
      }
      if (method === "DOM.getOuterHTML") {
        return {
          result: {
            outerHTML:
              '<view><text text="Ask &amp; build"></text><raw-text text="t3code"></raw-text></view>',
          },
        };
      }
      throw new Error(`Unexpected ${method}`);
    };
    const entry = { id: "sample", lynx: ".lynx" };
    const measurements = await collectLynxMeasurements({
      runCdp,
      spec: {
        route: "new-thread",
        anchors: [entry],
        typography: [],
        colors: [],
      },
    });

    assert.equal(measurements.anchors.sample.text, "Ask & build t3code");
  });
});
