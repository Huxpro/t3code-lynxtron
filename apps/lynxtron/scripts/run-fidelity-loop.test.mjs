import { describe, expect, it } from "vite-plus/test";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

import { exitCodeForChild, parseLoopArguments } from "./run-fidelity-loop.mjs";

const runnerPath = path.join(import.meta.dirname, "run-fidelity-loop.mjs");

describe("fidelity loop runner", () => {
  it("keeps the agent-browser leak policy visible in every loop", () => {
    const source = readFileSync(new URL("./run-fidelity-loop.mjs", import.meta.url), "utf8");
    expect(source).toContain(
      "agent-browser PPID=1, run-owned descendants, or detached processes carrying this loop ID fail; external live sessions are informational; never kill by pattern.",
    );
    expect(source).toContain("T3_LYNXTRON_FIDELITY_LOOP_ID: loopId");
    expect(source).toContain('runLeakGate("preflight", stateFile, loopId)');
    expect(source).toContain('runLeakGate("postflight", stateFile, loopId)');
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

  it.each([
    { name: "success", childExitCode: 0 },
    { name: "failure", childExitCode: 7 },
  ])("runs the agent-browser gate before and after a $name command", ({ childExitCode }) => {
    const stateFile = path.join(
      "/tmp",
      `t3-lynxtron-fidelity-loop-test-${process.pid}-${childExitCode}.json`,
    );
    const result = spawnSync(
      process.execPath,
      [
        runnerPath,
        "--state-file",
        stateFile,
        "--",
        process.execPath,
        "-e",
        `process.exit(${childExitCode})`,
      ],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(childExitCode);
    expect(result.stdout).toContain("PASS agent-browser preflight leak gate owned=0 orphaned=0");
    expect(result.stdout).toContain("PASS agent-browser postflight leak gate owned=0 orphaned=0");
    expect(existsSync(stateFile)).toBe(false);
  });

  it("fails when the command leaves a detached agent-browser process", () => {
    const suffix = `${process.pid}-${Date.now()}`;
    const stateFile = path.join("/tmp", `t3-lynxtron-fidelity-loop-test-${suffix}.json`);
    const processFile = path.join("/tmp", `t3-lynxtron-agent-browser-test-${suffix}.pid`);
    let leakedProcessId;
    try {
      const result = spawnSync(
        process.execPath,
        [
          runnerPath,
          "--state-file",
          stateFile,
          "--",
          process.execPath,
          "-e",
          `
            const { spawn } = require("node:child_process");
            const { writeFileSync } = require("node:fs");
            const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
              argv0: "agent-browser",
              detached: true,
              env: process.env,
              stdio: "ignore",
            });
            writeFileSync(${JSON.stringify(processFile)}, String(child.pid));
            child.unref();
          `,
        ],
        { encoding: "utf8" },
      );
      leakedProcessId = Number(readFileSync(processFile, "utf8"));
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("FAIL agent-browser postflight leak gate");
      expect(result.stderr).toContain(`pid=${leakedProcessId}`);
    } finally {
      if (Number.isInteger(leakedProcessId)) {
        try {
          process.kill(leakedProcessId, "SIGTERM");
        } catch {}
      }
      rmSync(stateFile, { force: true });
      rmSync(processFile, { force: true });
    }
  });
});
