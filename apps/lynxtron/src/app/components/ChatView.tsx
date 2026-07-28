import { useMemo, useCallback, useEffect, useRef } from "@lynx-js/react";
import { isSessionBusy } from "@t3tools/client-runtime/presentation/session";
import {
  getNextComposerRuntimeMode,
  projectComposerPrimaryOption,
  toggleComposerInteractionMode,
} from "@t3tools/client-runtime/presentation/composer";
import { ChatHeader } from "./ChatHeader";
import { MessagesTimeline } from "./MessagesTimeline";
import { Composer } from "./Composer";
import { RightPanel } from "./RightPanel";
import { t3ClientActions, useT3ClientState } from "../state/t3Client";
import { useClientSettingsState } from "../state/prefsStore";
import { uiActions, useRightPanelState } from "../state/uiState";

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
    <view className="chat-view-surface-reference main-pane">
      <ChatHeader
        projectName={activeProject?.title ?? "t3code"}
        threadTitle={activeThread?.title ?? "New thread"}
        sessionStatus={sessionStatus}
        connectionStatus={status}
        statusDetail={statusDetail}
        rightPanelOpen={rightPanel.isOpen}
        onToggleRightPanel={handleToggleRightPanel}
      />
      <view className="chat-body-row">
        <view className="chat-body">
          {!hero ? (
            <MessagesTimeline
              messages={messages}
              activities={activities}
              sessionStatus={sessionStatus}
              cwd={cwd}
              latestTurn={latestTurn}
              proposedPlans={proposedPlans}
              activeTurnId={activeTurnId}
            />
          ) : null}
          <Composer
            hero={hero}
            projectName={projectName}
            modelLabel={modelLabel}
            modelInstanceId={modelInstanceId}
            modelOptionLabel={primaryModelOption?.presentation.displayLabel}
            branch={activeThread?.branch ?? undefined}
            worktreePath={activeThread?.worktreePath ?? undefined}
            runtimeMode={activeThread?.runtimeMode ?? "full-access"}
            interactionMode={activeThread?.interactionMode ?? "default"}
            disabled={status !== "ready"}
            busy={isSessionBusy(sessionStatus)}
            onSend={sendPrompt}
            onStop={interrupt}
            onModelTap={uiActions.openModelPicker}
            onModelOptionTap={primaryModelOption ? handleModelOptionTap : undefined}
            onRuntimeModeTap={handleRuntimeModeTap}
            onInteractionModeTap={handleInteractionModeTap}
          />
        </view>
        <RightPanel
          activePlan={activePlan ?? null}
          activeProposedPlan={activeProposedPlan ?? null}
        />
      </view>
    </view>
  );
}
