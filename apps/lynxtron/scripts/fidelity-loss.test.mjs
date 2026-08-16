import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, assert, describe, it } from "vite-plus/test";

import {
  buildArtifacts,
  computeTimeline,
  normalizeDimensionValue,
  pixelResidual,
  validateHistory,
  validateModel,
} from "./fidelity-loss.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const temporaryRoots = [];

function model() {
  return {
    version: 1,
    id: "fixture",
    description: "Fixture",
    expectedStateCount: 1,
    expectedCellCount: 4,
    expectedTotalWeight: 1,
    formula: {
      unknownResidual: 1,
      unknownConfidence: 0,
      gateResiduals: {
        contentPass: 0,
      },
      pixelResidual: {
        maeWeight: 0.5,
        maeScale: 10,
        significantShareWeight: 0.5,
        significantShareScale: 0.2,
      },
    },
    clients: {
      lynx: { label: "Lynx", weight: 0.4 },
      native: { label: "Native", weight: 0.6 },
    },
    dimensions: {
      content: { label: "Content", weight: 0.5 },
      material: { label: "Material", weight: 0.5 },
    },
    groups: { shell: "Shell" },
    states: [
      {
        id: "hero",
        label: "Hero",
        group: "shell",
        weight: 1,
        clients: ["lynx", "native"],
      },
    ],
  };
}

