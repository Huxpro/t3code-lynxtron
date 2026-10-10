import { ProviderInstanceId } from "@t3tools/contracts";
import { assert, describe, it } from "vite-plus/test";

import { shellSnapshot } from "../app/state/upstreamState.fixtures.ts";
import {
  confirmedModelSelectionThreadIds,
  createDisposableThreadCleanup,
  disposableThreadIds,
  dropConfirmedModelSelections,
  withPendingModelSelection,
} from "./shellOverlays.ts";

const codex = ProviderInstanceId.make("codex");
const { threads } = shellSnapshot([
  { id: "thread-1", modelSelection: { instanceId: "codex", model: "gpt-5" } },
  { id: "thread-2", modelSelection: { instanceId: "codex", model: "gpt-5" } },
]);

describe("pending model selections", () => {
  it("shows the pending selection and returns other threads as they are", () => {
    const pending = new Map([["thread-1", { instanceId: codex, model: "gpt-5-mini" }]]);
    assert.equal(
      withPendingModelSelection(threads[0]!, pending).modelSelection.model,
      "gpt-5-mini",
    );
    assert.strictEqual(withPendingModelSelection(threads[1]!, pending), threads[1]);
  });

  it("is confirmed only by the selection that was asked for", () => {
    const pending = new Map([
      ["thread-1", { instanceId: codex, model: "gpt-5-mini" }],
      ["thread-2", { instanceId: codex, model: "gpt-5" }],
      ["thread-deleted", { instanceId: codex, model: "gpt-5" }],
    ]);
    assert.deepEqual(confirmedModelSelectionThreadIds(pending, threads), ["thread-2"]);
  });

  it("compares the selection's options as well as its model", () => {
    const withOptions = {
      instanceId: codex,
      model: "gpt-5",
      options: [{ id: "reasoning", value: "high" }],
    };
    const pending = new Map([["thread-1", withOptions]]);
    assert.deepEqual(confirmedModelSelectionThreadIds(pending, threads), []);
    assert.deepEqual(
      confirmedModelSelectionThreadIds(pending, [{ ...threads[0]!, modelSelection: withOptions }]),
      ["thread-1"],
    );
  });

  it("forgets a selection once the server reports it and keeps the rest", () => {
    const pending = new Map([
      ["thread-1", { instanceId: codex, model: "gpt-5-mini" }],
      ["thread-2", { instanceId: codex, model: "gpt-5" }],
    ]);
    dropConfirmedModelSelections(pending, threads);
    assert.deepEqual([...pending.keys()], ["thread-1"]);
    dropConfirmedModelSelections(pending, [
      { ...threads[0]!, modelSelection: { instanceId: codex, model: "gpt-5-mini" } },
    ]);
    assert.equal(pending.size, 0);
  });
});

describe("createDisposableThreadCleanup", () => {
  const empty = { id: "empty", title: "New thread", latestUserMessageAt: null };
  const kept = { id: "kept", title: "Plans" };
  const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  function harness(deleteThread: (threadId: string) => Promise<unknown>) {
    const deleted: Array<string> = [];
    let revealed = 0;
    const cleanup = createDisposableThreadCleanup({
      deleteThread: (threadId) => {
        deleted.push(threadId);
        return deleteThread(threadId);
      },
      onRevealed: () => {
        revealed += 1;
      },
    });
    return { cleanup, deleted, revealed: () => revealed };
  }

  it("hides an empty disposable thread at once and deletes it once", async () => {
    const { cleanup, deleted, revealed } = harness(() => Promise.resolve());
    const { threads } = shellSnapshot([kept, empty]);
    cleanup.observe(threads);
    assert.deepEqual([cleanup.isHidden("empty"), cleanup.isHidden("kept")], [true, false]);
    assert.deepEqual(deleted, []);
    await tick();
    cleanup.observe(threads);
    await tick();
    assert.deepEqual(deleted, ["empty"]);
    assert.isTrue(cleanup.isHidden("empty"));
    cleanup.observe(shellSnapshot([kept]).threads);
    assert.isFalse(cleanup.isHidden("empty"));
    assert.equal(revealed(), 0);
  });

  it("shows the thread again when the delete fails, and tries on the next shell change", async () => {
    let fail = true;
    const { cleanup, deleted, revealed } = harness(() =>
      fail ? Promise.reject(new Error("not connected")) : Promise.resolve(),
    );
    const { threads } = shellSnapshot([empty]);
    cleanup.observe(threads);
    await tick();
    assert.isFalse(cleanup.isHidden("empty"));
    assert.equal(revealed(), 1);
    fail = false;
    cleanup.observe(threads);
    await tick();
    assert.deepEqual(deleted, ["empty", "empty"]);
    assert.isTrue(cleanup.isHidden("empty"));
    assert.equal(revealed(), 1);
  });

  it("does not delete a thread that was written in before the delete was sent", async () => {
    const { cleanup, deleted, revealed } = harness(() => Promise.resolve());
    cleanup.observe(shellSnapshot([empty]).threads);
    cleanup.observe(
      shellSnapshot([{ ...empty, latestUserMessageAt: "2026-10-10T00:00:00.000Z" }]).threads,
    );
    await tick();
    assert.deepEqual(deleted, []);
    assert.isFalse(cleanup.isHidden("empty"));
    assert.equal(revealed(), 1);
  });

  it("says nothing about a failed delete of a thread that is already gone", async () => {
    const { cleanup, revealed } = harness(() => Promise.reject(new Error("thread not found")));
    cleanup.observe(shellSnapshot([empty]).threads);
    await Promise.resolve();
    cleanup.observe(shellSnapshot([]).threads);
    await tick();
    assert.equal(revealed(), 0);
  });
});

describe("disposableThreadIds", () => {
  it("names untouched threads still called New thread, and not archived ones", () => {
    const snapshot = shellSnapshot([
      { id: "written-in", title: "New thread" },
      { id: "empty", title: "New thread", latestUserMessageAt: null },
      { id: "renamed", title: "Plans", latestUserMessageAt: null },
      {
        id: "archived",
        title: "New thread",
        latestUserMessageAt: null,
        archivedAt: "2026-10-05T00:00:00.000Z",
      },
    ]);
    assert.deepEqual([...disposableThreadIds(snapshot.threads)], ["empty"]);
  });
});
