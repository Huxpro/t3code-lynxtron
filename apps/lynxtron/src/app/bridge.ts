/**
 * Bridge contract between the Lynx UI and the Node preload/host layer.
 *
 * The UI never touches the network directly (Lynx has no working fetch/WebSocket).
 * All backend I/O crosses this typed boundary:
 *   - UI -> host: Promise-based calls on `NativeModules.nodejs.exposed`
 *   - host -> UI: push events via `lynx.getJSModule('GlobalEventEmitter')`
 *
 * Keep runtime imports out of this file so both the UI and preload can share
 * the contract while retaining the canonical orchestration shell types.
 */
import type {
  DesktopAppBranding,
  OrchestrationLatestTurn,
  OrchestrationMessage,
  OrchestrationMessageRole,
  OrchestrationCheckpointSummary,
  OrchestrationProjectShell,
  OrchestrationProposedPlan,
  OrchestrationSessionStatus,
  OrchestrationThreadActivity,
  OrchestrationThreadActivityTone,
  OrchestrationThreadShell,
  TurnId,
  ProviderInteractionMode,
  ProviderInstanceId,
  ProjectListEntriesInput,
  ProjectListEntriesResult,
  ProjectReadFileInput,
  ProjectReadFileResult,
  ProjectWriteFileInput,
  ProjectWriteFileResult,
  ServerConfig,
  ServerSettingsPatch,
  SourceControlDiscoveryResult,
  RuntimeMode,
  ModelSelection,
} from "@t3tools/contracts";
import type { ModelPickerModel } from "@t3tools/client-runtime/presentation/model-picker";
import type { AuthAccessPresentation } from "@t3tools/client-runtime/presentation/connections";
import type {
  ActivePlanState,
  LatestProposedPlanState,
} from "@t3tools/client-runtime/presentation/thread";

export type ConnectionStatus = "idle" | "starting-server" | "connecting" | "ready" | "error";

export type SessionStatus = OrchestrationSessionStatus;

export type MessageRole = OrchestrationMessageRole;

export type ChatMessage = OrchestrationMessage;

export type ActivityTone = OrchestrationThreadActivityTone;

export type ActivityEntry = OrchestrationThreadActivity;

export type ThreadSummary = OrchestrationThreadShell;

export type ProjectSummary = OrchestrationProjectShell;

export type ModelInfo = ModelPickerModel;

export interface ConnectResult {
  readonly status: ConnectionStatus;
  readonly detail?: string;
  readonly config?: ServerConfig;
  readonly cwd?: string;
}

/** Host -> UI push event names (via GlobalEventEmitter). */
export const T3_EVENTS = {
  status: "t3:status",
  shell: "t3:shell",
  thread: "t3:thread",
  log: "t3:log",
} as const;

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

/** The API surface exposed by preload via contextBridge.exposeInLynxBTS. */
export interface T3Bridge {
  getAppBranding(): DesktopAppBranding;
  connect(): Promise<ConnectResult>;
  createThread(input: { projectId?: string; title?: string }): Promise<{ threadId: string }>;
  selectThread(threadId: string): Promise<void>;
  sendPrompt(input: { threadId: string; text: string }): Promise<void>;
  interrupt(input: { threadId: string }): Promise<void>;
  setModelSelection(input: { threadId?: string; selection: ModelSelection }): Promise<void>;
  setThreadRuntimeMode(input: { threadId: string; runtimeMode: RuntimeMode }): Promise<void>;
  setThreadInteractionMode(input: {
    threadId: string;
    interactionMode: ProviderInteractionMode;
  }): Promise<void>;
  setProviderEnabled(input: {
    instanceId: ProviderInstanceId;
    enabled: boolean;
  }): Promise<ServerConfig>;
  updateServerSettings(input: { patch: ServerSettingsPatch }): Promise<ServerConfig>;
  deleteThread(input: { threadId: string }): Promise<void>;
  archiveThread(input: { threadId: string; unarchive?: boolean }): Promise<void>;
  renameThread(input: { threadId: string; title: string }): Promise<void>;
  listProjectEntries(input: ProjectListEntriesInput): Promise<ProjectListEntriesResult>;
  readProjectFile(input: ProjectReadFileInput): Promise<ProjectReadFileResult>;
  writeProjectFile(input: ProjectWriteFileInput): Promise<ProjectWriteFileResult>;
  discoverSourceControl(): Promise<SourceControlDiscoveryResult>;
  createPairingCredential(input?: { readonly label?: string }): Promise<PairingCredentialResult>;
  revokePairingLink(input: { readonly id: string }): Promise<boolean>;
  revokeClientSession(input: { readonly sessionId: string }): Promise<boolean>;
  revokeOtherClientSessions(): Promise<number>;
  openExternal(url: string): Promise<void>;
  openPath(path: string): Promise<void>;
}
