#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const require = createRequire(import.meta.url);
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

async function waitFor(read, label) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const value = read();
    if (value) return value;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

export async function prepareSidebarVisualState(baseDirectory) {
  const baseDir = resolve(baseDirectory);
  const manifestPath = join(baseDir, "visual-state.json");
  const databasePath = join(baseDir, "userdata", "state.sqlite");
  if (!existsSync(manifestPath) || !existsSync(databasePath)) {
    throw new Error("Sidebar visual state requires a directory created by visual:prepare.");
  }

  const previousBaseDir = process.env.T3_LYNXTRON_BASE_DIR;
  const previousServerStdio = process.env.T3_LYNXTRON_SERVER_STDIO;
  const previousCwd = process.cwd();
  process.env.T3_LYNXTRON_BASE_DIR = baseDir;
  process.env.T3_LYNXTRON_SERVER_STDIO = "ignore";
  // The desktop connector resolves the bundled server entry absolutely, but
  // the server CLI still derives runtime paths from its launch cwd. Match the
  // normal Lynxtron host instead of inheriting an arbitrary caller directory.
  process.chdir(appRoot);

  const { T3Connector } = require(join(appRoot, "dist/desktop/connector.bundle.cjs"));
  let latestShell = { projects: [], threads: [] };
  const connector = new T3Connector({
    onStatus: () => {},
    onConfig: () => {},
    onShell: (shell) => {
      latestShell = shell;
    },
    onThread: () => {},
    onLog: () => {},
  });

  const titles = [
    "Global keyboard bridge and focus order",
    "Investigate an intentionally long thread title that must truncate without moving actions",
    "Finish the in-monorepo Lynxtron UI migration",
  ];

  try {
    const connected = await connector.connect();
    if (connected.status !== "ready") {
      throw new Error(`Connector did not become ready: ${connected.status}`);
    }
    const project = await waitFor(() => latestShell.projects[0], "canonical project shell");
    if (latestShell.threads.length !== 0) {
      throw new Error("Sidebar visual state must start from the empty visual snapshot.");
    }

    for (const title of titles) {
      const { threadId } = await connector.createThread({ projectId: project.id });
      await connector.renameThread({ threadId, title });
      await waitFor(
        () => latestShell.threads.find((thread) => thread.id === threadId)?.title === title,
        `renamed thread ${title}`,
      );
    }
  } finally {
    connector.dispose();
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
    if (previousBaseDir === undefined) {
      delete process.env.T3_LYNXTRON_BASE_DIR;
    } else {
      process.env.T3_LYNXTRON_BASE_DIR = previousBaseDir;
    }
    if (previousServerStdio === undefined) {
      delete process.env.T3_LYNXTRON_SERVER_STDIO;
    } else {
      process.env.T3_LYNXTRON_SERVER_STDIO = previousServerStdio;
    }
    process.chdir(previousCwd);
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
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
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
