#!/usr/bin/env node

// The long-transcript fixture: one thread with many short turns, so the
// transcript has more rows than the list keeps materialized. Each turn is a
// prompt the product sends and the scripted provider answers at once.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

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

export async function prepareLongTranscriptFixture(baseDirectory, options = {}) {
  const baseDir = path.resolve(baseDirectory);
  const manifestPath = path.join(baseDir, "visual-state.json");
  const databasePath = path.join(baseDir, "userdata", "statev2.sqlite");
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

  const title = `Long transcript ${turnCount} turns`;
  configureScriptedProvider(baseDir, { chunkDelayMs: 0 });
  const { threadId, state } = await seedThroughApp(baseDir, async (app) => {
    const createdThreadId = await app.createThread(title);
    let latest;
    for (let turn = 1; turn <= turnCount; turn += 1) {
      latest = await app.runTurn(
        createdThreadId,
        `Inspect transcript turn ${turn} and preserve its stable scroll position.`,
      );
      if (latest.latestTurn.state !== "completed") {
        throw new Error(`Turn ${turn} did not complete: ${JSON.stringify(latest.latestTurn)}`);
      }
    }
    return { threadId: createdThreadId, state: latest };
  });
  // Every turn is one user message and one reply, each a row of its own.
  const messageCount = turnCount * 2;
  if (state.messages.length !== messageCount) {
    throw new Error(`Expected ${messageCount} messages; the app shows ${state.messages.length}.`);
  }

  const fixture = {
    threadId,
    title,
    turnCount,
    messageCount,
    expectedTimelineRowCount: messageCount,
    modelSelection: SCRIPTED_MODEL_SELECTION,
    latestTurnState: state.latestTurn.state,
  };
  const nextManifest = {
    ...manifest,
    snapshotId: sha256File(databasePath),
    route: "thread-transcript",
    threadCount: 1,
    sidebarFixture: { titles: [title] },
    longTranscriptFixture: fixture,
    preparation: { kind: "product-long-transcript-turns", provider: "scripted" },
  };
  writeFileSync(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`);
  return nextManifest;
}

const baseDir = argumentValue("--base-dir");
if (!baseDir) {
  throw new Error("--base-dir is required (a directory created by visual:prepare).");
}
const turnCount = Number(argumentValue("--turn-count") ?? "120");
process.stdout.write(
  `${JSON.stringify(await prepareLongTranscriptFixture(baseDir, { turnCount }), null, 2)}\n`,
);
