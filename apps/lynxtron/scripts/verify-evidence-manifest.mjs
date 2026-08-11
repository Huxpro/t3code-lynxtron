#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  collectGitArtifactProvenance,
  summarizeArtifactProvenance,
} from "./evidence-provenance.mjs";

const CLIENTS = ["web", "lynx", "native"];
const EVIDENCE_STATUSES = new Set([
  "retained",
  "blocked",
  "diagnostic",
  "pending",
  "not-applicable",
]);
const VERDICTS = new Set([
  "incomplete",
  "invalid-harness",
  "capture-valid",
  "visual-gap",
  "interaction-gap",
  "intentional-delta",
  "visual-certified",
  "native-certified",
]);
const HARNESS_GATES = new Set(["invalid-harness", "capture-valid"]);
const RESULT_GATES = new Set(["unassessed", "gap", "pass", "intentional-delta", "not-required"]);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, "../../..");
const defaultManifest = path.resolve(scriptDirectory, "../evidence/manifests/main-shell.json");

function parseArguments(argv) {
  const options = {
    allowIncomplete: false,
    json: false,
    manifestPath: defaultManifest,
    requireArchivedEvidence: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--allow-incomplete") {
      options.allowIncomplete = true;
      continue;
    }
    if (argument === "--json") {
      options.json = true;
      continue;
    }
    if (argument === "--require-archived-evidence") {
      options.requireArchivedEvidence = true;
      continue;
    }
    if (argument === "--manifest") {
      options.manifestPath = path.resolve(argv[index + 1] ?? "");
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function pngDimensions(filePath) {
  const bytes = readFileSync(filePath);
  if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("not a valid PNG");
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function resolveArtifact(manifestPath, artifactPath) {
  return path.resolve(path.dirname(manifestPath), artifactPath);
}

function resolvedState(manifest, state) {
  return {
    ...manifest.defaults,
    ...state.state,
    viewport: {
      ...manifest.defaults.viewport,
      ...(state.state?.viewport ?? {}),
    },
  };
}

function expectedDimensions(client, state) {
  const viewport = state.viewport;
  if (client === "native") {
    return {
      width: viewport.nativePixelWidth ?? viewport.width,
      height: viewport.nativePixelHeight ?? viewport.height,
    };
  }
  return {
    width: Math.round(viewport.width * viewport.devicePixelRatio),
    height: Math.round(viewport.height * viewport.devicePixelRatio),
  };
}

function validateGateShape(errors, prefix, gates) {
  if (!gates || typeof gates !== "object") {
    errors.push(`${prefix}.gates is required for retained evidence`);
    return;
  }
  if (!HARNESS_GATES.has(gates.harness)) {
    errors.push(`${prefix}.gates.harness is invalid`);
  }
  for (const key of ["content", "visual", "interaction", "sourceReuse"]) {
    if (!RESULT_GATES.has(gates[key])) {
      errors.push(`${prefix}.gates.${key} is invalid`);
    }
  }
}

function gatePasses(value) {
  return value === "pass" || value === "intentional-delta" || value === "not-required";
}

function validateVerdict(errors, state, requiredEvidence) {
  const retained = requiredEvidence.every((entry) => entry?.status === "retained");
  const satisfied = requiredEvidence.every(
    (entry) => entry?.status === "retained" || entry?.status === "blocked",
  );
  const hasBlocked = requiredEvidence.some((entry) => entry?.status === "blocked");
  const validHarness = requiredEvidence.every((entry) => entry?.gates?.harness === "capture-valid");
  const visualPass = requiredEvidence.every(
    (entry) =>
      gatePasses(entry?.gates?.content) &&
      gatePasses(entry?.gates?.visual) &&
      gatePasses(entry?.gates?.sourceReuse),
  );
  const interactionPass = requiredEvidence.every((entry) => gatePasses(entry?.gates?.interaction));
  if (state.verdict === "visual-certified") {
    if (!retained || !validHarness || !visualPass || !interactionPass) {
      errors.push(
        `${state.id}: visual-certified requires retained required evidence and passing independent gates`,
      );
    }
  }
  if (state.verdict === "native-certified") {
    const native = state.evidence.native;
    if (
      !state.requiredClients.includes("native") ||
      native?.status !== "retained" ||
      native?.gates?.harness !== "capture-valid" ||
      !gatePasses(native?.gates?.visual) ||
      !gatePasses(native?.gates?.interaction)
    ) {
      errors.push(`${state.id}: native-certified requires retained passing Native evidence`);
    }
  }
  if (state.verdict === "intentional-delta" && (!satisfied || !hasBlocked)) {
    errors.push(
      `${state.id}: intentional-delta requires every required cell satisfied and at least one blocked cell`,
    );
  }
  if (state.verdict === "capture-valid" && visualPass) {
    errors.push(`${state.id}: capture-valid cannot conceal already-passing visual gates`);
  }
}

export function validateEvidenceManifest(manifest, manifestPath, options = {}) {
  const errors = [];
  const incomplete = [];
  const warnings = [];
  const ids = new Set();
  const retainedPaths = new Map();
  const retainedHashes = new Map();
  const retainedArtifactPaths = Array.isArray(manifest.states)
    ? manifest.states.flatMap((state) =>
        Object.values(state.evidence ?? {})
          .filter((evidence) => evidence?.status === "retained" && evidence.path)
          .map((evidence) => resolveArtifact(manifestPath, evidence.path)),
      )
    : [];
  const artifactProvenance =
    options.artifactProvenance ??
    collectGitArtifactProvenance({
      repoRoot: options.repoRoot ?? repoRoot,
      artifactPaths: retainedArtifactPaths,
    });
  const provenanceSummary = summarizeArtifactProvenance(artifactProvenance);
  const requiredDefaultKeys = [
    "route",
    "theme",
    "viewport",
    "density",
    "snapshotSha256",
    "selectedProject",
    "selectedThread",
    "selectedModel",
  ];

  if (manifest.version !== 1) errors.push("manifest.version must be 1");
  if (!manifest.id || !manifest.label) errors.push("manifest.id and manifest.label are required");
  if (!Array.isArray(manifest.states) || manifest.states.length === 0) {
    errors.push("manifest.states must be a non-empty array");
    return { errors, incomplete, warnings, provenanceSummary };
  }
  for (const key of requiredDefaultKeys) {
    if (!(key in (manifest.defaults ?? {}))) {
      errors.push(`manifest.defaults.${key} is required`);
    }
  }
  const viewport = manifest.defaults?.viewport;
  for (const key of ["width", "height", "devicePixelRatio"]) {
    if (!(Number(viewport?.[key]) > 0)) {
      errors.push(`manifest.defaults.viewport.${key} must be positive`);
    }
  }

  for (const state of manifest.states) {
    const prefix = state.id || "<missing-state-id>";
    if (!state.id || !state.label) {
      errors.push("Every state requires id and label");
      continue;
    }
    if (ids.has(state.id)) errors.push(`${prefix}: duplicate state id`);
    ids.add(state.id);
    if (!VERDICTS.has(state.verdict)) errors.push(`${prefix}: invalid verdict`);
    if (!Array.isArray(state.requiredClients)) {
      errors.push(`${prefix}: requiredClients must be an array`);
      continue;
    }
    const required = new Set(state.requiredClients);
    const optional = new Set(state.optionalClients ?? []);
    for (const client of [...required, ...optional]) {
      if (!CLIENTS.includes(client)) errors.push(`${prefix}: unknown client ${client}`);
    }
    const stateValue = resolvedState(manifest, state);
    const requiredEvidence = [];

    for (const client of CLIENTS) {
      const evidence = state.evidence?.[client];
      const evidencePrefix = `${prefix}.${client}`;
      if (!evidence) {
        errors.push(`${evidencePrefix}: evidence entry is required`);
        continue;
      }
      if (!EVIDENCE_STATUSES.has(evidence.status)) {
        errors.push(`${evidencePrefix}: invalid status`);
        continue;
      }
      if (required.has(client)) requiredEvidence.push(evidence);
      if (required.has(client) && evidence.status !== "retained" && evidence.status !== "blocked") {
        incomplete.push(`${evidencePrefix}: required evidence is ${evidence.status}`);
      }
      if (
        ["blocked", "diagnostic", "pending", "not-applicable"].includes(evidence.status) &&
        !evidence.reason
      ) {
        errors.push(`${evidencePrefix}: ${evidence.status} requires a reason`);
      }
      if (required.has(client) && evidence.status === "not-applicable") {
        errors.push(`${evidencePrefix}: required evidence cannot be not-applicable`);
      }
      if (evidence.status === "not-applicable" && evidence.path) {
        errors.push(`${evidencePrefix}: not-applicable evidence cannot have a path`);
      }
      if (evidence.status === "blocked") {
        if (!/^R[0-9]+$/.test(evidence.blockerId ?? "")) {
          errors.push(`${evidencePrefix}: blocked requires a runtime blockerId such as R10`);
        }
        if (client !== "native" || evidence.captureTier !== "native") {
          errors.push(`${evidencePrefix}: blocked evidence must identify the Native capture tier`);
        }
        if (!evidence.buildSha256) {
          errors.push(`${evidencePrefix}: blocked requires buildSha256`);
        }
        if (
          !evidence.assertions ||
          !existsSync(resolveArtifact(manifestPath, evidence.assertions))
        ) {
          errors.push(`${evidencePrefix}: blocked requires an existing assertions artifact`);
        }
        if (evidence.path) {
          errors.push(`${evidencePrefix}: blocked evidence must not masquerade as an image`);
        }
        continue;
      }
      if (!evidence.path) {
        if (evidence.status === "retained" || evidence.status === "diagnostic") {
          errors.push(`${evidencePrefix}: ${evidence.status} requires a path`);
        }
        continue;
      }

      const absolutePath = resolveArtifact(manifestPath, evidence.path);
      if (!existsSync(absolutePath)) {
        errors.push(`${evidencePrefix}: missing image ${evidence.path}`);
        continue;
      }
      try {
        const actual = pngDimensions(absolutePath);
        const expected = evidence.image ?? expectedDimensions(client, stateValue);
        if (actual.width !== expected.width || actual.height !== expected.height) {
          errors.push(
            `${evidencePrefix}: PNG ${actual.width}x${actual.height}, expected ${expected.width}x${expected.height}`,
          );
        }
      } catch (error) {
        errors.push(`${evidencePrefix}: ${error.message}`);
      }
      if (evidence.sha256 && evidence.sha256 !== sha256(absolutePath)) {
        errors.push(`${evidencePrefix}: image sha256 mismatch`);
      }
      if (evidence.status !== "retained") continue;

      const provenance = artifactProvenance.get(path.resolve(absolutePath));
      if (!provenance?.archived) {
        const diagnostic = `${evidencePrefix}: retained image is not archived in HEAD (${provenance?.status ?? "unknown"})`;
        if (options.requireArchivedEvidence) {
          errors.push(diagnostic);
        } else {
          warnings.push(diagnostic);
        }
      }

      for (const key of [
        "captureTier",
        "buildSha256",
        "snapshotSha256",
        "assertions",
        "console",
        "stateEcho",
        "gates",
      ]) {
        if (!evidence[key]) errors.push(`${evidencePrefix}: retained evidence requires ${key}`);
      }
      if (evidence.snapshotSha256 !== stateValue.snapshotSha256) {
        errors.push(`${evidencePrefix}: snapshot hash does not match resolved state`);
      }
      for (const linkedKey of ["assertions", "console"]) {
        if (
          evidence[linkedKey] &&
          !existsSync(resolveArtifact(manifestPath, evidence[linkedKey]))
        ) {
          errors.push(`${evidencePrefix}: missing ${linkedKey} ${evidence[linkedKey]}`);
        }
      }
      for (const key of [
        "route",
        "semanticRoute",
        "theme",
        "density",
        "selectedProject",
        "selectedThread",
        "selectedModel",
        "lifecycle",
        "overlay",
      ]) {
        if (JSON.stringify(evidence.stateEcho?.[key]) !== JSON.stringify(stateValue[key])) {
          errors.push(`${evidencePrefix}: stateEcho.${key} does not match resolved state`);
        }
      }
      validateGateShape(errors, evidencePrefix, evidence.gates);

      const pathKey = `${client}:${path.resolve(absolutePath)}`;
      const previous = retainedPaths.get(pathKey);
      if (previous && previous !== state.id && evidence.allowEvidenceReuse !== true) {
        errors.push(
          `${evidencePrefix}: retained image is already used by mutually exclusive state ${previous}`,
        );
      }
      retainedPaths.set(pathKey, state.id);

      const imageHash = sha256(absolutePath);
      const hashKey = `${client}:${imageHash}`;
      const previousHash = retainedHashes.get(hashKey);
      if (previousHash && previousHash !== state.id && evidence.allowEvidenceReuse !== true) {
        errors.push(
          `${evidencePrefix}: retained image bytes are already used by mutually exclusive state ${previousHash}`,
        );
      }
      retainedHashes.set(hashKey, state.id);
    }
    validateVerdict(errors, state, requiredEvidence);
  }

  if (!options.allowIncomplete && incomplete.length > 0) {
    errors.push(`${incomplete.length} required evidence cells are incomplete`);
  }
  return { errors, incomplete, warnings, provenanceSummary };
}

export function formatEvidenceResult(result, manifestPath) {
  return {
    manifest: manifestPath,
    valid: result.errors.length === 0,
    errorCount: result.errors.length,
    incompleteCount: result.incomplete.length,
    errors: result.errors,
    incomplete: result.incomplete,
    warnings: result.warnings,
    provenance: result.provenanceSummary,
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const manifest = readJson(options.manifestPath);
  const result = validateEvidenceManifest(manifest, options.manifestPath, options);
  const formatted = formatEvidenceResult(result, options.manifestPath);
  if (options.json) {
    console.log(JSON.stringify(formatted, null, 2));
  } else {
    console.log(
      `${formatted.valid ? "PASS" : "FAIL"} ${path.relative(process.cwd(), options.manifestPath)} ` +
        `errors=${formatted.errorCount} incomplete=${formatted.incompleteCount} ` +
        `archived=${formatted.provenance.archived}/${formatted.provenance.total}`,
    );
    for (const error of result.errors) console.error(`- ${error}`);
    for (const warning of result.warnings) console.warn(`- warning: ${warning}`);
    if (options.allowIncomplete) {
      for (const item of result.incomplete) console.log(`- incomplete: ${item}`);
    }
  }
  if (result.errors.length > 0) {
    process.exit(result.incomplete.length > 0 && !options.allowIncomplete ? 2 : 1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
