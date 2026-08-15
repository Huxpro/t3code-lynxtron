#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const leakCheckerPath = path.join(scriptDirectory, "check-agent-browser-leaks.mjs");

export function parseLoopArguments(argv, processId = process.pid) {
  const separatorIndex = argv.indexOf("--");
  if (separatorIndex < 0 || separatorIndex === argv.length - 1) {
    throw new Error("usage: run-fidelity-loop.mjs [--state-file <file>] -- <command> [args...]");
  }

  const wrapperArguments = argv.slice(0, separatorIndex);
  if (
    wrapperArguments.length !== 0 &&
    (wrapperArguments.length !== 2 ||
      wrapperArguments[0] !== "--state-file" ||
      !wrapperArguments[1])
  ) {
    throw new Error("only --state-file <file> is accepted before --");
  }

  return {
    stateFile: path.resolve(
      wrapperArguments.length === 2
        ? wrapperArguments[1]
        : path.join("/tmp", `t3-lynxtron-fidelity-loop-${processId}.json`),
    ),
    command: argv[separatorIndex + 1],
    commandArguments: argv.slice(separatorIndex + 2),
  };
}

export function exitCodeForChild(code, signal) {
  if (Number.isInteger(code)) return code;
  return signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 1;
}

function runLeakGate(phase, stateFile) {
  const result = spawnSync(
    process.execPath,
    [leakCheckerPath, "--phase", phase, "--state-file", stateFile],
    { stdio: "inherit" },
  );
  return exitCodeForChild(result.status, result.signal);
}

async function run() {
  const { stateFile, command, commandArguments } = parseLoopArguments(process.argv.slice(2));
  const preflightCode = runLeakGate("preflight", stateFile);
  if (preflightCode !== 0) {
    rmSync(stateFile, { force: true });
    return preflightCode;
  }

  let child;
  let forwardedSignal;
  const forwardSignal = (signal) => {
    forwardedSignal = signal;
    if (child && !child.killed) child.kill(signal);
  };
  const onSigint = () => forwardSignal("SIGINT");
  const onSigterm = () => forwardSignal("SIGTERM");
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);

  let commandCode = 1;
  try {
    commandCode = await new Promise((resolve) => {
      child = spawn(command, commandArguments, {
        cwd: process.cwd(),
        env: process.env,
        stdio: "inherit",
      });
      child.once("error", (error) => {
        console.error(`FAIL fidelity loop command could not start: ${error.message}`);
        resolve(1);
      });
      child.once("close", (code, signal) => {
        resolve(exitCodeForChild(code, signal ?? forwardedSignal));
      });
    });
  } finally {
    process.removeListener("SIGINT", onSigint);
    process.removeListener("SIGTERM", onSigterm);
  }

  const postflightCode = runLeakGate("postflight", stateFile);
  return postflightCode === 0 ? commandCode : postflightCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
