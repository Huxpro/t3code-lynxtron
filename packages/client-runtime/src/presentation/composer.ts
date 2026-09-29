import type {
  ModelCapabilities,
  ProviderOptionSelection,
  ProviderOptionDescriptor,
  ProviderInteractionMode,
  ProviderDriverKind,
  RuntimeMode,
} from "@t3tools/contracts";
import {
  buildProviderOptionSelectionsFromDescriptors,
  getProviderOptionCurrentLabel,
  getProviderOptionCurrentValue,
  getProviderOptionDescriptors,
} from "@t3tools/shared/providerOptions";
import type { SessionPresentationPhase } from "./session.ts";
export {
  deriveLatestContextWindowSnapshot,
  formatContextWindowTokens,
  formatProviderDisplayName,
  type ContextWindowSnapshot,
} from "./contextWindow.ts";

const INLINE_TERMINAL_CONTEXT_PLACEHOLDER = "\uFFFC";

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

export function resolveDefaultComposerPlaceholder(phase: SessionPresentationPhase): string {
  return phase === "disconnected"
    ? "Ask for follow-up changes or attach images"
    : "Ask anything, @tag files/folders, $use skills, or / for commands";
}

export interface ComposerProviderAvailabilityPresentation {
  readonly placeholder: string;
  readonly modelLabel: string | undefined;
}

/** A persisted model is not a visible dispatch target while its provider is unavailable. */
export function projectComposerProviderAvailability(options: {
  readonly phase: SessionPresentationPhase;
  readonly providerAvailable: boolean;
  readonly modelLabel: string | undefined;
}): ComposerProviderAvailabilityPresentation {
  return options.providerAvailable
    ? {
        placeholder: resolveDefaultComposerPlaceholder(options.phase),
        modelLabel: options.modelLabel,
      }
    : {
        placeholder: "Enable a provider in Settings to send a message",
        modelLabel: undefined,
      };
}

export function shouldUseComposerHeroLayout(options: {
  readonly isLocalDraftThread: boolean;
  readonly timelineEntryCount: number;
  readonly isWorking: boolean;
  readonly dockRequested: boolean;
}): boolean {
  return (
    options.isLocalDraftThread &&
    options.timelineEntryCount === 0 &&
    !options.isWorking &&
    !options.dockRequested
  );
}

export function isComposerDraftThread(options: {
  readonly activeThreadId: string | undefined;
  readonly draftHeroThreadId: string | undefined;
}): boolean {
  return (
    options.activeThreadId === undefined || options.activeThreadId === options.draftHeroThreadId
  );
}

export function shouldShowComposerContextStrip(options: {
  readonly hasProject: boolean;
  readonly isRepo: boolean | null | undefined;
}): boolean {
  return options.hasProject && options.isRepo !== false;
}

export interface ComposerContextPresentation {
  readonly checkoutLabel: "Current checkout" | "Current worktree" | "Local checkout" | "Worktree";
  readonly branchLabel: string;
}

