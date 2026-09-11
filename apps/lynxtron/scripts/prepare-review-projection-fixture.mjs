#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function runGit(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "T3 Fidelity",
      GIT_AUTHOR_EMAIL: "fidelity@example.invalid",
      GIT_COMMITTER_NAME: "T3 Fidelity",
      GIT_COMMITTER_EMAIL: "fidelity@example.invalid",
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

function checkpointRef(threadId, turnCount) {
  return `refs/t3/checkpoints/${Buffer.from(threadId).toString("base64url")}/turn/${turnCount}`;
}

export function prepareReviewProjectionFixture(baseDirectory) {
  const baseDir = path.resolve(baseDirectory);
  const manifestPath = path.join(baseDir, "visual-state.json");
  const databasePath = path.join(baseDir, "userdata", "state.sqlite");
  if (!existsSync(manifestPath) || !existsSync(databasePath)) {
    throw new Error("Review projection fixture requires a directory created by visual:prepare.");
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.threadCount !== 0 || manifest.route !== "new-thread") {
    throw new Error("Review projection fixture refuses a non-empty visual state.");
  }
  const workspaceRoot = realpathSync(manifest.project?.workspaceRoot ?? "");
  if (runGit(workspaceRoot, ["rev-parse", "--is-inside-work-tree"]) !== "true") {
    throw new Error("Review projection fixture requires a Git workspace.");
  }
  const fixtureFile = path.join(workspaceRoot, "review-fixture.txt");
  if (
    !existsSync(fixtureFile) ||
    readFileSync(fixtureFile, "utf8") !== "original review fixture\n"
  ) {
    throw new Error("Review projection fixture requires the canonical original review file.");
  }
  if (runGit(workspaceRoot, ["status", "--porcelain"]) !== "") {
    throw new Error("Review projection fixture requires a clean workspace.");
  }

  const threadId = "fidelity-review-thread";
  const turnId = "fidelity-review-turn-1";
  const userMessageId = "fidelity-review-user-1";
  const assistantMessageId = "fidelity-review-assistant-1";
  const baselineRef = checkpointRef(threadId, 0);
  const checkpointRefValue = checkpointRef(threadId, 1);
  const baselineCommit = runGit(workspaceRoot, ["rev-parse", "HEAD"]);
  runGit(workspaceRoot, ["update-ref", baselineRef, baselineCommit]);
  writeFileSync(fixtureFile, "updated by T3 review fixture\n");
  runGit(workspaceRoot, ["add", "review-fixture.txt"]);
  runGit(workspaceRoot, ["commit", "-m", "Create review checkpoint fixture"]);
  const checkpointCommit = runGit(workspaceRoot, ["rev-parse", "HEAD"]);
  runGit(workspaceRoot, ["update-ref", checkpointRefValue, checkpointCommit]);
  runGit(workspaceRoot, ["reset", "--hard", baselineCommit]);

  const now = "2026-08-19T15:10:00.000Z";
  const requestedAt = "2026-08-19T15:09:00.000Z";
  const modelSelection = manifest.project.defaultModelSelection ?? {
    instanceId: "codex",
    model: "gpt-5.6-sol",
  };
  const checkpointFile = {
    path: "review-fixture.txt",
    kind: "modified",
    additions: 1,
    deletions: 1,
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
      throw new Error("Review projection fixture requires one project and zero threads.");
    }
    database.exec("BEGIN IMMEDIATE");
    database
      .prepare(
        `INSERT INTO projection_threads (
          thread_id, project_id, title, branch, worktree_path, latest_turn_id, created_at,
          updated_at, deleted_at, runtime_mode, interaction_mode, model_selection_json,
          archived_at, latest_user_message_at, pending_approval_count, pending_user_input_count,
          has_actionable_proposed_plan, settled_override, settled_at
        ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, NULL, 'full-access', 'default', ?, NULL, ?, 0, 0, 0,
          'settled', ?)`,
      )
      .run(
        threadId,
        manifest.project.projectId,
        "Review checkpoint baseline",
        runGit(workspaceRoot, ["branch", "--show-current"]) || "main",
        turnId,
        requestedAt,
        now,
        JSON.stringify(modelSelection),
        requestedAt,
        now,
      );
    database
      .prepare(
        `INSERT INTO projection_thread_messages (
          message_id, thread_id, turn_id, role, text, is_streaming, created_at, updated_at,
          attachments_json
        ) VALUES
          (?, ?, ?, 'user', ?, 0, ?, ?, '[]'),
          (?, ?, ?, 'assistant', ?, 0, ?, ?, '[]')`,
      )
      .run(
        userMessageId,
        threadId,
        turnId,
        "Update review-fixture.txt.",
        requestedAt,
        requestedAt,
        assistantMessageId,
        threadId,
        turnId,
        "Updated the review fixture.",
        now,
        now,
      );
    database
      .prepare(
        `INSERT INTO projection_turns (
          thread_id, turn_id, pending_message_id, assistant_message_id, state, requested_at,
          started_at, completed_at, checkpoint_turn_count, checkpoint_ref, checkpoint_status,
          checkpoint_files_json, source_proposed_plan_thread_id, source_proposed_plan_id
        ) VALUES (?, ?, NULL, ?, 'completed', ?, ?, ?, 1, ?, 'ready', ?, NULL, NULL)`,
      )
      .run(
        threadId,
        turnId,
        assistantMessageId,
        requestedAt,
        requestedAt,
        now,
        checkpointRefValue,
        JSON.stringify([checkpointFile]),
      );
    database
      .prepare(
        `INSERT INTO projection_thread_sessions (
          thread_id, status, provider_name, provider_instance_id, provider_session_id,
          provider_thread_id, runtime_mode, active_turn_id, last_error, updated_at
        ) VALUES (?, 'ready', 'Codex', ?, NULL, NULL, 'full-access', NULL, NULL, ?)`,
      )
      .run(threadId, modelSelection.instanceId, now);
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

  const reviewFixture = {
    threadId,
    title: "Review checkpoint baseline",
    prompt: "Update review-fixture.txt.",
    modelSelection,
    messageCount: 2,
    latestTurnState: "completed",
    checkpoint: {
      turnId,
      checkpointTurnCount: 1,
      checkpointRef: checkpointRefValue,
      status: "ready",
      files: [checkpointFile],
      assistantMessageId,
      completedAt: now,
    },
  };
  const nextManifest = {
    ...manifest,
    snapshotId: sha256File(databasePath),
    route: "review",
    threadCount: 1,
    reviewFixture,
    preparation: {
      kind: "direct-projection-visual-fixture",
      backendBehaviorClaimed: false,
      baselineRef,
      checkpointRef: checkpointRefValue,
      baselineCommit,
      checkpointCommit,
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
process.stdout.write(`${JSON.stringify(prepareReviewProjectionFixture(baseDir), null, 2)}\n`);
