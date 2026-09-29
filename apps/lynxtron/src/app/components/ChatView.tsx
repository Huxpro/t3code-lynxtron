import { useMemo, useCallback, useEffect, useRef, useState } from "@lynx-js/react";
import { isSessionBusy } from "@t3tools/client-runtime/presentation/session";
import { presentConnectorLifecycle } from "@t3tools/client-runtime/presentation/connector-lifecycle";
import {
  derivePendingApprovals,
  derivePendingUserInputs,
} from "@t3tools/client-runtime/presentation/pending-requests";
import {
  buildPendingUserInputAnswers,
  derivePendingUserInputProgress,
  togglePendingUserInputOptionSelection,
  setPendingUserInputCustomAnswer,
  type PendingUserInputDraftAnswer,
} from "@t3tools/client-runtime/presentation/pending-user-input";
import type { ProviderApprovalDecision } from "@t3tools/contracts";
import {
  buildPlanImplementationPrompt,
  buildPlanImplementationThreadTitle,
  proposedPlanTitle,
} from "@t3tools/client-runtime/presentation/proposed-plan";
import { getProviderOptionDescriptors } from "@t3tools/shared/providerOptions";
import {
  buildComposerTraitsTriggerPresentation,
  getNextComposerRuntimeMode,
  projectComposerPrimaryOption,
  toggleComposerInteractionMode,
} from "@t3tools/client-runtime/presentation/composer";
import { ChatRouteSurface } from "../../../../web/src/components/ChatRouteSurface";
import { ConnectorLifecycleBannerSurface } from "../../../../web/src/components/chat/ConnectorLifecycleBannerSurface";
import { ChatHeader } from "./ChatHeader";
import { MessagesTimeline } from "./MessagesTimeline";
import { Composer } from "./Composer";
import { RightPanel } from "./RightPanel";
import { t3ClientActions, useT3ClientState } from "../state/t3Client";
import { useClientSettingsState } from "../state/prefsStore";
import { uiActions, useRightPanelState } from "../state/uiState";
import { navigate } from "../router";
import { composerDraftKey } from "../state/composerDraftRegistry";

interface ChatViewProps {
  threadId?: string;
}

