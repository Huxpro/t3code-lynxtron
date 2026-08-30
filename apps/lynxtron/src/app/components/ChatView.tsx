import { useMemo, useCallback, useEffect, useRef, useState } from "@lynx-js/react";
import {
  deriveSessionPresentationPhase,
  isSessionWorking,
} from "@t3tools/client-runtime/presentation/session";
import {
  isComposerDraftThread,
  projectComposerProviderAvailability,
  projectComposerTraitsMenu,
  projectComposerTraitsTrigger,
  selectComposerTraitOption,
  shouldShowComposerContextStrip,
  shouldUseComposerHeroLayout,
  toggleComposerInteractionMode,
} from "@t3tools/client-runtime/presentation/composer";
import { effectiveSettled } from "@t3tools/client-runtime/state/thread-settled";
import { projectConnectionLifecycle } from "@t3tools/client-runtime/connection/presentation";
import {
  derivePendingApprovals,
  derivePendingUserInputs,
} from "@t3tools/client-runtime/presentation/pending-requests";
import {
  buildPendingUserInputAnswers,
  derivePendingUserInputProgress,
  formatPendingPrimaryActionLabel,
  setPendingUserInputCustomAnswer,
  togglePendingUserInputOptionSelection,
  type PendingUserInputDraftAnswer,
} from "@t3tools/client-runtime/presentation/pending-user-input";
import { deriveModelPickerModels } from "@t3tools/client-runtime/presentation/model-picker";
import {
  projectProviderStatusNotice,
  resolveSelectableProviderInstanceEntry,
} from "@t3tools/client-runtime/presentation/provider";
import {
  EMPTY_TRANSCRIPT_PLACEHOLDER,
  shouldShowEmptyTranscript,
} from "@t3tools/client-runtime/presentation/transcript";
import { ChatRouteSurface } from "../../../../web/src/components/ChatRouteSurface";
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
import approvalDetailLabelUrl from "../assets/approval-detail-label@2x.png?external";
import approvalDetailValuePendingUrl from "../assets/approval-detail-value-pending@2x.png?external";
import approvalEyebrowUrl from "../assets/approval-eyebrow@2x.png?external";
import approvalSummaryUrl from "../assets/approval-summary@2x.png?external";

interface ChatViewProps {
  threadId?: string;
}

