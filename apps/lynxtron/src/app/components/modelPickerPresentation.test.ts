import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vite-plus/test";
import { ProviderDriverKind, ProviderInstanceId, type ServerProvider } from "@t3tools/contracts";
import {
  deriveModelPickerModels,
  providerModelKey,
} from "@t3tools/client-runtime/presentation/model-picker";
import { deriveProviderInstanceEntries } from "@t3tools/client-runtime/presentation/provider";

import {
  modelPickerRowDisabledReason,
  projectModelPickerProviders,
  projectModelPickerRows,
  resolveModelPickerSelectedKey,
  type ModelPickerContext,
} from "./modelPickerPresentation";

function provider(input: {
  readonly instanceId: string;
  readonly driverKind: string;
  readonly displayName: string;
  readonly status?: ServerProvider["status"];
  readonly availability?: ServerProvider["availability"];
  readonly message?: string;
  readonly requiresNewThreadForModelChange?: boolean;
  readonly continuationGroupKey?: string;
  readonly models?: ReadonlyArray<string>;
}): ServerProvider {
  return {
    instanceId: ProviderInstanceId.make(input.instanceId),
    driver: ProviderDriverKind.make(input.driverKind),
    displayName: input.displayName,
    enabled: true,
    installed: true,
    version: null,
    status: input.status ?? "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-08-11T00:00:00.000Z",
    ...(input.availability ? { availability: input.availability } : {}),
    ...(input.message ? { message: input.message } : {}),
    ...(input.requiresNewThreadForModelChange ? { requiresNewThreadForModelChange: true } : {}),
    ...(input.continuationGroupKey
      ? { continuation: { groupKey: input.continuationGroupKey } }
      : {}),
    models: (input.models ?? []).map((slug) => ({
      slug,
      name: slug,
      isCustom: false,
      capabilities: {},
    })),
    slashCommands: [],
    skills: [],
  };
}

const providers = [
  provider({
    instanceId: "codex",
    driverKind: "codex",
    displayName: "Codex",
    continuationGroupKey: "openai",
    models: ["gpt-5.6", "gpt-5.5"],
  }),
  provider({
    instanceId: "opencode",
    driverKind: "opencode",
    displayName: "OpenCode",
    continuationGroupKey: "opencode",
    models: ["openai/gpt-5", "opencode/big-pickle"],
  }),
  provider({
    instanceId: "grok",
    driverKind: "grok",
    displayName: "Grok",
    status: "error",
    availability: "unavailable",
    message: "Sign in to continue.",
    models: ["grok-build"],
  }),
  provider({
    instanceId: "locked",
    driverKind: "cursor",
    displayName: "Cursor",
    requiresNewThreadForModelChange: true,
    models: ["cursor-agent"],
  }),
] as const;

const entries = deriveProviderInstanceEntries(providers);
const models = deriveModelPickerModels(entries, { includeDisabled: true });

function context(overrides: Partial<ModelPickerContext> = {}): ModelPickerContext {
  return {
    providers,
    providerEntries: entries,
    currentModelSelection: undefined,
    currentProviderInstanceId: null,
    hasStartedSession: false,
    lockedProvider: null,
    lockedContinuationGroupKey: null,
    ...overrides,
  };
}

