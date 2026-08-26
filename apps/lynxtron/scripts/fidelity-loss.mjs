#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDirectory, "..");
const repoRoot = path.resolve(appRoot, "../..");
const defaultModelPath = path.join(scriptDirectory, "fidelity-loss-model.json");
const defaultHistoryPath = path.join(scriptDirectory, "fidelity-loss-history.json");
const defaultOutputPath = path.join(appRoot, "reports/fidelity-loss/history.json");
const defaultCsvPath = path.join(appRoot, "reports/fidelity-loss/history.csv");
const defaultHtmlPath = path.join(appRoot, "reports/fidelity-loss/index.html");

function clamp(value) {
  return Math.max(0, Math.min(1, Number(value)));
}

function round(value, digits = 6) {
  return Number(Number(value).toFixed(digits));
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function parseArguments(argv) {
  const options = {
    check: false,
    csvPath: defaultCsvPath,
    historyPath: defaultHistoryPath,
    htmlPath: defaultHtmlPath,
    modelPath: defaultModelPath,
    outputPath: defaultOutputPath,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") {
      options.check = true;
      continue;
    }
    const mappings = {
      "--csv": "csvPath",
      "--history": "historyPath",
      "--html": "htmlPath",
      "--model": "modelPath",
      "--output": "outputPath",
    };
    if (mappings[argument]) {
      options[mappings[argument]] = path.resolve(argv[index + 1] ?? "");
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function assertUnit(value, label, errors) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    errors.push(`${label} must be a number between 0 and 1`);
  }
}

export function normalizeDimensionValue(model, dimension, value) {
  if (typeof value === "number") {
    return { confidence: 1, method: "declared", residual: value, source: null };
  }
  if (value.gate) {
    const residual = model.formula.gateResiduals?.[value.gate];
    return {
      ...value,
      method: value.method ?? `gate:${value.gate}`,
      residual,
    };
  }
  if (value.pixel) {
    return {
      ...value,
      method: value.method ?? "pixel",
      residual: pixelResidual(model, value.pixel),
    };
  }
  if (value.anchorDeltas || value.relationResiduals) {
    const scale = Number(value.anchorScale ?? 32);
    const anchorResiduals = (value.anchorDeltas ?? []).map((delta) =>
      clamp(Math.abs(Number(delta)) / scale),
    );
    const relationResiduals = (value.relationResiduals ?? []).map((residual) =>
      clamp(Number(residual)),
    );
    const residuals = [...anchorResiduals, ...relationResiduals];
    const residual = residuals.reduce((sum, entry) => sum + entry, 0) / residuals.length;
    return {
      ...value,
      method:
        value.method ??
        (anchorResiduals.length > 0 && relationResiduals.length > 0
          ? "geometry-anchors-and-relations"
          : relationResiduals.length > 0
            ? "geometry-relations"
            : "geometry-anchors"),
      residual: round(residual),
    };
  }
  return {
    ...value,
    method: value.method ?? "declared",
    source: value.source ?? null,
  };
}

function resolveConfidenceFactor(model, event) {
  if (typeof event.factor === "number") return event.factor;
  if (typeof event.factor === "string") {
    return model.formula?.[event.factor];
  }
  return Number.NaN;
}

export function validateModel(model) {
  const errors = [];
  if (model.version !== 1) errors.push("model.version must be 1");
  if (!model.id) errors.push("model.id is required");
  const clientEntries = Object.entries(model.clients ?? {});
  const dimensionEntries = Object.entries(model.dimensions ?? {});
  if (clientEntries.length === 0) errors.push("model.clients must not be empty");
  if (dimensionEntries.length === 0) errors.push("model.dimensions must not be empty");
  const clientWeight = clientEntries.reduce((sum, [, value]) => sum + value.weight, 0);
  const dimensionWeight = dimensionEntries.reduce((sum, [, value]) => sum + value.weight, 0);
  if (Math.abs(clientWeight - 1) > 1e-9) {
    errors.push(`client weights must sum to 1, received ${clientWeight}`);
  }
  if (Math.abs(dimensionWeight - 1) > 1e-9) {
    errors.push(`dimension weights must sum to 1, received ${dimensionWeight}`);
  }
  for (const [id, value] of [...clientEntries, ...dimensionEntries]) {
    if (!value.label) errors.push(`${id}.label is required`);
    assertUnit(value.weight, `${id}.weight`, errors);
  }
  const gateResiduals = Object.entries(model.formula?.gateResiduals ?? {});
  if (gateResiduals.length === 0) errors.push("formula.gateResiduals must not be empty");
  for (const [id, value] of gateResiduals) {
    assertUnit(value, `formula.gateResiduals.${id}`, errors);
  }
  const pixelFormula = model.formula?.pixelResidual;
  if (
    Math.abs(
      Number(pixelFormula?.maeWeight ?? 0) + Number(pixelFormula?.significantShareWeight ?? 0) - 1,
    ) > 1e-9
  ) {
    errors.push("pixel residual weights must sum to 1");
  }
  for (const key of ["maeScale", "significantShareScale"]) {
    if (!(Number(pixelFormula?.[key]) > 0)) {
      errors.push(`formula.pixelResidual.${key} must be positive`);
    }
  }
  assertUnit(model.formula?.unknownResidual, "formula.unknownResidual", errors);
  const stateIds = new Set();
  for (const state of model.states ?? []) {
    if (!state.id || !state.label || !state.group) {
      errors.push("every state requires id, label, and group");
      continue;
    }
    if (stateIds.has(state.id)) errors.push(`duplicate state ${state.id}`);
    stateIds.add(state.id);
    if (!Number.isFinite(state.weight) || state.weight <= 0) {
      errors.push(`${state.id}.weight must be positive`);
    }
    if (!model.groups?.[state.group]) errors.push(`${state.id}: unknown group ${state.group}`);
    if (!Array.isArray(state.clients) || state.clients.length === 0) {
      errors.push(`${state.id}.clients must not be empty`);
    }
    for (const client of state.clients ?? []) {
      if (!model.clients?.[client]) errors.push(`${state.id}: unknown client ${client}`);
    }
  }
  if (stateIds.size === 0) errors.push("model.states must not be empty");
  let cellCount = 0;
  let totalWeight = 0;
  for (const state of model.states ?? []) {
    for (const client of state.clients ?? []) {
      for (const dimension of dimensionEntries.map(([id]) => id)) {
        cellCount += 1;
        totalWeight +=
          state.weight * model.clients[client].weight * model.dimensions[dimension].weight;
      }
    }
  }
  if (stateIds.size !== model.expectedStateCount) {
    errors.push(
      `state count changed: expected ${model.expectedStateCount}, received ${stateIds.size}`,
    );
  }
  if (cellCount !== model.expectedCellCount) {
    errors.push(`cell count changed: expected ${model.expectedCellCount}, received ${cellCount}`);
  }
  if (Math.abs(totalWeight - model.expectedTotalWeight) > 1e-9) {
    errors.push(
      `total weight changed: expected ${model.expectedTotalWeight}, received ${totalWeight}`,
    );
  }
  return errors;
}

function expandSelection(selection, allValues, label, errors) {
  if (selection === "*" || selection === undefined) return [...allValues];
  if (!Array.isArray(selection) || selection.length === 0) {
    errors.push(`${label} must be "*" or a non-empty array`);
    return [];
  }
  for (const value of selection) {
    if (!allValues.includes(value)) errors.push(`${label}: unknown value ${value}`);
  }
  return selection;
}

export function validateHistory(model, history, options = {}) {
  const errors = [];
  const warnings = [];
  const attributionAllocations = new Set([
    "evidence-session",
    "measured-product-change",
    "measurement-refinement",
    "working-tree-product-change",
  ]);
  if (history.version !== 1) errors.push("history.version must be 1");
  if (history.modelId !== model.id) {
    errors.push(`history.modelId must equal ${model.id}`);
  }
  if (!Number.isFinite(Date.parse(history.updatedAt))) {
    errors.push("history.updatedAt must be an ISO timestamp");
  }
  const backupRoot = history.provenance?.backupRoot;
  const stateIds = model.states.map((state) => state.id);
  const clientIds = Object.keys(model.clients);
  const dimensionIds = Object.keys(model.dimensions);
  const pointIds = new Set();
  const sourceClassifications = new Set(["archive", "backup", "tracked-current"]);
  let previousTimestamp = 0;
  for (const point of history.points ?? []) {
    if (!point.id || !point.observedAt || !point.label) {
      errors.push("every history point requires id, observedAt, and label");
      continue;
    }
    if (pointIds.has(point.id)) errors.push(`duplicate history point ${point.id}`);
    pointIds.add(point.id);
    const timestamp = Date.parse(point.observedAt);
    if (!Number.isFinite(timestamp)) errors.push(`${point.id}: invalid observedAt`);
    if (timestamp < previousTimestamp) errors.push(`${point.id}: history is not chronological`);
    previousTimestamp = timestamp;
    if (
      point.codeState !== undefined &&
      !["commit", "working-tree", "archive"].includes(point.codeState)
    ) {
      errors.push(`${point.id}: invalid codeState ${point.codeState}`);
    }
    if (point.commit) {
      const commit = spawnSync("git", ["cat-file", "-e", `${point.commit}^{commit}`], {
        cwd: repoRoot,
        stdio: "ignore",
      });
      if (commit.status !== 0) errors.push(`${point.id}: commit does not exist ${point.commit}`);
    }
    if (point.codeCommit) {
      const codeCommit = spawnSync("git", ["cat-file", "-e", `${point.codeCommit}^{commit}`], {
        cwd: repoRoot,
        stdio: "ignore",
      });
      if (codeCommit.status !== 0) {
        errors.push(`${point.id}: codeCommit does not exist ${point.codeCommit}`);
      }
    }
    for (const source of point.sources ?? []) {
      if (!source.path || !source.classification) {
        errors.push(`${point.id}: every source requires path and classification`);
        continue;
      }
      if (!sourceClassifications.has(source.classification)) {
        errors.push(`${point.id}: invalid source classification ${source.classification}`);
      }
      const absolutePath = path.resolve(repoRoot, source.path);
      if (source.classification === "tracked-current") {
        if (!existsSync(absolutePath)) {
          errors.push(`${point.id}: missing current source ${source.path}`);
        } else if (source.sha256 && sha256(absolutePath) !== source.sha256) {
          errors.push(`${point.id}: source hash drift ${source.path}`);
        }
      }
      if (source.classification === "backup" && !source.sha256) {
        errors.push(`${point.id}: backup source ${source.path} requires sha256`);
      }
      if (source.classification === "backup" && source.sha256 && backupRoot) {
        const backupPath = path.resolve(backupRoot, source.path);
        if (existsSync(backupPath)) {
          if (sha256(backupPath) !== source.sha256) {
            errors.push(`${point.id}: backup source hash drift ${source.path}`);
          }
        } else {
          warnings.push(`${point.id}: backup source is unavailable at ${backupPath}`);
        }
      }
    }
    for (const screenshot of point.screenshots ?? []) {
      if (
        !screenshot.path ||
        !screenshot.label ||
        !["web", "lynx", "native", "diff", "evidence"].includes(screenshot.client) ||
        !["direct", "representative"].includes(screenshot.relationship)
      ) {
        errors.push(`${point.id}: invalid screenshot entry`);
        continue;
      }
      if (/^https:\/\//u.test(screenshot.path)) {
        if (
          screenshot.hosting?.provider !== "github-pages" ||
          !screenshot.hosting.repository ||
          !/^[a-f0-9]{40}$/u.test(screenshot.hosting.commit ?? "")
        ) {
          errors.push(`${point.id}: remote screenshot requires immutable GitHub hosting metadata`);
        }
      } else {
        const absolutePath = path.resolve(appRoot, screenshot.path);
        if (!existsSync(absolutePath)) {
          errors.push(`${point.id}: missing screenshot ${screenshot.path}`);
        } else if (sha256(absolutePath) !== screenshot.sha256) {
          errors.push(`${point.id}: screenshot hash drift ${screenshot.path}`);
        }
      }
    }
    for (const update of point.updates ?? []) {
      const states = expandSelection(update.states, stateIds, `${point.id}.states`, errors);
      const clients = expandSelection(update.clients, clientIds, `${point.id}.clients`, errors);
      if (!update.dimensions || Object.keys(update.dimensions).length === 0) {
        errors.push(`${point.id}: update.dimensions must not be empty`);
      }
      for (const [dimension, value] of Object.entries(update.dimensions ?? {})) {
        if (!dimensionIds.includes(dimension)) {
          errors.push(`${point.id}: unknown dimension ${dimension}`);
          continue;
        }
        if (value?.anchorDeltas && value.anchorDeltas.length === 0) {
          errors.push(`${point.id}.${dimension}.anchorDeltas must not be empty`);
          continue;
        }
        if (value?.relationResiduals && value.relationResiduals.length === 0) {
          errors.push(`${point.id}.${dimension}.relationResiduals must not be empty`);
          continue;
        }
        if (value?.relationResiduals && dimension !== "geometry") {
          errors.push(`${point.id}.${dimension}.relationResiduals require the geometry dimension`);
          continue;
        }
        if (value?.gate && !Number.isFinite(model.formula.gateResiduals?.[value.gate])) {
          errors.push(`${point.id}.${dimension}: unknown gate ${value.gate}`);
          continue;
        }
        const normalized = normalizeDimensionValue(model, dimension, value);
        assertUnit(normalized.residual, `${point.id}.${dimension}.residual`, errors);
        assertUnit(normalized.confidence, `${point.id}.${dimension}.confidence`, errors);
      }
      for (const stateId of states) {
        const state = model.states.find((entry) => entry.id === stateId);
        for (const client of clients) {
          if (!state?.clients.includes(client)) {
            errors.push(`${point.id}: ${stateId} does not require client ${client}`);
          }
        }
      }
    }
    for (const event of point.confidenceEvents ?? []) {
      assertUnit(
        resolveConfidenceFactor(model, event),
        `${point.id}.confidenceEvent.factor`,
        errors,
      );
      expandSelection(event.states, stateIds, `${point.id}.confidenceEvent.states`, errors);
      expandSelection(event.clients, clientIds, `${point.id}.confidenceEvent.clients`, errors);
      expandSelection(
        event.dimensions,
        dimensionIds,
        `${point.id}.confidenceEvent.dimensions`,
        errors,
      );
      if (!event.reason) errors.push(`${point.id}: confidenceEvent.reason is required`);
    }
    if (point.attribution) {
      if (!attributionAllocations.has(point.attribution.allocation)) {
        errors.push(`${point.id}: invalid attribution allocation`);
      }
      assertUnit(point.attribution.confidence, `${point.id}.attribution.confidence`, errors);
      if (!point.attribution.reason) {
        errors.push(`${point.id}: attribution.reason is required`);
      }
    }
  }
  if ((history.points ?? []).length === 0) errors.push("history.points must not be empty");
  if (
    options.requireCurrentCommit &&
    history.points?.at(-1)?.commit !== options.requireCurrentCommit
  ) {
    warnings.push(
      `latest history commit ${history.points?.at(-1)?.commit ?? "<none>"} does not match ${options.requireCurrentCommit}`,
    );
  }
  return { errors, warnings };
}

function cellKey(stateId, client, dimension) {
  return `${stateId}\u0000${client}\u0000${dimension}`;
}

function cellWeight(model, state, client, dimension) {
  return state.weight * model.clients[client].weight * model.dimensions[dimension].weight;
}

function emptyObservation() {
  return {
    confidence: 0,
    method: "unobserved",
    residual: 1,
    source: null,
  };
}

function computeSnapshot(model, observations) {
  const dimensions = Object.keys(model.dimensions);
  const total = {
    confidenceMass: 0,
    residualMass: 0,
    weight: 0,
  };
  const byDimension = Object.fromEntries(
    dimensions.map((dimension) => [dimension, { confidenceMass: 0, residualMass: 0, weight: 0 }]),
  );
  const byGroup = Object.fromEntries(
    Object.keys(model.groups).map((group) => [
      group,
      { confidenceMass: 0, residualMass: 0, weight: 0 },
    ]),
  );
  const states = [];

  for (const state of model.states) {
    const stateTotal = { confidenceMass: 0, residualMass: 0, weight: 0 };
    for (const client of state.clients) {
      for (const dimension of dimensions) {
        const weight = cellWeight(model, state, client, dimension);
        const observation =
          observations.get(cellKey(state.id, client, dimension)) ?? emptyObservation();
        const confidence = clamp(observation.confidence);
        const residual = clamp(observation.residual);
        total.weight += weight;
        total.confidenceMass += weight * confidence;
        total.residualMass += weight * confidence * residual;
        byDimension[dimension].weight += weight;
        byDimension[dimension].confidenceMass += weight * confidence;
        byDimension[dimension].residualMass += weight * confidence * residual;
        byGroup[state.group].weight += weight;
        byGroup[state.group].confidenceMass += weight * confidence;
        byGroup[state.group].residualMass += weight * confidence * residual;
        stateTotal.weight += weight;
        stateTotal.confidenceMass += weight * confidence;
        stateTotal.residualMass += weight * confidence * residual;
      }
    }
    const evidenceDebt = 1 - stateTotal.confidenceMass / stateTotal.weight;
    states.push({
      confidence: round(stateTotal.confidenceMass / stateTotal.weight),
      evidenceDebt: round(evidenceDebt),
      group: state.group,
      id: state.id,
      label: state.label,
      loss: round(
        (stateTotal.residualMass +
          model.formula.unknownResidual * (stateTotal.weight - stateTotal.confidenceMass)) /
          stateTotal.weight,
      ),
      observedResidual:
        stateTotal.confidenceMass > 0
          ? round(stateTotal.residualMass / stateTotal.confidenceMass)
          : null,
      weight: state.weight,
    });
  }

  const summarize = (value) => {
    const evidenceDebt = 1 - value.confidenceMass / value.weight;
    return {
      confidence: round(value.confidenceMass / value.weight),
      evidenceDebt: round(evidenceDebt),
      loss: round(
        (value.residualMass +
          model.formula.unknownResidual * (value.weight - value.confidenceMass)) /
          value.weight,
      ),
      observedResidual:
        value.confidenceMass > 0 ? round(value.residualMass / value.confidenceMass) : null,
    };
  };
  return {
    ...summarize(total),
    byDimension: Object.fromEntries(
      Object.entries(byDimension).map(([id, value]) => [id, summarize(value)]),
    ),
    byGroup: Object.fromEntries(
      Object.entries(byGroup).map(([id, value]) => [id, summarize(value)]),
    ),
    states: states.sort((left, right) => right.loss - left.loss || left.id.localeCompare(right.id)),
  };
}

const pathSurfaceRules = [
  ["composer", /composer|modelSelection|pendingRequest/iu],
  ["transcript", /transcript|timeline|markdown|message|scroll/iu],
  ["overlays", /modelPicker|commandPalette|quickSwitch|searchOverlay|filePicker/iu],
  ["settings", /settings|sourceControl|connection/iu],
  ["review", /diff|changedFiles|rightPanel|fileTree|checkpoint|editor/iu],
  ["shell", /sidebar|appShell|chatRoute|chatHeader|viewport|theme|keyboard|connector|branding/iu],
];

function surfaceForPath(filePath) {
  for (const [surface, expression] of pathSurfaceRules) {
    if (expression.test(filePath)) return surface;
  }
  if (
    filePath.startsWith("apps/lynxtron/") ||
    filePath.startsWith("apps/web/") ||
    filePath.startsWith("packages/client-runtime/")
  ) {
    return "shell";
  }
  return null;
}

function gitLines(args) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) return [];
  return result.stdout.trim() ? result.stdout.trim().split("\n") : [];
}

