import { useMemo, useCallback, useEffect, useRef, useState } from "@lynx-js/react";
import { deriveSessionPresentationPhase, isSessionWorking } from "@t3tools/lynx-logic/session";
import {
  isComposerDraftThread,
  projectComposerProviderAvailability,
  projectComposerTraitsMenu,
  projectComposerTraitsTrigger,
  selectComposerTraitOption,
  shouldShowComposerContextStrip,
  shouldUseComposerHeroLayout,
  toggleComposerInteractionMode,
} from "@t3tools/lynx-logic/composer";
import {
  composerDraftScopeKey,
  composerImagePreparationErrorMessage,
  planComposerImageAdditions,
} from "@t3tools/lynx-logic/draftThread";
import { appendTerminalContextsToPrompt } from "@t3tools/lynx-logic/terminalContext";
import { appendElementContextsToPrompt } from "@t3tools/lynx-logic/elementContext";
import { appendFileContextsToPrompt, composerFileContext } from "@t3tools/lynx-logic/fileContext";
import { effectiveSettled } from "@t3tools/client-runtime/state/thread-settled";
import { projectConnectionLifecycle } from "@t3tools/client-runtime/connection/presentation";
import {
  derivePendingApprovals,
  derivePendingUserInputs,
} from "@t3tools/lynx-logic/pendingRequests";
import {
  buildPendingUserInputAnswers,
  derivePendingUserInputProgress,
  formatPendingPrimaryActionLabel,
  setPendingUserInputCustomAnswer,
  togglePendingUserInputOptionSelection,
  type PendingUserInputDraftAnswer,
} from "@t3tools/lynx-logic/pendingUserInput";
import {
  deriveModelPickerModels,
  getTriggerDisplayModelName,
} from "@t3tools/lynx-logic/modelPicker";
import {
  deriveLatestContextWindowSnapshot,
  formatProviderDisplayName,
} from "@t3tools/lynx-logic/composer";
import {
  projectProviderStatusNotice,
  resolveSelectableProviderInstanceEntry,
} from "@t3tools/lynx-logic/provider";
import {
  EMPTY_TRANSCRIPT_PLACEHOLDER,
  shouldShowEmptyTranscript,
} from "@t3tools/lynx-logic/transcript";
import { ChatRouteSurface } from "../../../../web/src/components/ChatRouteSurface";
import type { ExpandedImagePreview } from "@t3tools/lynx-logic/imagePreview";
import { ConnectionLifecycleBannerSurface } from "../../../../web/src/components/chat/ConnectionLifecycleBannerSurface";
import { ThreadErrorBannerSurface } from "../../../../web/src/components/chat/ThreadErrorBannerSurface";
import {
  ComposerPendingApprovalSurface,
  ComposerPendingQuestionSurface,
} from "../../../../web/src/components/chat/ComposerPendingSurface";
import { ComposerPendingApprovalActions } from "../../../../web/src/components/chat/ComposerPendingApprovalActions";
import { TranscriptEmptySurface } from "../../../../web/src/components/chat/TranscriptRowSurface";
import { ChatHeader, ChatLayoutControls } from "./ChatHeader";
import { Icon } from "./Icon";
import { MessagesTimeline } from "./MessagesTimeline";
import { ImagePreviewOverlay } from "./ImagePreviewOverlay";
import { Composer } from "./Composer";
import { ModelPicker } from "./ModelPicker";
import { RightPanel } from "./RightPanel";
import { SmallButton, SmallIconButton } from "./SettingsControls";
import { t3ClientActions, useT3ClientState } from "../state/t3Client";
import {
  resolveConnectionScopedValue,
  resolveThreadLockedConnectionValue,
  shouldRenderConnectionLifecycleBanner,
} from "../state/connectionPresentation.logic";
import { navigate } from "../router";
import { useClientSettingsState } from "../state/prefsStore";
import {
  uiActions,
  useModelPickerNavigation,
  useModelPickerOpen,
  useRightPanelState,
} from "../state/uiState";
import {
  availableThreadModels,
  resolveActiveThreadModelSelection,
  resolveModelPickerNavigationProvider,
} from "../state/modelSelection.logic";
import { useT3ProjectFileScripts } from "../hooks/useT3ProjectFileScripts";
import { ThreadId, type ProjectScript } from "@t3tools/contracts";
import type { UploadChatAttachment } from "@t3tools/contracts";
import { runProjectScriptInTerminal } from "./projectActionImports.logic";
import { classifyConnectorFailure } from "../../shared/connectorProtocol.ts";
import {
  T3_COMPOSER_IMAGE_PASTE_EVENT,
  isComposerImagePastePacket,
} from "../../shared/composerImagePasteProtocol.ts";

interface ChatViewProps {
  threadId?: string;
}

