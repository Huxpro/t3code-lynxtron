import { describe, expect, it } from "vite-plus/test";

import { presentTerminalText } from "./terminalText";

describe("presentTerminalText", () => {
  it("removes common ANSI styling and carriage returns from PTY history", () => {
    expect(presentTerminalText("\u001b[32mready\u001b[0m\r\n$ ")).toBe("ready\n$ ");
  });

  it("removes terminal title sequences", () => {
    expect(presentTerminalText("\u001b]0;workspace\u0007$ pwd")).toBe("$ pwd");
  });
});
