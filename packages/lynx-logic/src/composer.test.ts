import { describe, expect, it } from "vite-plus/test";
import { ProviderDriverKind } from "@t3tools/contracts";

import {
  COMPOSER_RUNTIME_MODE_PRESENTATIONS,
  buildComposerTraitsTriggerDisplay,
  deriveComposerControlState,
  deriveComposerSendState,
  getComposerInteractionModePresentation,
  getComposerRuntimeModePresentation,
  getNextComposerRuntimeMode,
  isComposerDraftThread,
  projectComposerContext,
  projectComposerProviderAvailability,
  projectComposerPrimaryOption,
  projectComposerTraitsMenu,
  resolveDefaultComposerPlaceholder,
  selectComposerTraitOption,
  shouldShowComposerContextStrip,
  shouldUseComposerHeroLayout,
  toggleComposerInteractionMode,
} from "./composer.ts";

describe("composer controls presentation", () => {
  it("owns the canonical runtime-mode copy and cycle order", () => {
    expect(COMPOSER_RUNTIME_MODE_PRESENTATIONS.map(({ mode }) => mode)).toEqual([
      "approval-required",
      "auto-accept-edits",
      "auto",
      "full-access",
    ]);
    expect(getComposerRuntimeModePresentation("full-access")).toEqual({
      mode: "full-access",
      label: "Full access",
      description: "Allow commands and edits without prompts.",
    });
    expect(getNextComposerRuntimeMode("full-access")).toBe("approval-required");
  });

  it("projects and toggles interaction modes", () => {
    expect(getComposerInteractionModePresentation("default")).toEqual({
      mode: "default",
      label: "Build",
      description: "Default mode — click to enter plan mode",
    });
    expect(toggleComposerInteractionMode("default")).toBe("plan");
    expect(toggleComposerInteractionMode("plan")).toBe("default");
  });

  it("keeps default placeholder copy aligned across session phases", () => {
    expect(resolveDefaultComposerPlaceholder("disconnected")).toBe(
      "Ask for follow-up changes or attach images",
    );
    for (const phase of ["connecting", "ready", "running"] as const) {
      expect(resolveDefaultComposerPlaceholder(phase)).toBe(
        "Ask anything, @tag files/folders, $use skills, or / for commands",
      );
    }
  });

  it("hides stale model state when no provider can accept a turn", () => {
    expect(
      projectComposerProviderAvailability({
        phase: "disconnected",
        providerAvailable: false,
        modelLabel: "GPT-5.6-Sol",
      }),
    ).toEqual({
      placeholder: "Enable a provider in Settings to send a message",
      modelLabel: undefined,
    });
  });

  it("preserves ordinary disconnected-session state with an available provider", () => {
    expect(
      projectComposerProviderAvailability({
        phase: "disconnected",
        providerAvailable: true,
        modelLabel: "GPT-5.6-Sol",
      }),
    ).toEqual({
      placeholder: "Ask for follow-up changes or attach images",
      modelLabel: "GPT-5.6-Sol",
    });
  });

  it("reserves the hero layout for an empty idle local draft", () => {
    expect(
      shouldUseComposerHeroLayout({
        isLocalDraftThread: true,
        timelineEntryCount: 0,
        isWorking: false,
        dockRequested: false,
      }),
    ).toBe(true);
    expect(
      shouldUseComposerHeroLayout({
        isLocalDraftThread: false,
        timelineEntryCount: 0,
        isWorking: false,
        dockRequested: false,
      }),
    ).toBe(false);
    expect(
      shouldUseComposerHeroLayout({
        isLocalDraftThread: true,
        timelineEntryCount: 1,
        isWorking: false,
        dockRequested: false,
      }),
    ).toBe(false);
    expect(
      shouldUseComposerHeroLayout({
        isLocalDraftThread: true,
        timelineEntryCount: 0,
        isWorking: true,
        dockRequested: false,
      }),
    ).toBe(false);
    expect(
      shouldUseComposerHeroLayout({
        isLocalDraftThread: true,
        timelineEntryCount: 0,
        isWorking: false,
        dockRequested: true,
      }),
    ).toBe(false);
  });

  it("distinguishes a newly-created draft thread from historical empty threads", () => {
    expect(
      isComposerDraftThread({
        activeThreadId: undefined,
        draftHeroThreadId: undefined,
      }),
    ).toBe(true);
    expect(
      isComposerDraftThread({
        activeThreadId: "new-thread",
        draftHeroThreadId: "new-thread",
      }),
    ).toBe(true);
    expect(
      isComposerDraftThread({
        activeThreadId: "historical-empty-thread",
        draftHeroThreadId: undefined,
      }),
    ).toBe(false);
  });

  it("shows repository context without flickering while status resolves", () => {
    expect(shouldShowComposerContextStrip({ hasProject: false, isRepo: true })).toBe(false);
    expect(shouldShowComposerContextStrip({ hasProject: true, isRepo: undefined })).toBe(true);
    expect(shouldShowComposerContextStrip({ hasProject: true, isRepo: true })).toBe(true);
    expect(shouldShowComposerContextStrip({ hasProject: true, isRepo: false })).toBe(false);
  });

  it("shows only context facts present in the canonical thread shell", () => {
    expect(projectComposerContext({ branch: null, worktreePath: null })).toEqual({
      checkoutLabel: "Current checkout",
      branchLabel: "No branch",
    });
    expect(
      projectComposerContext({
        branch: "feature/composer",
        worktreePath: "/repo/.worktrees/composer",
      }),
    ).toEqual({
      checkoutLabel: "Current worktree",
      branchLabel: "feature/composer",
    });
    expect(
      projectComposerContext({
        branch: "main",
        worktreePath: null,
        workspaceModeLocked: true,
      }),
    ).toEqual({
      checkoutLabel: "Local checkout",
      branchLabel: "main",
    });
    expect(
      projectComposerContext({
        branch: "feature/composer",
        worktreePath: "/repo/.worktrees/composer",
        workspaceModeLocked: true,
      }),
    ).toEqual({
      checkoutLabel: "Worktree",
      branchLabel: "feature/composer",
    });
  });

  it("cycles a real server-declared provider option", () => {
    expect(
      projectComposerPrimaryOption({
        capabilities: {
          optionDescriptors: [
            {
              id: "effort",
              label: "Reasoning",
              type: "select",
              options: [
                { id: "low", label: "Low", isDefault: true },
                { id: "high", label: "High" },
              ],
            },
          ],
        },
        selections: [{ id: "effort", value: "low" }],
      }),
    ).toEqual({
      presentation: {
        id: "effort",
        label: "Reasoning",
        valueLabel: "Low",
        displayLabel: "Reasoning · Low",
      },
      nextSelections: [{ id: "effort", value: "high" }],
    });
  });

  it("summarizes every visible provider trait in the shared trigger label", () => {
    expect(
      buildComposerTraitsTriggerDisplay({
        provider: ProviderDriverKind.make("claudeAgent"),
        descriptors: [
          {
            id: "reasoningEffort",
            label: "Reasoning",
            type: "select",
            options: [
              { id: "low", label: "Low" },
              { id: "high", label: "High" },
            ],
            currentValue: "high",
          },
          {
            id: "contextWindow",
            label: "Context window",
            type: "select",
            options: [
              { id: "200k", label: "200k" },
              { id: "1m", label: "1M" },
            ],
            currentValue: "1m",
          },
        ],
        primarySelectDescriptorId: "reasoningEffort",
        ultrathinkPromptControlled: false,
      }),
    ).toEqual({ label: "High · 1M", showFastModeIcon: false });
  });

  it("projects server-declared select and boolean traits into menu sections", () => {
    expect(
      projectComposerTraitsMenu({
        capabilities: {
          optionDescriptors: [
            {
              id: "reasoningEffort",
              label: "Reasoning",
              type: "select",
              options: [
                { id: "high", label: "High" },
                { id: "xhigh", label: "Extra High" },
              ],
            },
            {
              id: "contextWindow",
              label: "Context window",
              type: "select",
              options: [
                { id: "200k", label: "200k", isDefault: true },
                { id: "1m", label: "1M" },
              ],
            },
            {
              id: "thinking",
              label: "Thinking",
              type: "boolean",
            },
          ],
        },
        selections: [
          { id: "reasoningEffort", value: "xhigh" },
          { id: "contextWindow", value: "1m" },
          { id: "thinking", value: false },
        ],
      }),
    ).toEqual([
      {
        id: "reasoningEffort",
        label: "Reasoning",
        items: [
          { id: "high", label: "High", selected: false, value: "high" },
          { id: "xhigh", label: "Extra High", selected: true, value: "xhigh" },
        ],
      },
      {
        id: "contextWindow",
        label: "Context window",
        items: [
          { id: "200k", label: "200k", isDefault: true, selected: false, value: "200k" },
          { id: "1m", label: "1M", selected: true, value: "1m" },
        ],
      },
      {
        id: "thinking",
        label: "Thinking",
        items: [
          { id: "on", label: "On", selected: false, value: true },
          { id: "off", label: "Off", selected: true, value: false },
        ],
      },
    ]);
  });

  it("updates one provider trait while preserving every other selection", () => {
    expect(
      selectComposerTraitOption({
        capabilities: {
          optionDescriptors: [
            {
              id: "reasoningEffort",
              label: "Reasoning",
              type: "select",
              options: [
                { id: "high", label: "High" },
                { id: "xhigh", label: "Extra High" },
              ],
            },
            {
              id: "thinking",
              label: "Thinking",
              type: "boolean",
            },
          ],
        },
        selections: [
          { id: "reasoningEffort", value: "high" },
          { id: "thinking", value: false },
        ],
        descriptorId: "reasoningEffort",
        value: "xhigh",
      }),
    ).toEqual([
      { id: "reasoningEffort", value: "xhigh" },
      { id: "thinking", value: false },
    ]);
  });

  it("omits the compact option control when the provider declares none", () => {
    expect(projectComposerPrimaryOption({ capabilities: {}, selections: undefined })).toBeNull();
  });
});

