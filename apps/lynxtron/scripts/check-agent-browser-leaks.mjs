#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
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

export function parseProcessParents(output) {
  return new Map(
    String(output)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        const match = line.match(/^(\d+)\s+(\d+)$/u);
        return match ? [[Number(match[1]), Number(match[2])]] : [];
      }),
  );
}

export function processDescendsFrom(processId, ancestorId, parents) {
  const visited = new Set();
  let current = processId;
  while (Number.isInteger(current) && current > 1 && !visited.has(current)) {
    if (current === ancestorId) return true;
    visited.add(current);
    current = parents.get(current);
  }
  return false;
}

export function classifyAgentBrowserProcesses(processes, parents, ownerProcessId) {
  const orphaned = processes.filter((entry) => entry.parentPid === 1);
  const owned = processes.filter(
    (entry) => entry.parentPid !== 1 && processDescendsFrom(entry.pid, ownerProcessId, parents),
  );
  const external = processes.filter((entry) => !orphaned.includes(entry) && !owned.includes(entry));
  return { orphaned, owned, external };
}

export function inspectProcesses() {
  const agentBrowserOutput = execFileSync("ps", ["-axo", "pid=,ppid=,comm=,command="], {
    encoding: "utf8",
  });
  const parentOutput = execFileSync("ps", ["-axo", "pid=,ppid="], { encoding: "utf8" });
  return {
    agentBrowsers: parseAgentBrowserProcesses(agentBrowserOutput),
    parents: parseProcessParents(parentOutput),
  };
}

function phaseFromArguments(argv) {
  const index = argv.indexOf("--phase");
  const phase = index >= 0 ? argv[index + 1] : "check";
  if (!["check", "preflight", "postflight"].includes(phase)) {
    throw new Error("--phase must be check, preflight, or postflight");
  }
  return phase;
}

function argumentValue(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function printEntries(label, entries) {
  for (const entry of entries) {
    console.error(
      `- ${label} pid=${entry.pid} ppid=${entry.parentPid} executable=${entry.executable} command=${entry.command}`,
    );
  }
}

function main() {
  const argv = process.argv.slice(2);
  const phase = phaseFromArguments(argv);
  const stateFile = path.resolve(
    argumentValue(argv, "--state-file") ??
      path.join("/tmp", `t3-lynxtron-agent-browser-${process.ppid}.json`),
  );
  const { agentBrowsers, parents } = inspectProcesses();
  const ownerProcessId =
    phase === "postflight" && existsSync(stateFile)
      ? JSON.parse(readFileSync(stateFile, "utf8")).ownerProcessId
      : process.ppid;
  const classified = classifyAgentBrowserProcesses(agentBrowsers, parents, ownerProcessId);

  if (phase === "preflight") {
    writeFileSync(
      stateFile,
      `${JSON.stringify({ ownerProcessId, observedProcessIds: agentBrowsers.map(({ pid }) => pid) })}\n`,
    );
  } else if (phase === "postflight") {
    rmSync(stateFile, { force: true });
  }

  if (classified.external.length > 0) {
    console.log(`INFO agent-browser ${phase} external-active count=${classified.external.length}`);
  }
  if (classified.orphaned.length === 0 && classified.owned.length === 0) {
    console.log(`PASS agent-browser ${phase} leak gate owned=0 orphaned=0`);
    return;
  }
  console.error(
    `FAIL agent-browser ${phase} leak gate owned=${classified.owned.length} orphaned=${classified.orphaned.length}`,
  );
  printEntries("owned", classified.owned);
  printEntries("orphaned", classified.orphaned);
  console.error("Observe and stop only a PID owned by this run; never kill by pattern.");
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
