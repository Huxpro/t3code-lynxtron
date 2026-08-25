/**
 * Bridge contract between the Lynx UI and the Node preload/host layer.
 *
 * The UI never touches the network directly (Lynx has no working fetch/WebSocket).
 * Backend I/O crosses two typed boundaries:
 *   - connector transport: the main-owned sequenced push protocol in
 *     `src/shared/connectorProtocol.ts` (AR2; main owns the connector
 *     lifecycle, renderer state arrives as pushed events)
 *   - preload capabilities: the small `NativeModules.nodejs.exposed` surface
 *     below for capabilities that stay preload-resident (branding, preference
 *     storage, clipboard, native navigation)
 *
 * Keep runtime imports out of this file so both the UI and preload can share
 * the contract while retaining the canonical orchestration shell types.
 */
import type {
  DesktopAppBranding,
  EditorId,
  FilesystemBrowseInput,
  FilesystemBrowseResult,
  OrchestrationLatestTurn,
  OrchestrationMessage,
  OrchestrationMessageRole,
  OrchestrationCheckpointSummary,
  OrchestrationGetTurnDiffInput,
  OrchestrationGetTurnDiffResult,
  ReviewDiffPreviewInput,
  ReviewDiffPreviewResult,
  OrchestrationProjectShell,
  OrchestrationProposedPlan,
  OrchestrationSessionStatus,
  OrchestrationThreadActivity,
  OrchestrationThreadActivityTone,
  OrchestrationThreadShell,
  ApprovalRequestId,
  ProviderApprovalDecision,
  ProviderUserInputAnswers,
  TurnId,
  ProviderInteractionMode,
  ProviderDriverKind,
  ProviderInstanceId,
  ProjectListEntriesInput,
  ProjectListEntriesResult,
  ProjectSearchEntriesInput,
  ProjectSearchEntriesResult,
  ProjectScript,
  ProjectReadFileInput,
  ProjectReadFileResult,
  ProjectWriteFileInput,
  ProjectWriteFileResult,
  ServerConfig,
  ServerUpsertKeybindingInput,
  ServerUpsertKeybindingResult,
  ServerSettingsPatch,
  SourceControlDiscoveryResult,
  SourceControlCloneRepositoryInput,
  SourceControlCloneRepositoryResult,
  SourceControlRepositoryLookupInput,
  SourceControlRepositoryInfo,
  SourceControlPublishRepositoryInput,
  SourceControlPublishRepositoryResult,
  TerminalCloseInput,
  TerminalOpenInput,
  TerminalResizeInput,
  TerminalSessionSnapshot,
  TerminalWriteInput,
  VcsInitInput,
  VcsStatusResult,
  RuntimeMode,
  ModelSelection,
  ThreadTurnStartBootstrap,
} from "@t3tools/contracts";
import type { ModelPickerModel } from "@t3tools/client-runtime/presentation/model-picker";
import type { AuthAccessPresentation } from "@t3tools/client-runtime/presentation/connections";
import type {
  ActivePlanState,
  LatestProposedPlanState,
} from "@t3tools/client-runtime/presentation/thread";
import type { ProjectRepoContext } from "../shared/connectorProtocol";

export type ConnectionStatus =
  | "idle"
  | "starting-server"
  | "connecting"
  | "reconnecting"
  | "ready"
  | "error";

export type SessionStatus = OrchestrationSessionStatus;

export type MessageRole = OrchestrationMessageRole;

export type ChatMessage = OrchestrationMessage;

export type ActivityTone = OrchestrationThreadActivityTone;

export type ActivityEntry = OrchestrationThreadActivity;

export type ThreadSummary = OrchestrationThreadShell;

export type ProjectSummary = OrchestrationProjectShell;

export type ModelInfo = ModelPickerModel;

export interface StatusEventPayload {
  readonly status: ConnectionStatus;
  readonly detail?: string;
}

/** A coalesced shell snapshot (projects + threads) pushed to the UI. */
export interface ShellEventPayload {
  readonly projects: ReadonlyArray<ProjectSummary>;
  readonly threads: ReadonlyArray<ThreadSummary>;
  readonly archivedThreads?: ReadonlyArray<ThreadSummary>;
}

/** A coalesced thread snapshot (messages + session status) pushed to the UI. */
export interface ThreadEventPayload {
  readonly threadId: string;
  readonly messages: ReadonlyArray<ChatMessage>;
  readonly checkpoints: ReadonlyArray<OrchestrationCheckpointSummary>;
  readonly sessionStatus: SessionStatus;
  readonly sessionError?: string | null;
  readonly activities?: ReadonlyArray<ActivityEntry>;
  readonly activePlan?: ActivePlanState | null;
  readonly activeProposedPlan?: LatestProposedPlanState | null;
  /** Canonical turn lifecycle for transcript folds and elapsed labels. */
  readonly latestTurn?: OrchestrationLatestTurn | null;
  /** Canonical proposed plans rendered inline in the transcript. */
  readonly proposedPlans?: ReadonlyArray<OrchestrationProposedPlan>;
  /** The session's running turn id, when a turn is actively executing. */
  readonly activeTurnId?: TurnId | null;
}

export type { ActivePlanState, LatestProposedPlanState };
export type { AuthAccessPresentation };

export interface PairingCredentialResult {
  readonly id: string;
  readonly credential: string;
  readonly label?: string;
  readonly expiresAt: string;
}