describe("deriveComposerSendState", () => {
  it("treats placeholder-only prompts and expired terminal contexts as non-sendable", () => {
    const expired = { id: "expired", text: "" };
    const state = deriveComposerSendState({
      prompt: "\uFFFC",
      imageCount: 0,
      terminalContexts: [expired],
    });

    expect(state).toEqual({
      trimmedPrompt: "",
      sendableTerminalContexts: [],
      expiredTerminalContextCount: 1,
      hasSendableContent: false,
    });
  });

  it("keeps authored text while stripping inline terminal placeholders", () => {
    const state = deriveComposerSendState({
      prompt: "  yoo \uFFFC waddup  ",
      imageCount: 0,
      terminalContexts: [{ id: "expired", text: "" }],
    });

    expect(state.trimmedPrompt).toBe("yoo  waddup");
    expect(state.expiredTerminalContextCount).toBe(1);
    expect(state.hasSendableContent).toBe(true);
  });

  it("normalizes terminal text before deciding whether a context is sendable", () => {
    const live = { id: "live", text: "\r\noutput\r\n" };
    const state = deriveComposerSendState({
      prompt: "",
      imageCount: 0,
      terminalContexts: [{ id: "expired", text: "\r\n\r\n" }, live],
    });

    expect(state.sendableTerminalContexts).toEqual([live]);
    expect(state.expiredTerminalContextCount).toBe(1);
    expect(state.hasSendableContent).toBe(true);
  });

  it("treats image and element attachments as sendable content", () => {
    expect(
      deriveComposerSendState({
        prompt: "",
        imageCount: 1,
        terminalContexts: [],
      }).hasSendableContent,
    ).toBe(true);
    expect(
      deriveComposerSendState({
        prompt: "",
        imageCount: 0,
        terminalContexts: [],
        elementContextCount: 1,
      }).hasSendableContent,
    ).toBe(true);
  });
});

describe("deriveComposerControlState", () => {
  it("keeps session state visible while blocking unavailable actions", () => {
    expect(
      deriveComposerControlState({
        working: true,
        blocked: true,
        hasSendableContent: false,
      }),
    ).toEqual({ semanticState: "working", primaryActionState: "disabled" });
    expect(
      deriveComposerControlState({
        working: true,
        blocked: false,
        hasSendableContent: false,
      }),
    ).toEqual({ semanticState: "working", primaryActionState: "stop" });
    expect(
      deriveComposerControlState({
        working: false,
        blocked: true,
        hasSendableContent: true,
      }),
    ).toEqual({ semanticState: "disabled", primaryActionState: "disabled" });
    expect(
      deriveComposerControlState({
        working: false,
        blocked: false,
        hasSendableContent: true,
      }),
    ).toEqual({ semanticState: "sendable", primaryActionState: "send" });
    expect(
      deriveComposerControlState({
        working: false,
        blocked: false,
        hasSendableContent: false,
      }),
    ).toEqual({ semanticState: "idle", primaryActionState: "disabled" });
  });
});
