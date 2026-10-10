import { ProviderInstanceId } from "@t3tools/contracts";
import { assert, describe, it } from "vite-plus/test";

import { shellSnapshot } from "../app/state/upstreamState.fixtures.ts";
import {
  confirmedModelSelectionThreadIds,
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
