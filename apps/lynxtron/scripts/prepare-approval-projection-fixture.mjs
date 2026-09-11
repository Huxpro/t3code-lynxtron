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

export function prepareApprovalProjectionFixture(baseDirectory) {
  const baseDir = path.resolve(baseDirectory);
  const manifestPath = path.join(baseDir, "visual-state.json");
  const databasePath = path.join(baseDir, "userdata", "state.sqlite");
  if (!existsSync(manifestPath) || !existsSync(databasePath)) {
    throw new Error("Approval projection fixture requires a directory created by visual:prepare.");
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.threadCount !== 0 || manifest.route !== "new-thread") {
    throw new Error("Approval projection fixture refuses a non-empty visual state.");
  }

  const threadId = "7bca730b-1006-4b21-8c0d-913838a53e5e";
  const turnId = "f079fd25-2f9a-42eb-a93a-5e80710a982c";
  const messageId = "57e30b08-fad4-4583-a6f6-a74646111910";
  const activityId = "81cc66ac-3994-422d-a5d1-720bd268cc2a";
  const requestId = "approval-fixture-command-1";
  const createdAt = "2026-08-24T00:00:00.000Z";
  const detail = "printf pending-approval";
  const prompt =
    "Run `printf pending-approval` in the shell. Do not use any other tool and wait for my approval.";
  const modelSelection = {
    instanceId: "opencode",
    model: "opencode/big-pickle",
  };
  const activity = {
    id: activityId,
    tone: "approval",
    kind: "approval.requested",
    summary: "Command approval requested",
    payload: {
      requestId,
      requestKind: "command",
      detail,
    },
    turnId,
    createdAt,
  };

  const database = new DatabaseSync(databasePath);
  try {
    const projectCount = Number(
      database.prepare("SELECT COUNT(*) AS count FROM projection_projects").get().count,
    );
    const threadCount = Number(
      database.prepare("SELECT COUNT(*) AS count FROM projection_threads").get().count,
    );
    if (projectCount !== 1 || threadCount !== 0) {
      throw new Error("Approval projection fixture requires one project and zero threads.");
    }

    database.exec("BEGIN IMMEDIATE");
    database
      .prepare(
        `INSERT INTO projection_threads (
          thread_id, project_id, title, branch, worktree_path, latest_turn_id, created_at,
          updated_at, deleted_at, runtime_mode, interaction_mode, model_selection_json,
          archived_at, latest_user_message_at, pending_approval_count, pending_user_input_count,
          has_actionable_proposed_plan
        ) VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, NULL, 'approval-required', 'default', ?, NULL, ?, 1, 0, 0)`,
      )
      .run(
        threadId,
        manifest.project.projectId,
        "Pending command approval",
        turnId,
        createdAt,
        createdAt,
        JSON.stringify(modelSelection),
        createdAt,
      );
    database
      .prepare(
        `INSERT INTO projection_thread_messages (
          message_id, thread_id, turn_id, role, text, is_streaming, created_at, updated_at,
          attachments_json
        ) VALUES (?, ?, ?, 'user', ?, 0, ?, ?, '[]')`,
      )
      .run(messageId, threadId, turnId, prompt, createdAt, createdAt);
    database
      .prepare(
        `INSERT INTO projection_turns (
          thread_id, turn_id, pending_message_id, assistant_message_id, state, requested_at,
          started_at, completed_at, checkpoint_turn_count, checkpoint_ref, checkpoint_status,
          checkpoint_files_json, source_proposed_plan_thread_id, source_proposed_plan_id
        ) VALUES (?, ?, ?, NULL, 'running', ?, ?, NULL, NULL, NULL, NULL, '[]', NULL, NULL)`,
      )
      .run(threadId, turnId, messageId, createdAt, createdAt);
    database
      .prepare(
        `INSERT INTO projection_thread_sessions (
          thread_id, status, provider_name, provider_instance_id, provider_session_id,
          provider_thread_id, runtime_mode, active_turn_id, last_error, updated_at
        ) VALUES (?, 'running', 'OpenCode', ?, NULL, NULL, 'approval-required', ?, NULL, ?)`,
      )
      .run(threadId, modelSelection.instanceId, turnId, createdAt);
    database
      .prepare(
        `INSERT INTO projection_thread_activities (
          activity_id, thread_id, turn_id, tone, kind, summary, payload_json, sequence, created_at
        ) VALUES (?, ?, ?, 'approval', 'approval.requested', 'Command approval requested', ?, NULL, ?)`,
      )
      .run(activityId, threadId, turnId, JSON.stringify(activity.payload), createdAt);
    database
      .prepare(
        `INSERT INTO projection_pending_approvals (
          request_id, thread_id, turn_id, status, decision, created_at, resolved_at
        ) VALUES (?, ?, ?, 'pending', NULL, ?, NULL)`,
      )
      .run(requestId, threadId, turnId, createdAt);
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

  const pendingRequestFixture = {
    mode: "approval",
    threadId,
    title: "Pending command approval",
    prompt,
    modelSelection,
    activity,
    sessionStatus: "running",
    activeTurnId: turnId,
  };
  const nextManifest = {
    ...manifest,
    snapshotId: sha256File(databasePath),
    route: "pending-approval",
    threadCount: 1,
    sidebarFixture: {
      titles: [pendingRequestFixture.title],
    },
    pendingRequestFixture,
    preparation: {
      kind: "direct-projection-visual-fixture",
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
  if (!baseDir) {
    throw new Error("--base-dir is required (a directory created by visual:prepare).");
  }
  process.stdout.write(`${JSON.stringify(prepareApprovalProjectionFixture(baseDir), null, 2)}\n`);
}
