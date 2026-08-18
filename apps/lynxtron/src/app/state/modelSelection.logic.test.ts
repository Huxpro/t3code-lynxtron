import { assert, describe, it } from "vite-plus/test";
import {
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import { deriveProviderInstanceEntries } from "@t3tools/client-runtime/presentation/provider";

import {
  availableThreadModels,
  findExactModelForSelection,
  modelSelectionMutationError,
  projectModelSelectionCandidates,
  resolveActiveThreadModelSelection,
  resolveModelPickerNavigationProvider,
  shouldRollbackModelSelectionMutation,
} from "./modelSelection.logic";

const project = {
  id: ProjectId.make("project-1"),
  defaultModelSelection: {
    instanceId: ProviderInstanceId.make("claudeAgent"),
    model: "claude-fable-5",
  },
};

function provider(
  instanceId: string,
  driverKind: string,
  models: ReadonlyArray<string>,
): ServerProvider {
  return {
    instanceId: ProviderInstanceId.make(instanceId),
    driver: ProviderDriverKind.make(driverKind),
    displayName: instanceId,
    enabled: true,
    installed: true,
    version: null,
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-08-15T00:00:00.000Z",
    models: models.map((slug) => ({
      slug,
      name: slug,
      isCustom: false,
      capabilities: {},
    })),
    slashCommands: [],
    skills: [],
  };
}

describe("project model selection candidates", () => {
  it("prefers the current explicit selection over the project default", () => {
    const currentSelection = {
      instanceId: ProviderInstanceId.make("opencode"),
      model: "opencode/big-pickle",
    };
    const candidates = projectModelSelectionCandidates({
      currentSelection,
      projects: [project],
    });

    assert.deepEqual(candidates, [currentSelection, project.defaultModelSelection]);
  });

  it("finds only an exact model for an active thread selection", () => {
    const models = [
      {
        instanceId: ProviderInstanceId.make("claudeAgent"),
        slug: "claude-fable-5",
      },
    ];

    assert.deepEqual(findExactModelForSelection(models, project.defaultModelSelection), models[0]);
    assert.isUndefined(
      findExactModelForSelection(models, {
        instanceId: ProviderInstanceId.make("codex"),
        model: "gpt-5.6-sol",
      }),
    );
  });

  it("falls an invalid active-thread model back to the canonical provider projection", () => {
    const fallbackModel = {
      instanceId: ProviderInstanceId.make("opencode"),
      slug: "opencode/big-pickle",
    };
    const fallbackSelection = {
      instanceId: fallbackModel.instanceId,
      model: fallbackModel.slug,
    };

    assert.deepEqual(
      resolveActiveThreadModelSelection(
        [fallbackModel],
        {
          instanceId: ProviderInstanceId.make("opencode"),
          model: "opencode/not-a-real-model",
        },
        { selectedModel: fallbackModel, selection: fallbackSelection },
      ),
      {
        selectedModel: fallbackModel,
        selection: fallbackSelection,
      },
    );
  });

  it("falls back within the active provider before cached projection state exists", () => {
    const model = {
      instanceId: ProviderInstanceId.make("opencode"),
      slug: "opencode/big-pickle",
    };

    assert.deepEqual(
      resolveActiveThreadModelSelection(
        [model],
        {
          instanceId: model.instanceId,
          model: "opencode/not-a-real-model",
        },
        { selectedModel: undefined, selection: undefined },
      ),
      {
        selectedModel: model,
        selection: {
          instanceId: model.instanceId,
          model: model.slug,
        },
      },
    );
  });

  it("does not replace an unavailable thread provider with a cached provider", () => {
    const cachedModel = {
      instanceId: ProviderInstanceId.make("claudeAgent"),
      slug: "claude-fable-5",
    };
    const threadSelection = {
      instanceId: ProviderInstanceId.make("codex"),
      model: "gpt-5.6-sol",
    };

    assert.deepEqual(
      resolveActiveThreadModelSelection([], threadSelection, {
        selectedModel: cachedModel,
        selection: {
          instanceId: cachedModel.instanceId,
          model: cachedModel.slug,
        },
      }),
      {
        selectedModel: undefined,
        selection: threadSelection,
      },
    );
  });
});

describe("available thread models", () => {
  it("uses the complete provider catalog instead of the current projection subset", () => {
    const projectedClaudeModel = {
      instanceId: ProviderInstanceId.make("claudeAgent"),
      driverKind: ProviderDriverKind.make("claudeAgent"),
      providerDisplayName: "Claude",
      slug: "claude-fable-5",
      name: "Claude Fable 5",
      isCustom: false,
      capabilities: null,
    };
    const entries = deriveProviderInstanceEntries([
      provider("claudeAgent", "claudeAgent", ["claude-fable-5"]),
      provider("codex", "codex", ["gpt-5.6-sol"]),
    ]);

    const available = availableThreadModels({
      models: [projectedClaudeModel],
      providerEntries: entries,
    });

    assert.deepEqual(
      available.map((model) => `${model.instanceId}:${model.slug}`),
      ["claudeAgent:claude-fable-5", "codex:gpt-5.6-sol"],
    );
  });

  it("falls back to projected models before provider entries arrive", () => {
    const projectedModel = {
      instanceId: ProviderInstanceId.make("claudeAgent"),
      driverKind: ProviderDriverKind.make("claudeAgent"),
      providerDisplayName: "Claude",
      slug: "claude-fable-5",
      name: "Claude Fable 5",
      isCustom: false,
      capabilities: null,
    };

    assert.deepEqual(availableThreadModels({ models: [projectedModel], providerEntries: [] }), [
      projectedModel,
    ]);
  });
});

describe("model picker navigation provider", () => {
  it("keeps a ready current provider", () => {
    const entries = deriveProviderInstanceEntries([
      provider("claudeAgent", "claudeAgent", ["claude-fable-5"]),
      provider("codex", "codex", ["gpt-5.6-sol"]),
    ]);

    assert.equal(
      resolveModelPickerNavigationProvider({
        preferredProvider: ProviderInstanceId.make("codex"),
        providerEntries: entries,
        hasFavorites: false,
        providerSwitchLocked: false,
      }),
      "codex",
    );
  });

  it("opens on the first ready provider when the current provider is unavailable", () => {
    const entries = deriveProviderInstanceEntries([
      {
        ...provider("codex", "codex", ["gpt-5.6-sol"]),
        status: "error",
      },
      provider("opencode", "opencode", ["opencode/big-pickle"]),
    ]);

    assert.equal(
      resolveModelPickerNavigationProvider({
        preferredProvider: ProviderInstanceId.make("codex"),
        providerEntries: entries,
        hasFavorites: false,
        providerSwitchLocked: false,
      }),
      "opencode",
    );
  });

  it("does not leave a locked provider when its runtime becomes unavailable", () => {
    const entries = deriveProviderInstanceEntries([
      {
        ...provider("codex", "codex", ["gpt-5.6-sol"]),
        status: "error",
      },
      provider("opencode", "opencode", ["opencode/big-pickle"]),
    ]);

    assert.equal(
      resolveModelPickerNavigationProvider({
        preferredProvider: ProviderInstanceId.make("codex"),
        providerEntries: entries,
        hasFavorites: false,
        providerSwitchLocked: true,
      }),
      "codex",
    );
  });
});

describe("model selection mutation lifecycle", () => {
  it("rolls back only the latest failed optimistic mutation", () => {
    assert.isTrue(
      shouldRollbackModelSelectionMutation({
        currentSequence: 4,
        failedSequence: 4,
      }),
    );
    assert.isFalse(
      shouldRollbackModelSelectionMutation({
        currentSequence: 5,
        failedSequence: 4,
      }),
    );
  });

  it("normalizes bridge errors without throwing during presentation", () => {
    assert.equal(
      modelSelectionMutationError(new Error('SocketOpenError: timeout waiting for "open"')),
      'SocketOpenError: timeout waiting for "open"',
    );
    assert.equal(modelSelectionMutationError("connection failed"), "connection failed");
  });
});
