import { describe, expect, it, vi } from "vite-plus/test";

import { runMessageRevert, type MessageRevertStatus } from "./messageRevert";

describe("runMessageRevert", () => {
  it("reports pending and reverted around a confirmed command", async () => {
    const statuses: Array<MessageRevertStatus | null> = [];
    const revert = vi.fn(async () => undefined);

    await expect(
      runMessageRevert(
        async () => true,
        revert,
        (status) => statuses.push(status),
      ),
    ).resolves.toBe("reverted");
    expect(revert).toHaveBeenCalledOnce();
    expect(statuses).toEqual(["pending", "reverted"]);
  });

  it("returns to idle when confirmation is cancelled", async () => {
    const statuses: Array<MessageRevertStatus | null> = [];
    const revert = vi.fn(async () => undefined);

    await expect(
      runMessageRevert(
        async () => false,
        revert,
        (status) => statuses.push(status),
      ),
    ).resolves.toBeNull();
    expect(revert).not.toHaveBeenCalled();
    expect(statuses).toEqual(["pending", null]);
  });

  it("surfaces confirmation and command failures", async () => {
    for (const [confirm, revert] of [
      [async () => Promise.reject(new Error("dialog failed")), async () => undefined],
      [async () => true, async () => Promise.reject(new Error("revert failed"))],
    ] as const) {
      const statuses: Array<MessageRevertStatus | null> = [];
      await expect(
        runMessageRevert(confirm, revert, (status) => statuses.push(status)),
      ).resolves.toBe("failed");
      expect(statuses).toEqual(["pending", "failed"]);
    }
  });
});
