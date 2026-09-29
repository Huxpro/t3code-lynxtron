import type {
  ModelCapabilities,
  ProviderDriverKind,
  ProviderOptionDescriptor,
  ProviderOptionSelection,
  ProviderInteractionMode,
  RuntimeMode,
} from "@t3tools/contracts";
import {
  buildProviderOptionSelectionsFromDescriptors,
  getProviderOptionCurrentLabel,
  getProviderOptionCurrentValue,
  getProviderOptionDescriptors,
} from "@t3tools/shared/providerOptions";

const INLINE_TERMINAL_CONTEXT_PLACEHOLDER = "\uFFFC";

export function getComposerUnavailablePlaceholder(
  status: "error" | "connecting" | "starting-server" | "idle" | "ready",
): string {
  return status === "error" ? "Connection unavailable" : "Connecting to T3 Code…";
}

export interface ComposerRuntimeModePresentation {
  readonly mode: RuntimeMode;
  readonly label: string;
  readonly description: string;
}

export const COMPOSER_RUNTIME_MODE_PRESENTATIONS: ReadonlyArray<ComposerRuntimeModePresentation> = [
  {
    mode: "approval-required",
    label: "Supervised",
    description: "Ask before commands and file changes.",
  },
  {
    mode: "auto-accept-edits",
    label: "Auto-accept edits",
    description: "Auto-approve edits, ask before other actions.",
  },
  {
    mode: "auto",
    label: "Auto",
    description: "An AI reviewer approves routine actions; risky ones still ask.",
  },
  {
    mode: "full-access",
    label: "Full access",
    description: "Allow commands and edits without prompts.",
  },
];

export interface ComposerInteractionModePresentation {
  readonly mode: ProviderInteractionMode;
  readonly label: string;
  readonly description: string;
}

const COMPOSER_INTERACTION_MODE_PRESENTATIONS: Record<
  ProviderInteractionMode,
  ComposerInteractionModePresentation
> = {
  default: {
    mode: "default",
    label: "Build",
    description: "Default mode — click to enter plan mode",
  },
  plan: {
    mode: "plan",
    label: "Plan",
    description: "Plan mode — click to return to normal build mode",
  },
};

export function getComposerRuntimeModePresentation(
  mode: RuntimeMode,
): ComposerRuntimeModePresentation {
  return (
    COMPOSER_RUNTIME_MODE_PRESENTATIONS.find((presentation) => presentation.mode === mode) ??
    COMPOSER_RUNTIME_MODE_PRESENTATIONS[0]!
  );
}

export function getNextComposerRuntimeMode(mode: RuntimeMode): RuntimeMode {
  const currentIndex = COMPOSER_RUNTIME_MODE_PRESENTATIONS.findIndex(
    (presentation) => presentation.mode === mode,
  );
  return COMPOSER_RUNTIME_MODE_PRESENTATIONS[
    (currentIndex + 1) % COMPOSER_RUNTIME_MODE_PRESENTATIONS.length
  ]!.mode;
}

export function getComposerInteractionModePresentation(
  mode: ProviderInteractionMode,
): ComposerInteractionModePresentation {
  return COMPOSER_INTERACTION_MODE_PRESENTATIONS[mode];
}

export function toggleComposerInteractionMode(
  mode: ProviderInteractionMode,
): ProviderInteractionMode {
  return mode === "plan" ? "default" : "plan";
}

export interface ComposerContextPresentation {
  readonly checkoutLabel: "Local checkout" | "Worktree";
  readonly branchLabel: string;
}

export function projectComposerContext(options: {
  readonly branch: string | null | undefined;
  readonly worktreePath: string | null | undefined;
}): ComposerContextPresentation {
  return {
    checkoutLabel: options.worktreePath ? "Worktree" : "Local checkout",
    branchLabel: options.branch?.trim() || "No branch",
  };
}

export interface ComposerPrimaryOptionPresentation {
  readonly id: string;
  readonly label: string;
  readonly valueLabel: string;
  readonly displayLabel: string;
}

export interface ComposerPrimaryOptionProjection {
  readonly presentation: ComposerPrimaryOptionPresentation;
  readonly nextSelections: ReadonlyArray<ProviderOptionSelection>;
}

export interface ComposerTraitsTriggerPresentation {
  readonly label: string;
  readonly showFastModeIcon: boolean;
}

/**
 * Build the canonical compact summary for all server-declared model options.
 * Fast mode uses an icon when other traits provide the readable label, while
 * every other descriptor contributes its current presentation in declaration
 * order.
 */
