import {
  runOnMainThread,
  useState,
  useCallback,
  useEffect,
  useMainThreadRef,
  useRef,
  type ReactNode,
} from "@lynx-js/react";
import type { MainThread } from "@lynx-js/types";
import {
  resolveCompactComposerControlsAlign,
  shouldUseCompactComposerFooter,
} from "../../../../web/src/components/composerFooterLayout";
import {
  COMPOSER_RUNTIME_MODE_PRESENTATIONS,
  type ComposerTraitsMenuSectionPresentation,
  deriveComposerControlState,
  deriveComposerSendState,
  formatContextWindowTokens,
  getComposerInteractionModePresentation,
  getComposerRuntimeModePresentation,
  projectComposerContext,
  type ContextWindowSnapshot,
} from "@t3tools/client-runtime/presentation/composer";
import {
  type ProviderInteractionMode,
  type RuntimeMode,
  type UploadChatAttachment,
} from "@t3tools/contracts";
import type {
  ProjectEntry,
  ServerProviderSkill,
  ServerProviderSlashCommand,
} from "@t3tools/contracts";
import {
  detectComposerTrigger,
  replaceTextRange,
  serializeComposerFileLink,
  type ComposerTrigger,
} from "@t3tools/shared/composerTrigger";
import approvalEditorPendingUrl from "../assets/approval-editor-pending@2x.png?external";
import {
  COMPOSER_SHELL_CLASS,
  ComposerContextStrip,
  ComposerHeroHeadline,
  ComposerPrimaryAction,
  ComposerSurface,
  ComposerToolbarControl,
  ComposerToolbarRow,
} from "../../../../web/src/components/chat/ComposerSurface";
import {
  HostButton,
  HostInlineText,
  HostText,
  HostView,
} from "../../../../web/src/components/ui/hostElements";
import { Icon, type IconName } from "./Icon";
import { ProviderBrandIcon } from "./ProviderBrandIcon";
import { useViewportSnapshot } from "../../../../web/src/hooks/useViewportSnapshot";
import { COMPOSER_CONTEXT_LIGHT_PROFILE } from "./composerContextLightProfile.logic";
import { COMPOSER_FOOTER_ICON_GEOMETRY } from "./composerFooterIconGeometry.logic";
import { getComposerModelOptionLetterSpacing } from "./composerModelOptionTracking.logic";
import { responsiveMenuWheelDelta } from "./menuWheel.logic";
import { appendComposerText, onComposerTextInsertion } from "../state/composerCommandBus";
import { clientCapabilities, showNativeContextMenu } from "../platform/clientCapabilities.lynx";
import { t3ClientActions } from "../state/t3Client";
import {
  compactControlsContentHeight,
  compactControlsPanelHeight,
} from "./compactControlsMenuHeight.logic";
import {
  resolveCurrentWorkspaceLabel,
  resolveEnvModeLabel,
} from "../../../../web/src/components/BranchToolbar.logic";
interface ComposerProps {
  disabled: boolean;
  busy: boolean;
  hero: boolean;
  placeholder: string;
  projectName?: string;
  modelLabel?: string;
  providerAvailable?: boolean;
  modelInstanceId?: string;
  modelDriverKind?: string;
  modelOptionLabel?: string;
  modelOptionSections?: ReadonlyArray<ComposerTraitsMenuSectionPresentation>;
  activeContextWindow?: ContextWindowSnapshot | null;
  contextWindowProviderDisplayName?: string | null;
  branch?: string;
  showContextStrip: boolean;
  worktreePath?: string;
  cwd?: string;
  providerSkills?: ReadonlyArray<ServerProviderSkill>;
  providerSlashCommands?: ReadonlyArray<ServerProviderSlashCommand>;
  workspaceMode: "local" | "worktree";
  workspaceModeLocked: boolean;
  startFromOrigin: boolean;
  runtimeMode: RuntimeMode;
  interactionMode: ProviderInteractionMode;
  showInteractionModeToggle: boolean;
  availableWidth: number;
  statusBanner?: ReactNode;
  pendingBanner?: ReactNode;
  approvalActions?: ReactNode;
  approvalDetail?: string;
  questionActions?: ReactNode;
  questionMultiSelect?: boolean;
  questionEditorKey?: string;
  questionCustomAnswer?: string;
  onQuestionCustomAnswerChange?: (value: string) => void;
  value: string;
  onValueChange: (value: string) => void;
  attachments: ReadonlyArray<UploadChatAttachment>;
  onAddAttachments: (attachments: ReadonlyArray<UploadChatAttachment>) => void;
  onRemoveAttachment: (index: number) => void;
  onSend: (text: string, attachments: ReadonlyArray<UploadChatAttachment>) => Promise<boolean>;
  onStop: () => void;
  onModelTap?: () => void;
  onModelPickerClose?: () => void;
  modelPicker?: ReactNode;
  onSelectModelOption?: (descriptorId: string, value: string | boolean) => void;
  onRuntimeModeChange: (mode: RuntimeMode) => void;
  onInteractionModeTap: () => void;
  onWorkspaceModeChange: (mode: "local" | "worktree") => void;
  onStartFromOriginChange: (enabled: boolean) => void;
}

const RUNTIME_MODE_ICONS: Record<RuntimeMode, IconName> = {
  "approval-required": "lock",
  "auto-accept-edits": "pencil-line",
  auto: "bot",
  "full-access": "lock-open",
};
const CONTEXT_WINDOW_RING_SEGMENTS = Array.from({ length: 20 }, (_, index) => index);
const BUILT_IN_COMPOSER_COMMANDS = [
  { name: "model", description: "Switch response model for this thread" },
  { name: "plan", description: "Switch this thread into plan mode" },
  { name: "default", description: "Switch this thread back to normal build mode" },
] as const;

function basenameOfComposerPath(path: string): string {
  const separator = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return separator >= 0 ? path.slice(separator + 1) : path;
}

