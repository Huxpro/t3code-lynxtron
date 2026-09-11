#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

export const THREAD_JUMP_FIXTURE_THREADS = [
  { id: "fidelity-thread-one", title: "Thread One", createdAt: "2026-09-11T12:00:00.000Z" },
  { id: "fidelity-thread-two", title: "Thread Two", createdAt: "2026-09-11T12:01:00.000Z" },
];

export function prepareThreadJumpProjectionFixture(baseDirectory) {
  const baseDir = path.resolve(baseDirectory);
  const manifestPath = path.join(baseDir, "visual-state.json");
  const databasePath = path.join(baseDir, "userdata/state.sqlite");
  if (!existsSync(manifestPath) || !existsSync(databasePath)) {
    throw new Error("Thread-jump fixture requires a directory created by visual:prepare.");
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.threadCount !== 0 || manifest.route !== "new-thread") {
    throw new Error("Thread-jump fixture refuses a non-empty visual state.");
  }
  const modelSelection = manifest.project.defaultModelSelection ?? {
    instanceId: "codex",
    model: "gpt-5.6-sol",
  };
  const database = new DatabaseSync(databasePath);
  try {
    const insertThread = database.prepare(
      `INSERT INTO projection_threads (
        thread_id, project_id, title, branch, worktree_path, latest_turn_id, created_at,
        updated_at, deleted_at, runtime_mode, interaction_mode, model_selection_json,
        archived_at, latest_user_message_at, pending_approval_count, pending_user_input_count,
        has_actionable_proposed_plan, settled_override, settled_at
      ) VALUES (?, ?, ?, 'main', NULL, NULL, ?, ?, NULL, 'full-access', 'default', ?, NULL, ?,
        0, 0, 0, 'active', NULL)`,
    );
    const insertSession = database.prepare(
      `INSERT INTO projection_thread_sessions (
        thread_id, status, provider_name, provider_instance_id, provider_session_id,
        provider_thread_id, runtime_mode, active_turn_id, last_error, updated_at
      ) VALUES (?, 'idle', 'Codex', ?, NULL, NULL, 'full-access', NULL, NULL, ?)`,
    );
    database.exec("BEGIN IMMEDIATE");
    for (const thread of THREAD_JUMP_FIXTURE_THREADS) {
      insertThread.run(
        thread.id,
        manifest.project.projectId,
        thread.title,
        thread.createdAt,
        thread.createdAt,
        JSON.stringify(modelSelection),
        thread.createdAt,
      );
      insertSession.run(thread.id, modelSelection.instanceId, thread.createdAt);
    }
    database.exec("COMMIT");
    database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    database.close();
  }
  const orderedThreads = [...THREAD_JUMP_FIXTURE_THREADS].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
  const nextManifest = {
    ...manifest,
    snapshotId: sha256File(databasePath),
    route: "thread-transcript",
    threadCount: orderedThreads.length,
    sidebarFixture: { titles: orderedThreads.map((thread) => thread.title) },
    threadJumpFixture: {
      initialThreadId: orderedThreads[0].id,
      orderedThreads,
    },
    preparation: {
      kind: "direct-projection-thread-jump-fixture",
      backendBehaviorClaimed: false,
      interactionClaimed: false,
    },
  };
  writeFileSync(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`);
  writeFileSync(
    path.join(baseDir, "lynxtron-prefs.json"),
    `${JSON.stringify({ themePreference: "dark", clientSettings: {}, modelSelection }, null, 2)}\n`,
  );
  return nextManifest;
}

const IS_MAIN_MODULE =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (IS_MAIN_MODULE) {
  const baseDir = argumentValue("--base-dir");
  if (!baseDir) throw new Error("--base-dir is required.");
  process.stdout.write(`${JSON.stringify(prepareThreadJumpProjectionFixture(baseDir), null, 2)}\n`);
}
