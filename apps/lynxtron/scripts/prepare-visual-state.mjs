import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const REPO_ROOT = resolve(APP_ROOT, "../..");
const DEFAULT_SERVER_BIN = resolve(REPO_ROOT, "apps/server/dist/bin.mjs");
const DEFAULT_ELECTRON_WINDOW = {
  x: 0,
  y: 0,
  width: 1440,
  height: 900,
};

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

export function assertEmptyOutputDirectory(output) {
  if (!existsSync(output)) {
    mkdirSync(output, { recursive: true });
    return;
  }
  if (readdirSync(output).length > 0) {
    throw new Error(`Visual-state output must be new or empty; refusing to overwrite ${output}`);
  }
}

export function readVisualSnapshotSummary(baseDir) {
  const databasePath = join(baseDir, "userdata", "state.sqlite");
  const database = new DatabaseSync(databasePath);
  try {
    database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    const projects = database
      .prepare(
        `SELECT
          project_id AS projectId,
          title,
          workspace_root AS workspaceRoot,
          default_model_selection_json AS defaultModelSelectionJson
        FROM projection_projects
        WHERE deleted_at IS NULL
        ORDER BY created_at ASC, project_id ASC`,
      )
      .all()
      .map((row) => ({
        projectId: row.projectId,
        title: row.title,
        workspaceRoot: row.workspaceRoot,
        defaultModelSelection:
          typeof row.defaultModelSelectionJson === "string"
            ? JSON.parse(row.defaultModelSelectionJson)
            : null,
      }));
    const threadCount = database
      .prepare("SELECT COUNT(*) AS count FROM projection_threads WHERE deleted_at IS NULL")
      .get().count;
    return {
      databasePath,
      projects,
      threadCount,
    };
  } finally {
    database.close();
  }
}

export function prepareVisualState({
  electronWindow = DEFAULT_ELECTRON_WINDOW,
  output,
  serverBin = DEFAULT_SERVER_BIN,
  title,
  workspaceRoot,
}) {
  assertEmptyOutputDirectory(output);
  if (!existsSync(serverBin)) {
    throw new Error(
      `Server CLI is missing at ${serverBin}. Build apps/server before preparing visual state.`,
    );
  }
  if (
    !Number.isInteger(electronWindow.width) ||
    !Number.isInteger(electronWindow.height) ||
    electronWindow.width < 840 ||
    electronWindow.height < 620
  ) {
    throw new Error("Electron capture window must be at least 840x620.");
  }

  const result = spawnSync(
    serverBin,
    [
      "project",
      "add",
      "--base-dir",
      output,
      "--title",
      title,
      workspaceRoot,
      "--log-level",
      "error",
    ],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
      env: process.env,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `Server CLI exited ${result.status}`);
  }

  const summary = readVisualSnapshotSummary(output);
  if (
    summary.projects.length !== 1 ||
    summary.projects[0].title !== title ||
    summary.projects[0].workspaceRoot !== workspaceRoot ||
    summary.threadCount !== 0
  ) {
    throw new Error(`Prepared state failed invariants: ${JSON.stringify(summary)}`);
  }

  const snapshotId = sha256File(summary.databasePath);
  const desktopSettingsPath = join(output, "userdata", "desktop-settings.json");
  writeFileSync(
    desktopSettingsPath,
    `${JSON.stringify(
      {
        mainWindowBounds: electronWindow,
      },
      null,
      2,
    )}\n`,
  );
  const manifest = {
    schemaVersion: 1,
    snapshotId,
    baseDir: output,
    route: "new-thread",
    theme: "dark",
    project: summary.projects[0],
    threadCount: summary.threadCount,
    electronWindow,
    preparation: {
      serverBin,
      command: ["project", "add", "--base-dir", "<output>", "--title", title, workspaceRoot],
    },
  };
  writeFileSync(join(output, "visual-state.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

const IS_MAIN_MODULE =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (IS_MAIN_MODULE) {
  const workspaceRoot = realpathSync(resolve(argumentValue("--workspace") ?? REPO_ROOT));
  const title = argumentValue("--title") ?? basename(workspaceRoot);
  const outputArgument = argumentValue("--output");
  const output = outputArgument
    ? resolve(outputArgument)
    : mkdtempSync(join(tmpdir(), "t3code-visual-state-"));
  const manifest = prepareVisualState({
    electronWindow: {
      x: 0,
      y: 0,
      width: Number(argumentValue("--electron-window-width") ?? DEFAULT_ELECTRON_WINDOW.width),
      height: Number(argumentValue("--electron-window-height") ?? DEFAULT_ELECTRON_WINDOW.height),
    },
    output,
    serverBin: resolve(argumentValue("--server-bin") ?? DEFAULT_SERVER_BIN),
    title,
    workspaceRoot,
  });
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}
