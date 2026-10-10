#!/usr/bin/env node

// A provider CLI with no model behind it. It answers the three probes the
// server's Grok driver runs (`--version`, `models`, `inspect --json`) and speaks
// the Agent Client Protocol on `agent stdio`, so a real T3 server can run a
// whole turn against it: streamed text, a command approval, an interrupt.
//
// The turn is chosen by a marker in the prompt:
//   [approval]  stream, ask to run a command, wait for the decision, finish
//   [slow]      stream until `session/cancel`
//   otherwise   stream a short reply and finish
// Replies are short paragraphs, because the server's default delivers assistant
// text to clients a paragraph at a time: one long paragraph would not stream.
//
// Point a Grok provider instance's `binaryPath` at a launcher for this file.

import * as NodeFS from "node:fs";
import * as NodeProcess from "node:process";
import * as NodeReadline from "node:readline";
import * as NodeURL from "node:url";

export const SCRIPTED_MODEL_ID = "scripted-1";
export const SCRIPTED_MODEL_NAME = "Scripted 1";
export const APPROVAL_COMMAND = "printf scripted-approval";
export const APPROVAL_DONE_TEXT = "SCRIPTED_APPROVAL_DONE";
export const REPLY_DONE_TEXT = "SCRIPTED_REPLY_DONE";
export const SLOW_TICK_TEXT = "tick";
export const APPROVAL_PARAGRAPHS = [
  "Scripted reply one.",
  "Scripted reply two.",
  "Scripted reply three.",
  "Scripted reply four.",
  "Scripted reply five, then the command.",
];

const SESSION_ID = "scripted-session-1";
const TITLE_CLIENT_NAME = "t3-code-git-text";
const MODEL_STATE = {
  currentModelId: SCRIPTED_MODEL_ID,
  availableModels: [{ modelId: SCRIPTED_MODEL_ID, name: SCRIPTED_MODEL_NAME }],
};
const PERMISSION_OPTIONS = [
  { optionId: "allow-once", name: "Allow once", kind: "allow_once" },
  { optionId: "allow-always", name: "Allow always", kind: "allow_always" },
  { optionId: "reject-once", name: "Reject", kind: "reject_once" },
];
// A `[slow]` turn nobody cancels still ends, so an abandoned process cannot run forever.
const SLOW_TICK_LIMIT = 2400;

