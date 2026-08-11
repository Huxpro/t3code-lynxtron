import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, assert, describe, it } from "vite-plus/test";

import { validateEvidenceManifest } from "./verify-evidence-manifest.mjs";

const temporaryRoots = [];
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+M4T7WQAAAABJRU5ErkJggg==",
  "base64",
);

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "t3-evidence-"));
  temporaryRoots.push(root);
  mkdirSync(path.join(root, "state"), { recursive: true });
  writeFileSync(path.join(root, "state", "web.png"), PNG_1X1);
  writeFileSync(path.join(root, "state", "lynx.png"), PNG_1X1);
  writeFileSync(path.join(root, "state", "native.png"), PNG_1X1);
  writeFileSync(path.join(root, "state", "assertions.json"), "{}");
  writeFileSync(path.join(root, "state", "console.txt"), "");
  return root;
}

function retained(pathName, state, client) {
  const imagePath = path.join("state", pathName);
  const absolutePath = path.join(state.root, imagePath);
  return {
    status: "retained",
    path: imagePath,
    captureTier: client === "native" ? "native" : "browser",
    buildSha256: "build",
    snapshotSha256: "snapshot",
    image: { width: 1, height: 1 },
    sha256: createHash("sha256").update(PNG_1X1).digest("hex"),
    assertions: "state/assertions.json",
    console: "state/console.txt",
    stateEcho: {
      route: "/",
      semanticRoute: "new-thread",
      theme: "dark",
      density: "comfortable",
      selectedProject: null,
      selectedThread: null,
      selectedModel: null,
      lifecycle: "ready",
      overlay: null,
    },
    gates: {
      harness: "capture-valid",
      content: "pass",
      visual: "pass",
      interaction: "not-required",
      sourceReuse: "pass",
    },
  };
}

function blocked() {
  return {
    status: "blocked",
    reason: "Current Native runtime does not expose Worker.",
    blockerId: "R10",
    captureTier: "native",
    buildSha256: "native-build",
    assertions: "state/assertions.json",
  };
}

function provenanceFor(manifestPath, inputManifest, status) {
  return new Map(
    inputManifest.states.flatMap((state) =>
      Object.values(state.evidence)
        .filter((evidence) => evidence.path)
        .map((evidence) => [
          path.resolve(path.dirname(manifestPath), evidence.path),
          {
            status,
            repositoryPath: evidence.path,
            tracked: status !== "untracked",
            archived: status === "tracked-clean",
          },
        ]),
    ),
  );
}

function validateFixture(inputManifest, manifestPath, options = {}) {
  return validateEvidenceManifest(inputManifest, manifestPath, {
    artifactProvenance: provenanceFor(manifestPath, inputManifest, "tracked-clean"),
    ...options,
  });
}