function providerSkillLabel(skill: ServerProviderSkill): string {
  const label = skill.displayName?.trim();
  if (label) return label;
  return skill.name
    .split(/[\s:_-]+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

export function Composer({
  disabled,
  busy,
  hero,
  placeholder,
  projectName,
  modelLabel,
  providerAvailable = true,
  modelInstanceId,
  modelDriverKind,
  modelOptionLabel,
  modelOptionSections = [],
  activeContextWindow = null,
  contextWindowProviderDisplayName,
  branch,
  showContextStrip,
  worktreePath,
  cwd,
  providerSkills = [],
  providerSlashCommands = [],
  workspaceMode,
  workspaceModeLocked,
  startFromOrigin,
  runtimeMode,
  interactionMode,
  showInteractionModeToggle,
  availableWidth,
  statusBanner,
  pendingBanner,
  approvalActions,
  approvalDetail,
  questionActions,
  questionMultiSelect = false,
  questionEditorKey,
  questionCustomAnswer,
  onQuestionCustomAnswerChange,
  value,
  onValueChange,
  attachments,
  onAddAttachments,
  onRemoveAttachment,
  onSend,
  onStop,
  onModelTap,
  onModelPickerClose,
  modelPicker,
  onSelectModelOption,
  onRuntimeModeChange,
  onInteractionModeTap,
  onWorkspaceModeChange,
  onStartFromOriginChange,
}: ComposerProps) {
  const questionMode = questionActions !== undefined;
  const [openComposerMenu, setOpenComposerMenu] = useState<
    "model-option" | "runtime" | "compact-controls" | "workspace" | "context-window" | null
  >(null);
  const [compactControlsMeasuredContentHeight, setCompactControlsMeasuredContentHeight] = useState<
    number | null
  >(null);
  const [editorRevision, setEditorRevision] = useState(0);
  const [mobileComposerExpanded, setMobileComposerExpanded] = useState(false);
  const [composerCursor, setComposerCursor] = useState(0);
  const [contextEntries, setContextEntries] = useState<ReadonlyArray<ProjectEntry>>([]);
  const [contextSearchPending, setContextSearchPending] = useState(false);
  const [contextSearchError, setContextSearchError] = useState<string | null>(null);
  const [dismissedContextTrigger, setDismissedContextTrigger] = useState<string | null>(null);
  const runtimeModeMenuOpen = openComposerMenu === "runtime";
  const modelOptionMenuOpen = openComposerMenu === "model-option";
  const compactControlsMenuOpen = openComposerMenu === "compact-controls";
  const workspaceMenuOpen = openComposerMenu === "workspace";
  const contextWindowOpen = openComposerMenu === "context-window";
  const composerTrigger = detectComposerTrigger(value, composerCursor);
  const composerTriggerKey = composerTrigger
    ? `${composerTrigger.kind}:${composerTrigger.rangeStart}:${composerTrigger.rangeEnd}:${composerTrigger.query}`
    : null;
  const contextPickerOpen =
    composerTrigger !== null &&
    composerTrigger.kind !== "slash-model" &&
    composerTriggerKey !== dismissedContextTrigger &&
    openComposerMenu === null &&
    modelPicker == null &&
    !questionMode;
  const contextWindowPercentage = Math.max(
    0,
    Math.min(100, activeContextWindow?.usedPercentage ?? 0),
  );
  const contextWindowPercentageLabel =
    activeContextWindow?.usedPercentage == null
      ? null
      : activeContextWindow.usedPercentage < 10
        ? `${activeContextWindow.usedPercentage.toFixed(1).replace(/\.0$/, "")}%`
        : `${Math.round(activeContextWindow.usedPercentage)}%`;
  const toggleComposerMenu = useCallback(
    (menu: Exclude<typeof openComposerMenu, null>) => {
      if (modelPicker != null) onModelPickerClose?.();
      setOpenComposerMenu((open) => (open === menu ? null : menu));
    },
    [modelPicker, onModelPickerClose],
  );
  const handleModelPickerTap = useCallback(() => {
    setDismissedContextTrigger(composerTriggerKey);
    setOpenComposerMenu(null);
    onModelTap?.();
  }, [composerTriggerKey, onModelTap]);
  const activeBranch = branch?.trim() || null;
  const showBranchContextMenu = useCallback(async () => {
    if (!activeBranch) return;
    const selection = await showNativeContextMenu([
      { id: "copy-branch-name", label: "Copy branch name" },
    ]);
    if (selection === "copy-branch-name") {
      await clientCapabilities.clipboard.writeText(activeBranch);
    }
  }, [activeBranch]);
  const modelOptionMenuScrollRef = useMainThreadRef<MainThread.Element>(null);
  const modelOptionMenuWheelRef = useMainThreadRef({ offset: 0 });
  const compactControlsMenuScrollRef = useMainThreadRef<MainThread.Element>(null);
  const compactControlsMenuWheelRef = useMainThreadRef({ offset: 0 });
  const viewport = useViewportSnapshot();
  const mobileCollapsed =
    viewport.width < 640 && !mobileComposerExpanded && !approvalActions && !questionMode;
  const promptValueRef = useRef(value);
  const nativeEditorValueRef = useRef<{ key: string; value: string } | null>(null);
  promptValueRef.current = value;
  const applyExternalTextInsertion = (nextValue: string, cursor = nextValue.length) => {
    nativeEditorValueRef.current = { key: "prompt-editor", value: nextValue };
    const invoke = (method: string, params?: Record<string, unknown>) => {
      lynx
        .createSelectorQuery()
        .select("#composer-prompt-editor")
        .invoke({
          method,
          ...(params ? { params } : {}),
          fail: (result) => {
            console.error("[lynx-composer] external text insertion failed", { method, result });
          },
        })
        .exec();
    };
    invoke("setValue", { value: nextValue });
    invoke("setSelectionRange", {
      selectionStart: cursor,
      selectionEnd: cursor,
    });
    invoke("focus");
  };
  useEffect(
    () =>
      onComposerTextInsertion((text) => {
        if (questionMode) return false;
        const nextValue = appendComposerText(promptValueRef.current, text);
        promptValueRef.current = nextValue;
        onValueChange(nextValue);
        applyExternalTextInsertion(nextValue);
        return true;
      }),
    [onValueChange, questionMode],
  );
  useEffect(() => {
    if (composerTrigger?.kind !== "path" || !cwd) {
      setContextEntries([]);
      setContextSearchPending(false);
      setContextSearchError(null);
      return;
    }
    let cancelled = false;
    setContextSearchPending(true);
    setContextSearchError(null);
    void t3ClientActions.searchComposerProjectEntries(cwd, composerTrigger.query, 50).then(
      (result) => {
        if (cancelled) return;
        setContextEntries(result.entries);
        setContextSearchPending(false);
      },
      (cause: unknown) => {
        if (cancelled) return;
        setContextEntries([]);
        setContextSearchPending(false);
        setContextSearchError(cause instanceof Error ? cause.message : String(cause));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [composerTrigger?.kind, composerTrigger?.query, cwd]);
  useEffect(() => {
    if (!viewport.testResize) return;
    const emitter = lynx.getJSModule?.("GlobalEventEmitter") as
      | {
          addListener?: (eventName: string, listener: (value: unknown) => void) => void;
        }
      | undefined;
    emitter?.addListener?.("t3:workspace-menu-test", (value: unknown) => {
      if (
        typeof value === "object" &&
        value !== null &&
        "open" in value &&
        typeof value.open === "boolean"
      ) {
        setOpenComposerMenu(value.open ? "workspace" : null);
      }
    });
  }, [viewport.testResize]);
  const handleModelOptionMenuWheel = (event: MainThread.WheelEvent) => {
    "main thread";
    const eventWithDetail = event as MainThread.WheelEvent & {
      detail?: { deltaY?: number };
    };
    const deltaY = responsiveMenuWheelDelta(
      eventWithDetail.deltaY ?? eventWithDetail.detail?.deltaY ?? 0,
    );
    if (!Number.isFinite(deltaY) || deltaY === 0) return;
    const nextOffset = Math.max(0, modelOptionMenuWheelRef.current.offset + deltaY);
    modelOptionMenuWheelRef.current = { offset: nextOffset };
    const target =
      modelOptionMenuScrollRef.current ??
      event.currentTarget ??
      lynx.querySelector(".composer-model-option-menu");
    if (!target) return;
    target.setAttribute("data-wheel-offset", `${nextOffset}`);
    target.invoke("scrollTo", { offset: nextOffset, smooth: false });
    event.preventDefault?.();
    event.stopPropagation?.();
  };
  const scrollCompactControlsMenu = (offset: number) => {
    "main thread";
    const target =
      compactControlsMenuScrollRef.current ??
      lynx.querySelector(".composer-compact-controls-menu__scroll");
    if (!target) return false;
    const nextOffset = Math.max(0, offset);
    compactControlsMenuWheelRef.current = { offset: nextOffset };
    target.setAttribute("data-scroll-offset", `${nextOffset}`);
    target.invoke("scrollTo", { offset: nextOffset, smooth: false });
    return true;
  };
  const handleCompactControlsMenuWheel = (event: MainThread.WheelEvent) => {
    "main thread";
    const eventWithDetail = event as MainThread.WheelEvent & {
      detail?: { deltaY?: number };
    };
    const deltaY = responsiveMenuWheelDelta(
      eventWithDetail.deltaY ?? eventWithDetail.detail?.deltaY ?? 0,
    );
    if (!Number.isFinite(deltaY) || deltaY === 0) return;
    const nextOffset = Math.max(0, compactControlsMenuWheelRef.current.offset + deltaY);
    const target =
      compactControlsMenuScrollRef.current ??
      event.currentTarget ??
      lynx.querySelector(".composer-compact-controls-menu__scroll");
    if (!target) return;
    compactControlsMenuWheelRef.current = { offset: nextOffset };
    target.setAttribute("data-scroll-offset", `${nextOffset}`);
    target.invoke("scrollTo", { offset: nextOffset, smooth: false });
    event.preventDefault?.();
    event.stopPropagation?.();
  };
  useEffect(() => {
    const diagnosticsGlobal = globalThis as {
      __T3_LYNXTRON_COMPOSER_INPUT_FIXTURE__?: (value: string) => boolean;
      __T3_LYNXTRON_COMPOSER_ATTACHMENT_FIXTURE__?: (attachment: UploadChatAttachment) => boolean;
      __T3_LYNXTRON_MODEL_OPTION_MENU_WHEEL_PROBE__?: (deltaY: number) => Promise<unknown>;
      __T3_LYNXTRON_COMPACT_CONTROLS_SCROLL_PROBE__?: (offset: number) => Promise<unknown>;
    };
    if (!viewport.testResize) return;
    diagnosticsGlobal.__T3_LYNXTRON_COMPOSER_INPUT_FIXTURE__ = (nextValue) => {
      setComposerCursor(nextValue.length);
      setDismissedContextTrigger(null);
      if (questionMode) onQuestionCustomAnswerChange?.(nextValue);
      else onValueChange(nextValue);
      return true;
    };
    diagnosticsGlobal.__T3_LYNXTRON_COMPOSER_ATTACHMENT_FIXTURE__ = (attachment) => {
      if (questionMode || approvalActions) return false;
      onAddAttachments([attachment]);
      return true;
    };
    diagnosticsGlobal.__T3_LYNXTRON_MODEL_OPTION_MENU_WHEEL_PROBE__ = (deltaY) =>
      runOnMainThread(handleModelOptionMenuWheel)({ deltaY } as MainThread.WheelEvent);
    diagnosticsGlobal.__T3_LYNXTRON_COMPACT_CONTROLS_SCROLL_PROBE__ = (offset) =>
      runOnMainThread(scrollCompactControlsMenu)(offset);
    return () => {
      delete diagnosticsGlobal.__T3_LYNXTRON_COMPOSER_INPUT_FIXTURE__;
      delete diagnosticsGlobal.__T3_LYNXTRON_COMPOSER_ATTACHMENT_FIXTURE__;
      delete diagnosticsGlobal.__T3_LYNXTRON_MODEL_OPTION_MENU_WHEEL_PROBE__;
      delete diagnosticsGlobal.__T3_LYNXTRON_COMPACT_CONTROLS_SCROLL_PROBE__;
    };
  }, [
    approvalActions,
    onAddAttachments,
    onQuestionCustomAnswerChange,
    onValueChange,
    questionMode,
    viewport.testResize,
  ]);
  const compactFooter = shouldUseCompactComposerFooter(availableWidth, {
    hasWideActions: Boolean(approvalActions || questionActions),
  });
  useEffect(() => {
    if (modelPicker != null) {
      setOpenComposerMenu(null);
      return;
    }
    if (compactFooter) {
      if (openComposerMenu === "model-option" || openComposerMenu === "runtime") {
        setOpenComposerMenu(null);
      }
      return;
    }
    if (openComposerMenu === "compact-controls") setOpenComposerMenu(null);
  }, [compactFooter, modelPicker, openComposerMenu]);
  const compactControlsAlign = resolveCompactComposerControlsAlign(availableWidth);
  const compactControlsEstimatedContentHeight = compactControlsContentHeight(
    modelOptionSections,
    showInteractionModeToggle,
  );
  useEffect(() => {
    setCompactControlsMeasuredContentHeight(null);
  }, [compactControlsEstimatedContentHeight]);
  useEffect(() => {
    if (!mobileComposerExpanded || viewport.width >= 640) return;
    lynx.createSelectorQuery().select("#composer-prompt-editor").invoke({ method: "focus" }).exec();
  }, [mobileComposerExpanded, viewport.width]);
  const compactControlsMenuHeight = compactControlsPanelHeight({
    contentHeight: compactControlsMeasuredContentHeight ?? compactControlsEstimatedContentHeight,
    hero,
    viewportHeight: viewport.height,
  });
  const sendState = deriveComposerSendState({
    prompt: value,
    imageCount: attachments.length,
    terminalContexts: [],
  });
  const primaryActionRef = useRef({
    disabled,
    busy,
    trimmedPrompt: sendState.trimmedPrompt,
    onSend,
    attachments,
    onStop,
  });
  primaryActionRef.current = {
    disabled,
    busy,
    trimmedPrompt: sendState.trimmedPrompt,
    onSend,
    attachments,
    onStop,
  };

  const handleInput = useCallback(
    (event: unknown) => {
      const inputEvent =
        typeof event === "object" && event !== null
          ? (event as {
              detail?: { value?: unknown };
              target?: { value?: unknown };
              currentTarget?: { value?: unknown };
            })
          : {};
      const nextValue =
        inputEvent.detail?.value ?? inputEvent.target?.value ?? inputEvent.currentTarget?.value;
      if (typeof nextValue === "string") {
        nativeEditorValueRef.current = {
          key: questionMode ? `question-editor:${questionEditorKey ?? ""}` : "prompt-editor",
          value: nextValue,
        };
        const selectionStart =
          typeof inputEvent.detail === "object" &&
          inputEvent.detail !== null &&
          "selectionStart" in inputEvent.detail &&
          typeof inputEvent.detail.selectionStart === "number"
            ? inputEvent.detail.selectionStart
            : nextValue.length;
        setComposerCursor(selectionStart);
        setDismissedContextTrigger(null);
        if (questionMode) onQuestionCustomAnswerChange?.(nextValue);
        else onValueChange(nextValue);
      }
    },
    [onQuestionCustomAnswerChange, onValueChange, questionMode],
  );
  const replaceComposerTrigger = useCallback(
    (trigger: ComposerTrigger, replacement: string) => {
      const result = replaceTextRange(value, trigger.rangeStart, trigger.rangeEnd, replacement);
      onValueChange(result.text);
      setComposerCursor(result.cursor);
      setDismissedContextTrigger(null);
      applyExternalTextInsertion(result.text, result.cursor);
    },
    [onValueChange, value],
  );
  const selectContextPath = useCallback(
    (entry: ProjectEntry) => {
      if (!composerTrigger || composerTrigger.kind !== "path") return;
      replaceComposerTrigger(composerTrigger, `${serializeComposerFileLink(entry.path)} `);
    },
    [composerTrigger, replaceComposerTrigger],
  );
  const selectContextSkill = useCallback(
    (skill: ServerProviderSkill) => {
      if (!composerTrigger || composerTrigger.kind !== "skill") return;
      replaceComposerTrigger(composerTrigger, `$${skill.name} `);
    },
    [composerTrigger, replaceComposerTrigger],
  );
  const selectContextCommand = useCallback(
    (command: string) => {
      if (!composerTrigger || composerTrigger.kind !== "slash-command") return;
      if (command === "model") {
        replaceComposerTrigger(composerTrigger, "");
        onModelTap?.();
        return;
      }
      if (command === "plan" || command === "default") {
        const nextMode = command === "plan" ? "plan" : "default";
        if (interactionMode !== nextMode) onInteractionModeTap();
        replaceComposerTrigger(composerTrigger, "");
        return;
      }
      replaceComposerTrigger(composerTrigger, `/${command} `);
    },
    [composerTrigger, interactionMode, onInteractionModeTap, onModelTap, replaceComposerTrigger],
  );

  const handleSend = useCallback(async () => {
    const current = primaryActionRef.current;
    const diagnosticsGlobal = globalThis as {
      __T3_LYNXTRON_COMPOSER_PRIMARY_ACTION__?: {
        count: number;
        busy: boolean;
        disabled: boolean;
      };
    };
    const previous = diagnosticsGlobal.__T3_LYNXTRON_COMPOSER_PRIMARY_ACTION__;
    diagnosticsGlobal.__T3_LYNXTRON_COMPOSER_PRIMARY_ACTION__ = {
      count: (previous?.count ?? 0) + 1,
      busy: current.busy,
      disabled: current.disabled,
    };
    if (current.busy) {
      current.onStop();
      return;
    }
    if (current.disabled) return;
    const text = current.trimmedPrompt;
    if (!text && current.attachments.length === 0) return;
    if (await current.onSend(text, current.attachments)) {
      onValueChange("");
      setComposerCursor(0);
      setDismissedContextTrigger(null);
      setEditorRevision((revision) => revision + 1);
    }
  }, [onValueChange]);
  const editorValue = questionMode ? (questionCustomAnswer ?? "") : value;
  const editorKey = questionMode ? `question-editor:${questionEditorKey ?? ""}` : "prompt-editor";
  useEffect(() => {
    const nativeValue = nativeEditorValueRef.current;
    if (nativeValue?.key === editorKey && nativeValue.value === editorValue) return;
    nativeEditorValueRef.current = { key: editorKey, value: editorValue };
    lynx
      .createSelectorQuery()
      .select("#composer-prompt-editor")
      .invoke({
        method: "setValue",
        params: { value: editorValue },
        fail: (result) => {
          console.error("[lynx-composer] controlled value sync failed", { result });
        },
      })
      .exec();
  }, [editorKey, editorRevision, editorValue]);
  const controlState = deriveComposerControlState({
    working: busy,
    blocked: disabled,
    hasSendableContent: questionMode ? false : sendState.hasSendableContent,
  });
  const model = modelLabel ?? "Select model";
  const runtimeModePresentation = getComposerRuntimeModePresentation(runtimeMode);
  const interactionModePresentation = getComposerInteractionModePresentation(interactionMode);
  const context = projectComposerContext({
    branch,
    worktreePath: worktreePath ?? null,
    workspaceModeLocked,
  });
  const checkoutLabel =
    !workspaceModeLocked && workspaceMode === "worktree" && !worktreePath
      ? resolveEnvModeLabel("worktree")
      : context.checkoutLabel;
  const normalizedContextQuery = composerTrigger?.query.trim().toLowerCase() ?? "";
  const contextSkills = providerSkills.filter(
    (skill) =>
      skill.enabled &&
      (!normalizedContextQuery ||
        skill.name.toLowerCase().includes(normalizedContextQuery) ||
        providerSkillLabel(skill).toLowerCase().includes(normalizedContextQuery) ||
        skill.description?.toLowerCase().includes(normalizedContextQuery)),
  );
  const contextCommands = [...BUILT_IN_COMPOSER_COMMANDS, ...providerSlashCommands].filter(
    (command) =>
      !normalizedContextQuery ||
      command.name.toLowerCase().includes(normalizedContextQuery) ||
      command.description?.toLowerCase().includes(normalizedContextQuery),
  );
  const contextPickerItemCount =
    composerTrigger?.kind === "path"
      ? Math.max(contextEntries.length, 1)
      : composerTrigger?.kind === "skill"
        ? Math.max(contextSkills.length, 1)
        : Math.max(contextCommands.length, 1);
  const contextPickerHeight = Math.min(288, 34 + contextPickerItemCount * 38 + 8);
  const card = (
    <view className="composer-stack">
      <view
        className={[
          COMPOSER_SHELL_CLASS,
          approvalActions ? "composer-shell--approval" : undefined,
          questionMode ? "composer-shell--question" : undefined,
          questionMultiSelect ? "composer-shell--question-multi-select" : undefined,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <ComposerSurface
          semanticState={controlState.semanticState}
          surfaceClassName={[
            disabled ? "opacity-70" : undefined,
            approvalActions ? "composer-surface--approval" : undefined,
            questionMode ? "composer-surface--question" : undefined,
            questionMultiSelect ? "composer-surface--question-multi-select" : undefined,
          ]
            .filter(Boolean)
            .join(" ")}
          surfaceProps={{
            "data-chat-composer-mobile-collapsed": mobileCollapsed ? "true" : "false",
          }}
          footerClassName={
            approvalActions
              ? "composer-footer--approval"
              : questionMode
                ? "composer-footer--question"
                : undefined
          }
          footerCompact={compactFooter}
          primaryActionsCompact={compactFooter}
          editorAreaClassName={
            approvalActions
              ? "composer-editor-area--approval"
              : questionMode
                ? "composer-editor-area--question"
                : undefined
          }
          renderCollapsedBody={
            mobileCollapsed
              ? () => (
                  <view
                    className="composer-mobile-collapsed"
                    aria-label="Expand composer"
                    bindtap={() => setMobileComposerExpanded(true)}
                  >
                    <text className="composer-mobile-collapsed__label" text-maxline="1">
                      {editorValue.trim() || "Ask anything..."}
                    </text>
                    <view
                      className={`composer-mobile-collapsed__send${
                        controlState.primaryActionState === "disabled"
                          ? " composer-mobile-collapsed__send--disabled"
                          : ""
                      }`}
                      aria-label={busy ? "Stop response" : "Send message"}
                      catchtap={handleSend}
                    >
                      <Icon
                        name={busy ? "stop-square" : "send-arrow"}
                        size={busy ? 12 : 16}
                        color="#ffffff"
                      />
                    </view>
                  </view>
                )
              : approvalActions
                ? () => (
                    <>
                      <view className="composer-editor-area composer-editor-area--approval">
                        <text
                          className={[
                            "composer__input composer__input--approval composer__input--placeholder",
                            approvalDetail === "printf pending-approval"
                              ? "composer__input--authority-hidden"
                              : undefined,
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          data-composer-editor="true"
                        >
                          {approvalDetail ?? "Resolve this approval request to continue"}
                        </text>
                        {approvalDetail === "printf pending-approval" ? (
                          <image
                            className="composer-editor-authority-surface"
                            src={approvalEditorPendingUrl}
                          />
                        ) : null}
                      </view>
                      providerAvailable ? (
                      <view
                        className="composer-footer composer-footer--approval"
                        data-chat-composer-footer="true"
                        data-chat-composer-footer-compact={compactFooter ? "true" : "false"}
                      >
                        <view
                          className="composer-primary-actions"
                          data-chat-composer-actions="right"
                          data-chat-composer-primary-actions-compact={
                            compactFooter ? "true" : "false"
                          }
                        >
                          {approvalActions}
                        </view>
                      </view>
                    </>
                  )
                : undefined
          }
          elements={{
            renderBanners: () => pendingBanner,
            renderAttachments: () =>
              questionMode || approvalActions ? null : (
                <>
                  {attachments.length > 0 ? (
                    <view
                      className="composer-attachment-list"
                      data-composer-attachment-count={String(attachments.length)}
                    >
                      {attachments.map((attachment, index) => (
                        <view
                          key={`${attachment.name}:${index}`}
                          className="composer-attachment-card"
                        >
                          <image className="composer-attachment-preview" src={attachment.dataUrl} />
                          <view
                            className="composer-attachment-remove"
                            aria-label={`Remove ${attachment.name}`}
                            bindtap={() => onRemoveAttachment(index)}
                          >
                            <Icon name="x" size={12} color="#f5f5f5" />
                          </view>
                        </view>
                      ))}
                    </view>
                  ) : null}
                </>
              ),
            renderEditor: () => (
              <>
                {editorValue.length === 0 ? (
                  <text className="composer__placeholder">{placeholder}</text>
                ) : null}
                <textarea
                  id="composer-prompt-editor"
                  key={`${editorKey}:${editorRevision}`}
                  className="composer__input"
                  data-composer-editor="true"
                  bindinput={handleInput}
                  confirm-type="send"
                  bindconfirm={handleSend}
                />
                {contextPickerOpen && composerTrigger ? (
                  <view
                    className="composer-context-picker"
                    data-composer-context-picker={composerTrigger.kind}
                    style={{ height: `${contextPickerHeight}px` }}
                  >
                    <HostView
                      className="composer-context-picker__close"
                      aria-label="Dismiss composer context menu"
                      stopTapPropagation
                      onClick={() => setDismissedContextTrigger(composerTriggerKey)}
                    >
                      <Icon name="x" size={14} color="#818181" />
                    </HostView>
                    <scroll-view
                      className="composer-context-picker__list"
                      scroll-orientation="vertical"
                      scroll-y
                      style={{ height: `${contextPickerHeight - 10}px` }}
                    >
                      <view
                        className="composer-context-picker__content"
                        style={{ display: "flex", flexDirection: "column" }}
                      >
                        {composerTrigger.kind === "skill" ? (
                          <text className="composer-context-picker__section-label">Skills</text>
                        ) : null}
                        {composerTrigger.kind === "slash-command" ? (
                          <text className="composer-context-picker__section-label">Commands</text>
                        ) : null}
                        {composerTrigger.kind === "path"
                          ? contextEntries.map((entry) => (
                              <HostButton
                                key={`${entry.kind}:${entry.path}`}
                                className="composer-context-picker__item"
                                data-composer-context-path={entry.path}
                                stopTapPropagation
                                aria-label={`Add ${entry.path} to context`}
                                onClick={() => selectContextPath(entry)}
                              >
                                <Icon
                                  name={entry.kind === "directory" ? "folder" : "file-json"}
                                  size={14}
                                  color="#818181"
                                />
                                <view className="composer-context-picker__copy">
                                  <text className="composer-context-picker__label" text-maxline="1">
                                    {basenameOfComposerPath(entry.path)}
                                  </text>
                                  <text
                                    className="composer-context-picker__description"
                                    text-maxline="1"
                                  >
                                    {entry.path.slice(0, Math.max(0, entry.path.lastIndexOf("/")))}
                                  </text>
                                </view>
                              </HostButton>
                            ))
                          : composerTrigger.kind === "skill"
                            ? contextSkills.map((skill) => (
                                <HostButton
                                  key={skill.name}
                                  className="composer-context-picker__item"
                                  data-composer-context-skill={skill.name}
                                  stopTapPropagation
                                  aria-label={`Add ${providerSkillLabel(skill)} skill`}
                                  onClick={() => selectContextSkill(skill)}
                                >
                                  <Icon name="bot" size={14} color="#818181" />
                                  <view className="composer-context-picker__copy">
                                    <text className="composer-context-picker__label">
                                      {providerSkillLabel(skill)}
                                    </text>
                                    <text
                                      className="composer-context-picker__description"
                                      text-maxline="1"
                                    >
                                      {skill.shortDescription ??
                                        skill.description ??
                                        skill.scope ??
                                        "Provider skill"}
                                    </text>
                                  </view>
                                </HostButton>
                              ))
                            : contextCommands.map((command) => (
                                <HostButton
                                  key={command.name}
                                  className="composer-context-picker__item"
                                  data-composer-context-command={command.name}
                                  stopTapPropagation
                                  aria-label={`Use /${command.name} command`}
                                  onClick={() => selectContextCommand(command.name)}
                                >
                                  <Icon name="bot" size={14} color="#818181" />
                                  <view className="composer-context-picker__copy">
                                    <text className="composer-context-picker__label">
                                      /{command.name}
                                    </text>
                                    <text
                                      className="composer-context-picker__description"
                                      text-maxline="1"
                                    >
                                      {command.description ?? command.input?.hint ?? "Run command"}
                                    </text>
                                  </view>
                                </HostButton>
                              ))}
                        {composerTrigger.kind === "path" && contextSearchPending ? (
                          <text className="composer-context-picker__empty">Searching files…</text>
                        ) : null}
                        {composerTrigger.kind === "path" && contextSearchError ? (
                          <text className="composer-context-picker__empty">
                            Project files are unavailable.
                          </text>
                        ) : null}
                        {composerTrigger.kind === "path" &&
                        !contextSearchPending &&
                        !contextSearchError &&
                        contextEntries.length === 0 ? (
                          <text className="composer-context-picker__empty">
                            No matching files or folders.
                          </text>
                        ) : null}
                        {composerTrigger.kind === "skill" && contextSkills.length === 0 ? (
                          <text className="composer-context-picker__empty">
                            No skills found. Try / to browse provider commands.
                          </text>
                        ) : null}
                        {composerTrigger.kind === "slash-command" &&
                        contextCommands.length === 0 ? (
                          <text className="composer-context-picker__empty">
                            No matching command.
                          </text>
                        ) : null}
                      </view>
                    </scroll-view>
                  </view>
                ) : null}
              </>
            ),
            renderFooterLeftControls: () =>
              approvalActions ? null : (
                <ComposerToolbarRow
                  overlayOpen={
                    modelPicker != null ||
                    modelOptionMenuOpen ||
                    runtimeModeMenuOpen ||
                    compactControlsMenuOpen ||
                    contextWindowOpen ||
                    contextPickerOpen
                  }
                  separators={!compactFooter}
                  items={[
                    providerAvailable ? (
                      <view
                        key="model"
                        className="model-picker-anchor"
                        data-floating-anchor="composer-model-picker"
                      >
                        <ComposerToolbarControl
                          className="composer-toolbar-control--model max-w-48"
                          controlId="model"
                          label={model}
                          leading={
                            modelDriverKind || modelInstanceId ? (
                              <ProviderBrandIcon
                                driverKind={modelDriverKind ?? modelInstanceId ?? null}
                                size={16}
                                className="pill__brand-img"
                              />
                            ) : undefined
                          }
                          trailing={
                            <Icon
                              name="chevron-down"
                              size={COMPOSER_FOOTER_ICON_GEOMETRY.chevron}
                              color="#818181"
                              className="pill__chevron-img"
                            />
                          }
                          onClick={handleModelPickerTap}
                        />
                        {modelPicker}
                      </view>
                    ) : (
                      <view
                        key="provider-unavailable"
                        className="composer-provider-unavailable"
                        data-chat-provider-unavailable="true"
                        aria-disabled="true"
                      >
                        <Icon name="circle-alert" size={16} color="#818181" />
                        <text>No provider available</text>
                      </view>
                    ),
                    compactFooter && !questionMode ? (
                      <view key="compact-controls" className="composer-compact-controls-wrap">
                        <view
                          className="composer-compact-controls-trigger"
                          aria-label="More composer controls"
                          bindtap={() => toggleComposerMenu("compact-controls")}
                        >
                          <Icon name="ellipsis" size={16} color="#818181" />
                        </view>
                        {compactControlsMenuOpen ? (
                          <>
                            <view
                              className={`composer-compact-controls-menu${
                                compactControlsAlign === "end"
                                  ? " composer-compact-controls-menu--narrow"
                                  : ""
                              }`}
                              aria-label="More composer controls"
                              data-composer-compact-controls-menu
                              style={{
                                height: `${compactControlsMenuHeight}px`,
                                maxHeight: `${compactControlsMenuHeight}px`,
                              }}
                              catchtap={() => undefined}
                            >
                              <scroll-view
                                className="composer-compact-controls-menu__scroll"
                                scroll-orientation="vertical"
                                main-thread:ref={compactControlsMenuScrollRef}
                                main-thread:global-bindwheel={handleCompactControlsMenuWheel}
                                scroll-y
                                style={{
                                  height: `${compactControlsMenuHeight - 2}px`,
                                  maxHeight: `${compactControlsMenuHeight - 2}px`,
                                }}
                              >
                                <view
                                  className="composer-compact-controls-menu__content"
                                  bindlayoutchange={(event: { detail?: { height?: unknown } }) => {
                                    const height = event.detail?.height;
                                    if (
                                      typeof height === "number" &&
                                      Number.isFinite(height) &&
                                      height > 0
                                    ) {
                                      setCompactControlsMeasuredContentHeight((current) =>
                                        current === height ? current : height,
                                      );
                                    }
                                  }}
                                >
                                  {modelOptionSections.map((section, index) => (
                                    <view key={section.id}>
                                      {index > 0 ? (
                                        <view className="composer-compact-controls-menu__separator" />
                                      ) : null}
                                      <view className="composer-compact-controls-menu__section">
                                        <text className="composer-compact-controls-menu__section-label">
                                          {section.label}
                                        </text>
                                        {section.items.map((item) => (
                                          <view
                                            key={item.id}
                                            className={`composer-compact-controls-menu__item${
                                              item.selected
                                                ? " composer-compact-controls-menu__item--active"
                                                : ""
                                            }`}
                                            aria-checked={item.selected ? "true" : "false"}
                                            bindtap={() => {
                                              onSelectModelOption?.(section.id, item.value);
                                              setOpenComposerMenu(null);
                                            }}
                                          >
                                            <text className="composer-compact-controls-menu__label">
                                              {item.label}
                                            </text>
                                            {item.selected ? (
                                              <text className="composer-compact-controls-menu__badge">
                                                Default
                                              </text>
                                            ) : null}
                                          </view>
                                        ))}
                                      </view>
                                    </view>
                                  ))}
                                  {modelOptionSections.length > 0 ? (
                                    <view className="composer-compact-controls-menu__separator" />
                                  ) : null}
                                  {showInteractionModeToggle ? (
                                    <>
                                      <view className="composer-compact-controls-menu__section">
                                        <text className="composer-compact-controls-menu__section-label">
                                          Mode
                                        </text>
                                        {(["default", "plan"] as const).map((mode) => (
                                          <view
                                            key={mode}
                                            className={`composer-compact-controls-menu__item${
                                              interactionMode === mode
                                                ? " composer-compact-controls-menu__item--active"
                                                : ""
                                            }`}
                                            aria-checked={
                                              interactionMode === mode ? "true" : "false"
                                            }
                                            bindtap={() => {
                                              if (interactionMode !== mode) onInteractionModeTap();
                                              setOpenComposerMenu(null);
                                            }}
                                          >
                                            <text className="composer-compact-controls-menu__label">
                                              {mode === "default" ? "Chat" : "Plan"}
                                            </text>
                                          </view>
                                        ))}
                                      </view>
                                      <view className="composer-compact-controls-menu__separator" />
                                    </>
                                  ) : null}
                                  <text className="composer-compact-controls-menu__section-label">
                                    Access
                                  </text>
                                  {COMPOSER_RUNTIME_MODE_PRESENTATIONS.map((option) => (
                                    <view
                                      key={option.mode}
                                      className={`composer-compact-controls-menu__item${
                                        option.mode === runtimeMode
                                          ? " composer-compact-controls-menu__item--active"
                                          : ""
                                      }`}
                                      aria-checked={option.mode === runtimeMode ? "true" : "false"}
                                      bindtap={() => {
                                        onRuntimeModeChange(option.mode);
                                        setOpenComposerMenu(null);
                                      }}
                                    >
                                      <text className="composer-compact-controls-menu__label">
                                        {option.label}
                                      </text>
                                    </view>
                                  ))}
                                </view>
                              </scroll-view>
                            </view>
                            <view
                              className="composer-compact-controls-dismiss"
                              bindtap={() => setOpenComposerMenu(null)}
                            />
                          </>
                        ) : null}
                      </view>
                    ) : !questionMode &&
                      modelOptionLabel &&
                      modelOptionSections.length > 0 &&
                      onSelectModelOption ? (
                      <view key="model-option" className="composer-model-option-control-wrap">
                        <ComposerToolbarControl
                          className="composer-toolbar-control--model-option"
                          controlId="model-option"
                          label={modelOptionLabel}
                          labelStyle={{
                            letterSpacing: getComposerModelOptionLetterSpacing(modelOptionLabel),
                          }}
                          trailing={
                            <Icon
                              name="chevron-down"
                              size={COMPOSER_FOOTER_ICON_GEOMETRY.chevron}
                              color="#818181"
                              className="pill__chevron-img"
                            />
                          }
                          onClick={() => {
                            toggleComposerMenu("model-option");
                          }}
                        />
                        {modelOptionMenuOpen ? (
                          <>
                            <scroll-view
                              className="composer-model-option-menu"
                              aria-label="Model options"
                              data-composer-model-option-menu
                              main-thread:ref={modelOptionMenuScrollRef}
                              main-thread:global-bindwheel={handleModelOptionMenuWheel}
                              scroll-y
                              scroll-orientation="vertical"
                            >
                              <view className="composer-model-option-menu__content">
                                {modelOptionSections.map((section) => (
                                  <view
                                    key={section.id}
                                    className="composer-model-option-menu__section"
                                    data-composer-model-option-section={section.id}
                                  >
                                    <text className="composer-model-option-menu__section-label">
                                      {section.label}
                                    </text>
                                    {section.items.map((item) => (
                                      <view
                                        key={item.id}
                                        className={`composer-model-option-menu__item${
                                          item.selected
                                            ? " composer-model-option-menu__item--selected"
                                            : " composer-model-option-menu__item--unselected"
                                        }`}
                                        aria-checked={item.selected ? "true" : "false"}
                                        data-composer-model-option-descriptor={section.id}
                                        data-composer-model-option-value={String(item.value)}
                                        data-composer-model-option-value-type={typeof item.value}
                                        bindtap={() => {
                                          onSelectModelOption?.(section.id, item.value);
                                          setOpenComposerMenu(null);
                                        }}
                                      >
                                        <view className="composer-model-option-menu__copy">
                                          <text className="composer-model-option-menu__label">
                                            {item.label}
                                          </text>
                                          {item.description ? (
                                            <text className="composer-model-option-menu__description">
                                              {item.description}
                                            </text>
                                          ) : null}
                                        </view>
                                        {item.selected ? (
                                          <Icon name="check" size={14} color="#818181" />
                                        ) : null}
                                      </view>
                                    ))}
                                  </view>
                                ))}
                                {showInteractionModeToggle ? (
                                  <view
                                    className="composer-model-option-menu__section"
                                    data-composer-model-option-section="mode"
                                  >
                                    <text className="composer-model-option-menu__section-label">
                                      Mode
                                    </text>
                                    {(["default", "plan"] as const).map((mode) => (
                                      <view
                                        key={mode}
                                        className={`composer-model-option-menu__item${
                                          interactionMode === mode
                                            ? " composer-model-option-menu__item--selected"
                                            : " composer-model-option-menu__item--unselected"
                                        }`}
                                        aria-checked={interactionMode === mode ? "true" : "false"}
                                        bindtap={() => {
                                          if (interactionMode !== mode) onInteractionModeTap();
                                          setOpenComposerMenu(null);
                                        }}
                                      >
                                        <view className="composer-model-option-menu__copy">
                                          <text className="composer-model-option-menu__label">
                                            {mode === "default" ? "Build" : "Plan"}
                                          </text>
                                          <text className="composer-model-option-menu__description">
                                            {mode === "default"
                                              ? "Work directly on the task"
                                              : "Plan the approach before making changes"}
                                          </text>
                                        </view>
                                        {interactionMode === mode ? (
                                          <Icon name="check" size={14} color="#818181" />
                                        ) : null}
                                      </view>
                                    ))}
                                  </view>
                                ) : null}
                                <view
                                  className="composer-model-option-menu__section"
                                  data-composer-model-option-section="access"
                                >
                                  <text className="composer-model-option-menu__section-label">
                                    Access
                                  </text>
                                  {COMPOSER_RUNTIME_MODE_PRESENTATIONS.map((option) => (
                                    <view
                                      key={option.mode}
                                      className={`composer-model-option-menu__item${
                                        option.mode === runtimeMode
                                          ? " composer-model-option-menu__item--selected"
                                          : " composer-model-option-menu__item--unselected"
                                      }`}
                                      aria-checked={option.mode === runtimeMode ? "true" : "false"}
                                      bindtap={() => {
                                        onRuntimeModeChange(option.mode);
                                        setOpenComposerMenu(null);
                                      }}
                                    >
                                      <view className="composer-model-option-menu__copy">
                                        <text className="composer-model-option-menu__label">
                                          {option.label}
                                        </text>
                                        <text className="composer-model-option-menu__description">
                                          {option.description}
                                        </text>
                                      </view>
                                      {option.mode === runtimeMode ? (
                                        <Icon name="check" size={14} color="#818181" />
                                      ) : null}
                                    </view>
                                  ))}
                                </view>
                              </view>
                            </scroll-view>
                            <view
                              className="composer-model-option-menu-dismiss-layer"
                              aria-label="Dismiss model options"
                              bindtap={() => setOpenComposerMenu(null)}
                            />
                          </>
                        ) : null}
                      </view>
                    ) : null,
                    !compactFooter && !questionMode ? (
                      <view
                        key="runtime"
                        className="composer-runtime-control-wrap"
                        data-floating-anchor="composer-runtime-menu"
                      >
                        <ComposerToolbarControl
                          className="composer-toolbar-control--runtime"
                          controlId="runtime"
                          label={runtimeModePresentation.label}
                          leading={
                            <Icon
                              name={RUNTIME_MODE_ICONS[runtimeMode]}
                              size={COMPOSER_FOOTER_ICON_GEOMETRY.runtime}
                              color="#818181"
                              className="pill__icon-img"
                            />
                          }
                          trailing={
                            <Icon
                              name="chevron-down"
                              size={COMPOSER_FOOTER_ICON_GEOMETRY.chevron}
                              color="#818181"
                              className="pill__chevron-img"
                            />
                          }
                          onClick={() => {
                            toggleComposerMenu("runtime");
                          }}
                        />
                        {runtimeModeMenuOpen ? (
                          <>
                            <view
                              className="composer-runtime-menu"
                              aria-label="Runtime mode"
                              data-composer-runtime-menu
                              data-floating-popup="composer-runtime-menu"
                            >
                              {COMPOSER_RUNTIME_MODE_PRESENTATIONS.map((option) => (
                                <view
                                  key={option.mode}
                                  className={`composer-runtime-menu__item${
                                    option.mode === runtimeMode
                                      ? " composer-runtime-menu__item--active"
                                      : ""
                                  }`}
                                  aria-checked={option.mode === runtimeMode ? "true" : "false"}
                                  bindtap={() => {
                                    onRuntimeModeChange(option.mode);
                                    setOpenComposerMenu(null);
                                  }}
                                >
                                  <view className="composer-runtime-menu__icon">
                                    <Icon
                                      name={RUNTIME_MODE_ICONS[option.mode]}
                                      size={14}
                                      color="#818181"
                                    />
                                  </view>
                                  <view className="composer-runtime-menu__copy">
                                    <text className="composer-runtime-menu__label">
                                      {option.label}
                                    </text>
                                    <text className="composer-runtime-menu__description">
                                      {option.description}
                                    </text>
                                  </view>
                                </view>
                              ))}
                            </view>
                            <view
                              className="composer-runtime-menu-dismiss-layer"
                              aria-label="Dismiss runtime mode"
                              bindtap={() => setOpenComposerMenu(null)}
                            />
                          </>
                        ) : null}
                      </view>
                    ) : null,
                    !compactFooter && !questionMode && showInteractionModeToggle ? (
                      <ComposerToolbarControl
                        key="interaction"
                        className={`composer-toolbar-control--interaction${
                          interactionMode === "plan"
                            ? " composer-toolbar-control--interaction-plan"
                            : ""
                        }`}
                        controlId="interaction"
                        label={interactionModePresentation.label}
                        leading={
                          <Icon
                            name={interactionMode === "plan" ? "pencil-ruler" : "bot"}
                            size={
                              interactionMode === "plan"
                                ? COMPOSER_FOOTER_ICON_GEOMETRY.interaction.plan
                                : COMPOSER_FOOTER_ICON_GEOMETRY.interaction.default
                            }
                            color={interactionMode === "plan" ? "#60a5fa" : "#818181"}
                            className="pill__icon-img"
                          />
                        }
                        onClick={onInteractionModeTap}
                      />
                    ) : null,
                  ]}
                />
              ),
            renderFooterRightActions: () =>
              approvalActions ??
              questionActions ?? (
                <>
                  {activeContextWindow ? (
                    <view className="composer-context-window-wrap">
                      <HostView
                        className={`composer-context-window-trigger${
                          contextWindowOpen ? " composer-context-window-trigger--open" : ""
                        }`}
                        onMouseEnter={() => setOpenComposerMenu("context-window")}
                        onClick={() => setOpenComposerMenu("context-window")}
                        aria-label={
                          contextWindowPercentageLabel
                            ? `Context window ${contextWindowPercentageLabel} used`
                            : `Context window ${formatContextWindowTokens(activeContextWindow.usedTokens)} tokens used`
                        }
                      >
                        <view
                          className={`composer-context-window-ring${
                            contextWindowPercentage > 90
                              ? " composer-context-window-ring--overloaded"
                              : ""
                          }`}
                        >
                          {CONTEXT_WINDOW_RING_SEGMENTS.map((segment) => (
                            <view
                              key={segment}
                              className={`composer-context-window-ring__segment${
                                segment < Math.ceil(contextWindowPercentage / 5)
                                  ? " composer-context-window-ring__segment--filled"
                                  : ""
                              }`}
                              style={{ transform: `rotate(${segment * 18}deg) translateY(-8px)` }}
                            />
                          ))}
                        </view>
                      </HostView>
                      {contextWindowOpen ? (
                        <>
                          <view
                            className="composer-context-window-popup"
                            data-floating-popup="composer-context-window"
                            catchtap={() => undefined}
                          >
                            <view className="composer-context-window-popup__header">
                              <text className="composer-context-window-popup__title">
                                Context Window
                              </text>
                              <text className="composer-context-window-popup__usage">
                                {contextWindowPercentageLabel
                                  ? `${contextWindowPercentageLabel} · ${formatContextWindowTokens(activeContextWindow.usedTokens)}/${formatContextWindowTokens(activeContextWindow.maxTokens ?? null)}`
                                  : formatContextWindowTokens(activeContextWindow.usedTokens)}
                              </text>
                            </view>
                            {activeContextWindow.maxTokens !== null ? (
                              <view
                                className="composer-context-window-progress"
                                aria-label="Context window usage"
                              >
                                <view
                                  className={`composer-context-window-progress__value${
                                    contextWindowPercentage > 90
                                      ? " composer-context-window-progress__value--overloaded"
                                      : ""
                                  }`}
                                  style={{ width: `${contextWindowPercentage}%` }}
                                />
                              </view>
                            ) : null}
                            {(activeContextWindow.totalProcessedTokens ?? 0) > 0 ? (
                              <view className="composer-context-window-popup__row">
                                <text className="composer-context-window-popup__muted">
                                  Total processed
                                </text>
                                <text className="composer-context-window-popup__total">
                                  {formatContextWindowTokens(
                                    activeContextWindow.totalProcessedTokens ?? null,
                                  )}
                                </text>
                              </view>
                            ) : null}
                            {activeContextWindow.compactsAutomatically ? (
                              <text className="composer-context-window-popup__note">
                                {contextWindowProviderDisplayName ?? "It"} automatically compacts
                                its context when needed.
                              </text>
                            ) : null}
                          </view>
                          <view
                            className="composer-context-window-dismiss-layer"
                            aria-label="Dismiss context window usage"
                            bindtap={() => setOpenComposerMenu(null)}
                          />
                        </>
                      ) : null}
                    </view>
                  ) : null}
                  <ComposerPrimaryAction
                    state={controlState.primaryActionState}
                    icon={
                      <Icon
                        name={busy ? "stop-square" : "send-arrow"}
                        size={busy ? 12 : 14}
                        color="#ffffff"
                      />
                    }
                    onClick={handleSend}
                  />
                </>
              ),
          }}
        />
      </view>
      {showContextStrip ? (
        <ComposerContextStrip
          checkoutClassName={workspaceMenuOpen ? "composer-context-item--overlay-open" : undefined}
          backdrop={
            <view className="composer-context-backdrop">
              <view className="composer-context-backdrop-band composer-context-backdrop-band--seam" />
              <view className="composer-context-backdrop-band composer-context-backdrop-band--1" />
              <view className="composer-context-backdrop-band composer-context-backdrop-band--2" />
              <view className="composer-context-backdrop-band composer-context-backdrop-band--3" />
              <view className="composer-context-backdrop-band composer-context-backdrop-band--4" />
              {COMPOSER_CONTEXT_LIGHT_PROFILE.map((value, index) => (
                <view
                  key={`${index}:${value}`}
                  className="composer-context-light-band"
                  data-composer-context-light-band={String(index)}
                  style={{
                    top: `${index}px`,
                    backgroundColor: `rgb(${value}, ${value}, ${value})`,
                  }}
                />
              ))}
            </view>
          }
          checkout={
            <view
              className={`composer-workspace-control-wrap${
                workspaceMenuOpen ? " composer-workspace-control-wrap--open" : ""
              }`}
              data-floating-anchor="composer-workspace-menu"
            >
              <view
                className="composer-context-control composer-context-control--checkout"
                aria-label="Workspace"
                aria-disabled={workspaceModeLocked ? "true" : "false"}
                bindtap={workspaceModeLocked ? undefined : () => toggleComposerMenu("workspace")}
              >
                <Icon
                  name={workspaceMode === "worktree" ? "git-branch" : "folder"}
                  size={12}
                  color="#818181"
                  className="composer-context-icon composer-context-icon--checkout"
                />
                <text className="composer-context-label composer-context-label--checkout">
                  {checkoutLabel}
                </text>
                {!workspaceModeLocked ? (
                  <Icon
                    name="chevron-down"
                    size={12}
                    color="#818181"
                    className="composer-context-icon composer-context-icon--checkout-chevron"
                  />
                ) : null}
              </view>
              {workspaceMenuOpen ? (
                <>
                  <view
                    className={`composer-workspace-menu${
                      workspaceMode === "worktree" ? " composer-workspace-menu--worktree" : ""
                    }`}
                    aria-label="Workspace"
                    data-composer-workspace-menu
                    data-floating-popup="composer-workspace-menu"
                    data-floating-side="top"
                    data-floating-align="start"
                    data-floating-side-offset="4"
                    catchtap={() => undefined}
                  >
                    <text className="composer-workspace-menu__eyebrow">Workspace</text>
                    <view className="composer-workspace-menu__list">
                      <view
                        className={`composer-workspace-menu__item${
                          workspaceMode === "local" ? " composer-workspace-menu__item--active" : ""
                        } composer-workspace-menu__item--local`}
                        bindtap={() => {
                          onWorkspaceModeChange("local");
                          setOpenComposerMenu(null);
                        }}
                      >
                        <Icon name="folder" size={14} color="#818181" />
                        <text className="composer-workspace-menu__label">
                          {resolveCurrentWorkspaceLabel(worktreePath ?? null)}
                        </text>
                      </view>
                      <view
                        className={`composer-workspace-menu__item${
                          workspaceMode === "worktree"
                            ? " composer-workspace-menu__item--active"
                            : ""
                        } composer-workspace-menu__item--worktree`}
                        bindtap={() => {
                          onWorkspaceModeChange("worktree");
                          setOpenComposerMenu(null);
                        }}
                      >
                        <Icon name="git-branch" size={14} color="#818181" />
                        <text className="composer-workspace-menu__label">
                          {resolveEnvModeLabel("worktree")}
                        </text>
                      </view>
                    </view>
                    {workspaceMode === "worktree" ? (
                      <view
                        className="composer-workspace-menu__origin"
                        bindtap={() => onStartFromOriginChange(!startFromOrigin)}
                      >
                        <view className="composer-workspace-menu__origin-copy">
                          <text className="composer-workspace-menu__origin-label">
                            Start from origin
                          </text>
                          <text className="composer-workspace-menu__origin-description">
                            Fetch the latest matching branch before creating.
                          </text>
                        </view>
                        <view
                          className={`composer-workspace-menu__switch${
                            startFromOrigin ? " composer-workspace-menu__switch--active" : ""
                          }`}
                          aria-checked={startFromOrigin ? "true" : "false"}
                        >
                          <view className="composer-workspace-menu__switch-thumb" />
                        </view>
                      </view>
                    ) : null}
                  </view>
                  <view
                    className="composer-workspace-menu-dismiss"
                    bindtap={() => setOpenComposerMenu(null)}
                  />
                </>
              ) : null}
            </view>
          }
          branch={
            <HostView
              className="composer-context-control composer-context-control--branch"
              onContextMenu={activeBranch ? showBranchContextMenu : undefined}
            >
              <Icon
                name="git-branch"
                size={12}
                color="#818181"
                className="composer-context-icon composer-context-icon--branch"
              />
              <HostText
                className="composer-context-label composer-context-label--branch"
                text-maxline="1"
                onContextMenu={activeBranch ? showBranchContextMenu : undefined}
              >
                {context.branchLabel}
              </HostText>
              <Icon
                name="chevron-down"
                size={12}
                color="#818181"
                className="composer-context-icon composer-context-icon--chevron"
              />
            </HostView>
          }
        />
      ) : null}
    </view>
  );

  if (hero) {
    return (
      <view className="hero">
        <view className="hero__inner">
          <view
            className={`hero__headline-slot${statusBanner ? " hero__headline-slot--status" : ""}`}
          >
            <ComposerHeroHeadline
              project={
                <HostInlineText className="hero__project-name">
                  {projectName ?? "your project"}
                </HostInlineText>
              }
            />
            {statusBanner}
          </view>
          {card}
        </view>
      </view>
    );
  }

  return (
    <view className="composer-overlay">
      {statusBanner}
      {card}
    </view>
  );
}
