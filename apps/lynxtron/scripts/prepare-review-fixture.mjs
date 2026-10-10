#!/usr/bin/env node

// The review fixture: one thread whose only turn changed `review-fixture.txt`
// in the project's own Git workspace, so the server took a checkpoint and can
// show the turn's diff. The turn is run by the product against the scripted
// provider; the workspace is left as the agent left it.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

import {
  configureScriptedProvider,
  SCRIPTED_MODEL_SELECTION,
  seedThroughApp,
} from "./product-seeding.mjs";

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function runGit(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

const EDITS = [
  {
    path: "review-fixture.txt",
    before: "original review fixture\n",
    after: "updated by T3 review fixture",
  },
  {
    path: "review-secondary.ts",
    before: "export const reviewState = 'before';\n",
    after: "export const reviewState = 'after';",
  },
];

export async function prepareReviewFixture(baseDirectory, options = {}) {
  const baseDir = path.resolve(baseDirectory);
  const manifestPath = path.join(baseDir, "visual-state.json");
  const databasePath = path.join(baseDir, "userdata", "statev2.sqlite");
  if (!existsSync(manifestPath) || !existsSync(databasePath)) {
    throw new Error("Review fixture requires a directory created by visual:prepare.");
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.threadCount !== 0 || manifest.route !== "new-thread") {
    throw new Error("Review fixture refuses a non-empty visual state.");
  }
  const workspaceRoot = realpathSync(manifest.project?.workspaceRoot ?? "");
  // The turn edits files and the server writes checkpoint refs, so the
  // workspace must be a repository of its own, not a directory inside one.
  if (realpathSync(runGit(workspaceRoot, ["rev-parse", "--show-toplevel"])) !== workspaceRoot) {
    throw new Error("Review fixture requires a workspace that is its own Git repository.");
  }
  const edits = options.multiFile === true ? EDITS : EDITS.slice(0, 1);
  for (const edit of edits) {
    const file = path.join(workspaceRoot, edit.path);
    if (!existsSync(file) || readFileSync(file, "utf8") !== edit.before) {
      throw new Error(`Review fixture requires the canonical original ${edit.path}.`);
    }
  }
  if (runGit(workspaceRoot, ["status", "--porcelain"]) !== "") {
    throw new Error("Review fixture requires a clean workspace.");
  }

  const title = "Review checkpoint baseline";
  const prompt = [
    `Update ${edits.map((edit) => edit.path).join(" and ")}.`,
    ...edits.map((edit) => `[edit ${edit.path}=${edit.after}]`),
  ].join(" ");
  configureScriptedProvider(baseDir, { chunkDelayMs: 0 });
  const seeded = await seedThroughApp(baseDir, async (app) => {
    const threadId = await app.createThread(title);
    const turn = await app.runTurn(threadId, prompt);
    // The checkpoint is taken after the turn ends.
    const state = await app.waitForState(
      (current) =>
        current.checkpoints.some(
          (checkpoint) =>
            checkpoint.turnId === turn.latestTurn.turnId && checkpoint.status === "ready",
        ),
      "the turn's checkpoint",
    );
    return { threadId, state };
  });

  const { threadId, state } = seeded;
  const checkpoint = state.checkpoints.find(
    (candidate) => candidate.turnId === state.latestTurn.turnId,
  );
  const changedPaths = checkpoint.files.map((file) => file.path).toSorted();
  if (
    state.latestTurn.state !== "completed" ||
    state.activeThread?.title !== title ||
    JSON.stringify(changedPaths) !== JSON.stringify(edits.map((edit) => edit.path).toSorted()) ||
    edits.some(
      (edit) => readFileSync(path.join(workspaceRoot, edit.path), "utf8") !== `${edit.after}\n`,
    )
  ) {
    throw new Error(
      `The review turn did not leave the expected checkpoint: ${JSON.stringify({
        latestTurn: state.latestTurn,
        title: state.activeThread?.title,
        checkpoint,
      })}`,
    );
  }

  const reviewFixture = {
    threadId,
    title,
    prompt,
    modelSelection: SCRIPTED_MODEL_SELECTION,
    messageCount: state.messages.length,
    latestTurnState: state.latestTurn.state,
    checkpoint,
  };
  const nextManifest = {
    ...manifest,
    snapshotId: sha256File(databasePath),
    route: "review",
    threadCount: 1,
    reviewFixture,
    preparation: {
      kind: options.multiFile === true ? "product-multi-file-review-turn" : "product-review-turn",
      provider: "scripted",
    },
  };
  writeFileSync(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`);
  return nextManifest;
}

const baseDir = argumentValue("--base-dir");
if (!baseDir) {
  throw new Error("--base-dir is required (a directory created by visual:prepare).");
}
process.stdout.write(
  `${JSON.stringify(
    await prepareReviewFixture(baseDir, { multiFile: process.argv.includes("--multi-file") }),
    null,
    2,
  )}\n`,
);
