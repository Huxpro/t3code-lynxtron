import { describe, expect, it, vi } from "vite-plus/test";
import type { AtomCommandResult } from "./runtime.ts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/unstable/reactivity";

import { FileSaveCoordinator, type FileSaveScheduler } from "./fileSaveCoordinator.ts";

class TestScheduler implements FileSaveScheduler {
  private time = 0;
  private nextId = 1;
  private readonly tasks = new Map<
    number,
    { readonly at: number; readonly callback: () => void }
  >();

  readonly now = () => this.time;

  readonly schedule = (callback: () => void, delayMs: number): number => {
    const id = this.nextId;
    this.nextId += 1;
    this.tasks.set(id, { at: this.time + delayMs, callback });
    return id;
  };

  readonly cancel = (handle: unknown): void => {
    if (typeof handle === "number") this.tasks.delete(handle);
  };

  async advanceBy(delayMs: number): Promise<void> {
    const target = this.time + delayMs;
    while (true) {
      const next = [...this.tasks.entries()]
        .filter(([, task]) => task.at <= target)
        .toSorted((left, right) => left[1].at - right[1].at)[0];
      if (!next) break;
      this.time = next[1].at;
      this.tasks.delete(next[0]);
      next[1].callback();
      await Promise.resolve();
    }
    this.time = target;
    await Promise.resolve();
  }

  async runAll(): Promise<void> {
    while (this.tasks.size > 0) {
      const nextAt = Math.min(...[...this.tasks.values()].map((task) => task.at));
      await this.advanceBy(nextAt - this.time);
    }
  }
}

function deferred() {
  let resolve!: (result: AtomCommandResult<void, never>) => void;
  const promise = new Promise<AtomCommandResult<void, never>>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("FileSaveCoordinator", () => {
  it("debounces edits and persists only the latest contents", async () => {
    const scheduler = new TestScheduler();
    const persist = vi
      .fn<(contents: string) => Promise<AtomCommandResult<void, never>>>()
      .mockResolvedValue(AsyncResult.success(undefined));
    const onPendingChange = vi.fn();
    const onConfirmed = vi.fn();
    const coordinator = new FileSaveCoordinator({
      debounceMs: 500,
      scheduler,
      persist,
      onPendingChange,
      onConfirmed,
    });

    coordinator.change("first");
    await scheduler.advanceBy(300);
    coordinator.change("latest");
    await scheduler.advanceBy(499);
    expect(persist).not.toHaveBeenCalled();

    await scheduler.advanceBy(1);
    expect(persist).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledWith("latest");
    expect(onConfirmed).toHaveBeenCalledWith("latest");
    expect(onPendingChange.mock.calls).toEqual([[true], [true], [false]]);
  });

  it("keeps pending state until an edit made during a write is also saved", async () => {
    const scheduler = new TestScheduler();
    const firstWrite = deferred();
    const persist = vi
      .fn<(contents: string) => Promise<AtomCommandResult<void, never>>>()
      .mockReturnValueOnce(firstWrite.promise)
      .mockResolvedValueOnce(AsyncResult.success(undefined));
    const onPendingChange = vi.fn();
    const coordinator = new FileSaveCoordinator({
      debounceMs: 500,
      scheduler,
      persist,
      onPendingChange,
      onConfirmed: vi.fn(),
    });

    coordinator.change("first");
    await scheduler.advanceBy(500);
    coordinator.change("latest");
    await scheduler.advanceBy(500);
    expect(persist).toHaveBeenCalledTimes(1);

    firstWrite.resolve(AsyncResult.success(undefined));
    await Promise.resolve();
    await scheduler.runAll();
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenLastCalledWith("latest");
    expect(onPendingChange.mock.calls.at(-1)).toEqual([false]);
  });

  it("leaves the file pending when the latest write fails", async () => {
    const scheduler = new TestScheduler();
    const onPendingChange = vi.fn();
    const onFailure = vi.fn();
    const coordinator = new FileSaveCoordinator({
      debounceMs: 500,
      scheduler,
      persist: vi
        .fn()
        .mockResolvedValue(AsyncResult.failure(Cause.fail(new Error("write failed")))),
      onPendingChange,
      onConfirmed: vi.fn(),
      onFailure,
    });

    coordinator.change("latest");
    await scheduler.advanceBy(500);
    await Promise.resolve();
    expect(onPendingChange).toHaveBeenCalledWith(true);
    expect(onPendingChange).not.toHaveBeenCalledWith(false);
    expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({ _tag: "Result" }), "latest");
  });

  it("reports rejected writes and allows the same revision to be retried", async () => {
    const scheduler = new TestScheduler();
    const persist = vi
      .fn()
      .mockRejectedValueOnce(new Error("disk unavailable"))
      .mockResolvedValueOnce(AsyncResult.success(undefined));
    const onPendingChange = vi.fn();
    const onConfirmed = vi.fn();
    const onFailure = vi.fn();
    const coordinator = new FileSaveCoordinator({
      debounceMs: 500,
      scheduler,
      persist,
      onPendingChange,
      onConfirmed,
      onFailure,
    });

    coordinator.change("retry me");
    await scheduler.advanceBy(500);
    expect(onFailure).toHaveBeenCalledWith(
      {
        _tag: "Exception",
        error: expect.objectContaining({ message: "disk unavailable" }),
      },
      "retry me",
    );

    await coordinator.flush();
    expect(persist).toHaveBeenCalledTimes(2);
    expect(onConfirmed).toHaveBeenCalledWith("retry me");
    expect(onPendingChange.mock.calls.at(-1)).toEqual([false]);
  });

  it("does not write an already confirmed revision again when disposed", async () => {
    const scheduler = new TestScheduler();
    const persist = vi.fn().mockResolvedValue(AsyncResult.success(undefined));
    const coordinator = new FileSaveCoordinator({
      debounceMs: 500,
      scheduler,
      persist,
      onPendingChange: vi.fn(),
      onConfirmed: vi.fn(),
    });

    coordinator.change("confirmed");
    await scheduler.advanceBy(500);
    coordinator.dispose();
    await Promise.resolve();

    expect(persist).toHaveBeenCalledOnce();
  });

  it("flushes the latest revision before the debounce expires", async () => {
    const scheduler = new TestScheduler();
    const persist = vi.fn().mockResolvedValue(AsyncResult.success(undefined));
    const coordinator = new FileSaveCoordinator({
      debounceMs: 500,
      scheduler,
      persist,
      onPendingChange: vi.fn(),
      onConfirmed: vi.fn(),
    });

    coordinator.change("save now");
    await coordinator.flush();
    await scheduler.runAll();

    expect(persist).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledWith("save now");
  });
});
