import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, assert, describe, it } from "vite-plus/test";

import {
  collectGitArtifactProvenance,
  summarizeArtifactProvenance,
} from "./evidence-provenance.mjs";

const temporaryRoots = [];

function git(root, ...args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
  });
}

function repositoryFixture() {
  const root = mkdtempSync(path.join(tmpdir(), "t3-evidence-provenance-"));
  temporaryRoots.push(root);
  git(root, "init", "-q");
  git(root, "config", "user.name", "T3 Evidence Test");
  git(root, "config", "user.email", "evidence@example.invalid");
  mkdirSync(path.join(root, "evidence"));
  writeFileSync(path.join(root, "evidence", "clean.png"), "clean");
  writeFileSync(path.join(root, "evidence", "modified.png"), "before");
  git(root, "add", "evidence/clean.png", "evidence/modified.png");
  git(root, "commit", "-qm", "test fixture");
  writeFileSync(path.join(root, "evidence", "modified.png"), "after");
  writeFileSync(path.join(root, "evidence", "untracked.png"), "local");
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("evidence artifact provenance", () => {
  it("distinguishes archived, modified, untracked, missing, and outside-repository artifacts", () => {
    const root = repositoryFixture();
    const paths = [
      path.join(root, "evidence", "clean.png"),
      path.join(root, "evidence", "modified.png"),
      path.join(root, "evidence", "untracked.png"),
      path.join(root, "evidence", "missing.png"),
      path.join(path.dirname(root), "outside.png"),
    ];
    const result = collectGitArtifactProvenance({
      repoRoot: root,
      artifactPaths: paths,
    });

    assert.equal(result.get(paths[0]).status, "tracked-clean");
    assert.equal(result.get(paths[0]).archived, true);
    assert.equal(result.get(paths[1]).status, "tracked-modified");
    assert.equal(result.get(paths[1]).archived, false);
    assert.equal(result.get(paths[2]).status, "untracked");
    assert.equal(result.get(paths[3]).status, "missing");
    assert.equal(result.get(paths[4]).status, "outside-repository");
    assert.deepEqual(summarizeArtifactProvenance(result), {
      total: 5,
      archived: 1,
      counts: {
        "tracked-clean": 1,
        "tracked-modified": 1,
        untracked: 1,
        missing: 1,
        "outside-repository": 1,
      },
    });
  });
});
