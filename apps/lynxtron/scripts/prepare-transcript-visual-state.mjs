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

/**
 * Seeds a deterministic populated-transcript state on top of a directory
 * produced by `visual:prepare`: one canonical thread whose prompt was
 * dispatched through the real connector, so messages, activities, and the
 * latest-turn lifecycle all come from the canonical server projections.
 */
export async function prepareTranscriptVisualState(baseDirectory, options = {}) {
  const promptCount = Math.max(1, options.promptCount ?? 1);
  const settleMode = options.settleMode ?? "interrupted";
  if (settleMode !== "interrupted" && settleMode !== "completed" && settleMode !== "failed") {
    throw new Error(`Unsupported transcript settle mode: ${settleMode}`);
  }
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
  const threadListeners = new Set();
  const connector = new T3Connector({
    onStatus: () => {},
    onConfig: () => {},
    onShell: (shell) => {
      latestShell = shell;
    },
    onThread: (threadId, payload) => {
      threadPayloads.set(threadId, payload);
      for (const listener of threadListeners) listener({ threadId, payload });
    },
    onLog: () => {},
  });

  const waitForThread = (threadId, predicate, label, timeoutMs = 300_000) =>
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

  const title = options.title ?? "Native list transcript baseline";
  const promptText =
    options.promptText ?? "Explain how the sidebar derives its thread status labels.";
  const expectedAssistantText = options.expectedAssistantText?.trim() || null;
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
    const modelSelection = options.modelSelection ?? project.defaultModelSelection ?? null;
    if (modelSelection) {
      await connector.setModelSelection({ selection: modelSelection });
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
    const settledPayloadPromise = waitForThread(
      threadId,
      (payload) => {
        const state = payload?.latestTurn?.state;
        if (settleMode === "failed" && payload?.sessionStatus === "error" && state === "error") {
          return payload;
        }
        if (payload?.sessionStatus === "error") {
          return { errorState: "session-error", payload };
        }
        if (settleMode === "completed") {
          return state === "completed" &&
            payload.messages.some(
              (message) => message.role === "assistant" && message.text.trim().length > 0,
            )
            ? payload
            : state === "error" || state === "interrupted"
              ? { errorState: state, payload }
              : null;
        }
        return state === "completed" || state === "error" || state === "interrupted"
          ? payload
          : null;
      },
      `${settleMode} transcript turn`,
      options.timeoutMs ?? 300_000,
    );
    const beforeFinal = threadPayloads.get(threadId)?.messages?.length ?? 0;
    await connector.sendPrompt({ threadId, text: promptText });
    await waitFor(
      () => (threadPayloads.get(threadId)?.messages?.length ?? 0) > beforeFinal,
      "persisted prompt message",
    );
    if (settleMode === "interrupted") {
      // Existing scroll-depth fixture behavior: allow bounded real work before
      // interrupting, then retain the resulting canonical projection.
      await new Promise((resolveWait) => setTimeout(resolveWait, 8_000));
      await connector.interrupt({ threadId });
    }
    const settledResult = await settledPayloadPromise;
    if (settledResult?.errorState) {
      throw new Error(`Transcript turn became ${settledResult.errorState} instead of completed.`);
    }
    const payload = settledResult;
    const assistantText =
      payload.messages
        .filter((message) => message.role === "assistant")
        .at(-1)
        ?.text.trim() ?? "";
    if (expectedAssistantText && assistantText !== expectedAssistantText) {
      throw new Error(
        `Transcript assistant response did not match the canonical fixture: ${JSON.stringify({
          expected: expectedAssistantText,
          actual: assistantText,
        })}`,
      );
    }
    const failureReason =
      settleMode === "failed"
        ? (new DatabaseSync(databasePath)
            .prepare(
              "SELECT last_error AS lastError FROM projection_thread_sessions WHERE thread_id = ?",
            )
            .get(threadId)?.lastError ?? null)
        : null;
    if (settleMode === "failed" && !failureReason) {
      throw new Error("Failed transcript fixture has no persisted session error.");
    }
    const persistedTitle =
      new DatabaseSync(databasePath)
        .prepare("SELECT title FROM projection_threads WHERE thread_id = ?")
        .get(threadId)?.title ?? null;
    if (typeof persistedTitle !== "string" || persistedTitle.trim().length === 0) {
      throw new Error("Transcript fixture has no persisted thread title.");
    }
    fixture = {
      threadId,
      title: persistedTitle,
      promptText,
      expectedAssistantText,
      assistantText,
      failureReason,
      settleMode,
      modelSelection,
      messageCount: payload?.messages?.length ?? 0,
      activityCount: payload?.activities?.length ?? 0,
      latestTurnState: payload?.latestTurn?.state ?? null,
      settled: true,
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
    sidebarFixture: {
      titles: [fixture.title],
    },
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
  const settleMode = argumentValue("--settle-mode") ?? "interrupted";
  const manifest = await prepareTranscriptVisualState(baseDir, {
    promptCount: promptCountArgument ? Number(promptCountArgument) : 1,
    settleMode,
    timeoutMs: Number(argumentValue("--timeout-ms") ?? "300000"),
    ...(argumentValue("--title") ? { title: argumentValue("--title") } : {}),
    ...(argumentValue("--prompt") ? { promptText: argumentValue("--prompt") } : {}),
    ...(argumentValue("--expect-assistant")
      ? { expectedAssistantText: argumentValue("--expect-assistant") }
      : {}),
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
}
