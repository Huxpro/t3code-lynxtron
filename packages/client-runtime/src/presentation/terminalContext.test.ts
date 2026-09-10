import { describe, expect, it } from "vite-plus/test";

import { appendTerminalContextsToPrompt, recentTerminalContext } from "./terminalContext.ts";

describe("terminal context presentation", () => {
  it("projects the most recent bounded terminal lines with canonical numbering", () => {
    const context = recentTerminalContext({
      terminalId: "terminal-1",
      terminalLabel: "Terminal 1",
      history: "one\r\ntwo\nthree\n",
      maxLines: 2,
    });
    expect(context).toEqual({
      id: "terminal-1:2:3",
      terminalId: "terminal-1",
      terminalLabel: "Terminal 1",
      lineStart: 2,
      lineEnd: 3,
      text: "two\nthree",
    });
    expect(appendTerminalContextsToPrompt("Inspect this", [context!])).toBe(
      "Inspect this\n\n<terminal_context>\n- Terminal 1 lines 2-3:\n  2 | two\n  3 | three\n</terminal_context>",
    );
  });

  it("rejects empty history and supports context-only prompts", () => {
    expect(
      recentTerminalContext({ terminalId: "terminal-1", terminalLabel: "Terminal 1", history: "" }),
    ).toBeNull();
    const context = recentTerminalContext({
      terminalId: "terminal-1",
      terminalLabel: "Terminal 1",
      history: "ready",
    });
    expect(appendTerminalContextsToPrompt("", [context!])).toBe(
      "<terminal_context>\n- Terminal 1 line 1:\n  1 | ready\n</terminal_context>",
    );
  });
});
