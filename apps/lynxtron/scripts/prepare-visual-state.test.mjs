import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, assert, describe, it } from "vite-plus/test";

import {
  assertEmptyOutputDirectory,
  prepareVisualState,
  readVisualSnapshotSummary,
} from "./prepare-visual-state.mjs";

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    if (root.startsWith(join(tmpdir(), "t3code-visual-state-test-"))) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("visual reference-state preparation", () => {
  it("creates one project and zero threads through the production server CLI", () => {
    const output = mkdtempSync(join(tmpdir(), "t3code-visual-state-test-"));
    temporaryRoots.push(output);
    const workspaceRoot = resolve(import.meta.dirname, "..", "..", "..");
    const manifest = prepareVisualState({
      output,
      serverBin: resolve(workspaceRoot, "apps/server/dist/bin.mjs"),
      title: "t3code-visual-fixture",
      workspaceRoot,
    });
    const summary = readVisualSnapshotSummary(output);

    assert.equal(summary.projects.length, 1);
    assert.equal(summary.projects[0].title, "t3code-visual-fixture");
    assert.equal(summary.projects[0].workspaceRoot, workspaceRoot);
    assert.equal(summary.threadCount, 0);
    assert.equal(manifest.snapshotId.length, 64);
    assert.deepEqual(
      JSON.parse(readFileSync(join(output, "userdata", "desktop-settings.json"), "utf8")),
      {
        mainWindowBounds: {
          x: 0,
          y: 0,
          width: 1440,
          height: 900,
        },
      },
    );
    assert.deepEqual(JSON.parse(readFileSync(join(output, "visual-state.json"), "utf8")), manifest);
  });

  it("refuses to replace a non-empty output directory", () => {
    const output = mkdtempSync(join(tmpdir(), "t3code-visual-state-test-"));
    temporaryRoots.push(output);
    prepareVisualState({
      output,
      serverBin: resolve(import.meta.dirname, "../../server/dist/bin.mjs"),
      title: "existing",
      workspaceRoot: resolve(import.meta.dirname, "..", "..", ".."),
    });
    assert.throws(() => assertEmptyOutputDirectory(output), /refusing to overwrite/u);
  });
});
