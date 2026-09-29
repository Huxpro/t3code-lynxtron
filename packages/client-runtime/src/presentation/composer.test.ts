import { describe, expect, it } from "vite-plus/test";

import {
  appendFileContextsToPrompt,
  buildComposerTraitsTriggerPresentation,
  COMPOSER_RUNTIME_MODE_PRESENTATIONS,
  deriveComposerSendState,
  getComposerInteractionModePresentation,
  getComposerUnavailablePlaceholder,
  getComposerRuntimeModePresentation,
  getNextComposerRuntimeMode,
  projectComposerContext,
  projectComposerPrimaryOption,
  toggleComposerInteractionMode,
} from "./composer.ts";

describe("appendFileContextsToPrompt", () => {
  it("materializes canonical file blocks after the visible prompt", () => {
    expect(
      appendFileContextsToPrompt("Review this", [
        { path: "src/a.ts", contents: "export const a = 1;" },
      ]),
    ).toBe('Review this\n\n<file_context path="src/a.ts">\nexport const a = 1;\n</file_context>');
  });
});
import { ProviderDriverKind, type ProviderOptionDescriptor } from "@t3tools/contracts";

describe("composer controls presentation", () => {
  it("does not describe a terminal connection failure as still connecting", () => {
    expect(getComposerUnavailablePlaceholder("error")).toBe("Connection unavailable");
    expect(getComposerUnavailablePlaceholder("connecting")).toBe("Connecting to T3 Code…");
  });

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

  it("shows only context facts present in the canonical thread shell", () => {
    expect(projectComposerContext({ branch: null, worktreePath: null })).toEqual({
      checkoutLabel: "Local checkout",
      branchLabel: "No branch",
    });
    expect(
      projectComposerContext({
        branch: "feature/composer",
        worktreePath: "/repo/.worktrees/composer",
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

  it("omits the compact option control when the provider declares none", () => {
    expect(projectComposerPrimaryOption({ capabilities: {}, selections: undefined })).toBeNull();
  });

  it("summarizes every current model option in declaration order", () => {
    const descriptors: ReadonlyArray<ProviderOptionDescriptor> = [
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
    ];

    expect(
      buildComposerTraitsTriggerPresentation({
        provider: ProviderDriverKind.make("codex"),
        descriptors,
        primarySelectDescriptorId: "reasoningEffort",
        ultrathinkPromptControlled: false,
      }),
    ).toEqual({ label: "High · 1M", showFastModeIcon: false });
  });

  it("uses fast mode as an icon when another trait supplies the label", () => {
    expect(
      buildComposerTraitsTriggerPresentation({
        provider: ProviderDriverKind.make("codex"),
        descriptors: [
          {
            id: "reasoningEffort",
            label: "Reasoning",
            type: "select",
            options: [{ id: "high", label: "High" }],
            currentValue: "high",
          },
          { id: "fastMode", label: "Fast Mode", type: "boolean", currentValue: true },
        ],
        primarySelectDescriptorId: "reasoningEffort",
        ultrathinkPromptControlled: false,
      }),
    ).toEqual({ label: "High", showFastModeIcon: true });
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