function commitsBetween(previousCommit, nextCommit) {
  if (!previousCommit || !nextCommit || previousCommit === nextCommit) return [];
  const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", previousCommit, nextCommit], {
    cwd: repoRoot,
    stdio: "ignore",
  });
  if (ancestor.status !== 0) return [];
  return gitLines([
    "log",
    "--first-parent",
    "--reverse",
    "--format=%H%x09%aI%x09%s",
    `${previousCommit}..${nextCommit}`,
    "--",
    "apps/lynxtron",
    "apps/web",
    "packages/client-runtime",
    "packages/contracts",
    "apps/server",
  ]).map((line) => {
    const [commit, committedAt, ...subject] = line.split("\t");
    const paths = gitLines(["diff-tree", "--no-commit-id", "--name-only", "-r", commit]);
    const surfaces = [...new Set(paths.map(surfaceForPath).filter(Boolean))];
    const lineStats = gitLines(["show", "--format=", "--numstat", commit]);
    let changedLines = 0;
    for (const stat of lineStats) {
      const [added, deleted] = stat.split("\t");
      if (/^\d+$/u.test(added) && /^\d+$/u.test(deleted)) {
        changedLines += Number(added) + Number(deleted);
      }
    }
    return {
      changedLines,
      commit,
      committedAt,
      paths,
      subject: subject.join("\t"),
      surfaces,
    };
  });
}

