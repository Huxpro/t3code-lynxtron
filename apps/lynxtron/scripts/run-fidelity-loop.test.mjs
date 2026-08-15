import { describe, expect, it } from "vite-plus/test";
import { readFileSync } from "node:fs";

import { exitCodeForChild, parseLoopArguments } from "./run-fidelity-loop.mjs";

describe("fidelity loop runner", () => {
  it("keeps the agent-browser leak policy visible in every loop", () => {
    const source = readFileSync(new URL("./run-fidelity-loop.mjs", import.meta.url), "utf8");
    expect(source).toContain(
      "agent-browser PPID=1 or run-owned descendants fail; external live sessions are informational; never kill by pattern.",
    );
    expect(source).toContain('runLeakGate("preflight", stateFile)');
    expect(source).toContain('runLeakGate("postflight", stateFile)');
  });

  it("uses a run-owned default leak state file", () => {
    expect(parseLoopArguments(["--", "node", "verify.mjs"], 4242)).toEqual({
      stateFile: "/tmp/t3-lynxtron-fidelity-loop-4242.json",
      command: "node",
      commandArguments: ["verify.mjs"],
    });
  });

  it("accepts one explicit state file before the command separator", () => {
    expect(
      parseLoopArguments(["--state-file", "/tmp/review-loop.json", "--", "node", "verify.mjs"]),
    ).toEqual({
      stateFile: "/tmp/review-loop.json",
      command: "node",
      commandArguments: ["verify.mjs"],
    });
  });

  it("rejects missing commands and unsupported wrapper arguments", () => {
    expect(() => parseLoopArguments([])).toThrow("usage:");
    expect(() => parseLoopArguments(["--state-file", "/tmp/run.json", "--"])).toThrow("usage:");
    expect(() => parseLoopArguments(["--verbose", "--", "node"])).toThrow(
      "only --state-file <file> is accepted before --",
    );
  });

  it("preserves command failures and signal exit codes", () => {
    expect(exitCodeForChild(7)).toBe(7);
    expect(exitCodeForChild(null, "SIGINT")).toBe(130);
    expect(exitCodeForChild(null, "SIGTERM")).toBe(143);
    expect(exitCodeForChild(null, "SIGKILL")).toBe(1);
  });
});
