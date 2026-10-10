import { describe, expect, it } from "vite-plus/test";

import {
  enqueueSerialMutation,
  markPendingMutationAccepted,
  reconcilePendingMutation,
  rejectPendingMutation,
  setLatestPendingMutation,
  type LatestPendingMutation,
} from "./latestPendingMutation";

describe("latest pending mutation", () => {
  it("restores the canonical fallback when the only mutation fails", () => {
    const pending = new Map<string, LatestPendingMutation<string>>();
    const mutation = setLatestPendingMutation(pending, "thread-1", "plan", "default");

    expect(rejectPendingMutation(pending, "thread-1", mutation)).toEqual({
      changed: true,
      value: "default",
    });
    expect(pending.has("thread-1")).toBe(false);
  });

  it("does not disturb a newer mutation when an older request fails", () => {
    const pending = new Map<string, LatestPendingMutation<string>>();
    const older = setLatestPendingMutation(pending, "thread-1", "plan", "default");
    const newer = setLatestPendingMutation(pending, "thread-1", "default", "plan");

    expect(rejectPendingMutation(pending, "thread-1", older)).toEqual({ changed: false });
    expect(pending.get("thread-1")).toBe(newer);
    expect(pending.get("thread-1")?.value).toBe("default");
  });

  it("falls back to canonical state when every queued mutation fails out of order", () => {
    const pending = new Map<string, LatestPendingMutation<string>>();
    const older = setLatestPendingMutation(pending, "thread-1", "plan", "default");
    const newer = setLatestPendingMutation(pending, "thread-1", "default", "plan");

    expect(rejectPendingMutation(pending, "thread-1", older)).toEqual({ changed: false });
    expect(rejectPendingMutation(pending, "thread-1", newer)).toEqual({
      changed: true,
      value: "default",
    });
    expect(pending.has("thread-1")).toBe(false);
  });

  it("keeps newer intent after an older mutation is confirmed", () => {
    const pending = new Map<string, LatestPendingMutation<string>>();
    const older = setLatestPendingMutation(pending, "thread-1", "plan", "default");
    const newer = setLatestPendingMutation(pending, "thread-1", "default", "plan");

    markPendingMutationAccepted(older);
    reconcilePendingMutation(pending, "thread-1", "plan");

    expect(pending.get("thread-1")).toBe(newer);
    expect(newer.previous).toBeUndefined();
    expect(newer.fallback).toBe("plan");
    expect(rejectPendingMutation(pending, "thread-1", newer)).toEqual({
      changed: true,
      value: "plan",
    });
    expect(pending.has("thread-1")).toBe(false);
  });

  it("clears the chain when the latest accepted mutation reaches canonical state", () => {
    const pending = new Map<string, LatestPendingMutation<string>>();
    setLatestPendingMutation(pending, "thread-1", "plan", "default");
    const latest = setLatestPendingMutation(pending, "thread-1", "default", "plan");

    markPendingMutationAccepted(latest);
    reconcilePendingMutation(pending, "thread-1", "default");

    expect(pending.has("thread-1")).toBe(false);
  });

  it("does not mistake a stale canonical value for an unaccepted latest mutation", () => {
    const pending = new Map<string, LatestPendingMutation<string>>();
    setLatestPendingMutation(pending, "thread-1", "plan", "default");
    const latest = setLatestPendingMutation(pending, "thread-1", "default", "plan");

    reconcilePendingMutation(pending, "thread-1", "default");
    expect(pending.get("thread-1")).toBe(latest);
  });

  it("serializes mutations per key and continues after a rejected predecessor", async () => {
    const queues = new Map<string, Promise<unknown>>();
    const order: string[] = [];
    let releaseFirst: (() => void) | undefined;
    let markFirstStarted: (() => void) | undefined;
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    const first = enqueueSerialMutation(queues, "thread-1", async () => {
      order.push("first:start");
      markFirstStarted?.();
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      order.push("first:end");
      throw new Error("first failed");
    });
    const second = enqueueSerialMutation(queues, "thread-1", async () => {
      order.push("second");
    });
    await Promise.race([
      firstStarted,
      first.then(
        () => {
          throw new Error("first mutation completed before its start signal");
        },
        () => {
          throw new Error("first mutation failed before its start signal");
        },
      ),
    ]);
    expect(order).toEqual(["first:start"]);

    releaseFirst?.();
    await expect(first).rejects.toThrow("first failed");
    await second;

    expect(order).toEqual(["first:start", "first:end", "second"]);
    expect(queues.has("thread-1")).toBe(false);
  });

  it("does not serialize mutations across different keys", async () => {
    const queues = new Map<string, Promise<unknown>>();
    const order: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const first = enqueueSerialMutation(queues, "thread-1", async () => {
      order.push("first:start");
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
    });
    const other = enqueueSerialMutation(queues, "thread-2", async () => {
      order.push("other");
    });
    await other;

    expect(order).toEqual(["first:start", "other"]);
    releaseFirst?.();
    await first;
  });
});