function allocateCommitAttribution(previous, current) {
  const surfaceDeltas = Object.fromEntries(
    Object.keys(current.byGroup).map((surface) => [
      surface,
      round(current.byGroup[surface].loss - previous.byGroup[surface].loss),
    ]),
  );
  const totalDelta = round(current.loss - previous.loss);
  const commits = commitsBetween(previous.codeCommit, current.codeCommit);
  const confidenceOnlyChange =
    current.observedResidual === previous.observedResidual &&
    current.evidenceDebt > previous.evidenceDebt;
  if (current.attribution) {
    return [
      ...commits.map((commit) => ({
        allocation: "unmeasured-product-commit",
        changedLines: commit.changedLines,
        commit: commit.commit,
        committedAt: commit.committedAt,
        confidence: 0,
        delta: null,
        reason:
          "This interval ends in an explicit evidence measurement; no independent before/after measurement supports assigning its delta to this commit.",
        subject: commit.subject,
        surfaces: commit.surfaces,
      })),
      {
        allocation: current.attribution.allocation,
        changedLines: 0,
        commit: current.codeCommit,
        committedAt: current.observedAt,
        confidence: current.attribution.confidence,
        delta: totalDelta,
        reason: current.attribution.reason,
        subject: current.label,
        surfaces: Object.keys(surfaceDeltas).filter(
          (surface) => Math.abs(surfaceDeltas[surface]) > 1e-9,
        ),
      },
    ];
  }
  if (confidenceOnlyChange) {
    return [
      ...commits.map((commit) => ({
        allocation: "unmeasured-product-commit",
        changedLines: commit.changedLines,
        commit: commit.commit,
        committedAt: commit.committedAt,
        confidence: 0,
        delta: null,
        reason:
          "No independent current-head fidelity measurement follows this commit; do not infer product loss from the later evidence reset.",
        subject: commit.subject,
        surfaces: commit.surfaces,
      })),
      {
        allocation: "evidence-policy",
        changedLines: 0,
        commit: current.codeCommit,
        committedAt: current.observedAt,
        confidence: 1,
        delta: totalDelta,
        reason:
          "Conservative loss rose because stale pre-final5 evidence was demoted. Observed product residual did not change.",
        subject: current.label,
        surfaces: [],
      },
    ];
  }
  if (commits.length === 0) {
    const raised = totalDelta > 0;
    return [
      {
        allocation:
          current.codeState === "working-tree"
            ? raised
              ? "measurement-refinement"
              : "evidence-session"
            : "evidence-session",
        changedLines: 0,
        commit: current.codeCommit,
        committedAt: current.observedAt,
        confidence: current.codeState === "working-tree" ? 0.55 : 0.7,
        delta: totalDelta,
        reason:
          current.codeState === "working-tree"
            ? raised
              ? "A stricter measurement replaced a coarse gate inside an uncommitted evidence session; this is not attributable to a product commit."
              : "Evidence changed inside an uncommitted working-tree session; no per-commit split is defensible."
            : "No product commit lies between these measured checkpoints.",
        subject: current.label,
        surfaces: Object.keys(surfaceDeltas).filter(
          (surface) => Math.abs(surfaceDeltas[surface]) > 1e-9,
        ),
      },
    ];
  }

  const absoluteSurfaceDeltas = Object.fromEntries(
    Object.entries(surfaceDeltas).map(([surface, delta]) => [surface, Math.abs(delta)]),
  );
  const rows = commits.map((commit) => {
    const relevantSurfaces =
      commit.surfaces.length > 0
        ? commit.surfaces
        : Object.keys(surfaceDeltas).filter((surface) => Math.abs(surfaceDeltas[surface]) > 1e-9);
    const surfaceMass = relevantSurfaces.reduce(
      (sum, surface) => sum + (absoluteSurfaceDeltas[surface] ?? 0),
      0,
    );
    return {
      ...commit,
      allocation: "estimated-from-checkpoint-delta",
      confidence: 0.35,
      rawWeight:
        Math.max(1, Math.sqrt(Math.max(1, commit.changedLines))) * Math.max(0.001, surfaceMass),
    };
  });
  const weightTotal = rows.reduce((sum, row) => sum + row.rawWeight, 0);
  let assigned = 0;
  return rows.map((row, index) => {
    const delta =
      index === rows.length - 1
        ? round(totalDelta - assigned)
        : round((totalDelta * row.rawWeight) / weightTotal);
    assigned = round(assigned + delta);
    const direction = delta > 0 ? "raised" : delta < 0 ? "lowered" : "did not move";
    return {
      allocation: row.allocation,
      changedLines: row.changedLines,
      commit: row.commit,
      committedAt: row.committedAt,
      confidence: row.confidence,
      delta,
      reason: `${direction} checkpoint loss through ${row.surfaces.join(", ") || "cross-cutting"} changes; attribution is proportional to touched-surface loss and change size.`,
      subject: row.subject,
      surfaces: row.surfaces,
    };
  });
}

