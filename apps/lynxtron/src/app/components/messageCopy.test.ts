import { describe, expect, it, vi } from "vite-plus/test";

import { runMessageCopy } from "./messageCopy";

describe("runMessageCopy", () => {
  it("reports pending then copied after a successful write", async () => {
    const statuses: string[] = [];
    const writeText = vi.fn(async () => undefined);

    await expect(
      runMessageCopy(writeText, "message", (status) => statuses.push(status)),
    ).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith("message");
    expect(statuses).toEqual(["pending", "copied"]);
  });

  it("reports a visible failure state without leaking the rejection", async () => {
    const statuses: string[] = [];
    const writeText = vi.fn(async () => Promise.reject(new Error("clipboard unavailable")));

    await expect(
      runMessageCopy(writeText, "message", (status) => statuses.push(status)),
    ).resolves.toBe("failed");
    expect(statuses).toEqual(["pending", "failed"]);
  });
});
