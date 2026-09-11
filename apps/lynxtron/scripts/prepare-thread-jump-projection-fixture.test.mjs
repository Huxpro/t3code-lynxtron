import { describe, expect, it } from "vite-plus/test";

import { THREAD_JUMP_FIXTURE_THREADS } from "./prepare-thread-jump-projection-fixture.mjs";
import { sortThreads } from "../../../packages/client-runtime/src/state/threadSort.ts";

describe("thread-jump projection fixture", () => {
  it("pins the visible Sidebar order used by Command+1 and Command+2", () => {
    expect(
      sortThreads(THREAD_JUMP_FIXTURE_THREADS, "created_at").map((thread) => thread.id),
    ).toEqual(["fidelity-thread-two", "fidelity-thread-one"]);
  });
});
