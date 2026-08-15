import { describe, expect, it } from "vite-plus/test";

import { parseAgentBrowserProcesses } from "./check-agent-browser-leaks.mjs";

describe("agent-browser leak gate", () => {
  it("detects CLI and package-path processes", () => {
    expect(
      parseAgentBrowserProcesses(`
        101 1 agent-browser agent-browser open http://127.0.0.1
        102 1 node node /Users/test/.agents/skills/agent-browser/bin/cli.js screenshot
        103 1 node node /Users/test/.agent-browser/session/worker.js
        104 1 npx npx agent-browser screenshot
        105 1 agent-browser-darwin-arm64 /opt/homebrew/lib/node_modules/agent-browser/bin/agent-browser-darwin-arm64
      `),
    ).toEqual([
      {
        pid: 101,
        parentPid: 1,
        executable: "agent-browser",
        command: "agent-browser open http://127.0.0.1",
      },
      {
        pid: 102,
        parentPid: 1,
        executable: "node",
        command: "node /Users/test/.agents/skills/agent-browser/bin/cli.js screenshot",
      },
      {
        pid: 103,
        parentPid: 1,
        executable: "node",
        command: "node /Users/test/.agent-browser/session/worker.js",
      },
      {
        pid: 104,
        parentPid: 1,
        executable: "npx",
        command: "npx agent-browser screenshot",
      },
      {
        pid: 105,
        parentPid: 1,
        executable: "agent-browser-darwin-arm64",
        command: "/opt/homebrew/lib/node_modules/agent-browser/bin/agent-browser-darwin-arm64",
      },
    ]);
  });

  it("does not match the leak checker, prose, or unrelated browsers", () => {
    expect(
      parseAgentBrowserProcesses(`
        201 1 node node apps/lynxtron/scripts/check-agent-browser-leaks.mjs
        202 1 rg rg agent-browser
        203 1 zsh /bin/zsh -lc find ~/.agent-browser -type f
        204 1 Google Chrome /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
      `),
    ).toEqual([]);
  });
});
