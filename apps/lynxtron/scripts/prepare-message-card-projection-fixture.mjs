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

export const MESSAGE_CARD_PROMPT = [
  "Please apply these interface notes.",
  "",
  '<review_comment sectionId="turn:1" sectionTitle="Turn 1" filePath="src/card.tsx" startIndex="4" endIndex="6" rangeLabel="+5 to +7">',
  "Keep the shared card semantics aligned.",
  "```diff",
  "-const gap = 8",
  "+const gap = 12",
  "```",
  "</review_comment>",
  "",
  "<preview_annotation>",
  "Preview annotation:",
  "Id: card-spacing",
  "Page: Card preview",
  "Comment: Tighten the card hierarchy.",
  "Targets: 1 selected element.",
  "Requested visual changes:",
  "- Increase the content gap to 12px.",
  "</preview_annotation>",
  "",
  "<element_context>",
  "- <CardBody> (src/card.tsx:5):",
  "  selector: [data-card-body]",
  "</element_context>",
].join("\n");

export function prepareMessageCardProjectionFixture(baseDirectory) {
  const baseDir = path.resolve(baseDirectory);
  const manifestPath = path.join(baseDir, "visual-state.json");
  const databasePath = path.join(baseDir, "userdata/state.sqlite");
  if (!existsSync(manifestPath) || !existsSync(databasePath)) {
    throw new Error("Message-card fixture requires a directory created by visual:prepare.");
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.threadCount !== 0 || manifest.route !== "new-thread") {
    throw new Error("Message-card fixture refuses a non-empty visual state.");
  }

  const threadId = "fidelity-message-card-thread";
  const turnId = "fidelity-message-card-turn-1";
  const userMessageId = "fidelity-message-card-user-1";
  const assistantMessageId = "fidelity-message-card-assistant-1";
  const requestedAt = "2026-09-11T12:00:00.000Z";
  const completedAt = "2026-09-11T12:00:01.000Z";
  const modelSelection = manifest.project.defaultModelSelection ?? {
    instanceId: "codex",
    model: "gpt-5.6-sol",
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
      throw new Error("Message-card fixture requires one project and zero threads.");
    }
    database.exec("BEGIN IMMEDIATE");
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
        "Message card semantics",
        turnId,
        requestedAt,
        completedAt,
        JSON.stringify(modelSelection),
        requestedAt,
        completedAt,
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
        MESSAGE_CARD_PROMPT,
        requestedAt,
        requestedAt,
        assistantMessageId,
        threadId,
        turnId,
        "Recorded the shared message-card semantics.",
        completedAt,
        completedAt,
      );
    database
      .prepare(
        `INSERT INTO projection_turns (
          thread_id, turn_id, pending_message_id, assistant_message_id, state, requested_at,
          started_at, completed_at, checkpoint_turn_count, checkpoint_ref, checkpoint_status,
          checkpoint_files_json, source_proposed_plan_thread_id, source_proposed_plan_id
        ) VALUES (?, ?, NULL, ?, 'completed', ?, ?, ?, NULL, NULL, NULL, '[]', NULL, NULL)`,
      )
      .run(threadId, turnId, assistantMessageId, requestedAt, requestedAt, completedAt);
    database
      .prepare(
        `INSERT INTO projection_thread_sessions (
          thread_id, status, provider_name, provider_instance_id, provider_session_id,
          provider_thread_id, runtime_mode, active_turn_id, last_error, updated_at
        ) VALUES (?, 'ready', 'Codex', ?, NULL, NULL, 'full-access', NULL, NULL, ?)`,
      )
      .run(threadId, modelSelection.instanceId, completedAt);
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

  const messageCardFixture = {
    threadId,
    turnId,
    userMessageId,
    assistantMessageId,
    title: "Message card semantics",
    review: { filePath: "src/card.tsx", rangeLabel: "+5 to +7" },
    preview: { id: "card-spacing", comment: "Tighten the card hierarchy." },
    element: { header: "<CardBody> (src/card.tsx:5)" },
  };
  const nextManifest = {
    ...manifest,
    snapshotId: sha256File(databasePath),
    route: "thread-transcript",
    threadCount: 1,
    sidebarFixture: { titles: [messageCardFixture.title] },
    messageCardFixture,
    preparation: {
      kind: "direct-projection-message-card-fixture",
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
  process.stdout.write(
    `${JSON.stringify(prepareMessageCardProjectionFixture(baseDir), null, 2)}\n`,
  );
}