function manifest(root, overrides = {}) {
  const state = {
    root,
    id: "hero",
    label: "Hero",
    requiredClients: ["web", "lynx"],
    optionalClients: ["native"],
    state: {},
    verdict: "visual-certified",
    evidence: {},
    ...overrides,
  };
  state.evidence = {
    web: retained("web.png", state, "web"),
    lynx: retained("lynx.png", state, "lynx"),
    native: {
      status: "pending",
      reason: "Optional Native correlation.",
    },
    ...(overrides.evidence ?? {}),
  };
  return {
    version: 1,
    id: "fixture",
    label: "Fixture",
    defaults: {
      route: "/",
      semanticRoute: "new-thread",
      theme: "dark",
      viewport: { width: 1, height: 1, devicePixelRatio: 1 },
      density: "comfortable",
      snapshotSha256: "snapshot",
      selectedProject: null,
      selectedThread: null,
      selectedModel: null,
      lifecycle: "ready",
      overlay: null,
    },
    states: [state],
  };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("Plan 11C evidence verifier", () => {
  it("reports malformed manifests without losing provenance summary", () => {
    const root = fixture();
    const result = validateEvidenceManifest(
      { version: 1, id: "broken", label: "Broken", defaults: {}, states: [] },
      path.join(root, "manifest.json"),
      { artifactProvenance: new Map() },
    );
    assert.isTrue(result.errors.some((entry) => entry.includes("non-empty array")));
    assert.deepEqual(result.provenanceSummary, {
      total: 0,
      archived: 0,
      counts: {},
    });
  });

  it("accepts retained Browser evidence with independent passing gates", () => {
    const root = fixture();
    const input = manifest(root);
    const result = validateFixture(input, path.join(root, "manifest.json"));
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.incomplete, []);
    assert.deepEqual(result.provenanceSummary, {
      total: 2,
      archived: 2,
      counts: { "tracked-clean": 2 },
    });
  });

  it("fails strict mode when required evidence is pending", () => {
    const root = fixture();
    const input = manifest(root, {
      verdict: "incomplete",
      evidence: {
        web: { status: "pending", reason: "Not captured." },
      },
    });
    const result = validateFixture(input, path.join(root, "manifest.json"));
    assert.isTrue(result.incomplete.some((entry) => entry.includes("hero.web")));
    assert.isTrue(result.errors.some((entry) => entry.includes("required evidence cells")));
  });

  it("allows structurally valid incomplete manifests in planning mode", () => {
    const root = fixture();
    const input = manifest(root, {
      verdict: "incomplete",
      evidence: {
        web: { status: "pending", reason: "Not captured." },
      },
    });
    const result = validateFixture(input, path.join(root, "manifest.json"), {
      allowIncomplete: true,
    });
    assert.deepEqual(result.errors, []);
    assert.equal(result.incomplete.length, 1);
  });

  it("rejects snapshot and state-echo mismatches", () => {
    const root = fixture();
    const input = manifest(root);
    input.states[0].evidence.web.snapshotSha256 = "other";
    input.states[0].evidence.lynx.stateEcho.selectedThread = "wrong-thread";
    const result = validateFixture(input, path.join(root, "manifest.json"));
    assert.isTrue(result.errors.some((entry) => entry.includes("snapshot hash")));
    assert.isTrue(result.errors.some((entry) => entry.includes("selectedThread")));
  });

  it("rejects visual-certified when visual gates still report a gap", () => {
    const root = fixture();
    const input = manifest(root);
    input.states[0].evidence.lynx.gates.visual = "gap";
    const result = validateFixture(input, path.join(root, "manifest.json"));
    assert.isTrue(result.errors.some((entry) => entry.includes("visual-certified")));
  });

  it("rejects Native certification without retained Native evidence", () => {
    const root = fixture();
    const input = manifest(root, {
      requiredClients: ["web", "lynx", "native"],
      verdict: "native-certified",
    });
    const result = validateFixture(input, path.join(root, "manifest.json"));
    assert.isTrue(result.errors.some((entry) => entry.includes("native-certified")));
  });

  it("accepts a required Native cell satisfied by a strict runtime blocker", () => {
    const root = fixture();
    const input = manifest(root, {
      requiredClients: ["web", "lynx", "native"],
      optionalClients: [],
      verdict: "intentional-delta",
      evidence: {
        native: blocked(),
      },
    });
    const result = validateFixture(input, path.join(root, "manifest.json"));
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.incomplete, []);
  });

  it("rejects malformed runtime blocker evidence", () => {
    const root = fixture();
    const input = manifest(root, {
      requiredClients: ["web", "lynx", "native"],
      optionalClients: [],
      verdict: "intentional-delta",
      evidence: {
        native: {
          ...blocked(),
          blockerId: "runtime-gap",
          assertions: "state/missing.json",
          path: "state/native.png",
        },
      },
    });
    const result = validateFixture(input, path.join(root, "manifest.json"));
    assert.isTrue(result.errors.some((entry) => entry.includes("runtime blockerId")));
    assert.isTrue(result.errors.some((entry) => entry.includes("existing assertions")));
    assert.isTrue(result.errors.some((entry) => entry.includes("masquerade as an image")));
  });

  it("rejects one retained screenshot reused for mutually exclusive states", () => {
    const root = fixture();
    const input = manifest(root);
    const second = structuredClone(input.states[0]);
    second.id = "other";
    second.label = "Other";
    second.evidence.lynx.path = "state/web.png";
    input.states.push(second);
    const result = validateFixture(input, path.join(root, "manifest.json"));
    assert.isTrue(result.errors.some((entry) => entry.includes("mutually exclusive")));
  });

  it("rejects copied retained screenshots reused for mutually exclusive states", () => {
    const root = fixture();
    const input = manifest(root);
    const second = structuredClone(input.states[0]);
    second.id = "other";
    second.label = "Other";
    input.states.push(second);
    const result = validateFixture(input, path.join(root, "manifest.json"));
    assert.isTrue(result.errors.some((entry) => entry.includes("image bytes are already used")));
  });

  it("warns when retained evidence exists locally but is not archived", () => {
    const root = fixture();
    const input = manifest(root);
    const manifestPath = path.join(root, "manifest.json");
    const result = validateEvidenceManifest(input, manifestPath, {
      artifactProvenance: provenanceFor(manifestPath, input, "untracked"),
    });
    assert.deepEqual(result.errors, []);
    assert.equal(result.warnings.length, 2);
    assert.isTrue(result.warnings.every((entry) => entry.includes("not archived in HEAD")));
    assert.deepEqual(result.provenanceSummary, {
      total: 2,
      archived: 0,
      counts: { untracked: 2 },
    });
  });

  it("rejects unarchived retained evidence in phase-exit strict mode", () => {
    const root = fixture();
    const input = manifest(root);
    const manifestPath = path.join(root, "manifest.json");
    const result = validateEvidenceManifest(input, manifestPath, {
      artifactProvenance: provenanceFor(manifestPath, input, "tracked-modified"),
      requireArchivedEvidence: true,
    });
    assert.equal(result.errors.length, 2);
    assert.isTrue(result.errors.every((entry) => entry.includes("tracked-modified")));
  });

  it("rejects PNG dimensions that do not match the cell contract", () => {
    const root = fixture();
    const input = manifest(root);
    input.states[0].evidence.web.image = { width: 1280, height: 820 };
    const result = validateFixture(input, path.join(root, "manifest.json"));
    assert.isTrue(result.errors.some((entry) => entry.includes("PNG 1x1")));
  });
});
