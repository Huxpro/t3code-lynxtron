#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { redactConnectorLog } from "./redact-connector-log.mjs";

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

export async function preparePendingRequestVisualState(baseDirectory, options) {
  const baseDir = resolve(baseDirectory);
  const manifestPath = join(baseDir, "visual-state.json");
  const databasePath = join(baseDir, "userdata", "state.sqlite");
  if (!existsSync(manifestPath) || !existsSync(databasePath)) {
    throw new Error("Pending-request state requires a directory created by visual:prepare.");
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
    onLog: (line) => process.stderr.write(`${redactConnectorLog(line)}\n`),
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
  const onThread = (threadId, predicate, label, timeoutMs = 180_000) =>
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

  const mode = options.mode;
  const activityKind = mode === "approval" ? "approval.requested" : "user-input.requested";
  const title =
    mode === "approval"
      ? "Pending command approval"
      : mode === "question-multi-step"
        ? "Pending multi-step question"
        : "Pending structured question";
  const prompt =
    mode === "approval"
      ? "Run `printf pending-approval` in the shell. Do not use any other tool and wait for my approval."
      : mode === "question-multi-step"
        ? "Before doing anything else, use the question tool once with exactly two questions. First ask which deployment mode to use with exactly two options: Safe and Fast, single-select. Second ask which surfaces to verify with exactly two options: Web and Native, multi-select. Wait for my answers."
        : "Before doing anything else, use the question tool to ask me which deployment mode to use. Offer exactly two options: Safe and Fast. Wait for my answer.";
  let fixture;

  try {
    const connected = await connector.connect();
    if (connected.status !== "ready") {
      throw new Error(`Connector did not become ready: ${connected.status}`);
    }
    const project = await onShell((shell) => shell.projects[0], "canonical project shell");
    if (latestShell.threads.length !== 0) {
      throw new Error("Pending-request state must start from an empty visual snapshot.");
    }
    const modelSelection = {
      instanceId: "opencode",
      model: "opencode/big-pickle",
    };
    await connector.setModelSelection({ selection: modelSelection });
    const { threadId } = await connector.createThread({ projectId: project.id, title });
    await onShell(
      (shell) => shell.threads.find((thread) => thread.id === threadId),
      "created pending-request thread",
    );
    connector.selectThread(threadId);
    if (mode === "approval") {
      await connector.setThreadRuntimeMode({
        threadId,
        runtimeMode: "approval-required",
      });
    }
    const pendingPromise = onThread(
      threadId,
      (payload) => {
        const activity = payload?.activities?.find((candidate) => candidate.kind === activityKind);
        return activity ? { payload, activity } : null;
      },
      activityKind,
      options.timeoutMs,
    );
    await connector.sendPrompt({ threadId, text: prompt });
    const { payload, activity } = await pendingPromise;
    if (mode === "question-multi-step") {
      const questions = activity.payload?.questions;
      if (
        !Array.isArray(questions) ||
        questions.length !== 2 ||
        questions[0]?.multiSelect === true ||
        questions[1]?.multiSelect !== true
      ) {
        throw new Error(
          `Provider did not produce the requested multi-step question fixture: ${JSON.stringify(
            questions,
          )}`,
        );
      }
    }
    fixture = {
      mode,
      threadId,
      title,
      prompt,
      modelSelection,
      activity,
      sessionStatus: payload.sessionStatus,
      activeTurnId: payload.activeTurnId ?? null,
    };
  } finally {
    connector.dispose();
    if (previousBaseDir === undefined) delete process.env.T3_LYNXTRON_BASE_DIR;
    else process.env.T3_LYNXTRON_BASE_DIR = previousBaseDir;
    if (previousServerStdio === undefined) delete process.env.T3_LYNXTRON_SERVER_STDIO;
    else process.env.T3_LYNXTRON_SERVER_STDIO = previousServerStdio;
    process.chdir(previousCwd);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const nextManifest = {
    ...manifest,
    snapshotId: sha256File(databasePath),
    route: `pending-${mode}`,
    threadCount: 1,
    pendingRequestFixture: fixture,
  };
  writeFileSync(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`);
  return nextManifest;
}

const baseDir = argumentValue("--base-dir");
const mode = argumentValue("--mode");
if (!baseDir || (mode !== "approval" && mode !== "question" && mode !== "question-multi-step")) {
  throw new Error(
    "Usage: prepare-pending-request-visual-state.mjs --base-dir <visual-state-dir> --mode <approval|question|question-multi-step>",
  );
}
const manifest = await preparePendingRequestVisualState(baseDir, {
  mode,
  timeoutMs: Number(argumentValue("--timeout-ms") ?? "180000"),
});
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
