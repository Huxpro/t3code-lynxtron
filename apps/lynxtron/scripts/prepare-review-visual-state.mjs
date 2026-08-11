#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const appRoot = resolve(import.meta.dirname, "..");

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function waitForSignal(register, label, timeoutMs) {
  return new Promise((resolveWait, rejectWait) => {
    const timeout = setTimeout(() => {
      unregister();
      rejectWait(new Error(`Timed out waiting for ${label}`));
    }, timeoutMs);
    const unregister = register((value) => {
      clearTimeout(timeout);
      unregister();
      resolveWait(value);
    });
  });
}

export async function prepareReviewVisualState(baseDirectory, options = {}) {
  const baseDir = resolve(baseDirectory);
  const manifestPath = join(baseDir, "visual-state.json");
  const databasePath = join(baseDir, "userdata", "state.sqlite");
  if (!existsSync(manifestPath) || !existsSync(databasePath)) {
    throw new Error("Review visual state requires a directory created by visual:prepare.");
  }
  const visualManifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  const previousBaseDir = process.env.T3_LYNXTRON_BASE_DIR;
  const previousServerStdio = process.env.T3_LYNXTRON_SERVER_STDIO;
  const previousCwd = process.cwd();
  process.env.T3_LYNXTRON_BASE_DIR = baseDir;
  process.env.T3_LYNXTRON_SERVER_STDIO = "ignore";
  process.chdir(appRoot);

  const { T3Connector } = require(join(appRoot, "dist/desktop/connector.bundle.cjs"));
  let latestShell = { projects: [], threads: [] };
  const threadPayloads = new Map();
  const shellListeners = new Set();
  const threadListeners = new Set();
  const connector = new T3Connector({
    onStatus: () => {},
    onConfig: () => {},
    onShell: (shell) => {
      latestShell = shell;
      for (const listener of shellListeners) listener(shell);
    },
    onThread: (threadId, payload) => {
      threadPayloads.set(threadId, payload);
      for (const listener of threadListeners) listener({ threadId, payload });
    },
    onLog: (line) => process.stderr.write(`${line}\n`),
  });

  const onShell = (predicate, label, timeoutMs = 30_000) =>
    waitForSignal(
      (resolveSignal) => {
        const current = predicate(latestShell);
        if (current) {
          queueMicrotask(() => resolveSignal(current));
          return () => {};
        }
        const listener = (shell) => {
          const value = predicate(shell);
          if (value) resolveSignal(value);
        };
        shellListeners.add(listener);
        return () => shellListeners.delete(listener);
      },
      label,
      timeoutMs,
    );
  const onThread = (threadId, predicate, label, timeoutMs = 300_000) =>
    waitForSignal(
      (resolveSignal) => {
        const current = predicate(threadPayloads.get(threadId));
        if (current) {
          queueMicrotask(() => resolveSignal(current));
          return () => {};
        }
        const listener = (event) => {
          if (event.threadId !== threadId) return;
          const value = predicate(event.payload);
          if (value) resolveSignal(value);
        };
        threadListeners.add(listener);
        return () => threadListeners.delete(listener);
      },
      label,
      timeoutMs,
    );

  const title = options.title ?? "Review checkpoint baseline";
  const prompt =
    options.prompt ??
    "Modify review-fixture.txt so its entire contents are exactly `updated by T3 review fixture` followed by one newline. Do not modify any other file. Then stop.";
  let fixture;

  try {
    const connected = await connector.connect();
    if (connected.status !== "ready") {
      throw new Error(`Connector did not become ready: ${connected.status}`);
    }
    const project = await onShell(
      (shell) => shell.projects[0],
      "canonical project shell",
    );
    if (latestShell.threads.length !== 0) {
      throw new Error("Review visual state must start from an empty visual snapshot.");
    }
    const modelSelection =
      options.modelSelection ??
      visualManifest.project?.defaultModelSelection ??
      project.defaultModelSelection ??
      null;
    if (!modelSelection) {
      throw new Error("Review visual state requires a canonical project model selection.");
    }
    await connector.setModelSelection({ selection: modelSelection });

    const { threadId } = await connector.createThread({ projectId: project.id, title });
    await onShell(
      (shell) => shell.threads.find((thread) => thread.id === threadId),
      "created review thread",
    );
    const checkpointPromise = onThread(
      threadId,
      (payload) => {
        if (payload?.sessionStatus === "error") {
          return { kind: "error", payload };
        }
        const checkpoints =
          payload?.checkpoints
          ?.filter((candidate) => candidate.status === "ready" && candidate.files.length > 0)
          .sort((left, right) => right.checkpointTurnCount - left.checkpointTurnCount) ?? [];
        if (checkpoints[0]) {
          return { kind: "ready", payload, checkpoint: checkpoints[0] };
        }
        const latestTurnState = payload?.latestTurn?.state;
        const settled =
          latestTurnState === "completed" ||
          latestTurnState === "error" ||
          latestTurnState === "interrupted";
        const emptyCheckpoint = payload?.checkpoints
          ?.filter((candidate) => candidate.status === "ready")
          .sort((left, right) => right.checkpointTurnCount - left.checkpointTurnCount)[0];
        return settled && emptyCheckpoint
          ? { kind: "empty", payload, checkpoint: emptyCheckpoint }
          : null;
      },
      "settled checkpoint",
      options.timeoutMs ?? 300_000,
    );
    await connector.sendPrompt({ threadId, text: prompt });
    const outcome = await checkpointPromise;
    if (outcome.kind === "error") {
      throw new Error(
        `Provider session failed using ${modelSelection.instanceId}/${modelSelection.model}.`,
      );
    }
    if (outcome.kind === "empty") {
      const assistantText =
        outcome.payload.messages
          ?.filter((message) => message.role === "assistant")
          .at(-1)
          ?.text?.trim() ?? "";
      throw new Error(
        `Provider turn settled with an empty checkpoint using ${modelSelection.instanceId}/${modelSelection.model}: ${assistantText}`,
      );
    }
    const { payload, checkpoint } = outcome;
    fixture = {
      threadId,
      title,
      prompt,
      modelSelection,
      messageCount: payload.messages.length,
      latestTurnState: payload.latestTurn?.state ?? null,
      checkpoint,
    };
  } finally {
    connector.dispose();
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
    route: "review",
    threadCount: 1,
    reviewFixture: fixture,
  };
  writeFileSync(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`);
  return nextManifest;
}

const baseDir = argumentValue("--base-dir");
if (!baseDir) {
  throw new Error("--base-dir is required (a directory created by visual:prepare).");
}
const manifest = await prepareReviewVisualState(baseDir, {
  timeoutMs: Number(argumentValue("--timeout-ms") ?? "300000"),
  ...(argumentValue("--instance-id") && argumentValue("--model")
    ? {
        modelSelection: {
          instanceId: argumentValue("--instance-id"),
          model: argumentValue("--model"),
        },
      }
    : {}),
});
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
