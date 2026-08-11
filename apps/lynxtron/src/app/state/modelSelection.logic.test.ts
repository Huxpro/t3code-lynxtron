import { assert, describe, it } from "vite-plus/test";
import { ProjectId, ProviderInstanceId } from "@t3tools/contracts";

import {
  findExactModelForSelection,
  projectModelSelectionCandidates,
} from "./modelSelection.logic";

const project = {
  id: ProjectId.make("project-1"),
  defaultModelSelection: {
    instanceId: ProviderInstanceId.make("claudeAgent"),
    model: "claude-fable-5",
  },
};

describe("project model selection candidates", () => {
  it("prefers the first project default for a new thread", () => {
    const candidates = projectModelSelectionCandidates({
      currentSelection: {
        instanceId: ProviderInstanceId.make("opencode"),
        model: "opencode/big-pickle",
      },
      projects: [project],
    });

    assert.deepEqual(candidates, [
      project.defaultModelSelection,
      {
        instanceId: ProviderInstanceId.make("opencode"),
        model: "opencode/big-pickle",
      },
    ]);
  });

  it("finds only an exact model for an active thread selection", () => {
    const models = [
      {
        instanceId: ProviderInstanceId.make("claudeAgent"),
        slug: "claude-fable-5",
      },
    ];

    assert.deepEqual(
      findExactModelForSelection(models, project.defaultModelSelection),
      models[0],
    );
    assert.isUndefined(
      findExactModelForSelection(models, {
        instanceId: ProviderInstanceId.make("codex"),
        model: "gpt-5.6-sol",
      }),
    );
  });
});