export function ChatView({ threadId }: ChatViewProps) {
  const [expandedImage, setExpandedImage] = useState<ExpandedImagePreview | null>(null);
  const [attachmentPreviewUrlById, setAttachmentPreviewUrlById] = useState<
    Readonly<Record<string, string>>
  >({});
  const [attachmentPreviewRevision, setAttachmentPreviewRevision] = useState(0);
  const {
    status,
    statusDetail,
    connectionKind,
    connectorCommandsReady,
    vcsStatus,
    vcsStatusCwd,
    vcsStatusPending,
    projects,
    threads,
    activeThreadId,
    draftHeroThreadId,
    draftThread,
    composerDraftTextByScopeKey,
    composerDraftAttachmentsByScopeKey,
    composerTerminalContextsByScopeKey,
    composerFileContextsByScopeKey,
    composerElementContextsByScopeKey,
    messages,
    sessionStatus,
    sessionError,
    selectedModel,
    models,
    providers,
    providerEntries,
    modelSelection,
    modelSelectionError,
    serverConfig,
    activePlan,
    activeProposedPlan,
    activities,
    latestTurn,
    proposedPlans,
    activeTurnId,
    checkpoints,
  } = useT3ClientState();
  useEffect(() => setExpandedImage(null), [activeThreadId, threadId]);
  const closeExpandedImage = useCallback(() => setExpandedImage(null), []);
  const attachmentIds = useMemo(
    () => [
      ...new Set(messages.flatMap((message) => (message.attachments ?? []).map(({ id }) => id))),
    ],
    [messages],
  );
  const attachmentIdsKey = attachmentIds.join("\u0000");
  useEffect(() => {
    let active = true;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    setAttachmentPreviewUrlById({});
    void Promise.all(
      attachmentIds.map(async (attachmentId) => {
        try {
          const result = await t3ClientActions.createAssetUrl({
            resource: { _tag: "attachment", attachmentId },
          });
          return { attachmentId, url: result.url, expiresAt: result.expiresAt };
        } catch {
          return null;
        }
      }),
    ).then((entries) => {
      if (!active) return;
      setAttachmentPreviewUrlById(
        Object.fromEntries(
          entries.flatMap((entry) => (entry ? [[entry.attachmentId, entry.url] as const] : [])),
        ),
      );
      const earliestExpiry = Math.min(
        ...entries.flatMap((entry) => (entry ? [entry.expiresAt] : [])),
      );
      if (Number.isFinite(earliestExpiry)) {
        refreshTimer = setTimeout(
          () => setAttachmentPreviewRevision((revision) => revision + 1),
          Math.max(1_000, earliestExpiry - Date.now() - 5 * 60_000),
        );
      }
    });
    return () => {
      active = false;
      if (refreshTimer !== null) clearTimeout(refreshTimer);
    };
  }, [activeThreadId, attachmentIdsKey, attachmentPreviewRevision]);
  const displayMessages = useMemo(
    () =>
      messages.map((message) => ({
        ...message,
        attachments: message.attachments?.map((attachment) => ({
          ...attachment,
          previewUrl: attachmentPreviewUrlById[attachment.id],
        })),
      })),
    [attachmentPreviewUrlById, messages],
  );
  const [clientSettings] = useClientSettingsState();
  const rightPanel = useRightPanelState();
  const modelPickerOpen = useModelPickerOpen();
  const modelPickerNavigation = useModelPickerNavigation();
  const lastKnownSelectedModel = useRef(selectedModel);
  const lastKnownModelSelection = useRef(modelSelection);
  const [respondingApprovalId, setRespondingApprovalId] = useState<string | null>(null);
  // Upstream #6773: the question card collapses from its header, per question.
  const [collapsedQuestionId, setCollapsedQuestionId] = useState<string | null>(null);
  const [respondingUserInputId, setRespondingUserInputId] = useState<string | null>(null);
  const [dismissedThreadErrorsById, setDismissedThreadErrorsById] = useState<
    Record<string, string>
  >({});
  const [unsettleState, setUnsettleState] = useState<{
    readonly threadId: string;
    readonly status: "pending" | "failed";
    readonly message?: string;
  } | null>(null);
  const [pendingUserInputDraftsByRequestId, setPendingUserInputDraftsByRequestId] = useState<
    Record<string, Record<string, PendingUserInputDraftAnswer>>
  >({});
  const [pendingUserInputQuestionIndexByRequestId, setPendingUserInputQuestionIndexByRequestId] =
    useState<Record<string, number>>({});
  const [centerPanelWidth, setCenterPanelWidth] = useState(1024);
  const [rightPanelMaximized, setRightPanelMaximized] = useState(false);
  const [gitMenuOpen, setGitMenuOpen] = useState(false);
  const [draftWorkspaceMode, setDraftWorkspaceMode] = useState<"local" | "worktree">("local");
  const [startFromOrigin, setStartFromOrigin] = useState(false);
  const {
    interrupt,
    reconnect,
    respondToApproval,
    respondToUserInput,
    sendPrompt,
    setDraftStartFromOrigin,
    setDraftWorkspaceMode: updateDraftWorkspaceMode,
    setModelOptions,
    setThreadInteractionMode,
    setThreadRuntimeMode,
  } = t3ClientActions;

  const activeDraftThread = draftThread?.id === activeThreadId ? draftThread : undefined;
  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) ?? activeDraftThread,
    [threads, activeThreadId, activeDraftThread],
  );
  const activeUnsettleState =
    activeThreadId && unsettleState?.threadId === activeThreadId ? unsettleState : null;
  const handleUnsettle = useCallback(() => {
    if (!activeThreadId || activeUnsettleState?.status === "pending") return;
    const targetThreadId = activeThreadId;
    setUnsettleState({ threadId: targetThreadId, status: "pending" });
    void t3ClientActions.unsettleThread(targetThreadId).then(
      () => setUnsettleState((current) => (current?.threadId === targetThreadId ? null : current)),
      (cause) =>
        setUnsettleState((current) =>
          current?.threadId === targetThreadId
            ? {
                threadId: targetThreadId,
                status: "failed",
                message: cause instanceof Error ? cause.message : "Failed to un-settle thread.",
              }
            : current,
        ),
    );
  }, [activeThreadId, activeUnsettleState?.status]);
  const [composerImageErrorsByThreadKey, setComposerImageErrorsByThreadKey] = useState<
    Readonly<Record<string, string>>
  >({});
  const threadError =
    sessionError ??
    modelSelectionError ??
    composerImageErrorsByThreadKey[activeThreadId ?? ""] ??
    null;
  const visibleThreadError =
    threadError && dismissedThreadErrorsById[activeThreadId ?? ""] !== threadError
      ? threadError
      : null;
  const dismissThreadError = useCallback(() => {
    if (!activeThreadId || !threadError) return;
    setDismissedThreadErrorsById((errors) => ({ ...errors, [activeThreadId]: threadError }));
  }, [activeThreadId, threadError]);
  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeThread?.projectId) ?? projects[0] ?? null,
    [activeThread?.projectId, projects],
  );
  const cwd = activeThread?.worktreePath ?? activeProject?.workspaceRoot;
  const fileScripts = useT3ProjectFileScripts(cwd ?? null);
  const runProjectScript = useCallback(
    async (script: ProjectScript) => {
      if (!activeThreadId || !activeProject || !cwd) {
        throw new Error("Open a project thread before running an action.");
      }
      await runProjectScriptInTerminal({
        script,
        threadId: activeThreadId,
        projectCwd: activeProject.workspaceRoot,
        cwd,
        worktreePath: activeThread?.worktreePath ?? null,
        openTerminal: t3ClientActions.openTerminal,
        writeTerminal: t3ClientActions.writeTerminal,
        openPanel: () => uiActions.openRightPanelSurface("terminal"),
      });
    },
    [activeProject, activeThread?.worktreePath, activeThreadId, cwd],
  );
  const currentRepoContext = vcsStatusCwd === cwd ? vcsStatus : null;
  const checkoutBranch = currentRepoContext?.refName ?? null;

  const presentationModels = useMemo(
    () => availableThreadModels({ models, providerEntries }),
    [models, providerEntries],
  );
  const activeThreadModelProjection = useMemo(
    () =>
      activeThread
        ? resolveActiveThreadModelSelection(presentationModels, activeThread.modelSelection, {
            selectedModel,
            selection: modelSelection,
          })
        : { selectedModel, selection: modelSelection },
    [activeThread, modelSelection, presentationModels, selectedModel],
  );
  const presentedSelectedModel = resolveThreadLockedConnectionValue({
    hasActiveThread: activeThread !== undefined,
    status,
    current: activeThreadModelProjection.selectedModel,
    lastKnown: lastKnownSelectedModel.current,
  });
  const presentedModelSelection = resolveThreadLockedConnectionValue({
    hasActiveThread: activeThread !== undefined,
    status,
    current: activeThreadModelProjection.selection,
    lastKnown: lastKnownModelSelection.current,
  });
  const projectName = activeProject?.title ?? "your project";
  const persistedModelLabel = presentedSelectedModel
    ? getTriggerDisplayModelName(presentedSelectedModel)
    : presentedModelSelection?.model;
  const modelInstanceId = presentedSelectedModel?.instanceId ?? presentedModelSelection?.instanceId;
  const activeProviderInstanceId =
    activeThread?.session?.providerInstanceId ?? activeThread?.modelSelection.instanceId ?? null;
  const activeProviderEntry = providerEntries.find(
    (entry) => entry.instanceId === activeProviderInstanceId,
  );
  const activeProviderStatus =
    providers.find(
      (provider) =>
        provider.instanceId === (activeProviderInstanceId ?? presentedModelSelection?.instanceId),
    ) ?? null;
  const providerStatusNotice = projectProviderStatusNotice(activeProviderStatus);
  const providerStatusNoticeKey = providerStatusNotice?.key ?? null;
  const [dismissedProviderStatusNoticeKey, setDismissedProviderStatusNoticeKey] = useState<
    string | null
  >(null);
  useEffect(() => {
    if (
      dismissedProviderStatusNoticeKey !== null &&
      providerStatusNoticeKey !== dismissedProviderStatusNoticeKey
    ) {
      setDismissedProviderStatusNoticeKey(null);
    }
  }, [dismissedProviderStatusNoticeKey, providerStatusNoticeKey]);
  const visibleProviderStatusNotice =
    providerStatusNotice?.key === dismissedProviderStatusNoticeKey ? null : providerStatusNotice;
  const lockedProvider = activeThread?.session ? (activeProviderEntry?.driverKind ?? null) : null;
  const lockedContinuationGroupKey = activeThread?.session
    ? (activeProviderEntry?.continuationGroupKey ?? null)
    : null;
  const sessionWorking = isSessionWorking(sessionStatus);
  const hero = shouldUseComposerHeroLayout({
    isLocalDraftThread: isComposerDraftThread({
      activeThreadId,
      draftHeroThreadId,
    }),
    timelineEntryCount: messages.length,
    isWorking: sessionWorking,
    dockRequested: false,
  });
  const showEmptyTranscript =
    !hero &&
    shouldShowEmptyTranscript({
      activityCount: activities.length,
      isWorking: sessionWorking,
      messageCount: messages.length,
      proposedPlanCount: proposedPlans.length,
    });
  const providerAvailable =
    resolveSelectableProviderInstanceEntry(
      providerEntries,
      activeProviderInstanceId ?? presentedModelSelection?.instanceId,
    ) !== undefined;
  const composerProviderAvailability = projectComposerProviderAvailability({
    phase: deriveSessionPresentationPhase(activeThread?.session?.status),
    providerAvailable,
    modelLabel: persistedModelLabel,
  });
  const modelPickerScopeKey = hero
    ? `new-thread:${activeProject?.id ?? "unselected"}`
    : (activeThreadId ?? "no-thread");
  const pendingApprovals = useMemo(() => derivePendingApprovals(activities), [activities]);
  const pendingUserInputs = useMemo(() => derivePendingUserInputs(activities), [activities]);
  const activePendingApproval = pendingApprovals[0] ?? null;
  const activePendingUserInput = pendingUserInputs[0] ?? null;
  const activePendingDrafts = activePendingUserInput
    ? (pendingUserInputDraftsByRequestId[activePendingUserInput.requestId] ?? {})
    : {};
  const activePendingQuestionIndex = activePendingUserInput
    ? (pendingUserInputQuestionIndexByRequestId[activePendingUserInput.requestId] ?? 0)
    : 0;
  const activePendingProgress = useMemo(
    () =>
      activePendingUserInput
        ? derivePendingUserInputProgress(
            activePendingUserInput.questions,
            activePendingDrafts,
            activePendingQuestionIndex,
          )
        : null,
    [activePendingDrafts, activePendingQuestionIndex, activePendingUserInput],
  );
  const activePendingQuestion = activePendingProgress?.activeQuestion ?? null;
  const activePendingDraft = activePendingProgress?.activeDraft;
  const pendingAnswers = activePendingUserInput
    ? buildPendingUserInputAnswers(activePendingUserInput.questions, activePendingDrafts)
    : null;
  const activePendingIsResponding = respondingUserInputId === activePendingUserInput?.requestId;
  const questionPrimaryActionEnabled =
    activePendingProgress !== null &&
    !activePendingIsResponding &&
    (activePendingProgress.isLastQuestion
      ? activePendingProgress.isComplete
      : activePendingProgress.canAdvance);
  const modelTraitsTrigger = useMemo(
    () =>
      presentedSelectedModel
        ? projectComposerTraitsTrigger({
            provider: presentedSelectedModel.driverKind,
            capabilities: presentedSelectedModel.capabilities,
            selections: presentedModelSelection?.options,
          })
        : null,
    [presentedModelSelection?.options, presentedSelectedModel],
  );
  const modelOptionSections = useMemo(
    () =>
      projectComposerTraitsMenu({
        capabilities: presentedSelectedModel?.capabilities,
        selections: presentedModelSelection?.options,
      }),
    [presentedModelSelection?.options, presentedSelectedModel?.capabilities],
  );
  const activeContextWindow = useMemo(
    () => deriveLatestContextWindowSnapshot(activities),
    [activities],
  );
  const activeThreadProviderDisplayName = formatProviderDisplayName(
    presentedSelectedModel?.driverKind ?? activeProviderEntry?.driverKind,
  );
  const connectionLifecycle = useMemo(
    () =>
      projectConnectionLifecycle({
        phase: status,
        targetLabel: serverConfig?.environment.label ?? "T3 Code",
        detail: statusDetail,
        recoverySubject:
          connectionKind === "existing-environment"
            ? "the remote environment"
            : "the local backend",
        failureLayer: status === "error" ? classifyConnectorFailure(statusDetail) : null,
      }),
    [connectionKind, serverConfig?.environment.label, status, statusDetail],
  );
  // Plan mode is a legacy feature: while it is off the toggle is hidden and
  // every thread presents (and sends) the default mode.
  const showInteractionModeToggle =
    clientSettings.planModeEnabled &&
    (providerEntries.find((entry) => entry.instanceId === modelInstanceId)?.snapshot
      .showInteractionModeToggle ??
      true);
  const interactionMode = clientSettings.planModeEnabled
    ? (activeThread?.interactionMode ?? "default")
    : "default";
  const activeThreadSettled =
    activeThread !== undefined &&
    serverConfig?.environment.capabilities.threadSettlement === true &&
    effectiveSettled(activeThread, {
      now: new Date().toISOString(),
      autoSettleAfterDays: clientSettings.sidebarAutoSettleAfterDays,
    });
  const workspaceMode =
    activeThread?.worktreePath != null
      ? "worktree"
      : messages.length > 0
        ? "local"
        : draftWorkspaceMode;
  const workspaceModeLocked = messages.length > 0 || activeThread?.worktreePath != null;
  const showComposerContextStrip = shouldShowComposerContextStrip({
    hasProject: activeProject !== null,
    isRepo: currentRepoContext?.isRepo,
  });

  useEffect(() => {
    if (selectedModel) lastKnownSelectedModel.current = selectedModel;
    if (modelSelection) lastKnownModelSelection.current = modelSelection;
  }, [modelSelection, selectedModel]);

  useEffect(() => {
    setDraftWorkspaceMode(
      activeDraftThread
        ? activeDraftThread.envMode
        : activeThread?.worktreePath
          ? "worktree"
          : "local",
    );
    setStartFromOrigin(activeDraftThread?.startFromOrigin ?? false);
    setRightPanelMaximized(false);
  }, [
    activeThreadId,
    activeThread?.worktreePath,
    activeDraftThread?.envMode,
    activeDraftThread?.id,
    activeDraftThread?.startFromOrigin,
  ]);

  useEffect(() => {
    if (modelPickerOpen) return;
    const preferredProvider =
      presentedModelSelection?.instanceId ?? selectedModel?.instanceId ?? undefined;
    uiActions.syncModelPickerProvider(
      modelPickerScopeKey,
      resolveModelPickerNavigationProvider({
        preferredProvider,
        providerEntries,
        hasFavorites: clientSettings.favorites.length > 0,
        providerSwitchLocked: lockedProvider !== null,
      }),
    );
  }, [
    clientSettings.favorites.length,
    modelPickerScopeKey,
    lockedProvider,
    modelPickerOpen,
    presentedModelSelection?.instanceId,
    providerEntries,
    selectedModel?.instanceId,
  ]);

  useEffect(() => {
    if (!rightPanel.isOpen && rightPanelMaximized) {
      setRightPanelMaximized(false);
    }
  }, [rightPanel.isOpen, rightPanelMaximized]);

  const handleInteractionModeTap = useCallback(() => {
    setThreadInteractionMode(
      toggleComposerInteractionMode(activeThread?.interactionMode ?? "default"),
    );
  }, [activeThread?.interactionMode, setThreadInteractionMode]);

  const handleSelectModelOption = useCallback(
    (descriptorId: string, value: string | boolean) => {
      const nextSelections = selectComposerTraitOption({
        capabilities: presentedSelectedModel?.capabilities,
        selections: presentedModelSelection?.options,
        descriptorId,
        value,
      });
      if (nextSelections) setModelOptions(nextSelections);
    },
    [presentedModelSelection?.options, presentedSelectedModel?.capabilities, setModelOptions],
  );

  const handleSend = useCallback(
    (text: string, attachments: ReadonlyArray<UploadChatAttachment>): Promise<boolean> => {
      if (workspaceMode === "worktree" && !workspaceModeLocked && activeProject && checkoutBranch) {
        return sendPrompt(
          text,
          {
            prepareWorktree: {
              projectCwd: activeProject.workspaceRoot,
              baseBranch: checkoutBranch,
              ...(startFromOrigin ? { startFromOrigin: true } : {}),
            },
            runSetupScript: true,
          },
          attachments,
        );
      }
      if (workspaceMode === "worktree" && !workspaceModeLocked && !checkoutBranch) {
        return Promise.resolve(false);
      }
      return sendPrompt(text, undefined, attachments);
    },
    [
      activeProject,
      checkoutBranch,
      sendPrompt,
      startFromOrigin,
      workspaceMode,
      workspaceModeLocked,
    ],
  );
  const composerDraftKey = composerDraftScopeKey({
    threadId: activeThreadId,
    projectId: activeProject?.id,
    localDraft: activeDraftThread !== undefined || activeThreadId === undefined,
  });
  const composerDraftText = composerDraftKey
    ? (composerDraftTextByScopeKey[composerDraftKey] ?? "")
    : "";
  const composerDraftAttachments = composerDraftKey
    ? (composerDraftAttachmentsByScopeKey[composerDraftKey] ?? [])
    : [];
  const composerTerminalContexts = composerDraftKey
    ? (composerTerminalContextsByScopeKey[composerDraftKey] ?? [])
    : [];
  const composerImagePasteTargetRef = useRef({
    draftKey: composerDraftKey,
    threadKey: activeThreadId ?? "",
    reservedCount: composerDraftAttachments.length,
    hasPendingUserInput: activePendingQuestion !== null,
  });
  composerImagePasteTargetRef.current = {
    draftKey: composerDraftKey,
    threadKey: activeThreadId ?? "",
    reservedCount: composerDraftAttachments.length,
    hasPendingUserInput: activePendingQuestion !== null,
  };
  // Command+V with an image on the clipboard arrives from the main-process
  // Edit menu; acceptance and error text come from the shared draft planner.
  useEffect(() => {
    const emitter =
      typeof lynx !== "undefined" ? lynx.getJSModule?.("GlobalEventEmitter") : undefined;
    const listener = (packet: unknown) => {
      if (!isComposerImagePastePacket(packet)) return;
      const { draftKey, threadKey, reservedCount, hasPendingUserInput } =
        composerImagePasteTargetRef.current;
      if (!draftKey) return;
      const setError = (message: string | null) =>
        setComposerImageErrorsByThreadKey((errors) => {
          if (message !== null) return { ...errors, [threadKey]: message };
          if (!(threadKey in errors)) return errors;
          const { [threadKey]: _cleared, ...remaining } = errors;
          return remaining;
        });
      if (packet.kind === "failure") {
        setError(composerImagePreparationErrorMessage(packet.name, packet.reason));
        return;
      }
      const plan = planComposerImageAdditions({
        candidates: [packet.attachment],
        reservedCount,
        hasPendingUserInput,
      });
      if (plan.kind === "blocked-by-pending-user-input") {
        setError(plan.message);
        return;
      }
      if (plan.accepted.length > 0) t3ClientActions.addComposerAttachments(draftKey, plan.accepted);
      setError(plan.error);
    };
    emitter?.addListener?.(T3_COMPOSER_IMAGE_PASTE_EVENT, listener);
    return () => emitter?.removeListener?.(T3_COMPOSER_IMAGE_PASTE_EVENT, listener);
  }, []);
  const composerFileContexts = composerDraftKey
    ? (composerFileContextsByScopeKey[composerDraftKey] ?? [])
    : [];
  const composerElementContexts = composerDraftKey
    ? (composerElementContextsByScopeKey[composerDraftKey] ?? [])
    : [];
  const handleComposerDraftTextChange = useCallback(
    (text: string) => {
      if (composerDraftKey) t3ClientActions.setComposerDraftText(composerDraftKey, text);
    },
    [composerDraftKey],
  );

  const handleRespondToApproval = useCallback(
    async (
      requestId: Parameters<typeof respondToApproval>[0],
      decision: Parameters<typeof respondToApproval>[1],
    ) => {
      setRespondingApprovalId(requestId);
      try {
        await respondToApproval(requestId, decision);
      } finally {
        setRespondingApprovalId(null);
      }
    },
    [respondToApproval],
  );
  const handleQuestionOptionSelect = useCallback(
    (optionLabel: string) => {
      if (!activePendingUserInput || !activePendingQuestion) return;
      setPendingUserInputDraftsByRequestId((byRequestId) => ({
        ...byRequestId,
        [activePendingUserInput.requestId]: {
          ...byRequestId[activePendingUserInput.requestId],
          [activePendingQuestion.id]: togglePendingUserInputOptionSelection(
            activePendingQuestion,
            byRequestId[activePendingUserInput.requestId]?.[activePendingQuestion.id],
            optionLabel,
          ),
        },
      }));
    },
    [activePendingQuestion, activePendingUserInput],
  );
  const handleQuestionCustomAnswerChange = useCallback(
    (value: string) => {
      if (!activePendingUserInput || !activePendingQuestion) return;
      setPendingUserInputDraftsByRequestId((byRequestId) => ({
        ...byRequestId,
        [activePendingUserInput.requestId]: {
          ...byRequestId[activePendingUserInput.requestId],
          [activePendingQuestion.id]: setPendingUserInputCustomAnswer(
            byRequestId[activePendingUserInput.requestId]?.[activePendingQuestion.id],
            value,
          ),
        },
      }));
    },
    [activePendingQuestion, activePendingUserInput],
  );
  const handleQuestionAdvance = useCallback(async () => {
    if (!activePendingUserInput || !activePendingProgress) return;
    if (!activePendingProgress.isLastQuestion) {
      if (!activePendingProgress.canAdvance) return;
      setPendingUserInputQuestionIndexByRequestId((byRequestId) => ({
        ...byRequestId,
        [activePendingUserInput.requestId]: activePendingProgress.questionIndex + 1,
      }));
      return;
    }
    if (!pendingAnswers) return;
    setRespondingUserInputId(activePendingUserInput.requestId);
    try {
      await respondToUserInput(activePendingUserInput.requestId, pendingAnswers);
      setPendingUserInputDraftsByRequestId((byRequestId) => {
        const { [activePendingUserInput.requestId]: _resolved, ...remaining } = byRequestId;
        return remaining;
      });
      setPendingUserInputQuestionIndexByRequestId((byRequestId) => {
        const { [activePendingUserInput.requestId]: _resolved, ...remaining } = byRequestId;
        return remaining;
      });
    } finally {
      setRespondingUserInputId(null);
    }
  }, [activePendingProgress, activePendingUserInput, pendingAnswers, respondToUserInput]);
  const handleQuestionPrevious = useCallback(() => {
    if (!activePendingUserInput || !activePendingProgress) return;
    setPendingUserInputQuestionIndexByRequestId((byRequestId) => ({
      ...byRequestId,
      [activePendingUserInput.requestId]: Math.max(activePendingProgress.questionIndex - 1, 0),
    }));
  }, [activePendingProgress, activePendingUserInput]);

  return (
    <ChatRouteSurface
      onClick={
        modelPickerOpen || gitMenuOpen
          ? () => {
              if (modelPickerOpen) uiActions.closeModelPicker();
              if (gitMenuOpen) setGitMenuOpen(false);
            }
          : undefined
      }
      activeThreadKind={activeDraftThread ? "draft" : activeThread ? "server" : "none"}
      activeThreadId={activeThreadId}
      connectionStatus={status}
      connectionStatusDetail={statusDetail}
      layoutControls={<ChatLayoutControls rightPanelOpen={rightPanel.isOpen} />}
      header={
        <ChatHeader
          projectName={activeProject?.title ?? "t3code"}
          threadTitle={activeThread?.title ?? "New thread"}
          cwd={cwd}
          vcsStatus={vcsStatusCwd === cwd ? vcsStatus : null}
          vcsStatusPending={vcsStatusCwd !== cwd || vcsStatusPending}
          availableEditors={serverConfig?.availableEditors ?? []}
          platform={serverConfig?.environment.platform.os}
          keybindings={serverConfig?.keybindings}
          projectId={activeProject?.id}
          projectScripts={activeProject?.scripts ?? []}
          fileScripts={fileScripts}
          onRunProjectScript={runProjectScript}
          rightPanelOpen={rightPanel.isOpen}
          centerPanelWidth={centerPanelWidth}
          onCenterPanelWidthChange={setCenterPanelWidth}
          gitMenuOpen={gitMenuOpen}
          onGitMenuOpenChange={setGitMenuOpen}
        />
      }
      banner={
        <>
          {visibleThreadError && !hero ? (
            <ThreadErrorBannerSurface
              description={visibleThreadError}
              icon={<Icon name="circle-alert" size={16} color="#ef4444" />}
              action={
                <SmallIconButton
                  className="thread-error-dismiss"
                  label="Dismiss error"
                  icon={<Icon name="x" size={14} color="#ef4444" />}
                  onTap={dismissThreadError}
                />
              }
            />
          ) : null}
          {!hero && visibleProviderStatusNotice ? (
            <view className="provider-status-banner-flow">
              <ThreadErrorBannerSurface
                title={visibleProviderStatusNotice.title}
                description={visibleProviderStatusNotice.message}
                icon={
                  <Icon
                    name="info"
                    size={16}
                    color={visibleProviderStatusNotice.tone === "warning" ? "#f59e0b" : "#ef4444"}
                  />
                }
                action={
                  <SmallIconButton
                    className="provider-status-banner__dismiss"
                    label={`Dismiss ${activeProviderStatus?.displayName ?? activeProviderStatus?.driver ?? "provider"} provider ${activeProviderStatus?.status ?? "error"}`}
                    icon={<Icon name="x" size={14} color="#818181" />}
                    onTap={() =>
                      setDismissedProviderStatusNoticeKey(visibleProviderStatusNotice.key)
                    }
                  />
                }
              />
            </view>
          ) : null}
        </>
      }
      bodyOverlay={
        showEmptyTranscript || (hero && visibleProviderStatusNotice) ? (
          <>
            {showEmptyTranscript ? (
              <TranscriptEmptySurface
                className="timeline-empty-overlay"
                title={EMPTY_TRANSCRIPT_PLACEHOLDER}
              />
            ) : null}
            {hero && visibleProviderStatusNotice ? (
              <view className="provider-status-banner-overlay">
                <ThreadErrorBannerSurface
                  title={visibleProviderStatusNotice.title}
                  description={visibleProviderStatusNotice.message}
                  icon={
                    <Icon
                      name="info"
                      size={16}
                      color={visibleProviderStatusNotice.tone === "warning" ? "#f59e0b" : "#ef4444"}
                    />
                  }
                  action={
                    <SmallIconButton
                      className="provider-status-banner__dismiss"
                      label={`Dismiss ${activeProviderStatus?.displayName ?? activeProviderStatus?.driver ?? "provider"} provider ${activeProviderStatus?.status ?? "error"}`}
                      icon={<Icon name="x" size={14} color="#818181" />}
                      onTap={() =>
                        setDismissedProviderStatusNoticeKey(visibleProviderStatusNotice.key)
                      }
                    />
                  }
                />
              </view>
            ) : null}
          </>
        ) : undefined
      }
      chatColumnHidden={rightPanel.isOpen && rightPanelMaximized}
      rightPanel={
        <RightPanel
          cwd={cwd}
          activePlan={activePlan ?? null}
          activeProposedPlan={activeProposedPlan ?? null}
          maximized={rightPanelMaximized}
          onMaximizedChange={setRightPanelMaximized}
          onImageExpand={setExpandedImage}
        />
      }
      overlays={
        expandedImage ? (
          <ImagePreviewOverlay preview={expandedImage} onClose={closeExpandedImage} />
        ) : null
      }
    >
      {!hero ? (
        <MessagesTimeline
          key={activeThreadId ?? "no-thread"}
          threadId={activeThreadId ? ThreadId.make(activeThreadId) : undefined}
          messages={displayMessages}
          activities={activities}
          sessionStatus={sessionStatus}
          hasTopBanner={Boolean(visibleThreadError || visibleProviderStatusNotice)}
          cwd={cwd}
          latestTurn={latestTurn}
          proposedPlans={proposedPlans}
          activeTurnId={activeTurnId}
          checkpoints={checkpoints}
          availableWidth={centerPanelWidth}
          onImageExpand={setExpandedImage}
        />
      ) : null}
      <Composer
        key={activeThreadId ?? "no-thread"}
        hero={hero}
        placeholder={
          activePendingQuestion
            ? "Type your own answer, or leave this blank to use the selected option"
            : composerProviderAvailability.placeholder
        }
        projectName={projectName}
        modelLabel={composerProviderAvailability.modelLabel}
        providerAvailable={providerAvailable}
        modelInstanceId={modelInstanceId}
        modelDriverKind={presentedSelectedModel?.driverKind}
        modelOptionLabel={providerAvailable ? modelTraitsTrigger?.label : undefined}
        modelOptionSections={providerAvailable ? modelOptionSections : []}
        activeContextWindow={activeContextWindow}
        contextWindowProviderDisplayName={activeThreadProviderDisplayName}
        branch={activeThread?.branch ?? checkoutBranch ?? undefined}
        showContextStrip={showComposerContextStrip}
        worktreePath={activeThread?.worktreePath ?? undefined}
        cwd={cwd}
        providerSkills={activeProviderStatus?.skills ?? []}
        providerSlashCommands={activeProviderStatus?.slashCommands ?? []}
        workspaceMode={workspaceMode}
        workspaceModeLocked={workspaceModeLocked}
        startFromOrigin={startFromOrigin}
        runtimeMode={activeThread?.runtimeMode ?? "full-access"}
        interactionMode={interactionMode}
        showInteractionModeToggle={showInteractionModeToggle}
        planModeEnabled={clientSettings.planModeEnabled}
        availableWidth={centerPanelWidth}
        statusBanner={
          shouldRenderConnectionLifecycleBanner() && connectionLifecycle.visible ? (
            <view className="composer-lifecycle-banner">
              <ConnectionLifecycleBannerSurface
                presentation={connectionLifecycle}
                icon={<Icon name="wifi-off" size={16} color="#f59e0b" />}
                onReconnect={() => {
                  void reconnect().catch(() => undefined);
                }}
                onOpenConnections={() => navigate("/settings/connections")}
              />
            </view>
          ) : activeThreadSettled ? (
            <view className="composer-settled-banner" data-composer-settled-banner>
              <view className="composer-settled-banner__icon">
                <view className="composer-settled-banner__icon-ring">
                  <Icon name="check" size={10} color="#3b82f6" />
                </view>
              </view>
              <view className="composer-settled-banner__copy">
                <text className="composer-settled-banner__title">This thread is settled</text>
                <text className="composer-settled-banner__description">
                  {activeUnsettleState?.status === "failed"
                    ? activeUnsettleState.message
                    : "Sending a message moves it back to Active in the sidebar."}
                </text>
              </view>
              <view
                className="composer-settled-banner__action"
                data-thread-unsettle-state={activeUnsettleState?.status ?? "idle"}
                aria-disabled={activeUnsettleState?.status === "pending" ? "true" : "false"}
                bindtap={activeUnsettleState?.status === "pending" ? undefined : handleUnsettle}
              >
                <text className="composer-settled-banner__action-label">
                  {activeUnsettleState?.status === "pending"
                    ? "Working…"
                    : activeUnsettleState?.status === "failed"
                      ? "Retry"
                      : "Un-settle"}
                </text>
              </view>
            </view>
          ) : undefined
        }
        topDrawer={
          activePendingApproval
            ? {
                variant: "warning",
                content: (
                  <ComposerPendingApprovalSurface
                    fallbackLabel={
                      activePendingApproval.requestKind === "command"
                        ? "Command approval"
                        : activePendingApproval.requestKind === "file-read"
                          ? "File read approval"
                          : "File change approval"
                    }
                    detail={activePendingApproval.detail}
                    detailLabel={
                      activePendingApproval.requestKind === "command"
                        ? "Command"
                        : activePendingApproval.requestKind === "file-read"
                          ? "File to read"
                          : "File change"
                    }
                    pendingCount={pendingApprovals.length}
                  />
                ),
                actions: (
                  <ComposerPendingApprovalActions
                    requestId={activePendingApproval.requestId}
                    isResponding={respondingApprovalId === activePendingApproval.requestId}
                    onRespondToApproval={handleRespondToApproval}
                  />
                ),
              }
            : activePendingQuestion
              ? {
                  variant: "info",
                  content: (
                    <ComposerPendingQuestionSurface
                      header={activePendingQuestion.header}
                      question={activePendingQuestion.question}
                      questionIndex={activePendingProgress?.questionIndex ?? 0}
                      questionCount={activePendingUserInput?.questions.length ?? 1}
                      multiSelect={activePendingQuestion.multiSelect === true}
                      options={activePendingQuestion.options}
                      selectedOptionLabels={activePendingDraft?.selectedOptionLabels ?? []}
                      responding={activePendingIsResponding}
                      selectedIcon={<Icon name="check" size={14} color="#366ffb" />}
                      collapsed={collapsedQuestionId === activePendingQuestion.id}
                      toggleIcon={<Icon name="chevron-down" size={14} color="#818181" />}
                      onToggleCollapsed={() =>
                        setCollapsedQuestionId((current) =>
                          current === activePendingQuestion.id ? null : activePendingQuestion.id,
                        )
                      }
                      onSelect={handleQuestionOptionSelect}
                    />
                  ),
                }
              : undefined
        }
        approvalPending={activePendingApproval !== null}
        approvalDetail={activePendingApproval?.detail}
        questionActions={
          activePendingQuestion ? (
            <view className="composer-question-actions">
              {(activePendingProgress?.questionIndex ?? 0) > 0 ? (
                <view
                  className="composer-question-previous"
                  aria-label="Previous question"
                  aria-disabled={activePendingIsResponding ? "true" : "false"}
                  data-pending-question-action="previous"
                  bindtap={activePendingIsResponding ? undefined : handleQuestionPrevious}
                >
                  <Icon name="arrow-left" size={14} color="#818181" />
                </view>
              ) : null}
              <view
                className={`composer-question-submit${
                  questionPrimaryActionEnabled ? "" : " composer-question-submit--disabled"
                }`}
                data-composer-primary-state="stop"
                data-pending-question-action={
                  activePendingProgress?.isLastQuestion ? "submit" : "next"
                }
                aria-disabled={questionPrimaryActionEnabled ? "false" : "true"}
                bindtap={questionPrimaryActionEnabled ? handleQuestionAdvance : undefined}
              >
                <text className="composer-question-submit__label">
                  {formatPendingPrimaryActionLabel({
                    compact: true,
                    isLastQuestion: activePendingProgress?.isLastQuestion ?? true,
                    isResponding: activePendingIsResponding,
                    questionIndex: activePendingProgress?.questionIndex ?? 0,
                  })}
                </text>
              </view>
            </view>
          ) : undefined
        }
        questionEditorKey={activePendingQuestion?.id}
        questionCustomAnswer={activePendingDraft?.customAnswer ?? ""}
        onQuestionCustomAnswerChange={handleQuestionCustomAnswerChange}
        value={composerDraftText}
        onValueChange={handleComposerDraftTextChange}
        attachments={composerDraftAttachments}
        terminalContexts={composerTerminalContexts}
        fileContexts={composerFileContexts}
        elementContexts={composerElementContexts}
        onAddAttachments={(attachments) => {
          if (composerDraftKey)
            t3ClientActions.addComposerAttachments(composerDraftKey, attachments);
        }}
        onRemoveAttachment={(index) => {
          if (composerDraftKey) t3ClientActions.removeComposerAttachment(composerDraftKey, index);
        }}
        onRemoveTerminalContext={(contextId) => {
          if (composerDraftKey)
            t3ClientActions.removeComposerTerminalContext(composerDraftKey, contextId);
        }}
        onAddFileContext={(path) => {
          const context = composerFileContext(path);
          if (composerDraftKey && context)
            t3ClientActions.addComposerFileContext(composerDraftKey, context);
        }}
        onRemoveFileContext={(contextId) => {
          if (composerDraftKey)
            t3ClientActions.removeComposerFileContext(composerDraftKey, contextId);
        }}
        onRemoveElementContext={(contextId) => {
          if (composerDraftKey)
            t3ClientActions.removeComposerElementContext(composerDraftKey, contextId);
        }}
        disabled={status !== "ready" || sessionStatus === "starting"}
        busy={sessionWorking}
        onSend={async (text, attachments) => {
          const sent = await handleSend(
            appendElementContextsToPrompt(
              appendTerminalContextsToPrompt(
                appendFileContextsToPrompt(text, composerFileContexts),
                composerTerminalContexts,
              ),
              composerElementContexts,
            ),
            attachments,
          );
          if (sent && composerDraftKey) {
            t3ClientActions.clearComposerAttachments(composerDraftKey);
            t3ClientActions.clearComposerTerminalContexts(composerDraftKey);
            t3ClientActions.clearComposerFileContexts(composerDraftKey);
            t3ClientActions.clearComposerElementContexts(composerDraftKey);
          }
          return sent;
        }}
        onStop={interrupt}
        onModelTap={providerAvailable ? uiActions.toggleModelPicker : undefined}
        onModelPickerClose={uiActions.closeModelPicker}
        modelPicker={
          providerAvailable && modelPickerOpen ? (
            <ModelPicker
              models={presentationModels}
              providers={providerEntries}
              providerSnapshots={providers}
              selectedModel={selectedModel}
              currentModelSelection={
                presentedModelSelection ?? activeThread?.modelSelection ?? modelSelection
              }
              currentProviderInstanceId={activeThread?.session?.providerInstanceId ?? null}
              hasStartedSession={
                activeThread?.session !== null && activeThread?.session !== undefined
              }
              lockedProvider={lockedProvider}
              lockedContinuationGroupKey={lockedContinuationGroupKey}
              activeProvider={modelPickerNavigation.provider}
              onActiveProviderChange={uiActions.selectModelPickerProvider}
              onSelect={(model) => {
                t3ClientActions.setModelSelection(model);
                uiActions.syncModelPickerProvider(modelPickerScopeKey, model.instanceId);
                uiActions.closeModelPicker();
              }}
              onClose={uiActions.closeModelPicker}
            />
          ) : null
        }
        onSelectModelOption={
          providerAvailable && modelTraitsTrigger && modelOptionSections.length > 0
            ? handleSelectModelOption
            : undefined
        }
        onRuntimeModeChange={setThreadRuntimeMode}
        onInteractionModeTap={handleInteractionModeTap}
        onWorkspaceModeChange={(mode) => {
          setDraftWorkspaceMode(mode);
          updateDraftWorkspaceMode(mode);
        }}
        onStartFromOriginChange={(enabled) => {
          setStartFromOrigin(enabled);
          setDraftStartFromOrigin(enabled);
        }}
      />
    </ChatRouteSurface>
  );
}
