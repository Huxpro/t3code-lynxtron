#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import process from "node:process";
import { pathToFileURL } from "node:url";

function isAgentBrowserProcess(executable, command) {
  const executableName = executable.split("/").at(-1) ?? executable;
  return (
    executableName.startsWith("agent-browser") ||
    /\/agent-browser\//u.test(executable) ||
    /^(?:npx|bunx)\s+agent-browser(?:\s|$)/u.test(command) ||
    /^pnpm\s+dlx\s+agent-browser(?:\s|$)/u.test(command) ||
    /^(?:\S*\/)?(?:node|bun)\s+\S*(?:\/agent-browser\/|\/\.agent-browser\/)\S*/u.test(command)
  );
}

export function parseAgentBrowserProcesses(output) {
  return String(output)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const match = line.match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/u);
      if (!match || !isAgentBrowserProcess(match[3], match[4])) return [];
      return [
        {
          pid: Number(match[1]),
          parentPid: Number(match[2]),
          executable: match[3],
          command: match[4],
        },
      ];
    });
}

export function inspectAgentBrowserProcesses() {
  return parseAgentBrowserProcesses(
    execFileSync("ps", ["-axo", "pid=,ppid=,comm=,command="], {
      encoding: "utf8",
    }),
  );
}

function phaseFromArguments(argv) {
  const index = argv.indexOf("--phase");
  const phase = index >= 0 ? argv[index + 1] : "check";
  if (!["check", "preflight", "postflight"].includes(phase)) {
    throw new Error("--phase must be check, preflight, or postflight");
  }
  return phase;
}

function main() {
  const phase = phaseFromArguments(process.argv.slice(2));
  const processes = inspectAgentBrowserProcesses();
  if (processes.length === 0) {
    console.log(`PASS agent-browser ${phase} leak gate count=0`);
    return;
  }
  console.error(`FAIL agent-browser ${phase} leak gate count=${processes.length}`);
  for (const entry of processes) {
    console.error(
      `- pid=${entry.pid} ppid=${entry.parentPid} executable=${entry.executable} command=${entry.command}`,
    );
  }
  console.error("Observe and stop only a PID owned by this run; never kill by pattern.");
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
