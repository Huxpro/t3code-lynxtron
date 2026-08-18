import { describe, expect, it } from "vite-plus/test";

import { ProviderDriverKind, ProviderInstanceId, type ServerProvider } from "@t3tools/contracts";
import { DEFAULT_SERVER_SETTINGS } from "@t3tools/contracts/settings";

import {
  buildModelPickerSearchText,
  describeUnavailableProviderInstance,
  deriveModelPickerModels,
  deriveProviderModelSelectionProjection,
  providerInstanceLockedReason,
  providerModelKey,
  rankModelPickerSearchResults,
  scoreModelPickerSearch,
  sortModelsForProviderInstance,
  sortProviderModelItems,
} from "./modelPicker.ts";
import { applyProviderInstanceSettings, deriveProviderInstanceEntries } from "./provider.ts";

const CODEX_WORK_ID = ProviderInstanceId.make("codex_work");
const CLAUDE_ID = ProviderInstanceId.make("claudeAgent");

function provider(input: {
  readonly instanceId: string;
  readonly driverKind?: string;
  readonly enabled?: boolean;
  readonly availability?: "available" | "unavailable";
  readonly status?: ServerProvider["status"];
  readonly models?: ReadonlyArray<{
    readonly slug: string;
    readonly isDefault?: boolean;
  }>;
}): ServerProvider {
  return {
    instanceId: ProviderInstanceId.make(input.instanceId),
    driver: ProviderDriverKind.make(input.driverKind ?? "codex"),
    displayName: input.instanceId,
    enabled: input.enabled ?? true,
    installed: true,
    version: null,
    status: input.status ?? "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-01-01T00:00:00.000Z",
    ...(input.availability ? { availability: input.availability } : {}),
    models: (input.models ?? []).map((model) => ({
      slug: model.slug,
      name: model.slug,
      isCustom: false,
      capabilities: {},
      ...(model.isDefault ? { isDefault: true } : {}),
    })),
    slashCommands: [],
    skills: [],
  };
}

