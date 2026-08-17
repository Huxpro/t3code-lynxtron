/**
 * SB2 seed: build one isolated shared-server dataset for the dual-frontend
 * workbench.
 *
 * Both panes read the SAME server, so cross-pane state consistency is automatic
 * once the server points at a deterministic dataset. This script produces that
 * dataset in an isolated base dir, never touching live `~/.t3/userdata`
 * read-write.
 *
 * It uses `VACUUM INTO` per AGENTS.md test-data rules: safe even while a server
 * holds the source open, and yields one consistent file with no `-wal`/`-shm`
 * siblings to carry. The seeded DB lands at `<base-dir>/userdata/state.sqlite`,
 * which is where the server reads when launched with an explicit `--base-dir`
 * (see apps/server/src/config.ts deriveServerPaths: explicit base dir uses the
 * `userdata` state dir).
 *
 * Usage:
 *   node scripts/sb2-seed-shared-state.mjs \
 *     [--source ~/.t3-lynxtron/userdata/state.sqlite] \
 *     [--base-dir .t3-workbench] \
 *     [--output reports/sb2-seed.json]
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const lynxAppDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(lynxAppDir, "../..");

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}
function expandHome(p) {
  return p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p;
}

// Prefer the richest realistic thread-bearing source; fall back to the
// developer's real userdata. Both are opened READ-ONLY via VACUUM INTO.
const DEFAULT_SOURCES = [
  path.join(os.homedir(), ".t3-lynxtron/userdata/state.sqlite"),
  path.join(os.homedir(), ".t3/userdata/state.sqlite"),
];

const explicitSource = argValue("--source", null);
const source = explicitSource
  ? expandHome(explicitSource)
  : DEFAULT_SOURCES.find((candidate) => existsSync(candidate));
const baseDir = path.resolve(
  expandHome(argValue("--base-dir", path.join(lynxAppDir, ".t3-workbench"))),
);
const outputPath = path.resolve(argValue("--output", "reports/sb2-seed.json"));

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

/** Run a read-only VACUUM INTO through the current Node SQLite runtime. */
function vacuumInto(sourcePath, destPath) {
  const code = `
    const { DatabaseSync } = require("node:sqlite");
    const source = new DatabaseSync(${JSON.stringify(sourcePath)}, { readOnly: true });
    source.exec("VACUUM INTO '" + ${JSON.stringify(destPath)}.replaceAll("'", "''") + "'");
    source.close();
  `;
  const result = spawnSync(process.execPath, ["-e", code], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`VACUUM INTO failed: ${result.stderr || result.stdout || "unknown"}`);
  }
  if (!existsSync(destPath)) {
    throw new Error(`VACUUM INTO did not create ${destPath}`);
  }
}

/** Summarize the seeded dataset so both panes can assert the same records. */
function summarize(dbPath) {
  const code = `
    const db = new (require('bun:sqlite').Database)(${JSON.stringify(dbPath)}, { readonly: true });
    const projects = db.query('select project_id as id, title from projection_projects order by title').all();
    const threads = db.query(\`
      select
        t.thread_id as id,
        t.title,
        t.project_id as projectId,
        p.title as projectTitle,
        t.updated_at as updatedAt,
        s.status as sessionStatus,
        s.active_turn_id as activeTurnId,
        (
          select state
          from projection_turns latest_turn
          where latest_turn.thread_id = t.thread_id
          order by latest_turn.row_id desc
          limit 1
        ) as latestTurnState,
        count(m.message_id) as messageCount
      from projection_threads t
      join projection_projects p on p.project_id = t.project_id
      left join projection_thread_messages m on m.thread_id = t.thread_id
      left join projection_thread_sessions s on s.thread_id = t.thread_id
      where t.archived_at is null
      group by t.thread_id
      order by count(m.message_id) desc, t.updated_at desc, t.thread_id
    \`).all();
    const messages = db.query('select count(*) c from projection_thread_messages').get();
    const workingThread =
      threads.find((thread) => thread.sessionStatus === 'running') ?? null;
    const startingThread =
      threads.find((thread) => thread.sessionStatus === 'starting') ?? null;
    const completedThread =
      threads.find(
        (thread) => thread.latestTurnState === 'completed' && thread.messageCount > 0,
      ) ?? null;
    const failedThread =
      threads.find(
        (thread) => thread.latestTurnState === 'error' && thread.messageCount > 0,
      ) ?? null;
    const idleThread =
      threads.find((thread) => thread.sessionStatus !== 'running') ?? null;
    process.stdout.write(JSON.stringify({
      projects,
      threads,
      canonicalThread: threads[0] ?? null,
      workingThread,
      startingThread,
      completedThread,
      failedThread,
      idleThread,
      messageCount: messages.c,
    }));
  `;
  const result = spawnSync("bun", ["-e", code], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`summary failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}

async function main() {
  if (!source || !existsSync(source)) {
    throw new Error(
      `No seed source found. Checked: ${explicitSource ?? DEFAULT_SOURCES.join(", ")}. Pass --source <state.sqlite>.`,
    );
  }

  const stateDir = path.join(baseDir, "userdata");
  const dbPath = path.join(stateDir, "state.sqlite");

  await mkdir(stateDir, { recursive: true });
  // VACUUM INTO refuses to overwrite; clear any prior seed (and its siblings).
  for (const suffix of ["", "-wal", "-shm"]) {
    await rm(dbPath + suffix, { force: true });
  }

  console.log(`[sb2] seeding from ${source}`);
  console.log(`[sb2] into ${dbPath}`);
  vacuumInto(source, dbPath);

  const bytes = await readFile(dbPath);
  const summary = summarize(dbPath);

  const report = {
    task: "SB2",
    createdAt: new Date().toISOString(),
    source,
    baseDir,
    dbPath,
    snapshotSha256: sha256(bytes),
    sizeBytes: bytes.byteLength,
    dataset: summary,
    notes: [
      "Launch the shared server with --base-dir " + baseDir + " (reads userdata/state.sqlite).",
      "Both panes observe this exact dataset; assert projects/threads identity from `dataset`.",
      "Isolated: never point the server at ~/.t3/userdata; this snapshot is read-only-sourced.",
    ],
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(report, null, 2) + "\n");
  console.log(`[sb2] report -> ${path.relative(repoRoot, outputPath)}`);
  console.log(
    JSON.stringify(
      {
        snapshotSha256: report.snapshotSha256,
        projects: summary.projects.length,
        threads: summary.threads.length,
        messageCount: summary.messageCount,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
