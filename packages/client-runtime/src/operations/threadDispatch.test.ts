import { describe, expect, it } from "vite-plus/test";

import { ProviderInstanceId } from "@t3tools/contracts";

import { projectThreadTurnDispatchState } from "./threadDispatch.ts";

describe("projectThreadTurnDispatchState", () => {
  const shell = {
    modelSelection: {
      instanceId: ProviderInstanceId.make("codex"),
      model: "gpt-5.6",
      options: [{ id: "effort", value: "low" }],
    },
    runtimeMode: "approval-required" as const,
    interactionMode: "plan" as const,
  };

  it("uses every canonical mode from the thread shell", () => {
    expect(projectThreadTurnDispatchState(shell)).toEqual(shell);
  });

  it("uses only an explicitly thread-scoped pending model selection", () => {
    const pending = {
      instanceId: ProviderInstanceId.make("claudeAgent"),
      model: "claude-fable-5",
      options: [{ id: "effort", value: "high" }],
    };

    expect(projectThreadTurnDispatchState(shell, pending)).toEqual({
      modelSelection: pending,
      runtimeMode: "approval-required",
      interactionMode: "plan",
    });
  });
});
