import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { describe, it } from "vite-plus/test";

import { createIsolatedState, isExpectedReadiness } from "./retain-mts-product-app.mjs";

describe("retain MTS product app", () => {
  it("retains database identity through the isolated snapshot", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "t3-retain-snapshot-test-"));
    const sourceRoot = path.join(root, "source");
    const outputRoot = path.join(root, "output");
    mkdirSync(path.join(sourceRoot, "userdata"), { recursive: true });
    const sourceDatabase = new DatabaseSync(path.join(sourceRoot, "userdata/state.sqlite"));
    sourceDatabase.exec(`
      CREATE TABLE orchestration_events (event_id TEXT);
      CREATE TABLE projection_projects (project_id TEXT, deleted_at TEXT);
      CREATE TABLE projection_threads (thread_id TEXT, deleted_at TEXT);
      INSERT INTO orchestration_events VALUES ('event-1'), ('event-2');
      INSERT INTO projection_projects VALUES ('project-1', NULL);
      INSERT INTO projection_threads VALUES ('thread-1', NULL);
    `);
    sourceDatabase.close();

    try {
      const identity = createIsolatedState(outputRoot, { sourceRoot });
      assert.equal(identity.eventCount, 2);
      assert.deepEqual(identity.projectIds, ["project-1"]);
      assert.deepEqual(identity.threadIds, ["thread-1"]);
      assert.equal(identity.sha256.length, 64);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not accept generic readiness when an expected thread is missing", () => {
    const base = { status: "ready", transport: { kind: "main" }, threads: [] };
    assert.equal(isExpectedReadiness(base, "thread-1"), false);
    assert.equal(isExpectedReadiness({ ...base, threads: [{ id: "thread-1" }] }, "thread-1"), true);
    assert.equal(
      isExpectedReadiness({ ...base, archivedThreads: [{ id: "thread-1" }] }, "thread-1"),
      true,
    );
    assert.equal(isExpectedReadiness(base, undefined), true);
  });
});