describe("shared model picker presentation", () => {
  it("describes unavailable and locked providers with distinct reasons", () => {
    const [entry] = deriveProviderInstanceEntries([
      {
        ...provider({
          instanceId: "grok",
          driverKind: "grok",
          status: "error",
        }),
        displayName: "Grok",
        availability: "unavailable",
        message: "Sign in to continue.",
      },
    ]);

    expect(entry && describeUnavailableProviderInstance(entry)).toBe(
      "Grok — Unavailable. Sign in to continue.",
    );
    expect(
      entry &&
        providerInstanceLockedReason(entry, {
          driverKind: ProviderDriverKind.make("codex"),
          continuationGroupKey: null,
        }),
    ).toBe("Grok is unavailable in this thread. Start a new thread to switch providers.");
  });

  it("derives rows from canonical provider entries and excludes disabled instances", () => {
    const entries = applyProviderInstanceSettings(
      deriveProviderInstanceEntries([
        provider({
          instanceId: "codex",
          enabled: true,
          models: [{ slug: "gpt-5.6" }],
        }),
        provider({
          instanceId: "codex_work",
          enabled: true,
          models: [{ slug: "gpt-5.5" }],
        }),
      ]),
      {
        providers: {} as never,
        providerInstances: {
          [ProviderInstanceId.make("codex_work")]: {
            driver: ProviderDriverKind.make("codex"),
            enabled: false,
          },
        },
      },
    );

    expect(deriveModelPickerModels(entries)).toEqual([
      expect.objectContaining({
        instanceId: "codex",
        providerDisplayName: "codex",
        slug: "gpt-5.6",
      }),
    ]);
  });

  it("keeps warning provider models selectable while their probe is pending", () => {
    const entries = deriveProviderInstanceEntries([
      provider({
        instanceId: "claudeAgent",
        driverKind: "claudeAgent",
        status: "warning",
        models: [{ slug: "claude-fable-5" }],
      }),
      provider({
        instanceId: "opencode",
        driverKind: "opencode",
        status: "ready",
        models: [{ slug: "opencode/big-pickle" }],
      }),
    ]);

    expect(
      deriveModelPickerModels(entries).map((model) =>
        providerModelKey(model.instanceId, model.slug),
      ),
    ).toEqual(["claudeAgent:claude-fable-5", "opencode:opencode/big-pickle"]);
  });

  it("retains not-ready provider models for non-picker display lookup", () => {
    const entries = deriveProviderInstanceEntries([
      provider({
        instanceId: "grok",
        driverKind: "grok",
        status: "error",
        models: [{ slug: "grok-build" }],
      }),
    ]);

    expect(deriveModelPickerModels(entries)).toEqual([]);
    expect(deriveModelPickerModels(entries, { includeDisabled: true })).toEqual([
      expect.objectContaining({
        instanceId: "grok",
        providerDisplayName: "grok",
        slug: "grok-build",
      }),
    ]);
  });

  it("projects settings-overlayed entries and preserves the first valid selection candidate", () => {
    const projection = deriveProviderModelSelectionProjection(
      {
        providers: [
          provider({
            instanceId: "codex",
            models: [{ slug: "gpt-5.6", isDefault: true }],
          }),
          provider({
            instanceId: "claudeAgent",
            driverKind: "claudeAgent",
            models: [{ slug: "claude-fable-5", isDefault: true }],
          }),
        ],
        settings: DEFAULT_SERVER_SETTINGS,
      },
      [
        {
          instanceId: CLAUDE_ID,
          model: "claude-fable-5",
          options: [{ id: "effort", value: "high" }],
        },
        { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.6" },
      ],
    );

    expect(projection.selection).toEqual({
      instanceId: CLAUDE_ID,
      model: "claude-fable-5",
      options: [{ id: "effort", value: "high" }],
    });
    expect(projection.selectedEntry?.instanceId).toBe(CLAUDE_ID);
  });

  it("keeps a valid instance and uses its own default when its model disappeared", () => {
    const projection = deriveProviderModelSelectionProjection(
      {
        providers: [
          provider({
            instanceId: "codex",
            models: [{ slug: "gpt-5.6", isDefault: true }, { slug: "gpt-5.5" }],
          }),
        ],
        settings: DEFAULT_SERVER_SETTINGS,
      },
      [{ instanceId: ProviderInstanceId.make("codex"), model: "removed-model" }],
    );

    expect(projection.selection).toEqual({
      instanceId: ProviderInstanceId.make("codex"),
      model: "gpt-5.6",
    });
  });

  it("preserves an explicit unavailable instance instead of silently switching providers", () => {
    const projection = deriveProviderModelSelectionProjection(
      {
        providers: [
          provider({
            instanceId: "codex",
            models: [{ slug: "gpt-5.6", isDefault: true }],
          }),
          provider({
            instanceId: "claudeAgent",
            driverKind: "claudeAgent",
            availability: "unavailable",
            models: [{ slug: "claude-fable-5", isDefault: true }],
          }),
        ],
        settings: {
          ...DEFAULT_SERVER_SETTINGS,
          providers: {
            ...DEFAULT_SERVER_SETTINGS.providers,
            codex: {
              ...DEFAULT_SERVER_SETTINGS.providers.codex,
              enabled: false,
            },
          },
        },
      },
      [{ instanceId: CLAUDE_ID, model: "claude-fable-5" }],
    );

    expect(projection.selectedEntry?.instanceId).toBe(CLAUDE_ID);
    expect(projection.selectedModel).toEqual(
      expect.objectContaining({
        instanceId: CLAUDE_ID,
        slug: "claude-fable-5",
      }),
    );
    expect(projection.selection).toEqual({
      instanceId: CLAUDE_ID,
      model: "claude-fable-5",
    });
  });

  it("falls back only when the explicit provider instance no longer exists", () => {
    const projection = deriveProviderModelSelectionProjection(
      {
        providers: [
          provider({
            instanceId: "codex",
            models: [{ slug: "gpt-5.6", isDefault: true }],
          }),
        ],
        settings: DEFAULT_SERVER_SETTINGS,
      },
      [{ instanceId: CLAUDE_ID, model: "claude-fable-5" }],
    );

    expect(projection.selectedEntry?.instanceId).toBe("codex");
    expect(projection.selection).toEqual({
      instanceId: ProviderInstanceId.make("codex"),
      model: "gpt-5.6",
    });
  });

  it("prefers a ready fallback with models over warning and empty providers", () => {
    const projection = deriveProviderModelSelectionProjection({
      providers: [
        provider({
          instanceId: "codex",
          status: "warning",
          models: [{ slug: "gpt-warning" }],
        }),
        provider({
          instanceId: "claudeAgent",
          driverKind: "claudeAgent",
          models: [],
        }),
        provider({
          instanceId: "grok",
          driverKind: "grok",
          models: [{ slug: "grok-ready", isDefault: true }],
        }),
      ],
      settings: DEFAULT_SERVER_SETTINGS,
    });

    expect(projection.selection).toEqual({
      instanceId: ProviderInstanceId.make("grok"),
      model: "grok-ready",
    });
  });

  it("groups favorites first while preserving configured model order", () => {
    const models = [
      { slug: "gpt-5.5" },
      { slug: "gpt-5.4-mini" },
      { slug: "crest-alpha" },
      { slug: "gpt-5.3-codex" },
    ];

    expect(
      sortModelsForProviderInstance(models, {
        favoriteModels: ["gpt-5.5", "gpt-5.4-mini", "crest-alpha"],
        groupFavorites: true,
        modelOrder: ["gpt-5.4-mini", "gpt-5.5", "crest-alpha", "gpt-5.3-codex"],
      }).map((model) => model.slug),
    ).toEqual(["gpt-5.4-mini", "gpt-5.5", "crest-alpha", "gpt-5.3-codex"]);
  });

  it("sorts a favorites view by provider and original model order", () => {
    const items = [
      { instanceId: CODEX_WORK_ID, slug: "gpt-5.4-mini" },
      { instanceId: CODEX_WORK_ID, slug: "gpt-5.5" },
      { instanceId: CODEX_WORK_ID, slug: "crest-alpha" },
      { instanceId: CLAUDE_ID, slug: "claude-opus-4-6" },
    ];
    const favoriteKeys = [
      providerModelKey(CODEX_WORK_ID, "gpt-5.5"),
      providerModelKey(CLAUDE_ID, "claude-opus-4-6"),
      providerModelKey(CODEX_WORK_ID, "gpt-5.4-mini"),
      providerModelKey(CODEX_WORK_ID, "crest-alpha"),
    ];

    expect(
      sortProviderModelItems(items, {
        favoriteModelKeys: favoriteKeys,
        instanceOrder: [CODEX_WORK_ID, CLAUDE_ID],
      }).map((item) => item.slug),
    ).toEqual(["gpt-5.4-mini", "gpt-5.5", "crest-alpha", "claude-opus-4-6"]);
  });

  it("builds provider-agnostic search text", () => {
    expect(
      buildModelPickerSearchText({
        driverKind: "opencode",
        providerDisplayName: "OpenCode Work",
        name: "Claude Opus 4.7",
        subProvider: "GitHub Copilot",
      }),
    ).toBe("claude opus 4.7 github copilot opencode opencode work");
  });

  it("matches typo-tolerant multi-token queries and rejects missing tokens", () => {
    const model = {
      driverKind: "opencode",
      providerDisplayName: "OpenCode",
      name: "Claude Opus 4.7",
      subProvider: "GitHub Copilot",
    };

    expect(scoreModelPickerSearch(model, "coplt op")).not.toBeNull();
    expect(scoreModelPickerSearch(model, "coplt gemini")).toBeNull();
  });

  it("keeps a clearly better textual match ahead of a boosted favorite", () => {
    const favoriteScore = scoreModelPickerSearch(
      {
        driverKind: "claudeAgent",
        providerDisplayName: "Claude",
        name: "Claude Opus 4.7",
        isFavorite: true,
      },
      "opus 4.7",
    );
    const exactScore = scoreModelPickerSearch(
      {
        driverKind: "cursor",
        providerDisplayName: "Cursor",
        name: "Opus 4.7",
      },
      "opus 4.7",
    );

    expect(exactScore).not.toBeNull();
    expect(favoriteScore).not.toBeNull();
    expect(exactScore!).toBeLessThan(favoriteScore!);
  });

  it("ranks the same search projection for every renderer", () => {
    const models = [
      {
        id: "cursor",
        driverKind: "cursor",
        providerDisplayName: "Cursor",
        name: "Opus 4.5",
        favorite: false,
      },
      {
        id: "claude",
        driverKind: "claudeAgent",
        providerDisplayName: "Claude Personal",
        name: "Claude Opus 4.7",
        favorite: true,
      },
    ];

    expect(
      rankModelPickerSearchResults(models, "personal opus", (model) => ({
        ...model,
        isFavorite: model.favorite,
      })).map((model) => model.id),
    ).toEqual(["claude"]);
  });
});