export function buildComposerTraitsTriggerPresentation(input: {
  readonly provider: ProviderDriverKind;
  readonly descriptors: ReadonlyArray<ProviderOptionDescriptor>;
  readonly primarySelectDescriptorId: string | null;
  readonly ultrathinkPromptControlled: boolean;
}): ComposerTraitsTriggerPresentation {
  let hasFastMode = false;
  let fastModeEnabled = false;
  const labels: Array<string> = [];
  for (const descriptor of input.descriptors) {
    if (descriptor.id === "fastMode" && descriptor.type === "boolean") {
      hasFastMode = true;
      fastModeEnabled = descriptor.currentValue === true;
      continue;
    }
    if (
      input.provider === "codex" &&
      descriptor.id === "serviceTier" &&
      descriptor.type === "select"
    ) {
      const currentValue = getProviderOptionCurrentValue(descriptor);
      const fastTier = descriptor.options.find(({ label }) => label === "Fast");
      if (fastTier && (currentValue === "default" || currentValue === fastTier.id)) {
        hasFastMode = true;
        fastModeEnabled = currentValue === fastTier.id;
        continue;
      }
    }
    const label =
      input.ultrathinkPromptControlled && descriptor.id === input.primarySelectDescriptorId
        ? "Ultrathink"
        : descriptor.type === "boolean"
          ? `${descriptor.label} ${descriptor.currentValue === true ? "On" : "Off"}`
          : getProviderOptionCurrentLabel(descriptor);
    if (typeof label === "string" && label.length > 0) {
      labels.push(label);
    }
  }

  if (labels.length === 0 && hasFastMode) {
    return { label: fastModeEnabled ? "Fast" : "Normal", showFastModeIcon: false };
  }
  return { label: labels.join(" · "), showFastModeIcon: fastModeEnabled };
}

/**
 * Project the first server-declared provider option into a compact host
 * control. Hosts that cannot render a full traits picker can cycle this real
 * descriptor without inventing effort labels or maintaining separate state.
 */
export function projectComposerPrimaryOption(options: {
  readonly capabilities: ModelCapabilities | null | undefined;
  readonly selections: ReadonlyArray<ProviderOptionSelection> | null | undefined;
}): ComposerPrimaryOptionProjection | null {
  if (!options.capabilities) return null;
  const descriptors = getProviderOptionDescriptors({
    caps: options.capabilities,
    selections: options.selections,
  });
  const descriptor = descriptors.find(
    (candidate) =>
      candidate.type === "boolean" || (candidate.type === "select" && candidate.options.length > 1),
  );
  if (!descriptor) return null;

  const currentLabel = getProviderOptionCurrentLabel(descriptor) ?? "Default";
  const currentValue = getProviderOptionCurrentValue(descriptor);
  const nextValue =
    descriptor.type === "boolean"
      ? !(currentValue === true)
      : descriptor.options[
          Math.max(
            0,
            (descriptor.options.findIndex((option) => option.id === currentValue) + 1) %
              descriptor.options.length,
          )
        ]?.id;
  if (nextValue === undefined) return null;

  const nextDescriptors = descriptors.map((candidate) => {
    if (candidate.id !== descriptor.id) return candidate;
    if (candidate.type === "boolean" && typeof nextValue === "boolean") {
      return { ...candidate, currentValue: nextValue };
    }
    if (candidate.type === "select" && typeof nextValue === "string") {
      return { ...candidate, currentValue: nextValue };
    }
    return candidate;
  });
  const nextSelections = buildProviderOptionSelectionsFromDescriptors(nextDescriptors);
  if (!nextSelections) return null;

  return {
    presentation: {
      id: descriptor.id,
      label: descriptor.label,
      valueLabel: currentLabel,
      displayLabel: `${descriptor.label} · ${currentLabel}`,
    },
    nextSelections,
  };
}

function normalizeTerminalContextText(text: string): string {
  return text.replace(/\r\n/gu, "\n").replace(/^\n+|\n+$/gu, "");
}

export interface ComposerSendState<TerminalContext> {
  readonly trimmedPrompt: string;
  readonly sendableTerminalContexts: ReadonlyArray<TerminalContext>;
  readonly expiredTerminalContextCount: number;
  readonly hasSendableContent: boolean;
}

export interface ComposerFileContext {
  readonly path: string;
  readonly contents: string;
  readonly truncated?: boolean;
}

export function appendFileContextsToPrompt(
  prompt: string,
  contexts: ReadonlyArray<ComposerFileContext>,
): string {
  const blocks = contexts
    .filter((context) => context.path.trim() && context.contents.length > 0)
    .map((context) =>
      [
        `<file_context path=${JSON.stringify(context.path)}${context.truncated ? ' truncated="true"' : ""}>`,
        context.contents,
        "</file_context>",
      ].join("\n"),
    );
  const trimmed = prompt.trim();
  if (blocks.length === 0) return trimmed;
  return trimmed ? `${trimmed}\n\n${blocks.join("\n\n")}` : blocks.join("\n\n");
}

/**
 * Derive host-neutral composer sendability.
 *
 * Renderers own their editor and attachment UI; this projection owns the
 * invariant that placeholder-only prompts and expired terminal contexts are
 * not sendable, while images and element contexts are.
 */
export function deriveComposerSendState<
  TerminalContext extends { readonly text: string },
>(options: {
  readonly prompt: string;
  readonly imageCount: number;
  readonly terminalContexts: ReadonlyArray<TerminalContext>;
  readonly elementContextCount?: number;
}): ComposerSendState<TerminalContext> {
  const trimmedPrompt = options.prompt.split(INLINE_TERMINAL_CONTEXT_PLACEHOLDER).join("").trim();
  const sendableTerminalContexts = options.terminalContexts.filter(
    (context) => normalizeTerminalContextText(context.text).length > 0,
  );
  const expiredTerminalContextCount =
    options.terminalContexts.length - sendableTerminalContexts.length;
  const elementContextCount = options.elementContextCount ?? 0;

  return {
    trimmedPrompt,
    sendableTerminalContexts,
    expiredTerminalContextCount,
    hasSendableContent:
      trimmedPrompt.length > 0 ||
      options.imageCount > 0 ||
      sendableTerminalContexts.length > 0 ||
      elementContextCount > 0,
  };
}