function runAgent({ input, output, chunkDelayMs }) {
  let nextRequestId = 1;
  let titleClient = false;
  let cancelActiveTurn = null;
  const pendingRequests = new Map();

  const write = (message) => output.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
  const update = (payload) =>
    write({ method: "session/update", params: { sessionId: SESSION_ID, update: payload } });
  const say = (text) =>
    update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text } });
  const request = (method, params) =>
    new Promise((resolve) => {
      const id = `scripted-${nextRequestId++}`;
      pendingRequests.set(id, resolve);
      write({ id, method, params });
    });

  async function runTurn(params) {
    const prompt = (params.prompt ?? [])
      .map((block) => (block?.type === "text" ? block.text : ""))
      .join("\n");
    let cancelled = false;
    let wake = null;
    cancelActiveTurn = () => {
      cancelled = true;
      wake?.();
    };
    const pause = () =>
      new Promise((resolve) => {
        const timer = setTimeout(resolve, chunkDelayMs);
        wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    const stream = async (words) => {
      for (const word of words) {
        if (cancelled) return;
        say(`${word} `);
        await pause();
      }
    };

    if (titleClient) {
      say(JSON.stringify({ title: "Scripted thread" }));
    } else if (prompt.includes("[slow]")) {
      for (let tick = 1; tick <= SLOW_TICK_LIMIT && !cancelled; tick += 1) {
        say(`${SLOW_TICK_TEXT} ${tick}\n\n`);
        await pause();
      }
    } else if (prompt.includes("[approval]")) {
      for (const paragraph of APPROVAL_PARAGRAPHS) {
        await stream(paragraph.split(" "));
        if (!cancelled) say("\n\n");
      }
      if (!cancelled) {
        const toolCallId = "scripted-tool-1";
        update({
          sessionUpdate: "tool_call",
          toolCallId,
          title: "Terminal",
          kind: "execute",
          status: "pending",
          rawInput: { command: APPROVAL_COMMAND },
        });
        const permission = await Promise.race([
          request("session/request_permission", {
            sessionId: SESSION_ID,
            toolCall: {
              toolCallId,
              title: `\`${APPROVAL_COMMAND}\``,
              kind: "execute",
              status: "pending",
              rawInput: { variant: "Bash", command: APPROVAL_COMMAND },
            },
            options: PERMISSION_OPTIONS,
          }),
          new Promise((resolve) => {
            wake = () => resolve(null);
            if (cancelled) resolve(null);
          }),
        ]);
        const outcome = permission?.outcome;
        const allowed = outcome?.outcome === "selected" && outcome.optionId.startsWith("allow");
        if (!cancelled && outcome?.outcome !== "cancelled") {
          update({
            sessionUpdate: "tool_call_update",
            toolCallId,
            status: allowed ? "completed" : "failed",
            ...(allowed
              ? { rawOutput: { exitCode: 0, stdout: "scripted-approval", stderr: "" } }
              : {}),
          });
          await stream(
            allowed
              ? ["The", "command", "ran.", APPROVAL_DONE_TEXT]
              : ["The", "command", "was", "declined."],
          );
        } else {
          cancelled = true;
        }
      }
    } else {
      await stream(["Scripted", "reply.", REPLY_DONE_TEXT]);
    }
    cancelActiveTurn = null;
    return { stopReason: cancelled ? "cancelled" : "end_turn" };
  }

  const handlers = {
    initialize: (params) => {
      titleClient = params?.clientInfo?.name === TITLE_CLIENT_NAME;
      return {
        protocolVersion: 1,
        agentInfo: { name: "scripted-provider", version: "1.0.0" },
        agentCapabilities: { loadSession: false },
        _meta: { modelState: MODEL_STATE },
      };
    },
    authenticate: () => ({}),
    "session/new": () => ({ sessionId: SESSION_ID, models: MODEL_STATE }),
    "session/set_model": (params) => {
      if (params?.modelId !== SCRIPTED_MODEL_ID) {
        throw Object.assign(new Error(`Unknown model ${params?.modelId}`), { code: -32602 });
      }
      return {};
    },
    "session/prompt": runTurn,
  };

  async function handle(message) {
    if (message.method === undefined) {
      const resolve = pendingRequests.get(message.id);
      pendingRequests.delete(message.id);
      resolve?.(message.error ? null : message.result);
      return;
    }
    if (message.id === undefined) {
      if (message.method === "session/cancel") cancelActiveTurn?.();
      return;
    }
    const handler = handlers[message.method];
    if (!handler) {
      write({
        id: message.id,
        error: { code: -32601, message: `Method not found: ${message.method}` },
      });
      return;
    }
    try {
      write({ id: message.id, result: await handler(message.params) });
    } catch (error) {
      write({
        id: message.id,
        error: { code: error.code ?? -32603, message: error.message },
      });
    }
  }

  const lines = NodeReadline.createInterface({ input, crlfDelay: Infinity });
  lines.on("line", (line) => {
    if (line.trim().length === 0) return;
    void handle(JSON.parse(line));
  });
  return new Promise((resolve) => lines.once("close", resolve));
}

async function main(args) {
  if (args.includes("--version")) {
    NodeProcess.stdout.write("scripted-provider 1.0.0\n");
  } else if (args[0] === "models") {
    NodeProcess.stdout.write(
      `You are logged in with scripted-provider.\nDefault model: ${SCRIPTED_MODEL_ID}\nAvailable models:\n  * ${SCRIPTED_MODEL_ID} (default)\n`,
    );
  } else if (args[0] === "inspect") {
    NodeProcess.stdout.write(`${JSON.stringify({ skills: [] })}\n`);
  } else if (args.includes("agent") && args.includes("stdio")) {
    await runAgent({
      input: NodeProcess.stdin,
      output: NodeProcess.stdout,
      chunkDelayMs: Number(NodeProcess.env.T3_SCRIPTED_PROVIDER_CHUNK_DELAY_MS ?? 250),
    });
    // The server closed stdin: the session is over, whatever turn was running.
    NodeProcess.exit(0);
  } else {
    NodeProcess.stderr.write(`scripted-provider: unsupported arguments ${JSON.stringify(args)}\n`);
    NodeProcess.exit(2);
  }
}

// The fixture reaches this file through a launcher, so compare real paths.
const isMainModule =
  typeof NodeProcess.argv[1] === "string" &&
  NodeFS.realpathSync(NodeProcess.argv[1]) === NodeURL.fileURLToPath(import.meta.url);
if (isMainModule) await main(NodeProcess.argv.slice(2));
