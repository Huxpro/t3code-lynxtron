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

async function waitFor(read, label, attempts = 150) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const value = read();
    if (value) return value;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

/**
 * Seeds a deterministic populated-transcript state on top of a directory
 * produced by `visual:prepare`: one canonical thread whose prompt was
 * dispatched through the real connector, so messages, activities, and the
 * latest-turn lifecycle all come from the canonical server projections.
 */
export async function prepareTranscriptVisualState(baseDirectory, options = {}) {
  const promptCount = Math.max(1, options.promptCount ?? 1);
  const baseDir = resolve(baseDirectory);
  const manifestPath = join(baseDir, "visual-state.json");
  const databasePath = join(baseDir, "userdata", "state.sqlite");
  if (!existsSync(manifestPath) || !existsSync(databasePath)) {
    throw new Error("Transcript visual state requires a directory created by visual:prepare.");
  }

  const previousBaseDir = process.env.T3_LYNXTRON_BASE_DIR;
  const previousServerStdio = process.env.T3_LYNXTRON_SERVER_STDIO;
  const previousCwd = process.cwd();
  process.env.T3_LYNXTRON_BASE_DIR = baseDir;
  process.env.T3_LYNXTRON_SERVER_STDIO = "ignore";
  process.chdir(appRoot);

  const { T3Connector } = require(join(appRoot, "dist/desktop/connector.bundle.cjs"));
  let latestShell = { projects: [], threads: [] };
  const threadPayloads = new Map();
  const connector = new T3Connector({
    onStatus: () => {},
    onConfig: () => {},
    onShell: (shell) => {
      latestShell = shell;
    },
    onThread: (threadId, payload) => {
      threadPayloads.set(threadId, payload);
    },
    onLog: () => {},
  });

  const title = "Native list transcript baseline";
  const promptText = "Explain how the sidebar derives its thread status labels.";
  let fixture;

  try {
    const connected = await connector.connect();
    if (connected.status !== "ready") {
      throw new Error(`Connector did not become ready: ${connected.status}`);
    }
    const project = await waitFor(() => latestShell.projects[0], "canonical project shell");
    if (latestShell.threads.length !== 0) {
      throw new Error("Transcript visual state must start from the empty visual snapshot.");
    }

    const { threadId } = await connector.createThread({ projectId: project.id });
    await connector.renameThread({ threadId, title });
    connector.selectThread(threadId);
    // Earlier prompts are interrupted as soon as their user message persists:
    // they exist to give the transcript real scroll depth, while only the
    // final prompt is allowed to accumulate provider work.
    for (let index = 0; index < promptCount - 1; index += 1) {
      const before = threadPayloads.get(threadId)?.messages?.length ?? 0;
      await connector.sendPrompt({
        threadId,
        text: `${promptText} (context ${index + 1} of ${promptCount})`,
      });
      await waitFor(
        () => (threadPayloads.get(threadId)?.messages?.length ?? 0) > before,
        `persisted prompt message ${index + 1}`,
      );
      await connector.interrupt({ threadId });
      await new Promise((resolveWait) => setTimeout(resolveWait, 1_500));
    }
    const beforeFinal = threadPayloads.get(threadId)?.messages?.length ?? 0;
    await connector.sendPrompt({ threadId, text: promptText });
    await waitFor(
      () => (threadPayloads.get(threadId)?.messages?.length ?? 0) > beforeFinal,
      "persisted prompt message",
    );
    // Let the turn accumulate a little real work, then interrupt it so the
    // stored transcript settles deterministically ("You stopped after ..."):
    // an unbounded live turn can run for minutes against a real provider.
    await new Promise((resolveWait) => setTimeout(resolveWait, 8_000));
    await connector.interrupt({ threadId });
    let settled = false;
    for (let attempt = 0; attempt < 600; attempt += 1) {
      const payload = threadPayloads.get(threadId);
      const state = payload?.latestTurn?.state;
      if (state === "completed" || state === "error" || state === "interrupted") {
        settled = true;
        break;
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    const payload = threadPayloads.get(threadId);
    fixture = {
      threadId,
      title,
      promptText,
      messageCount: payload?.messages?.length ?? 0,
      activityCount: payload?.activities?.length ?? 0,
      latestTurnState: payload?.latestTurn?.state ?? null,
      settled,
    };
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

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const nextManifest = {
    ...manifest,
    snapshotId: sha256File(databasePath),
    route: "thread-transcript",
    threadCount: 1,
    transcriptFixture: fixture,
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
    throw new Error("--base-dir is required (a directory created by visual:prepare).");
  }
  const promptCountArgument = argumentValue("--prompt-count");
  const manifest = await prepareTranscriptVisualState(baseDir, {
    promptCount: promptCountArgument ? Number(promptCountArgument) : 1,
  });
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}
