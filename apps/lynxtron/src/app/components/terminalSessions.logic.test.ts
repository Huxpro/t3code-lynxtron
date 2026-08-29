import { describe, expect, it } from "vite-plus/test";

import {
  activateTerminalSession,
  addTerminalSession,
  initialTerminalSessionSelection,
  removeTerminalSession,
} from "./terminalSessions.logic";

describe("terminal session selection", () => {
  it("creates and activates a distinct terminal", () => {
    expect(addTerminalSession(initialTerminalSessionSelection())).toEqual({
      activeId: "term-2",
      ids: ["term-1", "term-2"],
      nextOrdinal: 3,
    });
  });

  it("switches only to a terminal that exists", () => {
    const selection = addTerminalSession(initialTerminalSessionSelection());
    expect(activateTerminalSession(selection, "term-1").activeId).toBe("term-1");
    expect(activateTerminalSession(selection, "missing")).toBe(selection);
  });

  it("selects the right neighbor, then the left neighbor, when closing active sessions", () => {
    const three = addTerminalSession(addTerminalSession(initialTerminalSessionSelection()));
    const middle = activateTerminalSession(three, "term-2");
    const withoutMiddle = removeTerminalSession(middle, "term-2");
    expect(withoutMiddle).toMatchObject({ activeId: "term-3", ids: ["term-1", "term-3"] });
    expect(removeTerminalSession(withoutMiddle, "term-3")).toMatchObject({
      activeId: "term-1",
      ids: ["term-1"],
    });
  });

  it("keeps one valid session and never reuses allocated ids", () => {
    const two = addTerminalSession(initialTerminalSessionSelection());
    const one = removeTerminalSession(two, "term-2");
    expect(removeTerminalSession(one, "term-1")).toBe(one);
    expect(addTerminalSession(one)).toMatchObject({
      activeId: "term-3",
      ids: ["term-1", "term-3"],
      nextOrdinal: 4,
    });
  });
});