function history(points) {
  return {
    version: 1,
    id: "fixture-history",
    modelId: "fixture",
    updatedAt: "2026-08-13T00:00:00Z",
    provenance: {},
    points,
  };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("fidelity loss", () => {
  it("uses a fixed denominator so sparse evidence cannot look complete", () => {
    const data = computeTimeline(
      model(),
      history([
        {
          id: "baseline",
          observedAt: "2026-08-01T00:00:00Z",
          label: "Baseline",
          updates: [
            {
              states: ["hero"],
              clients: ["lynx"],
              dimensions: {
                content: { residual: 0, confidence: 1 },
              },
            },
          ],
        },
      ]),
    );
    assert.equal(data.points[0].confidence, 0.2);
    assert.equal(data.points[0].evidenceDebt, 0.8);
    assert.equal(data.points[0].loss, 0.8);
  });

  it("lowers conservative loss only when new evidence covers more weighted cells", () => {
    const data = computeTimeline(
      model(),
      history([
        {
          id: "one-client",
          observedAt: "2026-08-01T00:00:00Z",
          label: "One client",
          updates: [
            {
              states: ["hero"],
              clients: ["lynx"],
              dimensions: {
                content: { residual: 0.2, confidence: 1 },
                material: { residual: 0.4, confidence: 1 },
              },
            },
          ],
        },
        {
          id: "native-added",
          observedAt: "2026-08-02T00:00:00Z",
          label: "Native added",
          updates: [
            {
              states: ["hero"],
              clients: ["native"],
              dimensions: {
                content: { residual: 0.1, confidence: 1 },
                material: { residual: 0.3, confidence: 1 },
              },
            },
          ],
        },
      ]),
    );
    assert.isBelow(data.points[1].loss, data.points[0].loss);
    assert.equal(data.points[1].evidenceDebt, 0);
  });

  it("raises evidence debt without inventing a product regression", () => {
    const data = computeTimeline(
      model(),
      history([
        {
          id: "certified",
          observedAt: "2026-08-01T00:00:00Z",
          label: "Certified",
          updates: [
            {
              states: ["hero"],
              clients: "*",
              dimensions: {
                content: { residual: 0.1, confidence: 1 },
                material: { residual: 0.2, confidence: 1 },
              },
            },
          ],
        },
        {
          id: "superseded",
          observedAt: "2026-08-02T00:00:00Z",
          label: "Superseded",
          confidenceEvents: [
            {
              states: "*",
              clients: "*",
              dimensions: "*",
              factor: 0.25,
              reason: "Evidence is stale.",
            },
          ],
        },
      ]),
    );
    assert.equal(data.points[0].observedResidual, data.points[1].observedResidual);
    assert.isAbove(data.points[1].evidenceDebt, data.points[0].evidenceDebt);
    assert.isAbove(data.points[1].loss, data.points[0].loss);
    assert.equal(data.points[1].bestLoss, data.points[0].loss);
  });

  it("normalizes pixel residuals with the declared formula", () => {
    assert.equal(pixelResidual(model(), { mae: 5, significantShare: 0.1 }), 0.5);
  });

  it("folds relation residuals into geometry without changing the fixed denominator", () => {
    const inputModel = model();
    const normalized = normalizeDimensionValue(inputModel, "geometry", {
      anchorDeltas: [0, 16],
      relationResiduals: [0, 1],
      anchorScale: 32,
      confidence: 1,
    });

    assert.equal(normalized.method, "geometry-anchors-and-relations");
    assert.equal(normalized.residual, 0.375);
    assert.equal(inputModel.expectedCellCount, 4);
    assert.equal(inputModel.expectedTotalWeight, 1);
  });

  it("rejects relation residuals outside the geometry dimension", () => {
    const result = validateHistory(
      model(),
      history([
        {
          id: "bad-relation-dimension",
          observedAt: "2026-08-01T00:00:00Z",
          label: "Bad relation dimension",
          updates: [
            {
              states: ["hero"],
              clients: ["lynx"],
              dimensions: {
                content: { relationResiduals: [0.2], confidence: 1 },
              },
            },
          ],
        },
      ]),
    );
    assert.isTrue(
      result.errors.some((entry) =>
        entry.includes("relationResiduals require the geometry dimension"),
      ),
    );
  });

  it("rejects invalid weights and unknown state updates", () => {
    const inputModel = model();
    inputModel.clients.native.weight = 0.5;
    assert.isTrue(validateModel(inputModel).some((entry) => entry.includes("sum to 1")));
    const result = validateHistory(
      model(),
      history([
        {
          id: "bad",
          observedAt: "2026-08-01T00:00:00Z",
          label: "Bad",
          updates: [
            {
              states: ["missing"],
              clients: ["lynx"],
              dimensions: { content: 0 },
            },
          ],
        },
      ]),
    );
    assert.isTrue(result.errors.some((entry) => entry.includes("unknown value missing")));
  });

  it("generates stable JSON, CSV, and single-file HTML artifacts", () => {
    const root = mkdtempSync(path.join(tmpdir(), "t3-fidelity-loss-"));
    temporaryRoots.push(root);
    const modelPath = path.join(root, "model.json");
    const historyPath = path.join(root, "history.json");
    const outputPath = path.join(root, "history.json.out");
    const csvPath = path.join(root, "history.csv");
    const attributionCsvPath = path.join(root, "commit-attribution.csv");
    const htmlPath = path.join(root, "index.html");
    writeFileSync(modelPath, JSON.stringify(model()));
    writeFileSync(
      historyPath,
      JSON.stringify(
        history([
          {
            id: "baseline",
            observedAt: "2026-08-01T00:00:00Z",
            label: "Baseline",
            updates: [],
          },
        ]),
      ),
    );
    const args = [
      path.join(scriptDirectory, "fidelity-loss.mjs"),
      "--model",
      modelPath,
      "--history",
      historyPath,
      "--output",
      outputPath,
      "--csv",
      csvPath,
      "--html",
      htmlPath,
    ];
    execFileSync(process.execPath, args);
    execFileSync(process.execPath, [...args, "--check"]);
    const direct = buildArtifacts(model(), JSON.parse(readFileSync(historyPath, "utf8")));
    assert.equal(readFileSync(outputPath, "utf8"), direct.json);
    assert.match(readFileSync(csvPath, "utf8"), /improvementFromBaseline/u);
    assert.match(readFileSync(attributionCsvPath, "utf8"), /allocation/u);
    assert.match(readFileSync(htmlPath, "utf8"), /Loss falls only when evidence earns it/u);
  });

  it("keeps attribution deltas equal to measured checkpoint deltas", () => {
    const inputModel = model();
    const data = computeTimeline(
      inputModel,
      history([
        {
          id: "baseline",
          observedAt: "2026-08-01T00:00:00Z",
          label: "Baseline",
          commit: "25db04b687d3473a3b807a6e674c71fecc534b2d",
          updates: [
            {
              states: ["hero"],
              clients: "*",
              dimensions: {
                content: { residual: 0.1, confidence: 1 },
                material: { residual: 0.2, confidence: 1 },
              },
            },
          ],
        },
        {
          id: "policy",
          observedAt: "2026-08-02T00:00:00Z",
          label: "Policy",
          commit: "a5352f06f872d5f256a970804a9c4b5116e84c87",
          confidenceEvents: [
            {
              states: "*",
              clients: "*",
              dimensions: "*",
              factor: 0.5,
              reason: "Evidence is stale.",
            },
          ],
        },
      ]),
    );
    const rows = data.attribution.filter((row) => typeof row.delta === "number");
    const delta = rows.reduce((sum, row) => sum + row.delta, 0);
    assert.equal(roundForTest(delta), roundForTest(data.points[1].loss - data.points[0].loss));
    assert.isTrue(data.attribution.some((row) => row.allocation === "unmeasured-product-commit"));
    assert.isTrue(data.attribution.some((row) => row.allocation === "evidence-policy"));
  });

  it("keeps explicit evidence-session deltas off intervening product commits", () => {
    const data = computeTimeline(
      model(),
      history([
        {
          id: "baseline",
          observedAt: "2026-08-12T05:40:56+08:00",
          label: "Baseline",
          commit: "25db04b687d3473a3b807a6e674c71fecc534b2d",
          updates: [],
        },
        {
          id: "current-measurement",
          observedAt: "2026-08-12T19:47:57.286Z",
          label: "Current measurement",
          commit: "43d1855adbc05922364c5ff312d954282cb7b361",
          attribution: {
            allocation: "evidence-session",
            confidence: 0.95,
            reason: "First current-head measurement.",
          },
          updates: [
            {
              states: ["hero"],
              clients: ["lynx"],
              dimensions: {
                content: { residual: 0.1, confidence: 1 },
              },
            },
          ],
        },
      ]),
    );
    const session = data.attribution.find((row) => row.allocation === "evidence-session");
    assert.equal(
      roundForTest(session.delta),
      roundForTest(data.points[1].loss - data.points[0].loss),
    );
    assert.isTrue(data.attribution.some((row) => row.allocation === "unmeasured-product-commit"));
    assert.isFalse(
      data.attribution.some((row) => row.allocation === "estimated-from-checkpoint-delta"),
    );
  });

  it("accepts an explicit working-tree product-change attribution", () => {
    const inputHistory = history([
      {
        id: "baseline",
        observedAt: "2026-08-12T19:00:00Z",
        label: "Baseline",
        updates: [],
      },
      {
        id: "working-tree-fix",
        observedAt: "2026-08-12T20:00:00Z",
        label: "Working tree fix",
        codeState: "working-tree",
        attribution: {
          allocation: "working-tree-product-change",
          confidence: 0.95,
          reason: "Measured before and after one working-tree product fix.",
        },
        updates: [
          {
            states: ["hero"],
            clients: ["lynx"],
            dimensions: {
              content: { residual: 0, confidence: 1 },
            },
          },
        ],
      },
    ]);
    assert.deepEqual(validateHistory(model(), inputHistory).errors, []);
    const data = computeTimeline(model(), inputHistory);
    assert.equal(data.attribution.at(-1)?.allocation, "working-tree-product-change");
    assert.equal(
      roundForTest(data.attribution.at(-1)?.delta ?? 0),
      roundForTest(data.points[1].loss - data.points[0].loss),
    );
  });

  it("accepts a direct measured delta for a committed product change", () => {
    const inputHistory = history([
      {
        id: "baseline",
        observedAt: "2026-08-12T19:00:00Z",
        label: "Baseline",
        updates: [],
      },
      {
        id: "committed-fix",
        observedAt: "2026-08-12T20:00:00Z",
        label: "Committed fix",
        commit: "43d1855adbc05922364c5ff312d954282cb7b361",
        attribution: {
          allocation: "measured-product-change",
          confidence: 0.95,
          reason: "Measured the same snapshot before and after one committed product fix.",
        },
        updates: [
          {
            states: ["hero"],
            clients: ["lynx"],
            dimensions: {
              content: { residual: 0, confidence: 1 },
            },
          },
        ],
      },
    ]);
    assert.deepEqual(validateHistory(model(), inputHistory).errors, []);
    const data = computeTimeline(model(), inputHistory);
    assert.equal(data.attribution.at(-1)?.allocation, "measured-product-change");
    assert.equal(
      roundForTest(data.attribution.at(-1)?.delta ?? 0),
      roundForTest(data.points[1].loss - data.points[0].loss),
    );
  });
});

function roundForTest(value) {
  return Number(value.toFixed(6));
}
