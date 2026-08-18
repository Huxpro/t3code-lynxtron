import type { ThreadSummary } from "../bridge";
import { describe, expect, it } from "vite-plus/test";

import {
  projectThreadInteractionMode,
  projectThreadRuntimeMode,
  rollbackThreadModeMutation,
} from "./threadModeMutation.logic";

const threads = [
  {
    id: "thread-1",
    runtimeMode: "approval-required",
    interactionMode: "default",
  },
  {
    id: "thread-2",
    runtimeMode: "full-access",
    interactionMode: "plan",
  },
] as unknown as ReadonlyArray<ThreadSummary>;

describe("thread mode mutation projection", () => {
  it("projects runtime and interaction mode immediately", () => {
    expect(projectThreadRuntimeMode(threads, "thread-1", "auto")[0]?.runtimeMode).toBe("auto");
    expect(projectThreadInteractionMode(threads, "thread-1", "plan")[0]?.interactionMode).toBe(
      "plan",
    );
    expect(projectThreadInteractionMode(threads, "thread-1", "plan")[1]).toBe(threads[1]);
  });

  it("rolls back only the optimistic value that actually failed", () => {
    const optimistic = projectThreadInteractionMode(threads, "thread-1", "plan");
    expect(
      rollbackThreadModeMutation(optimistic, threads, "thread-1", "interactionMode", "plan")[0]
        ?.interactionMode,
    ).toBe("default");

    const newer = projectThreadInteractionMode(optimistic, "thread-1", "default");
    expect(rollbackThreadModeMutation(newer, threads, "thread-1", "interactionMode", "plan")).toBe(
      newer,
    );
  });
});
