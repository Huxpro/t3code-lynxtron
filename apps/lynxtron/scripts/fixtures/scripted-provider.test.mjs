import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import process from "node:process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  APPROVAL_COMMAND,
  APPROVAL_DONE_TEXT,
  REPLY_DONE_TEXT,
  SCRIPTED_MODEL_ID,
  SLOW_TICK_TEXT,
} from "./scripted-provider.mjs";

const script = fileURLToPath(new URL("./scripted-provider.mjs", import.meta.url));
const agents = [];

afterEach(() => {
  for (const agent of agents.splice(0)) agent.child.kill();
});

// Runs the agent and exposes its frames as an ordered inbox to await on.
function startAgent() {
  const child = spawn(process.execPath, [script, "agent", "stdio"], {
    env: { ...process.env, T3_SCRIPTED_PROVIDER_CHUNK_DELAY_MS: "1" },
    stdio: ["pipe", "pipe", "inherit"],
  });
  const inbox = [];
  const waiters = [];
  createInterface({ input: child.stdout }).on("line", (line) => {
    const frame = JSON.parse(line);
    const index = waiters.findIndex((waiter) => waiter.match(frame));
    if (index >= 0) waiters.splice(index, 1)[0].resolve(frame);
    else inbox.push(frame);
  });
  const agent = {
    child,
    send: (frame) => child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...frame })}\n`),
    next: (match) => {
      const index = inbox.findIndex(match);
      if (index >= 0) return Promise.resolve(inbox.splice(index, 1)[0]);
      return new Promise((resolve) => waiters.push({ match, resolve }));
    },
    reply: (id) => agent.next((frame) => frame.id === id && frame.method === undefined),
    chunk: (text) =>
      agent.next(
        (frame) =>
          frame.method === "session/update" &&
          frame.params.update.sessionUpdate === "agent_message_chunk" &&
          frame.params.update.content.text.includes(text),
      ),
  };
  agents.push(agent);
  return agent;
}

async function startSession(agent) {
  agent.send({ id: 1, method: "initialize", params: { protocolVersion: 1 } });
  const initialized = await agent.reply(1);
  agent.send({ id: 2, method: "authenticate", params: { methodId: "cached_token" } });
  await agent.reply(2);
  agent.send({ id: 3, method: "session/new", params: { cwd: "/", mcpServers: [] } });
  const created = await agent.reply(3);
  return { initialized: initialized.result, sessionId: created.result.sessionId };
}

const prompt = (sessionId, text) => ({
  id: 10,
  method: "session/prompt",
  params: { sessionId, prompt: [{ type: "text", text }] },
});

describe("scripted provider", () => {
  it("answers the driver's CLI probes", () => {
    const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
    expect(run("--version").stdout).toMatch(/\d+\.\d+\.\d+/u);
    expect(run("models").stdout).toContain("You are logged in");
    expect(run("models").stdout).toContain(`* ${SCRIPTED_MODEL_ID} (default)`);
    expect(JSON.parse(run("inspect", "--json").stdout)).toEqual({ skills: [] });
    expect(run("login").status).toBe(2);
  });

  it("advertises one model and accepts only that model", async () => {
    const agent = startAgent();
    const { initialized, sessionId } = await startSession(agent);
    expect(initialized._meta.modelState.availableModels.map((model) => model.modelId)).toEqual([
      SCRIPTED_MODEL_ID,
    ]);
    agent.send({ id: 4, method: "session/set_model", params: { sessionId, modelId: "other" } });
    expect((await agent.reply(4)).error.code).toBe(-32602);
    agent.send({ id: 5, method: "session/load", params: { sessionId } });
    expect((await agent.reply(5)).error.code).toBe(-32601);
  });

  it("streams a plain reply and ends the turn", async () => {
    const agent = startAgent();
    const { sessionId } = await startSession(agent);
    agent.send(prompt(sessionId, "hello"));
    await agent.chunk(REPLY_DONE_TEXT);
    expect((await agent.reply(10)).result).toEqual({ stopReason: "end_turn" });
  });

  it("waits for the approval decision before finishing", async () => {
    const agent = startAgent();
    const { sessionId } = await startSession(agent);
    agent.send(prompt(sessionId, "please [approval]"));
    const permission = await agent.next((frame) => frame.method === "session/request_permission");
    expect(permission.params.toolCall.rawInput.command).toBe(APPROVAL_COMMAND);
    agent.send({
      id: permission.id,
      result: { outcome: { outcome: "selected", optionId: "allow-once" } },
    });
    await agent.chunk(APPROVAL_DONE_TEXT);
    expect((await agent.reply(10)).result).toEqual({ stopReason: "end_turn" });
  });

  it("reports a declined approval without the done marker", async () => {
    const agent = startAgent();
    const { sessionId } = await startSession(agent);
    agent.send(prompt(sessionId, "[approval]"));
    const permission = await agent.next((frame) => frame.method === "session/request_permission");
    agent.send({
      id: permission.id,
      result: { outcome: { outcome: "selected", optionId: "reject-once" } },
    });
    await agent.chunk("declined");
    expect((await agent.reply(10)).result).toEqual({ stopReason: "end_turn" });
  });

  it("streams a slow turn until it is cancelled", async () => {
    const agent = startAgent();
    const { sessionId } = await startSession(agent);
    agent.send(prompt(sessionId, "[slow]"));
    await agent.chunk(`${SLOW_TICK_TEXT} 3`);
    agent.send({ method: "session/cancel", params: { sessionId } });
    expect((await agent.reply(10)).result).toEqual({ stopReason: "cancelled" });
  });

  it("ends a turn cancelled while its approval is pending", async () => {
    const agent = startAgent();
    const { sessionId } = await startSession(agent);
    agent.send(prompt(sessionId, "[approval]"));
    await agent.next((frame) => frame.method === "session/request_permission");
    agent.send({ method: "session/cancel", params: { sessionId } });
    expect((await agent.reply(10)).result).toEqual({ stopReason: "cancelled" });
  });

  it("exits when the server closes its input", async () => {
    const agent = startAgent();
    const { sessionId } = await startSession(agent);
    agent.send(prompt(sessionId, "[slow]"));
    await agent.chunk(`${SLOW_TICK_TEXT} 1`);
    agent.child.stdin.end();
    expect(await once(agent.child, "exit")).toEqual([0, null]);
  });
});