/**
 * Connector command surface, owned by main and invoked through the typed
 * `t3:connector.command` handler (AR2). Implemented by the main transport in
 * `state/mainConnectorTransport.ts`.
 */
export interface T3ConnectorCommandBridge {
  reconnect(): Promise<void>;
  createProject(input: { workspaceRoot: string }): Promise<{ projectId: string }>;
  createThread(input: { projectId?: string; title?: string }): Promise<{ threadId: string }>;
  selectThread(threadId: string): Promise<void>;
  sendPrompt(input: {
    threadId: string;
    text: string;
    bootstrap?: ThreadTurnStartBootstrap;
  }): Promise<void>;
  interrupt(input: { threadId: string; turnId?: TurnId }): Promise<void>;
  respondToApproval(input: {
    threadId: string;
    requestId: ApprovalRequestId;
    decision: ProviderApprovalDecision;
  }): Promise<void>;
  respondToUserInput(input: {
    threadId: string;
    requestId: ApprovalRequestId;
    answers: ProviderUserInputAnswers;
  }): Promise<void>;
  setModelSelection(input: { threadId?: string; selection: ModelSelection }): Promise<void>;
  setThreadRuntimeMode(input: { threadId: string; runtimeMode: RuntimeMode }): Promise<void>;
  setThreadInteractionMode(input: {
    threadId: string;
    interactionMode: ProviderInteractionMode;
  }): Promise<void>;
  refreshProviders(input?: { instanceId?: ProviderInstanceId }): Promise<ServerConfig>;
  updateProvider(input: {
    provider: ProviderDriverKind;
    instanceId?: ProviderInstanceId;
  }): Promise<ServerConfig>;
  setProviderEnabled(input: {
    instanceId: ProviderInstanceId;
    enabled: boolean;
  }): Promise<ServerConfig>;
  updateServerSettings(input: { patch: ServerSettingsPatch }): Promise<ServerConfig>;
  deleteThread(input: { threadId: string }): Promise<void>;
  archiveThread(input: { threadId: string; unarchive?: boolean }): Promise<void>;
  settleThread(input: { threadId: string }): Promise<void>;
  unsettleThread(input: { threadId: string }): Promise<void>;
  renameThread(input: { threadId: string; title: string }): Promise<void>;
  updateProject(input: { projectId: string; title: string }): Promise<void>;
  deleteProject(input: { projectId: string; force?: boolean }): Promise<void>;
  updateProjectScripts(input: {
    projectId: string;
    scripts: ReadonlyArray<ProjectScript>;
  }): Promise<void>;
  upsertKeybinding(input: ServerUpsertKeybindingInput): Promise<ServerUpsertKeybindingResult>;
  openInEditor(input: { cwd: string; editor: EditorId }): Promise<void>;
  browseFilesystem(input: FilesystemBrowseInput): Promise<FilesystemBrowseResult>;
  listProjectEntries(input: ProjectListEntriesInput): Promise<ProjectListEntriesResult>;
  searchProjectEntries(input: ProjectSearchEntriesInput): Promise<ProjectSearchEntriesResult>;
  readProjectFile(input: ProjectReadFileInput): Promise<ProjectReadFileResult>;
  writeProjectFile(input: ProjectWriteFileInput): Promise<ProjectWriteFileResult>;
  getTurnDiff(input: OrchestrationGetTurnDiffInput): Promise<OrchestrationGetTurnDiffResult>;
  getDiffPreview(input: ReviewDiffPreviewInput): Promise<ReviewDiffPreviewResult>;
  readProjectBranch(input: { cwd: string }): Promise<ProjectRepoContext>;
  readVcsStatus(input: { cwd: string }): Promise<VcsStatusResult>;
  initializeRepository(input: VcsInitInput): Promise<void>;
  publishRepository(
    input: SourceControlPublishRepositoryInput,
  ): Promise<SourceControlPublishRepositoryResult>;
  lookupRepository(input: SourceControlRepositoryLookupInput): Promise<SourceControlRepositoryInfo>;
  cloneRepository(
    input: SourceControlCloneRepositoryInput,
  ): Promise<SourceControlCloneRepositoryResult>;
  discoverSourceControl(): Promise<SourceControlDiscoveryResult>;
  createPairingCredential(input?: { readonly label?: string }): Promise<PairingCredentialResult>;
  revokePairingLink(input: { readonly id: string }): Promise<boolean>;
  revokeClientSession(input: { readonly sessionId: string }): Promise<boolean>;
  revokeOtherClientSessions(): Promise<number>;
  openTerminal(input: TerminalOpenInput): Promise<TerminalSessionSnapshot>;
  writeTerminal(input: TerminalWriteInput): Promise<void>;
  resizeTerminal(input: TerminalResizeInput): Promise<void>;
  closeTerminal(input: TerminalCloseInput): Promise<void>;
}

/** Capabilities that stay preload-resident after AR2. */
export interface T3PreloadCapabilityBridge {
  getAppBranding(): DesktopAppBranding;
  reportReadiness?(value: Record<string, unknown>): boolean;
  openExternal(url: string): Promise<void>;
  openPath(path: string): Promise<void>;
}

/** The API surface reachable by the renderer across both boundaries. */
export interface T3Bridge extends T3ConnectorCommandBridge, T3PreloadCapabilityBridge {}
