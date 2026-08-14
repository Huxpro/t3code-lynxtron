import { useMemo, useCallback, useEffect, useRef, useState } from "@lynx-js/react";
import {
  deriveSessionPresentationPhase,
  isSessionBusy,
} from "@t3tools/client-runtime/presentation/session";
import {
  isComposerDraftThread,
  projectComposerPrimaryOption,
  projectComposerTraitsTrigger,
  resolveDefaultComposerPlaceholder,
  shouldUseComposerHeroLayout,
  toggleComposerInteractionMode,
} from "@t3tools/client-runtime/presentation/composer";
import { effectiveSettled } from "@t3tools/client-runtime/state/thread-settled";
import { DEFAULT_SIDEBAR_AUTO_SETTLE_AFTER_DAYS } from "@t3tools/contracts";
import { projectConnectionLifecycle } from "@t3tools/client-runtime/connection/presentation";
import {
  derivePendingApprovals,
  derivePendingUserInputs,
} from "@t3tools/client-runtime/presentation/pending-requests";
import {
  buildPendingUserInputAnswers,
  formatPendingPrimaryActionLabel,
  setPendingUserInputCustomAnswer,
  togglePendingUserInputOptionSelection,
  type PendingUserInputDraftAnswer,
} from "@t3tools/client-runtime/presentation/pending-user-input";
import { deriveModelPickerModels } from "@t3tools/client-runtime/presentation/model-picker";
import { ChatRouteSurface } from "../../../../web/src/components/ChatRouteSurface";
import { ConnectionLifecycleBannerSurface } from "../../../../web/src/components/chat/ConnectionLifecycleBannerSurface";
import { ThreadErrorBannerSurface } from "../../../../web/src/components/chat/ThreadErrorBannerSurface";
import {
  ComposerPendingApprovalSurface,
  ComposerPendingQuestionSurface,
} from "../../../../web/src/components/chat/ComposerPendingSurface";
import { ComposerPendingApprovalActions } from "../../../../web/src/components/chat/ComposerPendingApprovalActions";
import { ChatHeader, ChatLayoutControls } from "./ChatHeader";
import { Icon } from "./Icon";
import { MessagesTimeline } from "./MessagesTimeline";
import { Composer } from "./Composer";
import { ModelPicker } from "./ModelPicker";
import { RightPanel } from "./RightPanel";
import { t3ClientActions, useT3ClientState } from "../state/t3Client";
import {
  resolveConnectionScopedValue,
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
import { resolveActiveThreadModelSelection } from "../state/modelSelection.logic";
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
    projects,
    threads,
    activeThreadId,
    draftHeroThreadId,
    messages,
    sessionStatus,
    sessionError,
    selectedModel,
    models,
    providers,
    providerEntries,
    modelSelection,
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
  const [pendingUserInputDrafts, setPendingUserInputDrafts] = useState<
    Record<string, PendingUserInputDraftAnswer>
  >({});
  const [checkoutBranch, setCheckoutBranch] = useState<string | null>(null);
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
    setModelOptions,
    setThreadInteractionMode,
    setThreadRuntimeMode,
  } = t3ClientActions;

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeThreadId),
    [threads, activeThreadId],
  );
  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeThread?.projectId) ?? projects[0] ?? null,
    [activeThread?.projectId, projects],
  );
  const cwd = activeThread?.worktreePath ?? activeProject?.workspaceRoot;

  const presentationModels = useMemo(
    () =>
      models.length > 0
        ? models
        : deriveModelPickerModels(providerEntries, { includeDisabled: true }),
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
  const presentedSelectedModel = resolveConnectionScopedValue({
    status,
    current: activeThreadModelProjection.selectedModel,
    lastKnown: lastKnownSelectedModel.current,
  });
  const presentedModelSelection = resolveConnectionScopedValue({
    status,
    current: activeThreadModelProjection.selection,
    lastKnown: lastKnownModelSelection.current,
  });
  const projectName = activeProject?.title ?? "your project";
  const modelLabel = presentedSelectedModel?.name ?? presentedModelSelection?.model;
  const modelInstanceId = presentedSelectedModel?.instanceId ?? presentedModelSelection?.instanceId;
  const activeProviderInstanceId =
    activeThread?.session?.providerInstanceId ?? activeThread?.modelSelection.instanceId ?? null;
  const activeProviderEntry = providerEntries.find(
    (entry) => entry.instanceId === activeProviderInstanceId,
  );
  const lockedProvider = activeThread?.session ? (activeProviderEntry?.driverKind ?? null) : null;
  const lockedContinuationGroupKey = activeThread?.session
    ? (activeProviderEntry?.continuationGroupKey ?? null)
    : null;
  const hero = shouldUseComposerHeroLayout({
    isLocalDraftThread: isComposerDraftThread({
      activeThreadId,
      draftHeroThreadId,
    }),
    timelineEntryCount: messages.length,
    isWorking: isSessionBusy(sessionStatus),
    dockRequested: false,
  });
  const composerPlaceholder = resolveDefaultComposerPlaceholder(
    deriveSessionPresentationPhase(activeThread?.session?.status),
  );
  const modelPickerScopeKey = hero
    ? `new-thread:${activeProject?.id ?? "unselected"}`
    : (activeThreadId ?? "no-thread");
  const autoOpenPlanKey = activePlan?.turnId ?? activeProposedPlan?.turnId ?? null;
  const pendingApprovals = useMemo(() => derivePendingApprovals(activities), [activities]);
  const pendingUserInputs = useMemo(() => derivePendingUserInputs(activities), [activities]);
  const activePendingApproval = pendingApprovals[0] ?? null;
  const activePendingUserInput = pendingUserInputs[0] ?? null;
  const activePendingQuestion = pendingUserInputs[0]?.questions[0] ?? null;
  const activePendingDraft = activePendingQuestion
    ? pendingUserInputDrafts[activePendingQuestion.id]
    : undefined;
  const pendingAnswers = activePendingUserInput
    ? buildPendingUserInputAnswers(activePendingUserInput.questions, pendingUserInputDrafts)
    : null;
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
  const primaryModelOption = useMemo(
    () =>
      projectComposerPrimaryOption({
        capabilities: selectedModel?.capabilities,
        selections: modelSelection?.options,
      }),
    [modelSelection?.options, selectedModel?.capabilities],
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
      autoSettleAfterDays: DEFAULT_SIDEBAR_AUTO_SETTLE_AFTER_DAYS,
    });
  const workspaceMode =
    activeThread?.worktreePath != null
      ? "worktree"
      : messages.length > 0
        ? "local"
        : draftWorkspaceMode;
  const workspaceModeLocked = messages.length > 0 || activeThread?.worktreePath != null;

  useEffect(() => {
    if (selectedModel) lastKnownSelectedModel.current = selectedModel;
    if (modelSelection) lastKnownModelSelection.current = modelSelection;
  }, [modelSelection, selectedModel]);

  useEffect(() => {
    setDraftWorkspaceMode(activeThread?.worktreePath ? "worktree" : "local");
    setStartFromOrigin(false);
    setRightPanelMaximized(false);
  }, [activeThreadId, activeThread?.worktreePath]);

  useEffect(() => {
    uiActions.syncModelPickerProvider(
      modelPickerScopeKey,
      selectedModel?.instanceId ??
        (clientSettings.favorites.length > 0
          ? "favorites"
          : (providerEntries[0]?.instanceId ?? "favorites")),
    );
  }, [
    clientSettings.favorites.length,
    modelPickerScopeKey,
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
    if (activeThread?.branch || !cwd || !connectorCommandsReady) {
      setCheckoutBranch(null);
      return;
    }
    let cancelled = false;
    void readProjectBranch(cwd).then((branch) => {
      if (!cancelled) setCheckoutBranch(branch);
    });
    return () => {
      cancelled = true;
    };
  }, [activeThread?.branch, connectorCommandsReady, cwd, readProjectBranch]);

  const handleInteractionModeTap = useCallback(() => {
    setThreadInteractionMode(
      toggleComposerInteractionMode(activeThread?.interactionMode ?? "default"),
    );
  }, [activeThread?.interactionMode, setThreadInteractionMode]);

  const handleModelOptionTap = useCallback(() => {
    if (primaryModelOption) {
      setModelOptions(primaryModelOption.nextSelections);
    }
  }, [primaryModelOption, setModelOptions]);

  const handleSend = useCallback(
    (text: string) => {
      if (workspaceMode === "worktree" && !workspaceModeLocked && activeProject && checkoutBranch) {
        sendPrompt(text, {
          prepareWorktree: {
            projectCwd: activeProject.workspaceRoot,
            baseBranch: checkoutBranch,
            ...(startFromOrigin ? { startFromOrigin: true } : {}),
          },
          runSetupScript: true,
        });
        return;
      }
      if (workspaceMode === "worktree" && !workspaceModeLocked && !checkoutBranch) {
        return;
      }
      sendPrompt(text);
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
      if (!activePendingQuestion) return;
      setPendingUserInputDrafts((drafts) => ({
        ...drafts,
        [activePendingQuestion.id]: togglePendingUserInputOptionSelection(
          activePendingQuestion,
          drafts[activePendingQuestion.id],
          optionLabel,
        ),
      }));
    },
    [activePendingQuestion],
  );
  const handleQuestionCustomAnswerChange = useCallback(
    (value: string) => {
      if (!activePendingQuestion) return;
      setPendingUserInputDrafts((drafts) => ({
        ...drafts,
        [activePendingQuestion.id]: setPendingUserInputCustomAnswer(
          drafts[activePendingQuestion.id],
          value,
        ),
      }));
    },
    [activePendingQuestion],
  );
  const handleQuestionSubmit = useCallback(async () => {
    if (!activePendingUserInput || !pendingAnswers) return;
    setRespondingUserInputId(activePendingUserInput.requestId);
    try {
      await respondToUserInput(activePendingUserInput.requestId, pendingAnswers);
      setPendingUserInputDrafts({});
    } finally {
      setRespondingUserInputId(null);
    }
  }, [activePendingUserInput, pendingAnswers, respondToUserInput]);

  return (
    <ChatRouteSurface
      layoutControls={<ChatLayoutControls rightPanelOpen={rightPanel.isOpen} />}
      header={
        <ChatHeader
          projectName={activeProject?.title ?? "t3code"}
          threadTitle={activeThread?.title ?? "New thread"}
          cwd={cwd}
          availableEditors={serverConfig?.availableEditors ?? []}
          rightPanelOpen={rightPanel.isOpen}
          centerPanelWidth={centerPanelWidth}
          onCenterPanelWidthChange={setCenterPanelWidth}
        />
      }
      banner={
        sessionError && !hero ? (
          <ThreadErrorBannerSurface
            description={sessionError}
            icon={<Icon name="circle-alert" size={16} color="#ef4444" />}
          />
        ) : shouldRenderConnectionLifecycleBanner({ hero }) ? (
          <ConnectionLifecycleBannerSurface
            presentation={connectionLifecycle}
            onReconnect={() => {
              void reconnect().catch(() => undefined);
            }}
            onOpenConnections={() => navigate("/settings/connections")}
          />
        ) : null
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
          hasTopBanner={Boolean(sessionError)}
          cwd={cwd}
          latestTurn={latestTurn}
          proposedPlans={proposedPlans}
          activeTurnId={activeTurnId}
          checkpoints={checkpoints}
        />
      ) : null}
      <Composer
        hero={hero}
        placeholder={
          activePendingQuestion
            ? "Type your own answer, or leave this blank to use the selected option"
            : composerPlaceholder
        }
        projectName={projectName}
        modelLabel={modelLabel}
        modelInstanceId={modelInstanceId}
        modelDriverKind={presentedSelectedModel?.driverKind}
        modelOptionLabel={modelTraitsTrigger?.label}
        branch={activeThread?.branch ?? checkoutBranch ?? undefined}
        worktreePath={activeThread?.worktreePath ?? undefined}
        workspaceMode={workspaceMode}
        workspaceModeLocked={workspaceModeLocked}
        startFromOrigin={startFromOrigin}
        runtimeMode={activeThread?.runtimeMode ?? "full-access"}
        interactionMode={activeThread?.interactionMode ?? "default"}
        showInteractionModeToggle={showInteractionModeToggle}
        statusBanner={
          activeThreadSettled ? (
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
            <view className="composer-pending-wrapper composer-pending-wrapper--question rounded-t-[19px] border-b border-border/65 bg-muted/20">
              <ComposerPendingQuestionSurface
                header={activePendingQuestion.header}
                question={activePendingQuestion.question}
                questionIndex={0}
                questionCount={pendingUserInputs[0]?.questions.length ?? 1}
                multiSelect={activePendingQuestion.multiSelect === true}
                options={activePendingQuestion.options}
                selectedOptionLabels={activePendingDraft?.selectedOptionLabels ?? []}
                responding={respondingUserInputId === activePendingUserInput?.requestId}
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
        questionActions={
          activePendingQuestion ? (
            <view
              className={`composer-question-submit${
                pendingAnswers ? "" : " composer-question-submit--disabled"
              }`}
              data-composer-primary-state="stop"
              aria-disabled={pendingAnswers ? "false" : "true"}
              bindtap={pendingAnswers ? handleQuestionSubmit : undefined}
            >
              <text className="composer-question-submit__label">
                {formatPendingPrimaryActionLabel({
                  compact: true,
                  isLastQuestion: true,
                  isResponding: respondingUserInputId === activePendingUserInput?.requestId,
                  questionIndex: 0,
                })}
              </text>
            </view>
          ) : undefined
        }
        questionCustomAnswer={activePendingDraft?.customAnswer ?? ""}
        onQuestionCustomAnswerChange={handleQuestionCustomAnswerChange}
        disabled={status !== "ready"}
        busy={isSessionBusy(sessionStatus)}
        onSend={handleSend}
        onStop={interrupt}
        onModelTap={uiActions.toggleModelPicker}
        modelPicker={
          modelPickerOpen ? (
            <ModelPicker
              models={models}
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
        onModelOptionTap={modelTraitsTrigger ? handleModelOptionTap : undefined}
        onRuntimeModeChange={setThreadRuntimeMode}
        onInteractionModeTap={handleInteractionModeTap}
        onWorkspaceModeChange={setDraftWorkspaceMode}
        onStartFromOriginChange={setStartFromOrigin}
      />
    </ChatRouteSurface>
  );
}