function buildAttribution(points) {
  const rows = [];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const interval = allocateCommitAttribution(previous, current);
    for (const row of interval) {
      rows.push({
        ...row,
        fromPoint: previous.id,
        toPoint: current.id,
      });
    }
  }
  return rows;
}

function buildCommitSeries(model, points, attribution) {
  const alpha = Number(model.formula.commitSmoothingAlpha);
  const series = [
    {
      allocation: "measured-checkpoint",
      commit: points[0].codeCommit,
      committedAt: points[0].observedAt,
      confidence: points[0].confidence,
      delta: null,
      measuredCheckpoint: points[0].id,
      rawLoss: points[0].loss,
      smoothedLoss: points[0].loss,
      subject: points[0].label,
    },
  ];
  let rawLoss = points[0].loss;
  let smoothedLoss = rawLoss;
  for (const row of attribution) {
    if (typeof row.delta === "number") rawLoss = clamp(rawLoss + row.delta);
    smoothedLoss = alpha * rawLoss + (1 - alpha) * smoothedLoss;
    series.push({
      allocation: row.allocation,
      commit: row.commit,
      committedAt: row.committedAt,
      confidence: row.confidence,
      delta: row.delta,
      measuredCheckpoint: null,
      rawLoss: round(rawLoss),
      smoothedLoss: round(smoothedLoss),
      subject: row.subject,
    });
  }
  const checkpointById = new Map(points.map((point) => [point.id, point]));
  for (let index = 0; index < attribution.length; index += 1) {
    const current = attribution[index];
    const next = attribution[index + 1];
    if (next?.toPoint === current.toPoint) continue;
    const point = checkpointById.get(current.toPoint);
    if (!point) continue;
    const target = series[index + 1];
    target.measuredCheckpoint = point.id;
    target.rawLoss = point.loss;
  }
  return series;
}

export function pixelResidual(model, metrics) {
  const formula = model.formula.pixelResidual;
  const mae = clamp(Number(metrics.mae ?? 0) / formula.maeScale);
  const significantShare = clamp(
    Number(metrics.significantShare ?? metrics.changedShare ?? 0) / formula.significantShareScale,
  );
  return round(mae * formula.maeWeight + significantShare * formula.significantShareWeight);
}

export function computeTimeline(model, history) {
  const observations = new Map();
  const stateIds = model.states.map((state) => state.id);
  const clientIds = Object.keys(model.clients);
  const dimensionIds = Object.keys(model.dimensions);
  const points = [];

  for (const point of history.points) {
    for (const event of point.confidenceEvents ?? []) {
      const states = expandSelection(event.states, stateIds, "states", []);
      const clients = expandSelection(event.clients, clientIds, "clients", []);
      const dimensions = expandSelection(event.dimensions, dimensionIds, "dimensions", []);
      for (const stateId of states) {
        for (const client of clients) {
          for (const dimension of dimensions) {
            const key = cellKey(stateId, client, dimension);
            const current = observations.get(key);
            if (!current) continue;
            observations.set(key, {
              ...current,
              confidence: round(current.confidence * resolveConfidenceFactor(model, event)),
              confidenceReason: event.reason,
            });
          }
        }
      }
    }
    for (const update of point.updates ?? []) {
      const states = expandSelection(update.states, stateIds, "states", []);
      const clients = expandSelection(update.clients, clientIds, "clients", []);
      for (const stateId of states) {
        for (const client of clients) {
          for (const [dimension, value] of Object.entries(update.dimensions)) {
            const normalized = normalizeDimensionValue(model, dimension, value);
            observations.set(cellKey(stateId, client, dimension), {
              confidence: normalized.confidence ?? update.confidence ?? 1,
              method: normalized.method ?? update.method ?? "declared",
              residual: normalized.residual,
              source: normalized.source ?? update.source ?? null,
            });
          }
        }
      }
    }
    points.push({
      attribution: point.attribution ?? null,
      commit: point.commit ?? null,
      codeCommit: point.codeCommit ?? point.commit ?? null,
      codeState: point.codeState ?? "commit",
      id: point.id,
      label: point.label,
      narrative: point.narrative ?? "",
      observedAt: point.observedAt,
      screenshots: point.screenshots ?? [],
      sources: point.sources ?? [],
      ...computeSnapshot(model, observations),
    });
  }

  const firstLoss = points[0].loss;
  let bestLoss = 1;
  for (const point of points) {
    bestLoss = Math.min(bestLoss, point.loss);
    point.bestLoss = round(bestLoss);
    point.improvementFromBaseline = round(firstLoss - point.loss);
  }
  const attribution = buildAttribution(points);
  const commitSeries = buildCommitSeries(model, points, attribution);
  return {
    attribution,
    commitSeries,
    generatedAt: history.updatedAt,
    historyId: history.id,
    model: {
      clients: model.clients,
      description: model.description,
      dimensions: model.dimensions,
      formula: model.formula,
      groups: model.groups,
      id: model.id,
      stateCount: model.states.length,
      version: model.version,
    },
    points,
    provenance: history.provenance ?? {},
    schemaVersion: 1,
  };
}

