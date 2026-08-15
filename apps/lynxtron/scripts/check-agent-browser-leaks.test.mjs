import { describe, expect, it } from "vite-plus/test";

import { parseAgentBrowserProcesses } from "./check-agent-browser-leaks.mjs";

describe("agent-browser leak gate", () => {
  it("detects CLI and package-path processes", () => {
    expect(
      parseAgentBrowserProcesses(`
        101 1 agent-browser open http://127.0.0.1
        102 1 node /Users/test/.agents/skills/agent-browser/bin/cli.js screenshot
        103 1 node /Users/test/.agent-browser/session/worker.js
        104 1 npx agent-browser screenshot
      `),
    ).toEqual([
      {
        pid: 101,
        parentPid: 1,
        command: "agent-browser open http://127.0.0.1",
      },
      {
        pid: 102,
        parentPid: 1,
        command: "node /Users/test/.agents/skills/agent-browser/bin/cli.js screenshot",
      },
      {
        pid: 103,
        parentPid: 1,
        command: "node /Users/test/.agent-browser/session/worker.js",
      },
      {
        pid: 104,
        parentPid: 1,
        command: "npx agent-browser screenshot",
      },
    ]);
  });

  it("does not match the leak checker, prose, or unrelated browsers", () => {
    expect(
      parseAgentBrowserProcesses(`
        201 1 node apps/lynxtron/scripts/check-agent-browser-leaks.mjs
        202 1 rg agent-browser
        203 1 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
      `),
    ).toEqual([]);
  });
});
