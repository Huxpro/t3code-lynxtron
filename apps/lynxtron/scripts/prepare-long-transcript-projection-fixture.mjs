#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function fixtureTimestamp(index, offsetSeconds = 0) {
  return new Date(Date.UTC(2026, 8, 10, 12, 0, index * 2 + offsetSeconds)).toISOString();
}

export function prepareLongTranscriptProjectionFixture(baseDirectory, options = {}) {
  const baseDir = path.resolve(baseDirectory);
  const manifestPath = path.join(baseDir, "visual-state.json");
  const databasePath = path.join(baseDir, "userdata", "state.sqlite");
  if (!existsSync(manifestPath) || !existsSync(databasePath)) {
    throw new Error("Long-transcript fixture requires a directory created by visual:prepare.");
  }
  const turnCount = Number(options.turnCount ?? 120);
  if (!Number.isInteger(turnCount) || turnCount < 50 || turnCount > 500) {
    throw new Error("Long-transcript fixture turn count must be an integer from 50 through 500.");
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.threadCount !== 0 || manifest.route !== "new-thread") {
    throw new Error("Long-transcript fixture refuses a non-empty visual state.");
  }
  const modelSelection = manifest.project?.defaultModelSelection ?? {
    instanceId: "codex",
    model: "gpt-5.6-sol",
  };
  const threadId = "fidelity-long-transcript";
  const title = `Long transcript ${turnCount} turns`;
  const database = new DatabaseSync(databasePath);
  try {
    const projectCount = Number(
      database.prepare("SELECT COUNT(*) AS count FROM projection_projects").get().count,
    );
    const threadCountBefore = Number(
      database.prepare("SELECT COUNT(*) AS count FROM projection_threads").get().count,
    );
    if (projectCount !== 1 || threadCountBefore !== 0) {
      throw new Error("Long-transcript fixture requires one project and zero threads.");
    }
    const insertMessage = database.prepare(
      `INSERT INTO projection_thread_messages (
        message_id, thread_id, turn_id, role, text, is_streaming, created_at, updated_at,
        attachments_json
      ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, '[]')`,
    );
    const insertTurn = database.prepare(
      `INSERT INTO projection_turns (
        thread_id, turn_id, pending_message_id, assistant_message_id, state, requested_at,
        started_at, completed_at, checkpoint_turn_count, checkpoint_ref, checkpoint_status,
        checkpoint_files_json, source_proposed_plan_thread_id, source_proposed_plan_id
      ) VALUES (?, ?, NULL, ?, 'completed', ?, ?, ?, NULL, NULL, NULL, '[]', NULL, NULL)`,
    );
    database.exec("BEGIN IMMEDIATE");
    for (let index = 0; index < turnCount; index += 1) {
      const turnId = `fidelity-long-turn-${String(index + 1).padStart(3, "0")}`;
      const userMessageId = `${turnId}-user`;
      const assistantMessageId = `${turnId}-assistant`;
      const requestedAt = fixtureTimestamp(index);
      const completedAt = fixtureTimestamp(index, 1);
      insertMessage.run(
        userMessageId,
        threadId,
        turnId,
        "user",
        `Inspect transcript turn ${index + 1} and preserve its stable scroll position.`,
        requestedAt,
        requestedAt,
      );
      insertMessage.run(
        assistantMessageId,
        threadId,
        turnId,
        "assistant",
        [
          `Completed transcript turn ${index + 1}.`,
          "",
          "- Stable row identity",
          "- Bounded native list materialization",
          "- Deterministic first-to-last navigation",
        ].join("\n"),
        completedAt,
        completedAt,
      );
      insertTurn.run(threadId, turnId, assistantMessageId, requestedAt, requestedAt, completedAt);
    }
    const createdAt = fixtureTimestamp(0);
    const updatedAt = fixtureTimestamp(turnCount - 1, 1);
    database
      .prepare(
        `INSERT INTO projection_threads (
          thread_id, project_id, title, branch, worktree_path, latest_turn_id, created_at,
          updated_at, deleted_at, runtime_mode, interaction_mode, model_selection_json,
          archived_at, latest_user_message_at, pending_approval_count, pending_user_input_count,
          has_actionable_proposed_plan, settled_override, settled_at
        ) VALUES (?, ?, ?, 'main', NULL, ?, ?, ?, NULL, 'full-access', 'default', ?, NULL, ?,
          0, 0, 0, 'settled', ?)`,
      )
      .run(
        threadId,
        manifest.project.projectId,
        title,
        `fidelity-long-turn-${String(turnCount).padStart(3, "0")}`,
        createdAt,
        updatedAt,
        JSON.stringify(modelSelection),
        fixtureTimestamp(turnCount - 1),
        updatedAt,
      );
    database
      .prepare(
        `INSERT INTO projection_thread_sessions (
          thread_id, status, provider_name, provider_instance_id, provider_session_id,
          provider_thread_id, runtime_mode, active_turn_id, last_error, updated_at
        ) VALUES (?, 'ready', 'Codex', ?, NULL, NULL, 'full-access', NULL, NULL, ?)`,
      )
      .run(threadId, modelSelection.instanceId, updatedAt);
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

  const messageCount = turnCount * 2;
  const fixture = {
    threadId,
    title,
    turnCount,
    messageCount,
    expectedTimelineRowCount: messageCount,
    modelSelection,
    latestTurnState: "completed",
  };
  const nextManifest = {
    ...manifest,
    snapshotId: sha256File(databasePath),
    route: "thread-transcript",
    threadCount: 1,
    sidebarFixture: { titles: [title] },
    longTranscriptFixture: fixture,
    preparation: {
      kind: "direct-projection-long-transcript-fixture",
      backendBehaviorClaimed: false,
    },
  };
  writeFileSync(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`);
  writeFileSync(
    path.join(baseDir, "lynxtron-prefs.json"),
    `${JSON.stringify({ themePreference: "dark", clientSettings: {}, modelSelection }, null, 2)}\n`,
  );
  return nextManifest;
}

const baseDir = argumentValue("--base-dir");
if (!baseDir) {
  throw new Error("--base-dir is required (a directory created by visual:prepare).");
}
const turnCount = Number(argumentValue("--turn-count") ?? "120");
process.stdout.write(
  `${JSON.stringify(prepareLongTranscriptProjectionFixture(baseDir, { turnCount }), null, 2)}\n`,
);
