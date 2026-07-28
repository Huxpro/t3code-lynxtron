import { describe, expect, it } from "vite-plus/test";

import { deriveSessionPresentationPhase, isLatestTurnSettled, isSessionBusy } from "./session.ts";

describe("shared session presentation", () => {
  it("maps orchestration lifecycle states to client phases", () => {
    expect(deriveSessionPresentationPhase(null)).toBe("disconnected");
    expect(deriveSessionPresentationPhase("error")).toBe("disconnected");
    expect(deriveSessionPresentationPhase("starting")).toBe("connecting");
    expect(deriveSessionPresentationPhase("running")).toBe("running");
    expect(deriveSessionPresentationPhase("ready")).toBe("ready");
  });

  it("treats starting and running sessions as busy", () => {
    expect(isSessionBusy("starting")).toBe(true);
    expect(isSessionBusy("running")).toBe(true);
    expect(isSessionBusy("ready")).toBe(false);
    expect(isSessionBusy(null)).toBe(false);
  });

  it("only settles a completed, started turn that is no longer running", () => {
    const completedTurn = {
      startedAt: "2026-07-27T10:00:00.000Z",
      completedAt: "2026-07-27T10:01:00.000Z",
    };
    expect(isLatestTurnSettled(completedTurn, null)).toBe(true);
    expect(isLatestTurnSettled(completedTurn, { status: "ready" })).toBe(true);
    expect(isLatestTurnSettled(completedTurn, { status: "running" })).toBe(false);
    expect(isLatestTurnSettled({ ...completedTurn, completedAt: null }, null)).toBe(false);
    expect(isLatestTurnSettled({ ...completedTurn, startedAt: null }, null)).toBe(false);
  });
});