function csvCell(value) {
  const string = String(value ?? "");
  return /[",\n]/u.test(string) ? `"${string.replaceAll('"', '""')}"` : string;
}

function renderCsv(data) {
  const rows = [
    [
      "id",
      "observedAt",
      "commit",
      "codeState",
      "label",
      "loss",
      "bestLoss",
      "observedResidual",
      "evidenceDebt",
      "confidence",
      "improvementFromBaseline",
    ],
    ...data.points.map((point) => [
      point.id,
      point.observedAt,
      point.commit,
      point.codeState,
      point.label,
      point.loss,
      point.bestLoss,
      point.observedResidual,
      point.evidenceDebt,
      point.confidence,
      point.improvementFromBaseline,
    ]),
  ];
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function renderAttributionCsv(data) {
  const rows = [
    [
      "committedAt",
      "commit",
      "allocation",
      "delta",
      "confidence",
      "subject",
      "surfaces",
      "fromPoint",
      "toPoint",
      "reason",
    ],
    ...data.attribution.map((row) => [
      row.committedAt,
      row.commit,
      row.allocation,
      row.delta,
      row.confidence,
      row.subject,
      row.surfaces.join("+"),
      row.fromPoint,
      row.toPoint,
      row.reason,
    ]),
  ];
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function renderHtml(data) {
  const payload = JSON.stringify(data).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>T3 Code Lynxtron · Fidelity Loss</title>
<style>
:root{color-scheme:light;--paper:#f3f5f4;--ink:#101513;--muted:#65706b;--line:#cdd4d0;--soft:#e6eae7;--red:#b93b32;--amber:#a26a12;--green:#176b45;--blue:#315f8b;--white:#fbfcfb}
*{box-sizing:border-box}html{background:var(--paper)}body{margin:0;color:var(--ink);background:linear-gradient(90deg,transparent 0 72px,var(--line) 72px 73px,transparent 73px),var(--paper);font-family:"DM Sans","Avenir Next","Helvetica Neue",sans-serif}
button,select{font:inherit}.page{width:min(1540px,calc(100% - 40px));margin:0 auto;padding:44px 0 80px}.mast{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(280px,.55fr);gap:64px;padding:0 0 34px 96px;border-bottom:1px solid var(--ink)}
.kicker{margin:0 0 14px;font:700 11px/1.2 "JetBrains Mono","SFMono-Regular",monospace;letter-spacing:.16em;text-transform:uppercase;color:var(--green)}h1{max-width:900px;margin:0;font-size:clamp(44px,6vw,92px);font-weight:520;line-height:.91;letter-spacing:-.055em}.lede{max-width:760px;margin:26px 0 0;font-size:17px;line-height:1.55;color:#38423e}
.formula{align-self:end;border-top:4px solid var(--ink);padding-top:14px}.formula code{display:block;font:600 13px/1.65 "JetBrains Mono","SFMono-Regular",monospace}.formula p{margin:12px 0 0;color:var(--muted);font-size:13px;line-height:1.45}
.metrics{display:grid;grid-template-columns:repeat(4,1fr);margin-left:96px;border-bottom:1px solid var(--ink)}.metric{min-height:132px;padding:22px 18px 18px 0;border-right:1px solid var(--line)}.metric:last-child{border-right:0;padding-left:18px}.metric:not(:first-child){padding-left:18px}.metric b{display:block;font-size:clamp(31px,4vw,55px);font-weight:550;letter-spacing:-.04em}.metric span{display:block;margin-top:7px;font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}
.section{margin-left:96px;padding:34px 0;border-bottom:1px solid var(--line)}.section-head{display:flex;align-items:end;justify-content:space-between;gap:24px;margin-bottom:20px}.section h2{margin:0;font-size:26px;font-weight:580;letter-spacing:-.025em}.section-note{max-width:600px;margin:0;color:var(--muted);font-size:13px;line-height:1.45;text-align:right}
.chart-shell{position:relative;background:var(--white);border:1px solid var(--ink)}#lossChart{display:block;width:100%;height:auto;min-height:430px}.legend{display:flex;gap:18px;flex-wrap:wrap;padding:12px 16px;border-top:1px solid var(--line);font:600 11px/1.4 "JetBrains Mono","SFMono-Regular",monospace;text-transform:uppercase}.legend button{display:inline-flex;align-items:center;gap:7px;border:0;background:none;padding:0;color:var(--ink);cursor:pointer}.legend i{width:18px;height:3px;background:var(--series)}
.tooltip{position:absolute;display:none;z-index:2;min-width:250px;max-width:340px;padding:13px 14px;background:var(--ink);color:var(--white);pointer-events:none;box-shadow:8px 8px 0 #aeb8b2}.tooltip strong{display:block;font-size:14px}.tooltip small{display:block;margin-top:5px;color:#bdc6c1;line-height:1.45}.tooltip-grid{display:grid;grid-template-columns:1fr auto;gap:4px 16px;margin-top:10px;font:12px/1.4 "JetBrains Mono","SFMono-Regular",monospace}
.split{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(340px,.85fr);gap:28px}.bars{display:grid;gap:12px}.bar-row{display:grid;grid-template-columns:190px 1fr 56px;align-items:center;gap:12px;font-size:12px}.bar-track{height:11px;background:var(--soft);position:relative}.bar-fill{height:100%;background:var(--red)}.bar-row output{font:600 11px/1 "JetBrains Mono","SFMono-Regular",monospace;text-align:right}
.timeline{border-left:1px solid var(--ink);padding-left:24px}.event{position:relative;padding:0 0 24px 18px}.event::before{content:"";position:absolute;left:-30px;top:4px;width:10px;height:10px;border:2px solid var(--paper);background:var(--event-color,var(--ink));outline:1px solid var(--ink)}.event time{font:600 10px/1.2 "JetBrains Mono","SFMono-Regular",monospace;color:var(--muted)}.event h3{margin:4px 0;font-size:15px}.event p{margin:0;color:#4c5752;font-size:12px;line-height:1.5}.event code{font-size:10px}
.review{display:grid;grid-template-columns:minmax(280px,.62fr) minmax(0,1.38fr);gap:26px}.checkpoint-list{display:grid;align-content:start;border-top:1px solid var(--ink)}.checkpoint{display:grid;grid-template-columns:78px 1fr auto;gap:10px;padding:12px 0;border:0;border-bottom:1px solid var(--line);background:transparent;text-align:left;cursor:pointer}.checkpoint[aria-current="true"]{background:var(--ink);color:var(--white);padding-left:10px;padding-right:10px}.checkpoint time{font:600 10px/1.2 "JetBrains Mono","SFMono-Regular",monospace}.checkpoint strong{font-size:13px}.checkpoint output{font:700 11px/1 "JetBrains Mono","SFMono-Regular",monospace}.review-stage{min-width:0}.review-head{display:flex;justify-content:space-between;gap:20px;align-items:start;border-bottom:1px solid var(--ink);padding-bottom:12px}.review-head h3{margin:0;font-size:22px}.review-head p{margin:6px 0 0;color:var(--muted);font-size:12px;line-height:1.45}.review-score{font:700 22px/1 "JetBrains Mono","SFMono-Regular",monospace;color:var(--red)}.screens{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:14px}.screen{margin:0;border:1px solid var(--line);background:#111}.screen figcaption{display:flex;justify-content:space-between;gap:8px;padding:8px 9px;background:var(--white);font-size:10px}.screen img{display:block;width:100%;aspect-ratio:1280/820;object-fit:cover;object-position:top}.screen--empty{display:grid;place-items:center;min-height:220px;background:repeating-linear-gradient(135deg,var(--soft),var(--soft) 8px,var(--paper) 8px,var(--paper) 16px);color:var(--muted);font:600 11px/1.5 "JetBrains Mono","SFMono-Regular",monospace;text-align:center;padding:30px}.calc{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);margin-top:12px;border:1px solid var(--line)}.calc div{background:var(--white);padding:10px}.calc span{display:block;color:var(--muted);font-size:10px;text-transform:uppercase}.calc b{display:block;margin-top:4px;font:700 14px/1 "JetBrains Mono","SFMono-Regular",monospace}
.attribution-controls{display:flex;gap:12px;flex-wrap:wrap;align-items:center}.attribution-controls label{font:600 10px/1 "JetBrains Mono","SFMono-Regular",monospace;text-transform:uppercase}.attribution-controls select{margin-left:6px;border:1px solid var(--ink);border-radius:0;background:var(--white);padding:6px 28px 6px 8px}.attribution-summary{color:var(--muted);font-size:11px}.delta-up{color:var(--red)}.delta-down{color:var(--green)}.delta-none{color:var(--muted)}.allocation{font:600 9px/1 "JetBrains Mono","SFMono-Regular",monospace;text-transform:uppercase}.commit-subject{max-width:520px;white-space:normal;line-height:1.35}.confidence{display:inline-block;width:44px;height:6px;background:var(--soft);vertical-align:middle}.confidence i{display:block;height:100%;background:var(--blue)}
.commit-chart-shell{border:1px solid var(--ink);background:var(--white);margin-bottom:18px}.commit-chart-shell svg{display:block;width:100%;height:auto}.commit-chart-legend{display:flex;gap:18px;padding:10px 14px;border-top:1px solid var(--line);font:600 10px/1 "JetBrains Mono","SFMono-Regular",monospace;text-transform:uppercase}.commit-chart-legend span{display:inline-flex;align-items:center;gap:7px}.commit-chart-legend i{width:18px;height:3px;background:var(--color)}
.table-wrap{overflow:auto;border:1px solid var(--ink);background:var(--white)}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:10px 12px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}th{position:sticky;top:0;background:var(--ink);color:var(--white);font:600 10px/1.2 "JetBrains Mono","SFMono-Regular",monospace;text-transform:uppercase;letter-spacing:.06em}td.num{font:600 11px/1 "JetBrains Mono","SFMono-Regular",monospace;text-align:right}.status-dot{display:inline-block;width:8px;height:8px;margin-right:7px;background:var(--dot)}
.controls{display:flex;gap:10px;align-items:center}.controls label{font:600 10px/1 "JetBrains Mono","SFMono-Regular",monospace;text-transform:uppercase}.controls select{margin-left:7px;border:1px solid var(--ink);background:var(--white);padding:7px 28px 7px 8px;border-radius:0}
.foot{margin:28px 0 0 96px;display:grid;grid-template-columns:1fr 1fr;gap:40px;color:var(--muted);font-size:12px;line-height:1.55}.foot code{color:var(--ink)}
@media(max-width:900px){body{background:var(--paper)}.page{width:min(100% - 24px,760px);padding-top:24px}.mast,.metrics,.section,.foot{margin-left:0;padding-left:0}.mast{grid-template-columns:1fr;gap:28px}.metrics{grid-template-columns:1fr 1fr}.split,.review{grid-template-columns:1fr}.screens{grid-template-columns:1fr}.section-head{align-items:start;flex-direction:column}.section-note{text-align:left}.bar-row{grid-template-columns:130px 1fr 48px}.foot{grid-template-columns:1fr}.metric:nth-child(2){border-right:0}.metric:nth-child(3){padding-left:0}.metric:last-child{padding-left:18px}}
</style>
</head>
<body>
<main class="page">
  <header class="mast">
    <div>
      <p class="kicker">T3 Code · Lynxtron fidelity accounting</p>
      <h1>Loss falls only when evidence earns it.</h1>
      <p class="lede">A fixed ${data.model.stateCount}-state denominator reconstructs the port from archived geometry, strict gates, pixel metrics, runtime logs, and Git anchors. Missing or stale evidence remains visible as debt instead of disappearing from the score.</p>
    </div>
    <aside class="formula">
      <code>L = Σ w · [c·r + (1−c)·1] / Σ w</code>
      <code>w = state × client × dimension</code>
      <p><b>r</b> is measured residual, <b>c</b> is evidence confidence. Unknown cells carry maximum loss. Product residual and evidence debt are reported separately.</p>
    </aside>
  </header>
  <section class="metrics" id="metrics"></section>
  <section class="section">
    <div class="section-head">
      <div><p class="kicker">Historical reconstruction</p><h2>Conservative loss over evidence milestones</h2></div>
      <p class="section-note">The line moves only at a dated evidence milestone. Commits without measurements remain annotations, not invented interpolation.</p>
    </div>
    <div class="chart-shell">
      <svg id="lossChart" viewBox="0 0 1200 470" role="img" aria-label="Fidelity loss timeline"></svg>
      <div class="tooltip" id="tooltip"></div>
      <div class="legend" id="legend"></div>
    </div>
  </section>
  <section class="section">
    <div class="section-head">
      <div><p class="kicker">Loss ↔ pixels</p><h2>Checkpoint comparison review</h2></div>
      <p class="section-note">Select a measured checkpoint to inspect the exact screenshots behind it. Empty slots mean the checkpoint is metrics-only; no image is invented.</p>
    </div>
    <div class="review">
      <div class="checkpoint-list" id="checkpointList"></div>
      <div class="review-stage" id="reviewStage"></div>
    </div>
  </section>
  <section class="section">
    <div class="section-head">
      <div><p class="kicker">Commit observability</p><h2>Estimated contribution between measured checkpoints</h2></div>
      <div class="attribution-controls">
        <label>Day<select id="dayFilter"><option value="all">All</option></select></label>
        <label>Direction<select id="directionFilter"><option value="all">All</option><option value="down">Lowered loss</option><option value="up">Raised loss</option><option value="unmeasured">Unmeasured</option></select></label>
        <span class="attribution-summary" id="attributionSummary"></span>
      </div>
    </div>
    <div class="commit-chart-shell"><svg id="commitChart" viewBox="0 0 1200 360" role="img" aria-label="Commit-level raw and smoothed fidelity loss"></svg><div class="commit-chart-legend"><span style="--color:#8d9892"><i></i>Raw attributed loss</span><span style="--color:#315f8b"><i></i>EMA α=${data.model.formula.commitSmoothingAlpha}</span><span style="--color:#b93b32"><i></i>Measured checkpoint</span></div></div>
    <div class="table-wrap"><table><thead><tr><th>Day / revision</th><th>Contribution</th><th>Confidence</th><th>Cause</th><th>Surface</th><th>Allocation</th></tr></thead><tbody id="attributionRows"></tbody></table></div>
  </section>
  <section class="section split">
    <div>
      <div class="section-head"><div><p class="kicker">Current pressure</p><h2>Loss by product surface</h2></div></div>
      <div class="bars" id="groupBars"></div>
    </div>
    <div>
      <div class="section-head"><div><p class="kicker">What changed</p><h2>Evidence ledger</h2></div></div>
      <div class="timeline" id="timeline"></div>
    </div>
  </section>
  <section class="section">
    <div class="section-head">
      <div><p class="kicker">Fixed denominator</p><h2>${data.model.stateCount}-state loss register</h2></div>
      <div class="controls"><label>Group<select id="groupFilter"><option value="all">All</option></select></label></div>
    </div>
    <div class="table-wrap"><table><thead><tr><th>State</th><th>Group</th><th>Weight</th><th>Loss</th><th>Observed residual</th><th>Evidence debt</th></tr></thead><tbody id="stateRows"></tbody></table></div>
  </section>
  <footer class="foot">
    <p>Generated from <code>fidelity-loss-model.json</code> and <code>fidelity-loss-history.json</code>. The JSON and CSV beside this page are the machine-readable outputs.</p>
    <p>Browser evidence never substitutes for Native input, list, window, or persistence claims. The archaeology reset deliberately raises evidence debt without claiming a product regression.</p>
  </footer>
</main>
<script>
const data=${payload};
const points=data.points;
const latest=points.at(-1);
const first=points[0];
const best=points.reduce((a,b)=>a.loss<b.loss?a:b);
let selectedPoint=7;
const pct=(v)=>\`\${(v*100).toFixed(1)}%\`;
const esc=(v)=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
document.querySelector("#metrics").innerHTML=[
  [pct(latest.loss),"Current conservative loss"],
  [pct(best.loss),"Historical best"],
  [pct(latest.observedResidual??1),"Observed product residual"],
  [pct(latest.evidenceDebt),"Current evidence debt"],
].map(([value,label])=>\`<div class="metric"><b>\${value}</b><span>\${label}</span></div>\`).join("");

const series=[
  {id:"loss",label:"Conservative loss",color:"#b93b32",width:4},
  {id:"bestLoss",label:"Historical best",color:"#315f8b",width:2},
  {id:"observedResidual",label:"Observed residual",color:"#176b45",width:2},
  {id:"evidenceDebt",label:"Evidence debt",color:"#a26a12",width:2},
];
const enabled=new Set(series.map(s=>s.id));
const svg=document.querySelector("#lossChart");
const tooltip=document.querySelector("#tooltip");
const width=1200,height=470,pad={l:74,r:34,t:36,b:78};
const x=(index)=>pad.l+(index/Math.max(1,points.length-1))*(width-pad.l-pad.r);
const y=(value)=>pad.t+(1-value)*(height-pad.t-pad.b);
function pathFor(id){return points.map((p,i)=>\`\${i?"L":"M"}\${x(i).toFixed(1)},\${y(p[id]??1).toFixed(1)}\`).join(" ")}
function renderChart(){
  const grid=[0,0.25,0.5,0.75,1].map(v=>\`<g><line x1="\${pad.l}" y1="\${y(v)}" x2="\${width-pad.r}" y2="\${y(v)}" stroke="#d7ddda"/><text x="\${pad.l-12}" y="\${y(v)+4}" text-anchor="end" font-size="11" fill="#65706b">\${Math.round(v*100)}</text></g>\`).join("");
  const lines=series.filter(s=>enabled.has(s.id)).map(s=>\`<path d="\${pathFor(s.id)}" fill="none" stroke="\${s.color}" stroke-width="\${s.width}" vector-effect="non-scaling-stroke"/>\`).join("");
  const dots=points.map((p,i)=>\`<g class="point" data-index="\${i}" tabindex="0" role="button" aria-label="\${esc(p.label)} loss \${pct(p.loss)}"><line x1="\${x(i)}" y1="\${pad.t}" x2="\${x(i)}" y2="\${height-pad.b}" stroke="transparent" stroke-width="24"/><circle cx="\${x(i)}" cy="\${y(p.loss)}" r="5" fill="#fbfcfb" stroke="#101513" stroke-width="2"/><text x="\${x(i)}" y="\${height-pad.b+22}" transform="rotate(-38 \${x(i)} \${height-pad.b+22})" text-anchor="end" font-size="10" fill="#65706b">\${esc(p.observedAt.slice(5,10))}</text></g>\`).join("");
  svg.innerHTML=\`<rect width="\${width}" height="\${height}" fill="#fbfcfb"/>\${grid}<text x="18" y="24" font-size="10" font-family="monospace" fill="#65706b">LOSS × 100</text>\${lines}\${dots}\`;
  for(const node of svg.querySelectorAll(".point")){
    const show=(event)=>{const p=points[Number(node.dataset.index)];const revision=p.commit?.slice(0,10)??"evidence-only";const state=p.codeState==="working-tree"?revision+" + WIP":revision;tooltip.innerHTML=\`<strong>\${esc(p.label)}</strong><small>\${esc(p.observedAt)} · \${esc(state)}</small><div class="tooltip-grid"><span>Loss</span><b>\${pct(p.loss)}</b><span>Observed</span><b>\${pct(p.observedResidual??1)}</b><span>Debt</span><b>\${pct(p.evidenceDebt)}</b><span>Coverage</span><b>\${pct(p.confidence)}</b></div><small>\${esc(p.narrative)}</small>\`;tooltip.style.display="block";const rect=document.querySelector(".chart-shell").getBoundingClientRect();tooltip.style.left=\`\${Math.min(rect.width-350,Math.max(8,(event.clientX??rect.left+x(Number(node.dataset.index)))-rect.left+12))}px\`;tooltip.style.top=\`\${Math.max(8,(event.clientY??rect.top+y(p.loss))-rect.top-36)}px\`;};node.addEventListener("pointerenter",show);node.addEventListener("focus",show);node.addEventListener("pointerleave",()=>tooltip.style.display="none");node.addEventListener("blur",()=>tooltip.style.display="none");
  }
}
const legend=document.querySelector("#legend");
legend.innerHTML=series.map(s=>\`<button data-series="\${s.id}" style="--series:\${s.color}"><i></i>\${s.label}</button>\`).join("");
legend.addEventListener("click",event=>{const button=event.target.closest("button");if(!button)return;const id=button.dataset.series;enabled.has(id)?enabled.delete(id):enabled.add(id);button.style.opacity=enabled.has(id)?"1":".35";renderChart()});
renderChart();

document.querySelector("#groupBars").innerHTML=Object.entries(latest.byGroup).sort((a,b)=>b[1].loss-a[1].loss).map(([id,value])=>\`<div class="bar-row"><span>\${esc(data.model.groups[id])}</span><div class="bar-track"><div class="bar-fill" style="width:\${value.loss*100}%"></div></div><output>\${pct(value.loss)}</output></div>\`).join("");
document.querySelector("#timeline").innerHTML=points.map((p,i)=>\`<article class="event" style="--event-color:\${i===points.length-1?"#b93b32":p.loss===p.bestLoss?"#176b45":"#101513"}"><time>\${esc(p.observedAt)} · \${esc(p.commit?.slice(0,10)??"evidence")}\${p.codeState==="working-tree"?" + WIP":""}</time><h3>\${esc(p.label)}</h3><p>\${esc(p.narrative)}</p></article>\`).join("");
const filter=document.querySelector("#groupFilter");
for(const [id,label] of Object.entries(data.model.groups))filter.insertAdjacentHTML("beforeend",\`<option value="\${id}">\${esc(label)}</option>\`);
function renderStates(){const group=filter.value;document.querySelector("#stateRows").innerHTML=latest.states.filter(s=>group==="all"||s.group===group).map(s=>\`<tr><td><span class="status-dot" style="--dot:\${s.loss>.75?"#b93b32":s.loss>.45?"#a26a12":"#176b45"}"></span>\${esc(s.label)}</td><td>\${esc(data.model.groups[s.group])}</td><td class="num">\${s.weight}</td><td class="num">\${pct(s.loss)}</td><td class="num">\${s.observedResidual==null?"—":pct(s.observedResidual)}</td><td class="num">\${pct(s.evidenceDebt)}</td></tr>\`).join("")}
filter.addEventListener("change",renderStates);renderStates();

const checkpointList=document.querySelector("#checkpointList");
const reviewStage=document.querySelector("#reviewStage");
function renderReview(){
  checkpointList.innerHTML=points.map((point,index)=>\`<button class="checkpoint" data-index="\${index}" aria-current="\${index===selectedPoint}"><time>\${esc(point.observedAt.slice(5,10))}</time><strong>\${esc(point.label)}</strong><output>\${pct(point.loss)}</output></button>\`).join("");
  const point=points[selectedPoint];
  const frames=point.screenshots.length?point.screenshots.map(screen=>\`<figure class="screen"><figcaption><b>\${esc(screen.label)}</b><span>\${esc(screen.relationship)}</span></figcaption><img src="\${esc(screen.path.startsWith("https://")?screen.path:screen.path.replace("reports/fidelity-loss/",""))}" alt="\${esc(point.label+" · "+screen.label)}" loading="lazy"></figure>\`).join(""):\`<div class="screen--empty">Metrics-only checkpoint<br>No retained screenshot is attached.</div>\`;
  reviewStage.innerHTML=\`<div class="review-head"><div><h3>\${esc(point.label)}</h3><p>\${esc(point.observedAt)} · \${esc(point.commit?.slice(0,10)??"evidence")}\${point.codeState==="working-tree"?" + WIP":""}<br>\${esc(point.narrative)}</p></div><div class="review-score">\${pct(point.loss)}</div></div><div class="screens">\${frames}</div><div class="calc"><div><span>Observed</span><b>\${pct(point.observedResidual??1)}</b></div><div><span>Evidence debt</span><b>\${pct(point.evidenceDebt)}</b></div><div><span>Coverage</span><b>\${pct(point.confidence)}</b></div><div><span>Historical best</span><b>\${pct(point.bestLoss)}</b></div></div>\`;
}
checkpointList.addEventListener("click",event=>{const button=event.target.closest(".checkpoint");if(!button)return;selectedPoint=Number(button.dataset.index);renderReview()});renderReview();

const dayFilter=document.querySelector("#dayFilter");
const directionFilter=document.querySelector("#directionFilter");
const commitChart=document.querySelector("#commitChart");
function renderCommitChart(){
  const rows=data.commitSeries,width=1200,height=360,pad={l:70,r:28,t:26,b:48};
  const x=index=>pad.l+(index/Math.max(1,rows.length-1))*(width-pad.l-pad.r);
  const y=value=>pad.t+(1-value)*(height-pad.t-pad.b);
  const grid=[0,.25,.5,.75,1].map(value=>\`<g><line x1="\${pad.l}" y1="\${y(value)}" x2="\${width-pad.r}" y2="\${y(value)}" stroke="#d7ddda"/><text x="\${pad.l-10}" y="\${y(value)+4}" text-anchor="end" font-size="10" fill="#65706b">\${Math.round(value*100)}</text></g>\`).join("");
  const raw=rows.map((row,index)=>\`\${index?"L":"M"}\${x(index).toFixed(1)},\${y(row.rawLoss).toFixed(1)}\`).join(" ");
  const smooth=rows.map((row,index)=>\`\${index?"L":"M"}\${x(index).toFixed(1)},\${y(row.smoothedLoss).toFixed(1)}\`).join(" ");
  const checkpoints=rows.map((row,index)=>row.measuredCheckpoint?\`<circle cx="\${x(index)}" cy="\${y(row.rawLoss)}" r="4.5" fill="#fbfcfb" stroke="#b93b32" stroke-width="2"><title>\${esc(row.measuredCheckpoint)} · \${pct(row.rawLoss)}</title></circle>\`:"").join("");
  const dayTicks=[];let previousDay="";
  rows.forEach((row,index)=>{const day=row.committedAt.slice(5,10);if(day!==previousDay){dayTicks.push(\`<text x="\${x(index)}" y="\${height-18}" font-size="9" fill="#65706b" transform="rotate(-35 \${x(index)} \${height-18})" text-anchor="end">\${day}</text>\`);previousDay=day}});
  commitChart.innerHTML=\`<rect width="\${width}" height="\${height}" fill="#fbfcfb"/>\${grid}<path d="\${raw}" fill="none" stroke="#8d9892" stroke-width="1.2"/><path d="\${smooth}" fill="none" stroke="#315f8b" stroke-width="3"/>\${checkpoints}\${dayTicks.join("")}\`;
}
renderCommitChart();
for(const day of [...new Set(data.attribution.map(row=>row.committedAt.slice(0,10)))])dayFilter.insertAdjacentHTML("beforeend",\`<option value="\${day}">\${day}</option>\`);
function renderAttribution(){
  const day=dayFilter.value,direction=directionFilter.value;
  const rows=data.attribution.filter(row=>(day==="all"||row.committedAt.startsWith(day))&&(direction==="all"||(direction==="down"&&row.delta<0)||(direction==="up"&&row.delta>0)||(direction==="unmeasured"&&row.delta==null)));
  const measured=rows.filter(row=>typeof row.delta==="number");
  const total=measured.reduce((sum,row)=>sum+row.delta,0);
  attributionSummary.textContent=\`\${rows.length} rows · \${measured.length} attributed · net \${total>=0?"+":""}\${(total*100).toFixed(2)} pts\`;
  attributionRows.innerHTML=rows.map(row=>{const delta=row.delta==null?"unmeasured":\`\${row.delta>0?"+":""}\${(row.delta*100).toFixed(3)} pts\`;const tone=row.delta==null?"delta-none":row.delta>0?"delta-up":"delta-down";return \`<tr><td><code>\${esc(row.committedAt.slice(0,10))}</code><br><code>\${esc(row.commit?.slice(0,10)??"session")}</code></td><td class="num \${tone}">\${delta}</td><td><span class="confidence"><i style="width:\${row.confidence*100}%"></i></span> \${(row.confidence*100).toFixed(0)}%</td><td class="commit-subject"><b>\${esc(row.subject)}</b><br><small>\${esc(row.reason)}</small></td><td>\${esc(row.surfaces.join(", ")||"—")}</td><td><span class="allocation">\${esc(row.allocation)}</span></td></tr>\`}).join("");
}
dayFilter.addEventListener("change",renderAttribution);directionFilter.addEventListener("change",renderAttribution);renderAttribution();
</script>
</body>
</html>
`;
}

function writeOrCheck(filePath, content, check) {
  if (check) {
    if (!existsSync(filePath)) throw new Error(`Missing generated output ${filePath}`);
    const existing = readFileSync(filePath, "utf8");
    if (existing !== content) throw new Error(`Generated output is stale: ${filePath}`);
    return;
  }
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
}

export function buildArtifacts(model, history) {
  const timeline = computeTimeline(model, history);
  return {
    attributionCsv: renderAttributionCsv(timeline),
    csv: renderCsv(timeline),
    html: renderHtml(timeline),
    json: `${JSON.stringify(timeline, null, 2)}\n`,
    timeline,
  };
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const model = readJson(options.modelPath);
  const history = readJson(options.historyPath);
  const modelErrors = validateModel(model);
  const validation = validateHistory(model, history);
  const errors = [...modelErrors, ...validation.errors];
  if (errors.length > 0) {
    for (const error of errors) console.error(`error: ${error}`);
    process.exit(1);
  }
  for (const warning of validation.warnings) console.warn(`warning: ${warning}`);
  const artifacts = buildArtifacts(model, history);
  writeOrCheck(options.outputPath, artifacts.json, options.check);
  writeOrCheck(options.csvPath, artifacts.csv, options.check);
  writeOrCheck(
    path.join(path.dirname(options.csvPath), "commit-attribution.csv"),
    artifacts.attributionCsv,
    options.check,
  );
  writeOrCheck(options.htmlPath, artifacts.html, options.check);
  const latest = artifacts.timeline.points.at(-1);
  console.log(
    `${options.check ? "checked" : "wrote"} fidelity loss: ` +
      `${artifacts.timeline.points.length} milestones, ` +
      `${model.states.length} states, current=${round(latest.loss * 100, 2)}, ` +
      `best=${round(latest.bestLoss * 100, 2)}, debt=${round(latest.evidenceDebt * 100, 2)}`,
  );
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main();
}