describe("Lynx model picker presentation", () => {
  it("focuses the native search input when the picker mounts", () => {
    const picker = readFileSync(path.resolve(import.meta.dirname, "ModelPicker.tsx"), "utf8");

    expect(picker).toContain("const searchInputRef = useRef<NodesRef>(null);");
    expect(picker).toContain('id="model-picker-search-input"');
    expect(picker).toContain("ref={searchInputRef}");
    expect(picker).toMatch(
      /searchInputRef\.current[\s\S]*?\.invoke\(\{[\s\S]*?method: "focus"[\s\S]*?\}\)[\s\S]*?\.exec\(\)/,
    );
    expect(picker).toContain("[lynx-model-picker] input focus failed");
  });

  it("anchors the panel to the Composer authority offset", () => {
    const picker = readFileSync(path.resolve(import.meta.dirname, "ModelPicker.tsx"), "utf8");
    const overrides = readFileSync(path.resolve(import.meta.dirname, "../overrides.css"), "utf8");
    const panelStart = overrides.indexOf(".model-picker-panel {");
    const panelBlock = overrides.slice(panelStart, overrides.indexOf("}", panelStart));

    expect(picker).toContain('bottom: "32px"');
    expect(panelBlock).toContain("position: absolute;");
    expect(panelBlock).toContain("bottom: 32px;");
  });

  it("matches the authority row typography and vertical rhythm", () => {
    const overrides = readFileSync(path.resolve(import.meta.dirname, "../overrides.css"), "utf8");

    expect(overrides).toContain(".picker-list {\n  display: flex;\n  flex-direction: column;");
    expect(overrides).toContain("gap: 2px;");
    expect(overrides).toContain(".model-picker-row-copy {");
    expect(overrides).toContain(".model-picker-row-name {\n  color: var(--foreground);");
    expect(overrides).toContain("font-size: 12px;\n  font-weight: 500;\n  line-height: 17px;");
    expect(overrides).toContain(".model-picker-row-provider-label {");
    expect(overrides).toContain("color: rgba(var(--muted-foreground-rgb), 0.7);");
    expect(overrides).toContain("width: 20px;\n  height: 20px;");
  });

  it("keeps the current thread selection authoritative over a cached model", () => {
    const cachedClaude = {
      instanceId: ProviderInstanceId.make("claudeAgent"),
      slug: "claude-fable-5",
    } as const;

    expect(
      resolveModelPickerSelectedKey(
        {
          instanceId: ProviderInstanceId.make("codex"),
          model: "gpt-5.6-sol",
        },
        cachedClaude,
      ),
    ).toBe("codex:gpt-5.6-sol");
    expect(resolveModelPickerSelectedKey(undefined, cachedClaude)).toBe(
      "claudeAgent:claude-fable-5",
    );
  });

  it("keeps unavailable providers visible with the server reason", () => {
    const grok = projectModelPickerProviders(entries, context()).find(
      (item) => item.entry.instanceId === "grok",
    );

    expect(grok?.disabledReason).toBe("Grok — Unavailable. Sign in to continue.");
  });

  it("keeps warning provider rails and models selectable while probing", () => {
    const warningProvider = provider({
      instanceId: "claudeAgent",
      driverKind: "claudeAgent",
      displayName: "Claude",
      status: "warning",
      message: "Claude provider status has not been checked in this session yet.",
      models: ["claude-fable-5", "claude-opus-4-6"],
    });
    const warningEntries = deriveProviderInstanceEntries([warningProvider]);
    const warningModels = deriveModelPickerModels(warningEntries, { includeDisabled: true });
    const warningContext = {
      ...context(),
      providers: [warningProvider],
      providerEntries: warningEntries,
    };

    expect(
      projectModelPickerProviders(warningEntries, warningContext)[0]?.disabledReason,
    ).toBeNull();
    expect(
      projectModelPickerRows({
        models: warningModels,
        selectedProviderId: ProviderInstanceId.make("claudeAgent"),
        search: "",
        favoriteModelKeys: new Set(),
        instanceOrder: [ProviderInstanceId.make("claudeAgent")],
        context: warningContext,
      }).map((row) => row.disabledReason),
    ).toEqual([null, null]);
  });

  it("disables unavailable provider models when search reveals them", () => {
    const grok = models.find((model) => model.instanceId === "grok")!;
    expect(modelPickerRowDisabledReason(grok, context())).toBe(
      "Grok — Unavailable. Sign in to continue.",
    );
  });

  it("distinguishes current-thread provider locks from runtime unavailability", () => {
    const opencode = projectModelPickerProviders(
      entries,
      context({
        lockedProvider: ProviderDriverKind.make("codex"),
        lockedContinuationGroupKey: "openai",
      }),
    ).find((item) => item.entry.instanceId === "opencode");

    expect(opencode?.disabledReason).toBe(
      "OpenCode is unavailable in this thread. Start a new thread to switch providers.",
    );
  });

  it("blocks model changes after a restricted provider session starts", () => {
    const cursor = models.find((model) => model.instanceId === "locked")!;
    expect(
      modelPickerRowDisabledReason(
        cursor,
        context({
          currentModelSelection: {
            instanceId: ProviderInstanceId.make("locked"),
            model: "cursor-agent",
          },
          currentProviderInstanceId: ProviderInstanceId.make("locked"),
          hasStartedSession: true,
        }),
      ),
    ).toBeNull();

    const codex = models.find((model) => model.slug === "gpt-5.6")!;
    expect(
      modelPickerRowDisabledReason(
        codex,
        context({
          currentModelSelection: {
            instanceId: ProviderInstanceId.make("locked"),
            model: "cursor-agent",
          },
          currentProviderInstanceId: ProviderInstanceId.make("locked"),
          hasStartedSession: true,
        }),
      ),
    ).toContain("Start a new thread to use this model.");
  });

  it("filters favorites and searches across provider labels", () => {
    const favorites = new Set([providerModelKey("opencode", "opencode/big-pickle")]);

    expect(
      projectModelPickerRows({
        models,
        selectedProviderId: "favorites",
        search: "",
        favoriteModelKeys: favorites,
        instanceOrder: entries.map((entry) => entry.instanceId),
        context: context(),
      }).map((row) => row.model.slug),
    ).toEqual(["opencode/big-pickle"]);

    expect(
      projectModelPickerRows({
        models,
        selectedProviderId: ProviderInstanceId.make("codex"),
        search: "opencode pickle",
        favoriteModelKeys: favorites,
        instanceOrder: entries.map((entry) => entry.instanceId),
        context: context(),
      }).map((row) => row.model.slug),
    ).toEqual(["opencode/big-pickle"]);
  });

  it("groups favorites before the remaining models for one provider", () => {
    const favorites = new Set([providerModelKey("codex", "gpt-5.5")]);
    expect(
      projectModelPickerRows({
        models,
        selectedProviderId: ProviderInstanceId.make("codex"),
        search: "",
        favoriteModelKeys: favorites,
        instanceOrder: entries.map((entry) => entry.instanceId),
        context: context(),
      }).map((row) => row.model.slug),
    ).toEqual(["gpt-5.5", "gpt-5.6"]);
  });
});