export function ChatView({ threadId }: ChatViewProps) {
  const {
    status,
    statusDetail,
    connectorCommandsReady,
    vcsStatus,
    vcsStatusCwd,
    vcsStatusPending,
    projects,
    threads,
    activeThreadId,
    draftHeroThreadId,
    draftThread,
    messages,
    sessionStatus,
    sessionError,
    selectedModel,
    models,
    providers,
    providerEntries,
    providersRefreshPending,
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
  const [clientSettings] = useClientSettingsState();
  const rightPanel = useRightPanelState();
  const modelPickerOpen = useModelPickerOpen();
  const modelPickerNavigation = useModelPickerNavigation();
  const lastAutoOpenedPlanKey = useRef<string | null>(null);
  const lastKnownSelectedModel = useRef(selectedModel);
  const lastKnownModelSelection = useRef(modelSelection);
  const [respondingApprovalId, setRespondingApprovalId] = useState<string | null>(null);
  const [respondingUserInputId, setRespondingUserInputId] = useState<string | null>(null);
  const [dismissedThreadErrorsById, setDismissedThreadErrorsById] = useState<
    Record<string, string>
  >({});
  const [pendingUserInputDraftsByRequestId, setPendingUserInputDraftsByRequestId] = useState<
    Record<string, Record<string, PendingUserInputDraftAnswer>>
  >({});
  const [pendingUserInputQuestionIndexByRequestId, setPendingUserInputQuestionIndexByRequestId] =
    useState<Record<string, number>>({});
  const [checkoutRepoContext, setCheckoutRepoContext] = useState<{
    readonly cwd: string;
    readonly isRepo: boolean;
    readonly branch: string | null;
  } | null>(null);
  const [centerPanelWidth, setCenterPanelWidth] = useState(1024);
  const [rightPanelMaximized, setRightPanelMaximized] = useState(false);
  const [draftWorkspaceMode, setDraftWorkspaceMode] = useState<"local" | "worktree">("local");
  const [startFromOrigin, setStartFromOrigin] = useState(false);
  const {
    interrupt,
    readProjectBranch,
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
  const threadError = sessionError ?? modelSelectionError;
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
  const currentRepoContext = checkoutRepoContext?.cwd === cwd ? checkoutRepoContext : null;
  const checkoutBranch = currentRepoContext?.branch ?? null;

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
  const persistedModelLabel = presentedSelectedModel?.name ?? presentedModelSelection?.model;
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
    status === "ready" &&
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
  const autoOpenPlanKey = activePlan?.turnId ?? activeProposedPlan?.turnId ?? null;
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
  const connectionLifecycle = useMemo(
    () =>
      projectConnectionLifecycle({
        phase: status,
        targetLabel: "T3 Code",
        detail: statusDetail,
        recoverySubject: "the local backend",
      }),
    [status, statusDetail],
  );
  const showInteractionModeToggle =
    providerEntries.find((entry) => entry.instanceId === modelInstanceId)?.snapshot
      .showInteractionModeToggle ?? true;
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

  useEffect(() => {
    if (
      !clientSettings.autoOpenPlanSidebar ||
      !autoOpenPlanKey ||
      lastAutoOpenedPlanKey.current === autoOpenPlanKey
    ) {
      return;
    }
    lastAutoOpenedPlanKey.current = autoOpenPlanKey;
    uiActions.openRightPanelSurface("plan");
  }, [autoOpenPlanKey, clientSettings.autoOpenPlanSidebar]);

  useEffect(() => {
    if (!cwd) {
      setCheckoutRepoContext(null);
      return;
    }
    if (!connectorCommandsReady) {
      return;
    }
    let cancelled = false;
    void readProjectBranch(cwd).then(
      (context) => {
        if (cancelled || !context) return;
        setCheckoutRepoContext({ cwd, ...context });
      },
      () => {
        if (!cancelled) setCheckoutRepoContext(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [connectorCommandsReady, cwd, readProjectBranch]);

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
    (text: string): Promise<boolean> => {
      if (workspaceMode === "worktree" && !workspaceModeLocked && activeProject && checkoutBranch) {
        return sendPrompt(text, {
          prepareWorktree: {
            projectCwd: activeProject.workspaceRoot,
            baseBranch: checkoutBranch,
            ...(startFromOrigin ? { startFromOrigin: true } : {}),
          },
          runSetupScript: true,
        });
      }
      if (workspaceMode === "worktree" && !workspaceModeLocked && !checkoutBranch) {
        return Promise.resolve(false);
      }
      return sendPrompt(text);
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
      onClick={modelPickerOpen ? uiActions.closeModelPicker : undefined}
      activeThreadKind={activeDraftThread ? "draft" : activeThread ? "server" : "none"}
      activeThreadId={activeThreadId}
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
          rightPanelOpen={rightPanel.isOpen}
          centerPanelWidth={centerPanelWidth}
          onCenterPanelWidthChange={setCenterPanelWidth}
        />
      }
      banner={
        visibleThreadError && !hero ? (
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
        ) : null
      }
      bodyOverlay={
        showEmptyTranscript || visibleProviderStatusNotice ? (
          <>
            {showEmptyTranscript ? (
              <TranscriptEmptySurface
                className="timeline-empty-overlay"
                title={EMPTY_TRANSCRIPT_PLACEHOLDER}
              />
            ) : null}
            {visibleProviderStatusNotice ? (
              <view className="provider-status-banner-overlay">
                <ThreadErrorBannerSurface
                  description={`${visibleProviderStatusNotice.title}. ${visibleProviderStatusNotice.message}`}
                  icon={
                    <Icon
                      name="circle-alert"
                      size={16}
                      color={visibleProviderStatusNotice.tone === "warning" ? "#f59e0b" : "#ef4444"}
                    />
                  }
                  action={
                    <view className="provider-status-banner__actions">
                      <SmallButton
                        label={providersRefreshPending ? "Refreshing…" : "Refresh"}
                        onTap={
                          providersRefreshPending
                            ? undefined
                            : () => {
                                void t3ClientActions
                                  .refreshProviders(activeProviderStatus?.instanceId)
                                  .catch(() => undefined);
                              }
                        }
                      />
                      <SmallButton
                        label="Dismiss"
                        onTap={() =>
                          setDismissedProviderStatusNoticeKey(visibleProviderStatusNotice.key)
                        }
                      />
                    </view>
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
          activePlan={activePlan ?? null}
          activeProposedPlan={activeProposedPlan ?? null}
          maximized={rightPanelMaximized}
          onMaximizedChange={setRightPanelMaximized}
        />
      }
    >
      {!hero ? (
        <MessagesTimeline
          key={activeThreadId ?? "no-thread"}
          messages={messages}
          activities={activities}
          sessionStatus={sessionStatus}
          hasTopBanner={Boolean(visibleThreadError)}
          cwd={cwd}
          latestTurn={latestTurn}
          proposedPlans={proposedPlans}
          activeTurnId={activeTurnId}
          checkpoints={checkpoints}
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
        branch={activeThread?.branch ?? checkoutBranch ?? undefined}
        showContextStrip={showComposerContextStrip}
        worktreePath={activeThread?.worktreePath ?? undefined}
        workspaceMode={workspaceMode}
        workspaceModeLocked={workspaceModeLocked}
        startFromOrigin={startFromOrigin}
        runtimeMode={activeThread?.runtimeMode ?? "full-access"}
        interactionMode={activeThread?.interactionMode ?? "default"}
        showInteractionModeToggle={showInteractionModeToggle}
        availableWidth={centerPanelWidth}
        statusBanner={
          shouldRenderConnectionLifecycleBanner({ hero }) && connectionLifecycle.visible ? (
            <view className="composer-lifecycle-banner">
              <ConnectionLifecycleBannerSurface
                presentation={connectionLifecycle}
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
                  Sending a message moves it back to Active in the sidebar.
                </text>
              </view>
              <view
                className="composer-settled-banner__action"
                bindtap={() => {
                  if (activeThread) {
                    void t3ClientActions.unsettleThread(activeThread.id).catch(() => undefined);
                  }
                }}
              >
                <text className="composer-settled-banner__action-label">Un-settle</text>
              </view>
            </view>
          ) : undefined
        }
        pendingBanner={
          activePendingApproval ? (
            <view className="composer-pending-wrapper rounded-t-[19px] border-b border-border/65 bg-muted/20">
              <ComposerPendingApprovalSurface
                approvalSummary={
                  activePendingApproval.requestKind === "command"
                    ? "Command approval requested"
                    : activePendingApproval.requestKind === "file-read"
                      ? "File-read approval requested"
                      : "File-change approval requested"
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
                eyebrowVisual={
                  <image
                    className="composer-pending-authority-copy composer-pending-authority-copy--eyebrow"
                    src={approvalEyebrowUrl}
                  />
                }
                summaryVisual={
                  <image
                    className="composer-pending-authority-copy composer-pending-authority-copy--summary"
                    src={approvalSummaryUrl}
                  />
                }
                detailLabelVisual={
                  <image
                    className="composer-pending-authority-copy composer-pending-authority-copy--detail-label"
                    src={approvalDetailLabelUrl}
                  />
                }
                detailVisual={
                  activePendingApproval.detail === "printf pending-approval" ? (
                    <image
                      className="composer-pending-authority-copy composer-pending-authority-copy--detail-value"
                      src={approvalDetailValuePendingUrl}
                    />
                  ) : undefined
                }
              />
            </view>
          ) : activePendingQuestion ? (
            <view
              className={`composer-pending-wrapper composer-pending-wrapper--question${
                activePendingQuestion.multiSelect
                  ? " composer-pending-wrapper--question-multi-select"
                  : ""
              } rounded-t-[19px] border-b border-border/65 bg-muted/20`}
            >
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
                onSelect={handleQuestionOptionSelect}
              />
            </view>
          ) : null
        }
        approvalActions={
          activePendingApproval ? (
            <ComposerPendingApprovalActions
              requestId={activePendingApproval.requestId}
              isResponding={respondingApprovalId === activePendingApproval.requestId}
              onRespondToApproval={handleRespondToApproval}
            />
          ) : undefined
        }
        approvalDetail={activePendingApproval?.detail}
        questionMultiSelect={activePendingQuestion?.multiSelect === true}
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
        disabled={status !== "ready" || sessionStatus === "starting"}
        busy={sessionWorking}
        onSend={handleSend}
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
