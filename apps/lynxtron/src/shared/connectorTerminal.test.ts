import { assert, describe, it } from "vite-plus/test";

import { terminal } from "../app/state/upstreamState.fixtures.ts";
import { projectTerminalSession, terminalSessionKey } from "./connectorTerminal.ts";

function session(wire: Parameters<typeof terminal>[0]) {
  const { summary, buffer } = terminal(wire);
  assert.ok(buffer);
  return projectTerminalSession({
    threadId: summary.threadId,
    terminalId: summary.terminalId,
    cwd: summary.cwd,
    buffer,
  });
}

describe("projectTerminalSession", () => {
  it("joins the snapshot's history and the output that followed it", () => {
    assert.deepEqual(
      session({ terminalId: "term-1", history: "$ ls\n", output: ["a.ts\n", "b.ts\n"] }),
      {
        threadId: "thread-1",
        terminalId: "term-1",
        cwd: "/work/project-1",
        status: "running",
        history: "$ ls\na.ts\nb.ts\n",
        error: null,
        updatedAt: "2026-10-09T00:00:00.000Z",
      },
    );
  });

  it("follows the terminal's lifecycle and keeps what it printed", () => {
    const exited = session({ terminalId: "term-1", history: "done\n", then: ["exited"] });
    assert.equal(exited.status, "exited");
    assert.equal(exited.history, "done\n");
    assert.equal(session({ terminalId: "term-1", history: "x", then: ["cleared"] }).history, "");
    assert.equal(session({ terminalId: "term-1", then: ["closed"] }).status, "closed");
  });
});

describe("terminalSessionKey", () => {
  it("keeps a terminal id apart from the same id in another thread", () => {
    assert.notEqual(
      terminalSessionKey("thread-1", "term-1"),
      terminalSessionKey("thread-2", "term-1"),
    );
    assert.notEqual(terminalSessionKey("a", "b-c"), terminalSessionKey("a-b", "c"));
  });
});