export function projectComposerContext(options: {
  readonly branch: string | null | undefined;
  readonly worktreePath: string | null | undefined;
  readonly workspaceModeLocked?: boolean;
}): ComposerContextPresentation {
  return {
    checkoutLabel: options.workspaceModeLocked
      ? options.worktreePath
        ? "Worktree"
        : "Local checkout"
      : options.worktreePath
        ? "Current worktree"
        : "Current checkout",
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

export interface ComposerTraitsMenuItemPresentation {
  readonly id: string;
  readonly label: string;
  readonly isDefault?: boolean;
  readonly selected: boolean;
  readonly value: string | boolean;
}

export interface ComposerTraitsMenuSectionPresentation {
  readonly id: string;
  readonly label: string;
  readonly items: ReadonlyArray<ComposerTraitsMenuItemPresentation>;
}

export function projectComposerTraitsMenu(options: {
  readonly capabilities: ModelCapabilities | null | undefined;
  readonly selections: ReadonlyArray<ProviderOptionSelection> | null | undefined;
}): ReadonlyArray<ComposerTraitsMenuSectionPresentation> {
  if (!options.capabilities) return [];
  const sections: Array<ComposerTraitsMenuSectionPresentation> = [];
  for (const descriptor of getProviderOptionDescriptors({
    caps: options.capabilities,
    selections: options.selections,
  })) {
    if (descriptor.type === "select") {
      const currentValue = getProviderOptionCurrentValue(descriptor);
      const items = descriptor.options.map((option) => ({
        id: option.id,
        label: option.label,
        ...(option.isDefault ? { isDefault: true } : {}),
        selected: option.id === currentValue,
        value: option.id,
      }));
      if (items.length > 0) {
        sections.push({ id: descriptor.id, label: descriptor.label, items });
      }
      continue;
    }
    const currentValue = getProviderOptionCurrentValue(descriptor) === true;
    sections.push({
      id: descriptor.id,
      label: descriptor.label,
      items: [
        { id: "on", label: "On", selected: currentValue, value: true },
        { id: "off", label: "Off", selected: !currentValue, value: false },
      ],
    });
  }
  return sections;
}

export function selectComposerTraitOption(options: {
  readonly capabilities: ModelCapabilities | null | undefined;
  readonly selections: ReadonlyArray<ProviderOptionSelection> | null | undefined;
  readonly descriptorId: string;
  readonly value: string | boolean;
}): ReadonlyArray<ProviderOptionSelection> | null {
  if (!options.capabilities) return null;
  const descriptors = getProviderOptionDescriptors({
    caps: options.capabilities,
    selections: options.selections,
  });
  let changed = false;
  const nextDescriptors = descriptors.map((descriptor) => {
    if (descriptor.id !== options.descriptorId) return descriptor;
    if (descriptor.type === "boolean" && typeof options.value === "boolean") {
      changed = true;
      return { ...descriptor, currentValue: options.value };
    }
    if (
      descriptor.type === "select" &&
      typeof options.value === "string" &&
      descriptor.options.some((option) => option.id === options.value)
    ) {
      changed = true;
      return { ...descriptor, currentValue: options.value };
    }
    return descriptor;
  });
  if (!changed) return null;
  return buildProviderOptionSelectionsFromDescriptors(nextDescriptors) ?? null;
}

export function buildComposerTraitsTriggerDisplay(input: {
  readonly provider: ProviderDriverKind;
  readonly descriptors: ReadonlyArray<ProviderOptionDescriptor>;
  readonly primarySelectDescriptorId: string | null;
  readonly ultrathinkPromptControlled: boolean;
}): { readonly label: string; readonly showFastModeIcon: boolean } {
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

export function projectComposerTraitsTrigger(options: {
  readonly provider: ProviderDriverKind;
  readonly capabilities: ModelCapabilities | null | undefined;
  readonly selections: ReadonlyArray<ProviderOptionSelection> | null | undefined;
}): { readonly label: string; readonly showFastModeIcon: boolean } | null {
  if (!options.capabilities) return null;
  const descriptors = getProviderOptionDescriptors({
    caps: options.capabilities,
    selections: options.selections,
  });
  if (descriptors.length === 0) return null;
  const primarySelectDescriptor =
    descriptors.find(
      (descriptor): descriptor is Extract<ProviderOptionDescriptor, { type: "select" }> =>
        descriptor.type === "select",
    ) ?? null;
  return buildComposerTraitsTriggerDisplay({
    provider: options.provider,
    descriptors,
    primarySelectDescriptorId: primarySelectDescriptor?.id ?? null,
    ultrathinkPromptControlled: false,
  });
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

  const nextSelections = selectComposerTraitOption({
    capabilities: options.capabilities,
    selections: options.selections,
    descriptorId: descriptor.id,
    value: nextValue,
  });
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

export interface ComposerControlState {
  readonly semanticState: "disabled" | "idle" | "sendable" | "working";
  readonly primaryActionState: "disabled" | "send" | "stop";
}

export function deriveComposerControlState(options: {
  readonly working: boolean;
  readonly blocked: boolean;
  readonly hasSendableContent: boolean;
}): ComposerControlState {
  if (options.working) {
    return {
      semanticState: "working",
      primaryActionState: options.blocked ? "disabled" : "stop",
    };
  }
  if (options.blocked) {
    return { semanticState: "disabled", primaryActionState: "disabled" };
  }
  return options.hasSendableContent
    ? { semanticState: "sendable", primaryActionState: "send" }
    : { semanticState: "idle", primaryActionState: "disabled" };
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