export function ChatView({ threadId }: ChatViewProps) {
  const {
    status,
    statusDetail,
    projects,
    threads,
    activeThreadId,
    messages,
    sessionStatus,
    selectedModel,
    modelSelection,
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
  const lastAutoOpenedPlanKey = useRef<string | null>(null);
  const { interrupt, sendPrompt, setModelOptions, setThreadInteractionMode, setThreadRuntimeMode } =
    t3ClientActions;

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeThreadId),
    [threads, activeThreadId],
  );
  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeThread?.projectId) ?? projects[0] ?? null,
    [activeThread?.projectId, projects],
  );
  const cwd = activeThread?.worktreePath ?? activeProject?.workspaceRoot;
  const [currentBranch, setCurrentBranch] = useState<string | undefined>(undefined);
  const pendingApprovals = useMemo(() => derivePendingApprovals(activities), [activities]);
  const activePendingApproval = pendingApprovals[0];
  const [respondingApprovalId, setRespondingApprovalId] = useState<string | null>(null);
  const respondingApprovalIdRef = useRef<string | null>(null);
  const [approvalError, setApprovalError] = useState<string | undefined>(undefined);
  const pendingUserInputs = useMemo(() => derivePendingUserInputs(activities), [activities]);
  const activePendingUserInput = pendingUserInputs[0];
  const [userInputAnswers, setUserInputAnswers] = useState<
    Record<string, PendingUserInputDraftAnswer>
  >({});
  const [userInputQuestionIndex, setUserInputQuestionIndex] = useState(0);
  const [respondingUserInputId, setRespondingUserInputId] = useState<string | null>(null);
  const respondingUserInputIdRef = useRef<string | null>(null);
  const [userInputError, setUserInputError] = useState<string | undefined>(undefined);
  const [planSubmitting, setPlanSubmitting] = useState(false);
  const planSubmittingRef = useRef(false);
  const [planError, setPlanError] = useState<string | undefined>(undefined);
  const pendingUserInputProgress = useMemo(
    () =>
      activePendingUserInput
        ? derivePendingUserInputProgress(
            activePendingUserInput.questions,
            userInputAnswers,
            userInputQuestionIndex,
          )
        : undefined,
    [activePendingUserInput, userInputAnswers, userInputQuestionIndex],
  );

  const projectName = activeProject?.title ?? "your project";
  const modelLabel = selectedModel?.name;
  const modelInstanceId = selectedModel?.instanceId;
  const hero = messages.length === 0;
  const autoOpenPlanKey = activePlan?.turnId ?? activeProposedPlan?.turnId ?? null;
  const primaryModelOption = useMemo(
    () =>
      projectComposerPrimaryOption({
        capabilities: selectedModel?.capabilities,
        selections: modelSelection?.options,
      }),
    [modelSelection?.options, selectedModel?.capabilities],
  );
  const modelOptionLabel = useMemo(() => {
    if (!selectedModel?.capabilities) return undefined;
    const descriptors = getProviderOptionDescriptors({
      caps: selectedModel.capabilities,
      selections: modelSelection?.options,
    });
    const primarySelectDescriptor = descriptors.find((descriptor) => descriptor.type === "select");
    return buildComposerTraitsTriggerPresentation({
      provider: selectedModel.driverKind,
      descriptors,
      primarySelectDescriptorId: primarySelectDescriptor?.id ?? null,
      ultrathinkPromptControlled: false,
    }).label;
  }, [modelSelection?.options, selectedModel?.capabilities, selectedModel?.driverKind]);
  const lifecycle = useMemo(
    () => presentConnectorLifecycle(status, statusDetail),
    [status, statusDetail],
  );

  useEffect(() => {
    let cancelled = false;
    setCurrentBranch(undefined);
    if (!cwd || status !== "ready") return () => {};
    void t3ClientActions
      .refreshVcsStatus(cwd)
      .then((vcsStatus) => {
        if (!cancelled) setCurrentBranch(vcsStatus.refName ?? undefined);
      })
      .catch(() => {
        if (!cancelled) setCurrentBranch(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [cwd, status]);

  useEffect(() => {
    if (
      respondingApprovalId !== null &&
      (!activePendingApproval || activePendingApproval.requestId !== respondingApprovalId)
    ) {
      setRespondingApprovalId(null);
      respondingApprovalIdRef.current = null;
      setApprovalError(undefined);
    }
  }, [activePendingApproval, respondingApprovalId]);

  useEffect(() => {
    if (!activePendingUserInput || activePendingUserInput.requestId !== respondingUserInputId) {
      setRespondingUserInputId(null);
      respondingUserInputIdRef.current = null;
      setUserInputError(undefined);
    }
    if (!activePendingUserInput) {
      setUserInputAnswers({});
      setUserInputQuestionIndex(0);
    }
  }, [activePendingUserInput, respondingUserInputId]);

  const handleApprovalResponse = useCallback(
    (decision: ProviderApprovalDecision) => {
      if (!activePendingApproval || respondingApprovalIdRef.current) return;
      respondingApprovalIdRef.current = activePendingApproval.requestId;
      setRespondingApprovalId(activePendingApproval.requestId);
      setApprovalError(undefined);
      void t3ClientActions
        .respondToApproval(activePendingApproval.requestId, decision)
        .catch((error: unknown) => {
          respondingApprovalIdRef.current = null;
          setRespondingApprovalId(null);
          setApprovalError(error instanceof Error ? error.message : String(error));
        });
    },
    [activePendingApproval],
  );

  const handleToggleUserInputOption = useCallback(
    (questionId: string, optionLabel: string) => {
      if (!activePendingUserInput || respondingUserInputIdRef.current) return;
      const question = activePendingUserInput.questions.find((entry) => entry.id === questionId);
      if (!question) return;
      setUserInputAnswers((current) => ({
        ...current,
        [questionId]: togglePendingUserInputOptionSelection(
          question,
          current[questionId],
          optionLabel,
        ),
      }));
    },
    [activePendingUserInput],
  );

  const handleAdvanceUserInput = useCallback(() => {
    if (!activePendingUserInput || !pendingUserInputProgress || respondingUserInputIdRef.current)
      return;
    if (!pendingUserInputProgress.isLastQuestion) {
      setUserInputQuestionIndex(pendingUserInputProgress.questionIndex + 1);
      return;
    }
    const answers = buildPendingUserInputAnswers(
      activePendingUserInput.questions,
      userInputAnswers,
    );
    if (!answers) return;
    respondingUserInputIdRef.current = activePendingUserInput.requestId;
    setRespondingUserInputId(activePendingUserInput.requestId);
    setUserInputError(undefined);
    void t3ClientActions
      .respondToUserInput(activePendingUserInput.requestId, answers)
      .catch((error: unknown) => {
        respondingUserInputIdRef.current = null;
        setRespondingUserInputId(null);
        setUserInputError(error instanceof Error ? error.message : String(error));
      });
  }, [activePendingUserInput, pendingUserInputProgress, userInputAnswers]);

  const handleUserInputCustomAnswerChange = useCallback(
    (questionId: string, value: string) => {
      if (!activePendingUserInput || respondingUserInputIdRef.current) return;
      setUserInputAnswers((current) => ({
        ...current,
        [questionId]: setPendingUserInputCustomAnswer(current[questionId], value),
      }));
    },
    [activePendingUserInput],
  );

  const handleImplementPlan = useCallback(() => {
    if (!activeProposedPlan || planSubmittingRef.current) return;
    planSubmittingRef.current = true;
    setPlanSubmitting(true);
    setPlanError(undefined);
    void t3ClientActions
      .implementProposedPlan(
        activeProposedPlan.id,
        buildPlanImplementationPrompt(activeProposedPlan.planMarkdown),
      )
      .catch((error: unknown) => {
        planSubmittingRef.current = false;
        setPlanSubmitting(false);
        setPlanError(error instanceof Error ? error.message : String(error));
      });
  }, [activeProposedPlan]);

  const handleImplementPlanInNewThread = useCallback(() => {
    if (!activeProposedPlan || planSubmittingRef.current) return;
    planSubmittingRef.current = true;
    setPlanSubmitting(true);
    setPlanError(undefined);
    void t3ClientActions
      .implementProposedPlanInNewThread(
        activeProposedPlan.id,
        buildPlanImplementationPrompt(activeProposedPlan.planMarkdown),
        buildPlanImplementationThreadTitle(activeProposedPlan.planMarkdown),
      )
      .catch((error: unknown) => {
        planSubmittingRef.current = false;
        setPlanSubmitting(false);
        setPlanError(error instanceof Error ? error.message : String(error));
      });
  }, [activeProposedPlan]);

  useEffect(() => {
    if (!activeProposedPlan && planSubmittingRef.current) {
      planSubmittingRef.current = false;
      setPlanSubmitting(false);
      setPlanError(undefined);
    }
  }, [activeProposedPlan]);

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

  const handleToggleRightPanel = useCallback(() => {
    uiActions.toggleRightPanel();
  }, []);

  const handleRuntimeModeTap = useCallback(() => {
    setThreadRuntimeMode(getNextComposerRuntimeMode(activeThread?.runtimeMode ?? "full-access"));
  }, [activeThread?.runtimeMode, setThreadRuntimeMode]);

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

  return (
    <ChatRouteSurface
      header={
        <ChatHeader
          projectName={activeProject?.title ?? "t3code"}
          threadTitle={activeThread?.title ?? "New thread"}
          sessionStatus={sessionStatus}
          connectionStatus={status}
          statusDetail={statusDetail}
          rightPanelOpen={rightPanel.isOpen}
          onToggleRightPanel={handleToggleRightPanel}
        />
      }
      banner={
        <ConnectorLifecycleBannerSurface
          presentation={lifecycle}
          onAction={
            lifecycle.action === "retry"
              ? () => void t3ClientActions.reconnectConnector()
              : lifecycle.action === "connections"
                ? () => navigate("/settings/connections")
                : undefined
          }
        />
      }
      rightPanel={
        <RightPanel
          activePlan={activePlan ?? null}
          activeProposedPlan={activeProposedPlan ?? null}
        />
      }
    >
      {!hero ? (
        <MessagesTimeline
          key={activeThreadId ?? "no-thread"}
          messages={messages}
          activities={activities}
          sessionStatus={sessionStatus}
          cwd={cwd}
          latestTurn={latestTurn}
          proposedPlans={proposedPlans}
          activeTurnId={activeTurnId}
          checkpoints={checkpoints}
        />
      ) : null}
      <Composer
        hero={hero}
        connectionStatus={status}
        draftKey={composerDraftKey({ projectId: activeProject?.id, threadId: activeThreadId })}
        projectName={projectName}
        modelLabel={modelLabel}
        modelInstanceId={modelInstanceId}
        modelOptionLabel={modelOptionLabel}
        branch={activeThread?.branch ?? currentBranch}
        worktreePath={activeThread?.worktreePath ?? undefined}
        runtimeMode={activeThread?.runtimeMode ?? "full-access"}
        interactionMode={activeThread?.interactionMode ?? "default"}
        pendingApproval={activePendingApproval}
        pendingApprovalCount={pendingApprovals.length}
        approvalResponding={respondingApprovalId === activePendingApproval?.requestId}
        approvalError={approvalError}
        pendingUserInput={activePendingUserInput}
        pendingUserInputProgress={pendingUserInputProgress}
        userInputResponding={respondingUserInputId === activePendingUserInput?.requestId}
        userInputError={userInputError}
        planTitle={
          activeProposedPlan
            ? (proposedPlanTitle(activeProposedPlan.planMarkdown) ?? "Full Plan")
            : undefined
        }
        planSubmitting={planSubmitting}
        planError={planError}
        disabled={status !== "ready"}
        busy={isSessionBusy(sessionStatus)}
        onSend={sendPrompt}
        onPickImageAttachments={() =>
          Promise.reject(new Error("Native image picking is unavailable in this Lynxtron build."))
        }
        onStop={interrupt}
        onModelTap={uiActions.openModelPicker}
        onModelOptionTap={primaryModelOption ? handleModelOptionTap : undefined}
        onRuntimeModeTap={handleRuntimeModeTap}
        onInteractionModeTap={handleInteractionModeTap}
        onRespondToApproval={handleApprovalResponse}
        onToggleUserInputOption={handleToggleUserInputOption}
        onPreviousUserInputQuestion={() =>
          setUserInputQuestionIndex((index) => Math.max(0, index - 1))
        }
        onAdvanceUserInputQuestion={handleAdvanceUserInput}
        onUserInputCustomAnswerChange={handleUserInputCustomAnswerChange}
        onImplementPlan={handleImplementPlan}
        onImplementPlanInNewThread={handleImplementPlanInNewThread}
      />
    </ChatRouteSurface>
  );
}
