#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const appRoot = resolve(import.meta.dirname, "..");

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function readSidebarSnapshot(databasePath) {
  const database = new DatabaseSync(databasePath);
  try {
    database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    return database
      .prepare(
        `SELECT title
         FROM projection_threads
         WHERE deleted_at IS NULL
         ORDER BY updated_at DESC, thread_id DESC`,
      )
      .all()
      .map((row) => row.title);
  } finally {
    database.close();
  }
}

function stabilizeSidebarTimestamps(databasePath, titles) {
  const database = new DatabaseSync(databasePath);
  const update = database.prepare(
    `UPDATE projection_threads
     SET created_at = ?, updated_at = ?
     WHERE title = ?`,
  );
  try {
    database.exec("BEGIN IMMEDIATE");
    titles.forEach((title, index) => {
      // Visual captures run one client after the other. A fixed, deliberately
      // old timestamp keeps the relative-time label stable across both runs,
      // while the one-second offsets preserve the canonical newest-first order.
      const timestamp = new Date(Date.UTC(2020, 0, 1, 0, 0, index)).toISOString();
      update.run(timestamp, timestamp, title);
    });
    database.exec("COMMIT");
    database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  } finally {
    database.close();
  }
}

// Runs in the hidden app. Until the client is ready and shows the project it
// answers `pending`; then it creates one thread per title with the command
// the UI sends. A command resolves once the server has accepted it. The
// evaluation context has no timers, so the waiting is done by the caller.
function createThreadsExpression(titles) {
  return `(async () => {
    const state = globalThis.__T3_LYNXTRON_CLIENT_STATE__?.();
    const project = state?.projects[0];
    if (globalThis.__T3_LYNXTRON_READINESS__?.().ready !== true || !project) {
      return JSON.stringify({ pending: true });
    }
    if (state.threadIds.length !== 0) {
      throw new Error("Sidebar visual state must start from the empty visual snapshot.");
    }
    const threadIds = [];
    for (const title of ${JSON.stringify(titles)}) {
      const { threadId } = await globalThis.__T3_LYNXTRON_COMMAND__("createThread", {
        projectId: project.id,
        title,
      });
      threadIds.push(threadId);
    }
    return JSON.stringify({ threadIds });
  })().catch((error) => JSON.stringify({ error: error?.message ?? String(error) }))`;
}

function devInstance(args) {
  return execFileSync(process.execPath, [join(appRoot, "scripts/dev-instance.mjs"), ...args], {
    cwd: appRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

export async function prepareSidebarVisualState(baseDirectory) {
  const baseDir = resolve(baseDirectory);
  const manifestPath = join(baseDir, "visual-state.json");
  const databasePath = join(baseDir, "userdata", "state.sqlite");
  if (!existsSync(manifestPath) || !existsSync(databasePath)) {
    throw new Error("Sidebar visual state requires a directory created by visual:prepare.");
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  const titles = [
    "Global keyboard bridge and focus order",
    "Investigate an intentionally long thread title that must truncate without moving actions",
    "Finish the in-monorepo Lynxtron UI migration",
  ];

  // The threads are created by the product itself: the built app, hidden, on
  // this state directory. What the app saves for itself is put back after.
  const prefsPath = join(baseDir, "lynxtron-prefs.json");
  const prefsBefore = existsSync(prefsPath) ? readFileSync(prefsPath) : null;
  devInstance([
    "start",
    baseDir,
    "--env",
    `T3_LYNXTRON_PROJECT_CWD=${manifest.project.workspaceRoot}`,
  ]);
  try {
    let created = { pending: true };
    for (let attempt = 0; attempt < 60 && created.pending; attempt += 1) {
      if (attempt > 0) await new Promise((resolveWait) => setTimeout(resolveWait, 500));
      created = JSON.parse(devInstance(["eval", baseDir, createThreadsExpression(titles)]));
    }
    if (created.threadIds?.length !== titles.length) {
      throw new Error(`The app did not create the sidebar threads: ${JSON.stringify(created)}`);
    }
  } finally {
    devInstance(["stop", baseDir]);
    rmSync(join(baseDir, "dev-instance.log"), { force: true });
    if (prefsBefore === null) rmSync(prefsPath, { force: true });
    else writeFileSync(prefsPath, prefsBefore);
  }

  stabilizeSidebarTimestamps(databasePath, titles);
  const renderedTitles = readSidebarSnapshot(databasePath);
  if (
    renderedTitles.length !== titles.length ||
    renderedTitles.some((title) => !titles.includes(title))
  ) {
    throw new Error(
      `Prepared sidebar snapshot failed invariants: ${JSON.stringify(renderedTitles)}`,
    );
  }
  const nextManifest = {
    ...manifest,
    snapshotId: sha256File(databasePath),
    route: "sidebar-populated",
    threadCount: titles.length,
    sidebarFixture: {
      titles: renderedTitles,
      collapsed: false,
    },
  };
  writeFileSync(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`);
  return nextManifest;
}

const IS_MAIN_MODULE =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (IS_MAIN_MODULE) {
  const baseDir = argumentValue("--base-dir");
  if (!baseDir) {
    throw new Error("Usage: prepare-sidebar-visual-state.mjs --base-dir <visual-state-dir>");
  }
  process.stdout.write(`${JSON.stringify(await prepareSidebarVisualState(baseDir), null, 2)}\n`);
}
