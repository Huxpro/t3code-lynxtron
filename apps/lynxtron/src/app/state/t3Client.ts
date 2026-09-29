import { useAtomValue } from "@effect/atom-react";
import { useEffect } from "@lynx-js/react";
import { Atom } from "effect/unstable/reactivity";
import { presentThreadCommandErrorMessage } from "@t3tools/client-runtime/errors";
import { truncate } from "@t3tools/shared/String";
import {
  deriveModelPickerModels,
  deriveProviderModelSelectionProjection,
} from "@t3tools/client-runtime/presentation/model-picker";
import type { ProviderInstanceEntry } from "@t3tools/client-runtime/presentation/provider";
import type { AuthAccessPresentation } from "@t3tools/client-runtime/presentation/connections";
import {
  MAX_TERMINAL_CONTEXTS_PER_SCOPE,
  normalizeComposerTerminalContextsByScopeKey,
  type ComposerTerminalContext,
  type ComposerTerminalContextsByScopeKey,
} from "@t3tools/client-runtime/presentation/terminal-context";
import {
  MAX_FILE_CONTEXTS_PER_SCOPE,
  normalizeComposerFileContextsByScopeKey,
  type ComposerFileContext,
  type ComposerFileContextsByScopeKey,
} from "@t3tools/client-runtime/presentation/file-context";
import {
  addComposerElementContext as addComposerElementContextToState,
  normalizeComposerElementContextsByScopeKey,
  removeComposerElementContext as removeComposerElementContextFromState,
  type ComposerElementContextsByScopeKey,
  type ElementContextDraft,
} from "@t3tools/client-runtime/presentation/element-context";
import {
  buildDraftThreadTurnBootstrap,
  addComposerDraftAttachments,
  composerDraftScopeKey,
  createLocalDraftThread,
  forgetLocalDraftThread,
  normalizeComposerDraftAttachmentsByScopeKey,
  normalizeComposerDraftTextByScopeKey,
  normalizeLocalDraftThreadsByProjectId,
  serializeLocalDraftThreadsByProjectId,
  removeComposerDraftAttachment,
  projectDraftThreadInteractionMode,
  projectComposerDraftText,
  projectDraftThreadModelSelection,
  projectDraftThreadRuntimeMode,
  projectDraftThreadWorkspace,
  readLocalDraftThreadForProject,
  rememberLocalDraftThread,
  shouldFinalizePromotedDraftThread,
  type LocalDraftThread,
  type LocalDraftThreadEnvMode,
  type LocalDraftThreadsByProjectId,
  type ComposerDraftTextByScopeKey,
  type ComposerDraftAttachmentsByScopeKey,
} from "@t3tools/client-runtime/presentation/draft-thread";
import {
  PORTABLE_SERVER_SETTINGS_DEFAULTS,
  projectPortableGeneralSettingsRestore,
} from "@t3tools/client-runtime/presentation/settings";
import {
  buildProviderInstanceCreatePatch,
  buildProviderInstanceDeletePatch,
  buildProviderInstanceUpdatePatch,
} from "@t3tools/client-runtime/presentation/provider-settings";
import { ProjectId, ThreadId } from "@t3tools/contracts";
import type {
  ApprovalRequestId,
  AssetCreateUrlInput,
  EditorId,
  FilesystemBrowseInput,
  FilesystemBrowseResult,
  GitRunStackedActionInput,
  GitRunStackedActionResult,
  ModelSelection,
  OrchestrationCheckpointSummary,
  OrchestrationGetTurnDiffInput,
  OrchestrationGetTurnDiffResult,
  ReviewDiffPreviewInput,
  ReviewDiffPreviewResult,
  OrchestrationLatestTurn,
  OrchestrationProposedPlan,
  ProviderInteractionMode,
  ProviderApprovalDecision,
  ProviderUserInputAnswers,
  ProjectListEntriesResult,
  ProjectSearchEntriesResult,
  ProjectScript,
  ProjectReadFileResult,
  ProjectWriteFileResult,
  ProviderInstanceConfig,
  ProviderInstanceId,
  ServerConfig,
  ServerRemoveKeybindingInput,
  ServerRemoveKeybindingResult,
  ServerProvider,
  ServerSettings,
  ServerSettingsPatch,
  ServerUpsertKeybindingInput,
  ServerUpsertKeybindingResult,
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
  VcsStatusResult,
  RuntimeMode,
  ThreadTurnStartBootstrap,
  TurnId,
  UploadChatAttachment,
} from "@t3tools/contracts";
import { newThreadId } from "../../../../web/src/lib/utils";

import type {
  ActivePlanState,
  ActivityEntry,
  ChatMessage,
  ConnectionStatus,
  LatestProposedPlanState,
  ModelInfo,
  PairingCredentialResult,
  ProjectSummary,
  SessionStatus,
  ShellEventPayload,
  StatusEventPayload,
  T3Bridge,
  ThreadEventPayload,
  ThreadSummary,
} from "../bridge";
import { navigate, getPathname } from "../router";
import { appAtomRegistry } from "./atomRegistry";
import { reportConnectionStatus } from "./connectionStatus";
import { LYNX_PRIMARY_ENVIRONMENT_ID } from "./environment";
import { getClientSettingsState, getPref, setPref, updateClientSettingsState } from "./prefsStore";
import {
  callBridge,
  startMainConnectorTransport,
  type BridgeCallResult,
  type BridgeCallModule,
  type GlobalEventListenerRegistry,
  type MainConnectorTransport,
} from "./mainConnectorTransport";
import {
  CONNECTOR_COMMAND_NAMES,
  decodeConnectorCommandResult,
  decodeConnectorServerConfig,
  encodeConnectorCommandParams,
  type ConnectorAssetUrlResult,
} from "../../shared/connectorProtocol.ts";
import {
  availableThreadModels,
  findExactModelForSelection,
  modelSelectionMutationError,
  projectModelSelectionCandidates,
  resolveActiveThreadModelSelection,
  shouldRollbackModelSelectionMutation,
} from "./modelSelection.logic";
import { shouldReportVcsStatusReadFailure } from "./vcsStatusProjection.logic";
import { projectThreadInteractionMode, projectThreadRuntimeMode } from "./threadModeMutation.logic";
import {
  enqueueSerialMutation,
  markPendingMutationAccepted,
  reconcilePendingMutation,
  rejectPendingMutation,
  setLatestPendingMutation,
  type LatestPendingMutation,
} from "../../shared/latestPendingMutation";
import type {
  ConnectorCommandName,
  ConnectorEventEnvelope,
  ConnectorSnapshot,
  ProjectRepoContext,
  TerminalSessionPresentation,
} from "../../shared/connectorProtocol.ts";

interface PollBridge extends T3Bridge {}

declare const NativeModules: {
  nodejs?: { exposed?: Partial<PollBridge> };
  bridge?: BridgeCallModule;
} & Record<string, unknown>;

declare const lynx:
  | {
      getJSModule?: (name: string) => GlobalEventListenerRegistry | undefined;
    }
  | undefined;

export interface T3ClientState {
  readonly status: ConnectionStatus;
  readonly statusDetail?: string;
  readonly connectorCommandsReady: boolean;
  readonly vcsStatus: VcsStatusResult | null;
  readonly vcsStatusCwd: string | null;
  readonly vcsStatusPending: boolean;
  readonly projects: ReadonlyArray<ProjectSummary>;
  readonly threads: ReadonlyArray<ThreadSummary>;
  readonly archivedThreads: ReadonlyArray<ThreadSummary>;
  readonly activeThreadId?: string;
  readonly draftHeroThreadId?: string;
  readonly draftThread?: LocalDraftThread;
  readonly draftThreadsByProjectId: LocalDraftThreadsByProjectId;
  readonly composerDraftTextByScopeKey: ComposerDraftTextByScopeKey;
  readonly composerDraftAttachmentsByScopeKey: ComposerDraftAttachmentsByScopeKey;
  readonly composerTerminalContextsByScopeKey: ComposerTerminalContextsByScopeKey;
  readonly composerFileContextsByScopeKey: ComposerFileContextsByScopeKey;
  readonly composerElementContextsByScopeKey: ComposerElementContextsByScopeKey;
  readonly messages: ReadonlyArray<ChatMessage>;
  readonly checkpoints: ReadonlyArray<OrchestrationCheckpointSummary>;
  readonly sessionStatus: SessionStatus;
  readonly sessionError: string | null;
  readonly models: ReadonlyArray<ModelInfo>;
  readonly selectedModel?: ModelInfo;
  readonly modelSelection?: ModelSelection;
  readonly modelSelectionError: string | null;
  readonly modelSelectionPending: boolean;
  readonly serverConfig?: ServerConfig;
  readonly providers: ReadonlyArray<ServerProvider>;
  readonly settings?: ServerSettings;
  readonly authAccess: AuthAccessPresentation;
  readonly providerEntries: ReadonlyArray<ProviderInstanceEntry>;
  readonly providersRefreshPending: boolean;
  readonly providerUpdatePending: ProviderInstanceId | null;
  readonly providerSettingsError: string | null;
  readonly settingsUpdatePending: boolean;
  readonly settingsError: string | null;
  readonly activePlan?: ActivePlanState;
  readonly activeProposedPlan?: LatestProposedPlanState;
  readonly activities: ReadonlyArray<ActivityEntry>;
  readonly latestTurn: OrchestrationLatestTurn | null;
  readonly proposedPlans: ReadonlyArray<OrchestrationProposedPlan>;
  readonly activeTurnId: TurnId | null;
  readonly terminalSessions: Readonly<Record<string, TerminalSessionPresentation>>;
}

const INITIAL_T3_CLIENT_STATE: T3ClientState = {
  status: "idle",
  connectorCommandsReady: false,
  vcsStatus: null,
  vcsStatusCwd: null,
  vcsStatusPending: false,
  projects: [],
  threads: [],
  archivedThreads: [],
  draftThreadsByProjectId: {},
  composerDraftTextByScopeKey: {},
  composerDraftAttachmentsByScopeKey: {},
  composerTerminalContextsByScopeKey: {},
  composerFileContextsByScopeKey: {},
  composerElementContextsByScopeKey: {},
  messages: [],
  checkpoints: [],
  sessionStatus: "idle",
  sessionError: null,
  models: [],
  modelSelectionError: null,
  modelSelectionPending: false,
  providers: [],
  authAccess: {
    pairingLinks: [],
    clientSessions: [],
    pairingLinkCount: 0,
    clientSessionCount: 0,
    hasEntries: false,
  },
  providerEntries: [],
  providersRefreshPending: false,
  providerUpdatePending: null,
  providerSettingsError: null,
  settingsUpdatePending: false,
  settingsError: null,
  activities: [],
  latestTurn: null,
  proposedPlans: [],
  activeTurnId: null,
  terminalSessions: {},
};

export const t3ClientStateAtom = Atom.make<T3ClientState>(INITIAL_T3_CLIENT_STATE).pipe(
  Atom.withLabel("lynx-t3-client-state"),
);

let started = false;
let configFingerprint = "";
let accessFingerprint = "";
let shellFingerprint = "";
let threadFingerprint = "";
let mainTransport: MainConnectorTransport | null = null;
let mainCommandBridge: Partial<PollBridge> | null = null;
let mtsProviderFixture: ServerProvider | undefined;
let lastUserInputResponse:
  | {
      readonly threadId: string;
      readonly requestId: ApprovalRequestId;
      readonly answers: ProviderUserInputAnswers;
    }
  | undefined;
let vcsStatusRequestSequence = 0;
let modelSelectionMutationSequence = 0;
const pendingThreadRuntimeModes = new Map<string, LatestPendingMutation<RuntimeMode>>();
const pendingThreadInteractionModes = new Map<
  string,
  LatestPendingMutation<ProviderInteractionMode>
>();
const pendingThreadModeCommands = new Map<string, Promise<void>>();
const canonicalThreadRuntimeModes = new Map<string, RuntimeMode>();
const canonicalThreadInteractionModes = new Map<string, ProviderInteractionMode>();

function getPreloadBridge(): Partial<PollBridge> | undefined {
  "background only";
  try {
    return NativeModules?.nodejs?.exposed;
  } catch {
    return undefined;
  }
}

function getBridge(): Partial<PollBridge> | undefined {
  "background only";
  const preload = getPreloadBridge();
  // The main-owned transport overrides only connector-owned commands; preload
  // keeps branding, preference storage, clipboard, and shell navigation in
  // both transports.
  if (mainCommandBridge) return { ...preload, ...mainCommandBridge };
  return preload;
}

function patchState(partial: Partial<T3ClientState>): void {
  const previous = appAtomRegistry.get(t3ClientStateAtom);
  const next = {
    ...previous,
    ...partial,
  };
  appAtomRegistry.set(t3ClientStateAtom, next);
  if (next.draftThreadsByProjectId !== previous.draftThreadsByProjectId) {
    setPref(
      "draftThreadsByProjectId",
      serializeLocalDraftThreadsByProjectId(next.draftThreadsByProjectId),
    );
  }
  const reportReadiness = getPreloadBridge()?.reportReadiness as
    | ((value: Record<string, unknown>) => boolean)
    | undefined;
  if (reportReadiness && next.status === "ready" && next.projects.length > 0) {
    reportReadiness({
      status: next.status,
      projects: next.projects.map((project) => ({ id: project.id, title: project.title })),
      threads: next.threads.map((thread) => ({
        id: thread.id,
        projectId: thread.projectId,
        title: thread.title,
      })),
      archivedThreads: next.archivedThreads.map((thread) => ({
        id: thread.id,
        projectId: thread.projectId,
        title: thread.title,
      })),
      activeThreadId: next.activeThreadId ?? null,
      transport: {
        kind: mainTransport ? "main" : "unavailable",
        lastSeq: mainTransport?.lastSeq ?? -1,
      },
    });
  }
}

function activeVcsCwd(state: T3ClientState): string | null {
  const activeThread =
    state.threads.find((thread) => thread.id === state.activeThreadId) ??
    (state.draftThread?.id === state.activeThreadId ? state.draftThread : undefined);
  const activeProject =
    state.projects.find((project) => project.id === activeThread?.projectId) ??
    state.projects[0] ??
    null;
  return activeThread?.worktreePath ?? activeProject?.workspaceRoot ?? null;
}

function refreshVcsStatusProjection(): void {
  const state = appAtomRegistry.get(t3ClientStateAtom);
  const cwd = activeVcsCwd(state);
  const bridge = getBridge();
  const requestSequence = ++vcsStatusRequestSequence;
  if (!cwd || !bridge?.readVcsStatus) {
    patchState({
      vcsStatus: null,
      vcsStatusCwd: cwd,
      vcsStatusPending: Boolean(cwd),
    });
    return;
  }
  patchState({ vcsStatusCwd: cwd, vcsStatusPending: true });
  void bridge.readVcsStatus({ cwd }).then(
    (vcsStatus) => {
      if (requestSequence !== vcsStatusRequestSequence) return;
      patchState({ vcsStatus, vcsStatusCwd: cwd, vcsStatusPending: false });
    },
    (cause) => {
      if (requestSequence !== vcsStatusRequestSequence) return;
      if (shouldReportVcsStatusReadFailure(appAtomRegistry.get(t3ClientStateAtom).status)) {
        console.error("[t3-client] failed to read VCS status", { cwd, cause });
      }
      patchState({ vcsStatus: null, vcsStatusCwd: cwd, vcsStatusPending: false });
    },
  );
}

export function installT3ClientFixtureForDevTool(partial: Partial<T3ClientState>): void {
  started = true;
  patchState(partial);
}

function resetActiveThreadState(
  activeThreadId?: string,
  options?: { readonly draftHero?: boolean },
): void {
  threadFingerprint = "";
  const current = appAtomRegistry.get(t3ClientStateAtom);
  const thread = current.threads.find((candidate) => candidate.id === activeThreadId);
  const activeModels = availableThreadModels(current);
  const activeProjection = thread
    ? resolveActiveThreadModelSelection(activeModels, thread.modelSelection, {
        selectedModel: current.selectedModel,
        selection: current.modelSelection,
      })
    : null;
  patchState({
    activeThreadId,
    draftHeroThreadId: options?.draftHero ? activeThreadId : undefined,
    draftThread: undefined,
    messages: [],
    checkpoints: [],
    sessionStatus: "idle",
    sessionError: null,
    activePlan: undefined,
    activeProposedPlan: undefined,
    activities: [],
    latestTurn: null,
    proposedPlans: [],
    activeTurnId: null,
    ...(thread
      ? {
          modelSelection: activeProjection?.selection ?? thread.modelSelection,
          selectedModel: activeProjection?.selectedModel,
        }
      : {}),
  });
}

function applyServerConfig(config: ServerConfig, preferredSelection?: ModelSelection | null): void {
  const effectiveConfig = mtsProviderFixture
    ? { ...config, providers: [mtsProviderFixture] }
    : config;
  const current = appAtomRegistry.get(t3ClientStateAtom);
  const activeThread =
    current.threads.find((thread) => thread.id === current.activeThreadId) ??
    (current.draftThread?.id === current.activeThreadId ? current.draftThread : undefined);
  const newThreadSelectionCandidates = projectModelSelectionCandidates({
    currentSelection: preferredSelection ?? current.modelSelection,
    projects: current.projects,
  });
  const projection = deriveProviderModelSelectionProjection(effectiveConfig, [
    activeThread?.modelSelection,
    ...(activeThread
      ? []
      : [
          ...newThreadSelectionCandidates,
          current.selectedModel
            ? {
                instanceId: current.selectedModel.instanceId,
                model: current.selectedModel.slug,
              }
            : null,
        ]),
  ]);
  const displayModels = deriveModelPickerModels(projection.entries, { includeDisabled: true });
  const fallbackSelection =
    projection.selection ??
    (projection.selectedModel
      ? {
          instanceId: projection.selectedModel.instanceId,
          model: projection.selectedModel.slug,
        }
      : undefined);
  const activeProjection = activeThread
    ? resolveActiveThreadModelSelection(displayModels, activeThread.modelSelection, {
        selectedModel: projection.selectedModel,
        selection: fallbackSelection,
      })
    : null;
  const selectedModel = activeProjection?.selectedModel ?? projection.selectedModel;
  const selection = activeProjection?.selection ?? fallbackSelection;

  patchState({
    serverConfig: effectiveConfig,
    providers: effectiveConfig.providers,
    settings: effectiveConfig.settings,
    providerEntries: projection.entries,
    models: projection.models,
    selectedModel,
    modelSelection: selection,
  });

  if (selection) {
    setPref("modelSelection", selection);
  }
}

function applyStatusPayload(status: StatusEventPayload): void {
  const current = appAtomRegistry.get(t3ClientStateAtom);
  reportConnectionStatus(status.status);
  if (status.status !== current.status || status.detail !== current.statusDetail) {
    patchState({ status: status.status, statusDetail: status.detail });
  }
}

function applyConfigPayload(
  config: ServerConfig,
  preferredSelection?: ModelSelection | null,
): void {
  const nextFingerprint = JSON.stringify(config);
  if (nextFingerprint === configFingerprint) return;
  configFingerprint = nextFingerprint;
  applyServerConfig(config, preferredSelection);
}

function applyAccessPayload(access: AuthAccessPresentation): void {
  const nextFingerprint = JSON.stringify(access);
  if (nextFingerprint === accessFingerprint) return;
  accessFingerprint = nextFingerprint;
  patchState({ authAccess: access });
}

function applyShellPayload(shell: ShellEventPayload): void {
  const nextFingerprint = JSON.stringify(shell);
  if (nextFingerprint === shellFingerprint) return;
  shellFingerprint = nextFingerprint;
  const canonicalThreads = shell.threads ?? [];
  canonicalThreadRuntimeModes.clear();
  canonicalThreadInteractionModes.clear();
  for (const thread of canonicalThreads) {
    canonicalThreadRuntimeModes.set(thread.id, thread.runtimeMode);
    canonicalThreadInteractionModes.set(thread.id, thread.interactionMode);
  }
  for (const threadId of pendingThreadRuntimeModes.keys()) {
    const thread = canonicalThreads.find((candidate) => candidate.id === threadId);
    if (thread) reconcilePendingMutation(pendingThreadRuntimeModes, threadId, thread.runtimeMode);
  }
  for (const threadId of pendingThreadInteractionModes.keys()) {
    const thread = canonicalThreads.find((candidate) => candidate.id === threadId);
    if (thread) {
      reconcilePendingMutation(pendingThreadInteractionModes, threadId, thread.interactionMode);
    }
  }
  let threads = canonicalThreads;
  for (const [threadId, mutation] of pendingThreadRuntimeModes) {
    threads = projectThreadRuntimeMode(threads, threadId, mutation.value);
  }
  for (const [threadId, mutation] of pendingThreadInteractionModes) {
    threads = projectThreadInteractionMode(threads, threadId, mutation.value);
  }
  const stateBeforeShell = appAtomRegistry.get(t3ClientStateAtom);
  const canonicalThreadIds = new Set(threads.map((thread) => thread.id));
  const draftThreadsByProjectId = Object.fromEntries(
    Object.entries(stateBeforeShell.draftThreadsByProjectId).filter(
      ([, draft]) => !canonicalThreadIds.has(draft.id),
    ),
  );
  const activeThread = threads.find((thread) => thread.id === stateBeforeShell.activeThreadId);
  const currentDraftThread = stateBeforeShell.draftThread;
  const activeDraftThread = currentDraftThread
    ? currentDraftThread.id === stateBeforeShell.activeThreadId &&
      !canonicalThreadIds.has(currentDraftThread.id)
      ? currentDraftThread
      : undefined
    : undefined;
  const activePresentationThread = activeThread ?? activeDraftThread;
  const projects = shell.projects ?? [];
  const modelProjection =
    !activePresentationThread && stateBeforeShell.serverConfig
      ? deriveProviderModelSelectionProjection(
          stateBeforeShell.serverConfig,
          projectModelSelectionCandidates({
            currentSelection: stateBeforeShell.modelSelection,
            projects,
          }),
        )
      : null;
  const activeModels = availableThreadModels(stateBeforeShell);
  const activeProjection = activePresentationThread
    ? resolveActiveThreadModelSelection(activeModels, activePresentationThread.modelSelection, {
        selectedModel: stateBeforeShell.selectedModel,
        selection: stateBeforeShell.modelSelection,
      })
    : null;
  patchState({
    projects,
    threads,
    archivedThreads: shell.archivedThreads ?? [],
    draftThreadsByProjectId,
    ...(activeThread ? { draftThread: undefined, draftHeroThreadId: undefined } : {}),
    ...(activePresentationThread
      ? {
          modelSelection: activeProjection?.selection ?? activePresentationThread.modelSelection,
          selectedModel: activeProjection?.selectedModel,
        }
      : modelProjection?.selection
        ? {
            modelSelection: modelProjection.selection,
            ...(modelProjection.selectedModel
              ? { selectedModel: modelProjection.selectedModel }
              : {}),
          }
        : {}),
  });
  if (stateBeforeShell.activeThreadId && !activePresentationThread) {
    resetActiveThreadState();
  }
  if (
    !activeThread &&
    modelProjection?.selection &&
    (stateBeforeShell.modelSelection?.instanceId !== modelProjection.selection.instanceId ||
      stateBeforeShell.modelSelection?.model !== modelProjection.selection.model ||
      JSON.stringify(stateBeforeShell.modelSelection?.options ?? null) !==
        JSON.stringify(modelProjection.selection.options ?? null))
  ) {
    setPref("modelSelection", modelProjection.selection);
  }
  const latest = appAtomRegistry.get(t3ClientStateAtom);
  if (!latest.activeThreadId && threads.length > 0) {
    // Auto-select the first thread as the active thread, but do not yank the
    // renderer off a non-chat route (Settings or Components Lab) to do it.
    // Force-navigating here caused those surfaces to flash back to chat when
    // the shell snapshot arrived. On the chat route this still navigates to
    // the selected thread.
    const pathname = getPathname();
    selectThread(threads[0].id, {
      navigate: pathname === "/",
    });
  } else {
    refreshVcsStatusProjection();
  }
}

function applyThreadPayload(payload: ThreadEventPayload): void {
  const nextFingerprint = JSON.stringify(payload);
  if (nextFingerprint === threadFingerprint) return;
  threadFingerprint = nextFingerprint;
  const current = appAtomRegistry.get(t3ClientStateAtom);
  const draftPromoted = shouldFinalizePromotedDraftThread({
    draftThreadId: current.draftThread?.id,
    payloadThreadId: ThreadId.make(payload.threadId),
    messageCount: payload.messages?.length ?? 0,
    sessionStatus: payload.sessionStatus ?? "idle",
  });
  const draftThreadsByProjectId =
    draftPromoted && current.draftThread
      ? forgetLocalDraftThread(current.draftThreadsByProjectId, current.draftThread)
      : current.draftThreadsByProjectId;
  patchState({
    ...(draftPromoted
      ? {
          draftThread: undefined,
          draftHeroThreadId: undefined,
          draftThreadsByProjectId,
        }
      : {}),
    messages: payload.messages ?? [],
    checkpoints: payload.checkpoints ?? [],
    sessionStatus: payload.sessionStatus ?? "idle",
    sessionError: payload.sessionError ?? null,
    activePlan: payload.activePlan ?? undefined,
    activeProposedPlan: payload.activeProposedPlan ?? undefined,
    activities: payload.activities ?? [],
    latestTurn: payload.latestTurn ?? null,
    proposedPlans: payload.proposedPlans ?? [],
    activeTurnId: payload.activeTurnId ?? null,
  });
}

function applyConnectorSnapshot(
  snapshot: ConnectorSnapshot,
  preferredSelection?: ModelSelection | null,
): void {
  applyStatusPayload(snapshot.status as StatusEventPayload);
  if (snapshot.config) {
    applyConfigPayload(decodeConnectorServerConfig(snapshot.config), preferredSelection);
  }
  applyAccessPayload(snapshot.access);
  applyShellPayload(snapshot.shell as ShellEventPayload);
  const activeThreadId = appAtomRegistry.get(t3ClientStateAtom).activeThreadId;
  const activeThread = activeThreadId ? snapshot.threads[activeThreadId] : undefined;
  if (activeThread) applyThreadPayload(activeThread as ThreadEventPayload);
  patchState({ terminalSessions: snapshot.terminals });
}

function applyConnectorEvent(envelope: ConnectorEventEnvelope): void {
  switch (envelope.kind) {
    case "status":
      applyStatusPayload(envelope.payload as StatusEventPayload);
      return;
    case "config":
      applyConfigPayload(decodeConnectorServerConfig(envelope.payload));
      return;
    case "access":
      applyAccessPayload(envelope.payload as AuthAccessPresentation);
      return;
    case "shell":
      applyShellPayload(envelope.payload as ShellEventPayload);
      return;
    case "thread": {
      const activeThreadId = appAtomRegistry.get(t3ClientStateAtom).activeThreadId;
      if (envelope.threadId === activeThreadId) {
        applyThreadPayload(envelope.payload as ThreadEventPayload);
      }
      return;
    }
    case "terminal":
      patchState({
        terminalSessions: {
          ...appAtomRegistry.get(t3ClientStateAtom).terminalSessions,
          [`${envelope.threadId}\u0000${envelope.terminalId}`]: envelope.payload,
        },
      });
      return;
    case "log":
      // Mirror host logs to the renderer console, matching the preload path.
      console.log(envelope.payload);
      return;
  }
}

function buildMainCommandBridge(transport: MainConnectorTransport): Partial<PollBridge> {
  const bridge: Record<string, (input?: unknown) => Promise<unknown>> = {};
  for (const method of CONNECTOR_COMMAND_NAMES) {
    bridge[method] = async (input?: unknown) =>
      decodeConnectorCommandResult(
        method,
        await transport.invoke(method, encodeConnectorCommandParams(method, input)),
      );
  }
  return bridge as Partial<PollBridge>;
}

function installTransportDevToolHook(): void {
  const diagnosticsGlobal = globalThis as {
    __T3_LYNXTRON_CONNECTOR_TRANSPORT__?: {
      kind: "main" | "unavailable";
      lastSeq: () => number;
      invoke: (method: string, params?: unknown) => Promise<unknown>;
    };
    __T3_LYNXTRON_CLIENT_STATE__?: () => {
      activeThreadId?: string;
      sessionStatus: SessionStatus;
      activeTurnId: TurnId | null;
      latestTurn: OrchestrationLatestTurn | null;
      activeProject?: ProjectSummary;
      activeThread?: ThreadSummary;
      environmentLabel: string | null;
      threadIds: ReadonlyArray<string>;
      archivedThreadIds: ReadonlyArray<string>;
      pairingLinkIds: ReadonlyArray<string>;
      pairingLinkCount: number;
      approvalReceipts: ReadonlyArray<{
        readonly kind: string;
        readonly requestId: string | null;
        readonly decision: string | null;
      }>;
      userInputReceipts: ReadonlyArray<{
        readonly kind: string;
        readonly requestId: string | null;
        readonly answers: unknown;
        readonly detail: string | null;
      }>;
      lastUserInputResponse?: {
        readonly threadId: string;
        readonly requestId: ApprovalRequestId;
        readonly answers: ProviderUserInputAnswers;
      };
      pendingApprovalRequests: ReadonlyArray<{
        readonly requestId: string;
        readonly requestKind: string | null;
      }>;
      selectedProvider?: {
        instanceId: string;
        showInteractionModeToggle: boolean | undefined;
        status: ServerProvider["status"];
        authStatus: ServerProvider["auth"]["status"];
        message: string | null;
      };
      modelCount: number;
      modelSelectionError: string | null;
      modelSelectionPending: boolean;
      providerCount: number;
      providerEntryCount: number;
      providerInstanceIds: ReadonlyArray<string>;
      providersRefreshPending: boolean;
      providerSettingsError: string | null;
      keybindingCommands: ReadonlyArray<string>;
      vcsStatus: VcsStatusResult | null;
      vcsStatusCwd: string | null;
      vcsStatusPending: boolean;
      activeComposerElementContexts: ReadonlyArray<ElementContextDraft>;
      clientSettings: ReturnType<typeof getClientSettingsState>;
    };
    __T3_LYNXTRON_SELECT_THREAD__?: (threadId: string) => void;
    __T3_LYNXTRON_CREATE_DRAFT_THREAD__?: (projectId: string) => Promise<boolean>;
    __T3_LYNXTRON_COMPOSER_TERMINAL_CONTEXT_FIXTURE__?: (
      context: ComposerTerminalContext,
    ) => boolean;
    __T3_LYNXTRON_COMPOSER_ELEMENT_CONTEXT_FIXTURE__?: (context: ElementContextDraft) => boolean;
    __T3_LYNXTRON_MODEL_SELECTION_FIXTURE__?: (instanceId: string, model: string) => boolean;
    __T3_LYNXTRON_MTS_PROVIDER_FIXTURE__?: (provider: ServerProvider) => boolean;
  };
  diagnosticsGlobal.__T3_LYNXTRON_CONNECTOR_TRANSPORT__ = {
    kind: mainTransport ? ("main" as const) : ("unavailable" as const),
    lastSeq: () => mainTransport?.lastSeq ?? -1,
    invoke: (method, params) => {
      if (!mainTransport) return Promise.reject(new Error("main transport is not active"));
      return mainTransport.invoke(method as ConnectorCommandName, params);
    },
  };
  diagnosticsGlobal.__T3_LYNXTRON_CLIENT_STATE__ = () => {
    const state = appAtomRegistry.get(t3ClientStateAtom);
    const activeThread =
      state.threads.find((thread) => thread.id === state.activeThreadId) ??
      (state.draftThread?.id === state.activeThreadId ? state.draftThread : undefined);
    const activeProject =
      state.projects.find((project) => project.id === activeThread?.projectId) ?? state.projects[0];
    const activeComposerDraftKey = composerDraftScopeKey({
      threadId: state.activeThreadId,
      projectId: activeProject?.id,
      localDraft:
        state.draftThread?.id === state.activeThreadId || state.activeThreadId === undefined,
    });
    const selectedProvider = state.providerEntries.find(
      (entry) =>
        entry.instanceId === (state.selectedModel?.instanceId ?? state.modelSelection?.instanceId),
    );
    return {
      activeThreadId: state.activeThreadId,
      draftThreadId: state.draftThread?.id ?? null,
      environmentLabel: state.serverConfig?.environment.label ?? null,
      draftThreadIdsByProjectId: Object.fromEntries(
        Object.entries(state.draftThreadsByProjectId).map(([projectId, draft]) => [
          projectId,
          draft.id,
        ]),
      ),
      activeComposerDraftText: activeComposerDraftKey
        ? (state.composerDraftTextByScopeKey[activeComposerDraftKey] ?? "")
        : "",
      composerDraftTextByScopeKey: state.composerDraftTextByScopeKey,
      activeComposerDraftAttachments: activeComposerDraftKey
        ? (state.composerDraftAttachmentsByScopeKey[activeComposerDraftKey] ?? [])
        : [],
      activeComposerTerminalContexts: activeComposerDraftKey
        ? (state.composerTerminalContextsByScopeKey[activeComposerDraftKey] ?? [])
        : [],
      activeComposerFileContexts: activeComposerDraftKey
        ? (state.composerFileContextsByScopeKey[activeComposerDraftKey] ?? [])
        : [],
      activeComposerElementContexts: activeComposerDraftKey
        ? (state.composerElementContextsByScopeKey[activeComposerDraftKey] ?? [])
        : [],
      clientSettings: getClientSettingsState(),
      messages: state.messages,
      sessionStatus: state.sessionStatus,
      sessionError: state.sessionError,
      activeTurnId: state.activeTurnId,
      latestTurn: state.latestTurn,
      threadIds: state.threads.map((thread) => thread.id),
      archivedThreadIds: state.archivedThreads.map((thread) => thread.id),
      pairingLinkIds: state.authAccess.pairingLinks.map((pairingLink) => pairingLink.id),
      pairingLinkCount: state.authAccess.pairingLinkCount,
      approvalReceipts: state.activities
        .filter(
          (activity) =>
            activity.kind === "approval.resolved" ||
            activity.kind === "provider.approval.respond.failed",
        )
        .map((activity) => {
          const payload =
            typeof activity.payload === "object" && activity.payload !== null
              ? (activity.payload as { decision?: unknown; requestId?: unknown })
              : {};
          return {
            kind: activity.kind,
            requestId: typeof payload.requestId === "string" ? payload.requestId : null,
            decision: typeof payload.decision === "string" ? payload.decision : null,
          };
        }),
      userInputReceipts: state.activities
        .filter(
          (activity) =>
            activity.kind === "user-input.resolved" ||
            activity.kind === "provider.user-input.respond.failed",
        )
        .map((activity) => {
          const payload =
            typeof activity.payload === "object" && activity.payload !== null
              ? (activity.payload as {
                  answers?: unknown;
                  detail?: unknown;
                  requestId?: unknown;
                })
              : {};
          return {
            kind: activity.kind,
            requestId: typeof payload.requestId === "string" ? payload.requestId : null,
            answers: payload.answers ?? null,
            detail: typeof payload.detail === "string" ? payload.detail : null,
          };
        }),
      ...(lastUserInputResponse ? { lastUserInputResponse } : {}),
      pendingApprovalRequests: state.activities
        .filter((activity) => activity.kind === "approval.requested")
        .flatMap((activity) => {
          const payload =
            typeof activity.payload === "object" && activity.payload !== null
              ? (activity.payload as { requestId?: unknown; requestKind?: unknown })
              : {};
          return typeof payload.requestId === "string"
            ? [
                {
                  requestId: payload.requestId,
                  requestKind: typeof payload.requestKind === "string" ? payload.requestKind : null,
                },
              ]
            : [];
        }),
      modelCount: state.models.length,
      modelSelectionError: state.modelSelectionError,
      modelSelectionPending: state.modelSelectionPending,
      providerCount: state.providers.length,
      providerEntryCount: state.providerEntries.length,
      providerInstanceIds: Object.keys(state.settings?.providerInstances ?? {}),
      providersRefreshPending: state.providersRefreshPending,
      providerSettingsError: state.providerSettingsError,
      keybindingCommands: state.serverConfig?.keybindings.map((binding) => binding.command) ?? [],
      vcsStatus: state.vcsStatus,
      vcsStatusCwd: state.vcsStatusCwd,
      vcsStatusPending: state.vcsStatusPending,
      ...(activeProject ? { activeProject } : {}),
      ...(activeThread ? { activeThread } : {}),
      ...(selectedProvider
        ? {
            selectedProvider: {
              instanceId: selectedProvider.instanceId,
              showInteractionModeToggle: selectedProvider.snapshot.showInteractionModeToggle,
              status: selectedProvider.snapshot.status,
              authStatus: selectedProvider.snapshot.auth.status,
              message: selectedProvider.snapshot.message ?? null,
            },
          }
        : {}),
    };
  };
  diagnosticsGlobal.__T3_LYNXTRON_SELECT_THREAD__ = (threadId) => {
    selectThread(threadId);
  };
  if (
    typeof (
      globalThis as {
        __T3_LYNXTRON_VIEWPORT_PROBE__?: unknown;
      }
    ).__T3_LYNXTRON_VIEWPORT_PROBE__ === "function"
  ) {
    diagnosticsGlobal.__T3_LYNXTRON_CREATE_DRAFT_THREAD__ = async (projectId) => {
      await createThread(projectId);
      return true;
    };
    diagnosticsGlobal.__T3_LYNXTRON_COMPOSER_TERMINAL_CONTEXT_FIXTURE__ = (context) => {
      const state = appAtomRegistry.get(t3ClientStateAtom);
      const activeThread =
        state.threads.find((thread) => thread.id === state.activeThreadId) ??
        (state.draftThread?.id === state.activeThreadId ? state.draftThread : undefined);
      const scopeKey = composerDraftScopeKey({
        threadId: state.activeThreadId,
        projectId: activeThread?.projectId ?? state.projects[0]?.id,
        localDraft:
          state.draftThread?.id === state.activeThreadId || state.activeThreadId === undefined,
      });
      if (!scopeKey) return false;
      addComposerTerminalContext(scopeKey, context);
      return true;
    };
    diagnosticsGlobal.__T3_LYNXTRON_COMPOSER_ELEMENT_CONTEXT_FIXTURE__ = (context) => {
      const state = appAtomRegistry.get(t3ClientStateAtom);
      const activeThread =
        state.threads.find((thread) => thread.id === state.activeThreadId) ??
        (state.draftThread?.id === state.activeThreadId ? state.draftThread : undefined);
      const scopeKey = composerDraftScopeKey({
        threadId: state.activeThreadId,
        projectId: activeThread?.projectId ?? state.projects[0]?.id,
        localDraft:
          state.draftThread?.id === state.activeThreadId || state.activeThreadId === undefined,
      });
      if (!scopeKey) return false;
      return addComposerElementContext(scopeKey, context);
    };
    diagnosticsGlobal.__T3_LYNXTRON_MODEL_SELECTION_FIXTURE__ = (instanceId, model) => {
      const state = appAtomRegistry.get(t3ClientStateAtom);
      const selection = state.models.find(
        (candidate) => candidate.instanceId === instanceId && candidate.slug === model,
      );
      if (!selection) return false;
      setModelSelection(selection);
      return true;
    };
    diagnosticsGlobal.__T3_LYNXTRON_MTS_PROVIDER_FIXTURE__ = (provider) => {
      const state = appAtomRegistry.get(t3ClientStateAtom);
      if (!state.serverConfig) return false;
      mtsProviderFixture = provider;
      applyServerConfig(state.serverConfig);
      return true;
    };
  }
}

function startT3Client(): void {
  if (started) return;
  started = true;
  void bootstrapT3Client();
}

async function bootstrapT3Client(): Promise<void> {
  "background only";
  // AR2: the main-owned push transport is authoritative. The renderer
  // bootstraps with one ready-and-snapshot exchange, consumes sequenced push
  // events, and routes commands through the typed main handlers. There is no
  // polling fallback; a failed probe surfaces an honest error state.
  let eventRegistry: GlobalEventListenerRegistry | undefined;
  try {
    eventRegistry =
      typeof lynx !== "undefined" ? lynx?.getJSModule?.("GlobalEventEmitter") : undefined;
  } catch {
    eventRegistry = undefined;
  }
  const saved = getPref<ModelSelection | null>("modelSelection", null);
  const savedComposerDraftText = normalizeComposerDraftTextByScopeKey(
    getPref<unknown>("composerDraftTextByScopeKey", null),
  );
  const savedComposerDraftAttachments = normalizeComposerDraftAttachmentsByScopeKey(
    getPref<unknown>("composerDraftAttachmentsByScopeKey", null),
  );
  const savedComposerTerminalContexts = normalizeComposerTerminalContextsByScopeKey(
    getPref<unknown>("composerTerminalContextsByScopeKey", null),
  );
  const savedComposerFileContexts = normalizeComposerFileContextsByScopeKey(
    getPref<unknown>("composerFileContextsByScopeKey", null),
  );
  const savedComposerElementContexts = normalizeComposerElementContextsByScopeKey(
    getPref<unknown>("composerElementContextsByScopeKey", null),
  );
  const savedDraftThreadsByProjectId = normalizeLocalDraftThreadsByProjectId(
    getPref<unknown>("draftThreadsByProjectId", null),
  );
  if (saved) {
    patchState({
      modelSelection: saved,
      composerDraftTextByScopeKey: savedComposerDraftText,
      composerDraftAttachmentsByScopeKey: savedComposerDraftAttachments,
      composerTerminalContextsByScopeKey: savedComposerTerminalContexts,
      composerFileContextsByScopeKey: savedComposerFileContexts,
      composerElementContextsByScopeKey: savedComposerElementContexts,
      draftThreadsByProjectId: savedDraftThreadsByProjectId,
    });
  } else {
    patchState({
      composerDraftTextByScopeKey: savedComposerDraftText,
      composerDraftAttachmentsByScopeKey: savedComposerDraftAttachments,
      composerTerminalContextsByScopeKey: savedComposerTerminalContexts,
      composerFileContextsByScopeKey: savedComposerFileContexts,
      composerElementContextsByScopeKey: savedComposerElementContexts,
      draftThreadsByProjectId: savedDraftThreadsByProjectId,
    });
  }
  let firstSnapshotApplied = false;
  const transport = await startMainConnectorTransport({
    bridge: NativeModules?.bridge,
    eventRegistry,
    applySnapshot: (snapshot) => {
      // The first snapshot applies the locally saved model selection as the
      // preferred projection, matching the former connect()-time behavior.
      applyConnectorSnapshot(snapshot, firstSnapshotApplied ? null : saved);
      firstSnapshotApplied = true;
    },
    applyEvent: applyConnectorEvent,
    onLog: (line) => console.log(line),
  });
  if (!transport) {
    installTransportDevToolHook();
    reportConnectionStatus("error");
    patchState({
      status: "error",
      connectorCommandsReady: false,
      statusDetail:
        "Main-owned connector transport unavailable (typed bridge probe failed). The renderer cannot reach the backend.",
    });
    return;
  }
  mainTransport = transport;
  mainCommandBridge = buildMainCommandBridge(transport);
  patchState({ connectorCommandsReady: true });
  if (saved) {
    const result = await transport.invokeSettled("setModelSelection", { selection: saved });
    if (!result.ok) {
      patchState({ modelSelectionError: result.error });
    }
  }
  refreshVcsStatusProjection();
  const current = appAtomRegistry.get(t3ClientStateAtom);
  const activeThreadId = current.activeThreadId;
  if (activeThreadId && activeThreadId !== current.draftThread?.id) {
    void mainCommandBridge.selectThread?.(activeThreadId);
  }
  installTransportDevToolHook();
}

export function useT3ClientState(): T3ClientState {
  const state = useAtomValue(t3ClientStateAtom);
  useEffect(() => {
    startT3Client();
  }, []);
  return state;
}

export function getT3ClientSnapshot(): T3ClientState {
  return appAtomRegistry.get(t3ClientStateAtom);
}

export async function readPreviewInitialState(): Promise<{
  readonly route?: string;
  readonly overlay?: string | null;
  readonly theme?: "light" | "dark";
} | null> {
  "background only";
  try {
    if (!NativeModules?.bridge?.call) return null;
    const value = await callBridge(NativeModules.bridge, "t3:preview.initial-state", {});
    return value && typeof value === "object"
      ? (value as {
          readonly route?: string;
          readonly overlay?: string | null;
          readonly theme?: "light" | "dark";
        })
      : null;
  } catch {
    return null;
  }
}

function selectThread(
  threadId: string,
  options?: { navigate?: boolean; draftHero?: boolean },
): void {
  resetActiveThreadState(threadId, { draftHero: options?.draftHero });
  getBridge()?.selectThread?.(threadId);
  refreshVcsStatusProjection();
  if (options?.navigate !== false) {
    navigate(`/${LYNX_PRIMARY_ENVIRONMENT_ID}/${threadId}`);
  }
}

function createProject(workspaceRoot: string): Promise<{ projectId: string }> {
  const bridge = getBridge();
  if (!bridge?.createProject) {
    return Promise.reject(new Error("Project creation is unavailable."));
  }
  return bridge.createProject({ workspaceRoot });
}

async function createThread(
  projectId?: string,
  options?: {
    readonly branch?: string | null;
    readonly worktreePath?: string | null;
    readonly envMode?: LocalDraftThreadEnvMode;
    readonly startFromOrigin?: boolean;
  },
): Promise<void> {
  const state = appAtomRegistry.get(t3ClientStateAtom);
  const activeServerThread = state.threads.find((thread) => thread.id === state.activeThreadId);
  const activeDraftThread =
    state.draftThread?.id === state.activeThreadId ? state.draftThread : undefined;
  const targetProjectId =
    projectId ??
    activeDraftThread?.projectId ??
    activeServerThread?.projectId ??
    state.projects[0]?.id;
  const targetProject = state.projects.find((project) => project.id === targetProjectId);
  const selection =
    state.modelSelection ??
    targetProject?.defaultModelSelection ??
    (state.selectedModel
      ? { instanceId: state.selectedModel.instanceId, model: state.selectedModel.slug }
      : state.models[0]
        ? { instanceId: state.models[0].instanceId, model: state.models[0].slug }
        : undefined);
  if (!targetProjectId || !selection) return;
  if (activeDraftThread?.projectId === targetProjectId) {
    if (options) {
      const draftThread = projectDraftThreadWorkspace(activeDraftThread, options);
      patchState({
        draftThread,
        draftThreadsByProjectId: draftThread
          ? rememberLocalDraftThread(state.draftThreadsByProjectId, draftThread)
          : state.draftThreadsByProjectId,
      });
    }
    navigate("/");
    return;
  }
  const reusableDraftThread = readLocalDraftThreadForProject(
    state.draftThreadsByProjectId,
    ProjectId.make(targetProjectId),
  );
  if (reusableDraftThread) {
    const draftThread = options
      ? projectDraftThreadWorkspace(reusableDraftThread, options)
      : reusableDraftThread;
    if (!draftThread) return;
    patchState({
      activeThreadId: draftThread.id,
      draftHeroThreadId: draftThread.id,
      draftThread,
      draftThreadsByProjectId: rememberLocalDraftThread(state.draftThreadsByProjectId, draftThread),
      modelSelection: draftThread.modelSelection,
      selectedModel:
        state.models.find(
          (model) =>
            model.instanceId === draftThread.modelSelection.instanceId &&
            model.slug === draftThread.modelSelection.model,
        ) ?? state.selectedModel,
    });
    navigate("/");
    refreshVcsStatusProjection();
    return;
  }
  const threadId = ThreadId.make(newThreadId());
  const createdAt = new Date().toISOString();
  const envMode =
    options?.envMode ??
    state.settings?.defaultThreadEnvMode ??
    PORTABLE_SERVER_SETTINGS_DEFAULTS.defaultThreadEnvMode;
  const startFromOrigin =
    options?.startFromOrigin ??
    (envMode === "worktree" &&
      (state.settings?.newWorktreesStartFromOrigin ??
        PORTABLE_SERVER_SETTINGS_DEFAULTS.newWorktreesStartFromOrigin));
  const draftThread = createLocalDraftThread({
    threadId,
    projectId: ProjectId.make(targetProjectId),
    modelSelection: selection,
    runtimeMode: activeServerThread?.runtimeMode ?? activeDraftThread?.runtimeMode,
    interactionMode: activeServerThread?.interactionMode ?? activeDraftThread?.interactionMode,
    branch: options?.branch,
    worktreePath: options?.worktreePath,
    envMode,
    startFromOrigin,
    createdAt,
  });
  resetActiveThreadState();
  patchState({
    activeThreadId: threadId,
    draftHeroThreadId: threadId,
    draftThread,
    draftThreadsByProjectId: rememberLocalDraftThread(state.draftThreadsByProjectId, draftThread),
    modelSelection: selection,
    selectedModel:
      state.models.find(
        (model) => model.instanceId === selection.instanceId && model.slug === selection.model,
      ) ?? state.selectedModel,
  });
  navigate("/");
}

function reconnect(): Promise<void> {
  const bridge = getBridge();
  if (!bridge?.reconnect) {
    return Promise.reject(new Error("Backend reconnection is unavailable."));
  }
  return bridge.reconnect();
}

function setDraftWorkspaceMode(envMode: LocalDraftThreadEnvMode): void {
  const state = appAtomRegistry.get(t3ClientStateAtom);
  if (state.draftThread?.id !== state.activeThreadId) return;
  const draftThread = projectDraftThreadWorkspace(state.draftThread, { envMode });
  if (!draftThread) return;
  patchState({
    draftThread,
    draftThreadsByProjectId: rememberLocalDraftThread(state.draftThreadsByProjectId, draftThread),
  });
}

function setDraftStartFromOrigin(startFromOrigin: boolean): void {
  const state = appAtomRegistry.get(t3ClientStateAtom);
  if (state.draftThread?.id !== state.activeThreadId) return;
  const draftThread = projectDraftThreadWorkspace(state.draftThread, { startFromOrigin });
  if (!draftThread) return;
  patchState({
    draftThread,
    draftThreadsByProjectId: rememberLocalDraftThread(state.draftThreadsByProjectId, draftThread),
  });
}

let composerDraftPersistenceTimer: ReturnType<typeof setTimeout> | undefined;
let composerAttachmentPersistenceTimer: ReturnType<typeof setTimeout> | undefined;
let composerTerminalContextPersistenceTimer: ReturnType<typeof setTimeout> | undefined;
let composerFileContextPersistenceTimer: ReturnType<typeof setTimeout> | undefined;
let composerElementContextPersistenceTimer: ReturnType<typeof setTimeout> | undefined;

function persistComposerAttachments(next: ComposerDraftAttachmentsByScopeKey): void {
  if (composerAttachmentPersistenceTimer) clearTimeout(composerAttachmentPersistenceTimer);
  composerAttachmentPersistenceTimer = setTimeout(() => {
    composerAttachmentPersistenceTimer = undefined;
    setPref("composerDraftAttachmentsByScopeKey", next);
  }, 300);
}

function persistComposerTerminalContexts(next: ComposerTerminalContextsByScopeKey): void {
  if (composerTerminalContextPersistenceTimer)
    clearTimeout(composerTerminalContextPersistenceTimer);
  composerTerminalContextPersistenceTimer = setTimeout(() => {
    composerTerminalContextPersistenceTimer = undefined;
    setPref("composerTerminalContextsByScopeKey", next);
  }, 300);
}

function persistComposerFileContexts(next: ComposerFileContextsByScopeKey): void {
  if (composerFileContextPersistenceTimer) clearTimeout(composerFileContextPersistenceTimer);
  composerFileContextPersistenceTimer = setTimeout(() => {
    composerFileContextPersistenceTimer = undefined;
    setPref("composerFileContextsByScopeKey", next);
  }, 300);
}

function persistComposerElementContexts(next: ComposerElementContextsByScopeKey): void {
  if (composerElementContextPersistenceTimer) clearTimeout(composerElementContextPersistenceTimer);
  composerElementContextPersistenceTimer = setTimeout(() => {
    composerElementContextPersistenceTimer = undefined;
    setPref("composerElementContextsByScopeKey", next);
  }, 300);
}

function setComposerDraftText(scopeKey: string, text: string): void {
  const state = appAtomRegistry.get(t3ClientStateAtom);
  const next = projectComposerDraftText(state.composerDraftTextByScopeKey, scopeKey, text);
  patchState({
    composerDraftTextByScopeKey: next,
  });
  if (composerDraftPersistenceTimer) clearTimeout(composerDraftPersistenceTimer);
  composerDraftPersistenceTimer = setTimeout(() => {
    composerDraftPersistenceTimer = undefined;
    setPref("composerDraftTextByScopeKey", next);
  }, 300);
}

function addComposerAttachments(
  scopeKey: string,
  attachments: ReadonlyArray<UploadChatAttachment>,
): void {
  const state = appAtomRegistry.get(t3ClientStateAtom);
  const next = addComposerDraftAttachments(
    state.composerDraftAttachmentsByScopeKey,
    scopeKey,
    attachments,
  );
  patchState({ composerDraftAttachmentsByScopeKey: next });
  persistComposerAttachments(next);
}

function removeComposerAttachment(scopeKey: string, index: number): void {
  const state = appAtomRegistry.get(t3ClientStateAtom);
  const next = removeComposerDraftAttachment(
    state.composerDraftAttachmentsByScopeKey,
    scopeKey,
    index,
  );
  patchState({ composerDraftAttachmentsByScopeKey: next });
  persistComposerAttachments(next);
}

function clearComposerAttachments(scopeKey: string): void {
  const state = appAtomRegistry.get(t3ClientStateAtom);
  const { [scopeKey]: _cleared, ...remaining } = state.composerDraftAttachmentsByScopeKey;
  patchState({ composerDraftAttachmentsByScopeKey: remaining });
  persistComposerAttachments(remaining);
}

function addComposerTerminalContext(scopeKey: string, context: ComposerTerminalContext): void {
  const state = appAtomRegistry.get(t3ClientStateAtom);
  const current = state.composerTerminalContextsByScopeKey[scopeKey] ?? [];
  const withoutDuplicate = current.filter((candidate) => candidate.id !== context.id);
  const next = {
    ...state.composerTerminalContextsByScopeKey,
    [scopeKey]: [...withoutDuplicate, context].slice(-MAX_TERMINAL_CONTEXTS_PER_SCOPE),
  };
  patchState({ composerTerminalContextsByScopeKey: next });
  persistComposerTerminalContexts(next);
}

function removeComposerTerminalContext(scopeKey: string, contextId: string): void {
  const state = appAtomRegistry.get(t3ClientStateAtom);
  const current = state.composerTerminalContextsByScopeKey[scopeKey] ?? [];
  const next = current.filter((context) => context.id !== contextId);
  if (next.length === current.length) return;
  const contexts = { ...state.composerTerminalContextsByScopeKey };
  if (next.length > 0) contexts[scopeKey] = next;
  else delete contexts[scopeKey];
  patchState({ composerTerminalContextsByScopeKey: contexts });
  persistComposerTerminalContexts(contexts);
}

function clearComposerTerminalContexts(scopeKey: string): void {
  const state = appAtomRegistry.get(t3ClientStateAtom);
  const { [scopeKey]: _cleared, ...remaining } = state.composerTerminalContextsByScopeKey;
  patchState({ composerTerminalContextsByScopeKey: remaining });
  persistComposerTerminalContexts(remaining);
}

function addComposerFileContext(scopeKey: string, context: ComposerFileContext): void {
  const state = appAtomRegistry.get(t3ClientStateAtom);
  const current = state.composerFileContextsByScopeKey[scopeKey] ?? [];
  const next = {
    ...state.composerFileContextsByScopeKey,
    [scopeKey]: [...current.filter((candidate) => candidate.id !== context.id), context].slice(
      -MAX_FILE_CONTEXTS_PER_SCOPE,
    ),
  };
  patchState({ composerFileContextsByScopeKey: next });
  persistComposerFileContexts(next);
}

function removeComposerFileContext(scopeKey: string, contextId: string): void {
  const state = appAtomRegistry.get(t3ClientStateAtom);
  const current = state.composerFileContextsByScopeKey[scopeKey] ?? [];
  const nextForScope = current.filter((context) => context.id !== contextId);
  if (nextForScope.length === current.length) return;
  const next = { ...state.composerFileContextsByScopeKey };
  if (nextForScope.length > 0) next[scopeKey] = nextForScope;
  else delete next[scopeKey];
  patchState({ composerFileContextsByScopeKey: next });
  persistComposerFileContexts(next);
}

function clearComposerFileContexts(scopeKey: string): void {
  const state = appAtomRegistry.get(t3ClientStateAtom);
  const { [scopeKey]: _cleared, ...remaining } = state.composerFileContextsByScopeKey;
  patchState({ composerFileContextsByScopeKey: remaining });
  persistComposerFileContexts(remaining);
}

function addComposerElementContext(scopeKey: string, context: ElementContextDraft): boolean {
  const state = appAtomRegistry.get(t3ClientStateAtom);
  const next = addComposerElementContextToState(
    state.composerElementContextsByScopeKey,
    scopeKey,
    context,
  );
  if (next === state.composerElementContextsByScopeKey) return false;
  patchState({ composerElementContextsByScopeKey: next });
  persistComposerElementContexts(next);
  return true;
}

function removeComposerElementContext(scopeKey: string, contextId: string): void {
  const state = appAtomRegistry.get(t3ClientStateAtom);
  const next = removeComposerElementContextFromState(
    state.composerElementContextsByScopeKey,
    scopeKey,
    contextId,
  );
  if (next === state.composerElementContextsByScopeKey) return;
  patchState({ composerElementContextsByScopeKey: next });
  persistComposerElementContexts(next);
}

function clearComposerElementContexts(scopeKey: string): void {
  const state = appAtomRegistry.get(t3ClientStateAtom);
  const { [scopeKey]: _cleared, ...remaining } = state.composerElementContextsByScopeKey;
  patchState({ composerElementContextsByScopeKey: remaining });
  persistComposerElementContexts(remaining);
}

function sendPrompt(
  text: string,
  bootstrap?: ThreadTurnStartBootstrap,
  attachments: ReadonlyArray<UploadChatAttachment> = [],
): Promise<boolean> {
  const trimmed = text.trim();
  const state = appAtomRegistry.get(t3ClientStateAtom);
  const threadId = state.activeThreadId;
  const draftThread = state.draftThread?.id === threadId ? state.draftThread : undefined;
  const bridge = getBridge();
  if ((!trimmed && attachments.length === 0) || !threadId || !bridge?.sendPrompt) {
    return Promise.resolve(false);
  }
  const resolvedBootstrap = draftThread
    ? buildDraftThreadTurnBootstrap(
        draftThread,
        truncate(trimmed || attachments[0]?.name || "New thread"),
        bootstrap,
      )
    : bootstrap;
  patchState({ sessionError: null });
  try {
    return bridge
      .sendPrompt({
        threadId,
        text: trimmed,
        ...(attachments.length > 0 ? { attachments } : {}),
        ...(resolvedBootstrap ? { bootstrap: resolvedBootstrap } : {}),
      })
      .then(() => true)
      .catch((error: unknown) => {
        if (appAtomRegistry.get(t3ClientStateAtom).activeThreadId === threadId) {
          patchState({
            sessionError: presentThreadCommandErrorMessage(
              error instanceof Error ? error.message : String(error),
            ),
          });
        }
        return false;
      });
  } catch (error) {
    patchState({
      sessionError: presentThreadCommandErrorMessage(
        error instanceof Error ? error.message : String(error),
      ),
    });
    return Promise.resolve(false);
  }
}

function interrupt(): void {
  const state = appAtomRegistry.get(t3ClientStateAtom);
  const threadId = state.activeThreadId;
  const bridge = getBridge();
  if (!threadId || !bridge?.interrupt) return;
  void bridge.interrupt({
    threadId,
    ...(state.activeTurnId ? { turnId: state.activeTurnId } : {}),
  });
}

function revertCheckpoint(turnCount: number): Promise<void> {
  const state = appAtomRegistry.get(t3ClientStateAtom);
  const threadId = state.activeThreadId;
  const bridge = getBridge();
  if (!threadId || !bridge?.revertCheckpoint) {
    return Promise.reject(new Error("Checkpoint revert is unavailable."));
  }
  return bridge.revertCheckpoint({ threadId, turnCount });
}

function respondToApproval(
  requestId: ApprovalRequestId,
  decision: ProviderApprovalDecision,
): Promise<void> {
  const threadId = appAtomRegistry.get(t3ClientStateAtom).activeThreadId;
  const bridge = getBridge();
  if (!threadId || !bridge?.respondToApproval) {
    return Promise.reject(new Error("Approval response is unavailable."));
  }
  return bridge.respondToApproval({ threadId, requestId, decision });
}

async function respondToUserInput(
  requestId: ApprovalRequestId,
  answers: ProviderUserInputAnswers,
): Promise<void> {
  const threadId = appAtomRegistry.get(t3ClientStateAtom).activeThreadId;
  const bridge = getBridge();
  if (!threadId || !bridge?.respondToUserInput) {
    return Promise.reject(new Error("User-input response is unavailable."));
  }
  await bridge.respondToUserInput({ threadId, requestId, answers });
  if (
    typeof (
      globalThis as {
        __T3_LYNXTRON_VIEWPORT_PROBE__?: unknown;
      }
    ).__T3_LYNXTRON_VIEWPORT_PROBE__ === "function"
  ) {
    lastUserInputResponse = { threadId, requestId, answers };
  }
}

async function deleteThread(threadId: string): Promise<void> {
  const bridge = getBridge();
  if (!bridge?.deleteThread) {
    throw new Error("Thread deletion is unavailable.");
  }
  try {
    await bridge.deleteThread({ threadId });
    if (appAtomRegistry.get(t3ClientStateAtom).activeThreadId === threadId) {
      resetActiveThreadState();
    }
  } catch (error) {
    patchState({
      sessionError: presentThreadCommandErrorMessage(
        error instanceof Error ? error.message : String(error),
      ),
    });
    throw error;
  }
}

async function archiveThread(threadId: string, unarchive = false): Promise<void> {
  const bridge = getBridge();
  if (!bridge?.archiveThread) return;
  if (!unarchive && appAtomRegistry.get(t3ClientStateAtom).activeThreadId === threadId) {
    resetActiveThreadState();
  }
  await bridge.archiveThread({ threadId, unarchive });
}

async function settleThread(threadId: string): Promise<void> {
  const bridge = getBridge();
  if (!bridge?.settleThread) return;
  await bridge.settleThread({ threadId });
}

async function unsettleThread(threadId: string): Promise<void> {
  const bridge = getBridge();
  if (!bridge?.unsettleThread) throw new Error("Thread un-settle is unavailable.");
  await bridge.unsettleThread({ threadId });
}

async function renameThread(threadId: string, title: string): Promise<void> {
  const bridge = getBridge();
  if (!bridge?.renameThread) return;
  await bridge.renameThread({ threadId, title });
}

async function regenerateThreadTitle(threadId: string): Promise<void> {
  const bridge = getBridge();
  if (!bridge?.regenerateThreadTitle) return;
  await bridge.regenerateThreadTitle({ threadId });
}

async function snoozeThread(threadId: string, snoozedUntil: string): Promise<void> {
  const bridge = getBridge();
  if (!bridge?.snoozeThread) return;
  await bridge.snoozeThread({ threadId, snoozedUntil });
}

async function unsnoozeThread(threadId: string): Promise<void> {
  const bridge = getBridge();
  if (!bridge?.unsnoozeThread) return;
  await bridge.unsnoozeThread({ threadId });
}

async function updateProject(projectId: string, title: string): Promise<void> {
  const bridge = getBridge();
  if (!bridge?.updateProject) {
    return Promise.reject(new Error("Project renaming is unavailable."));
  }
  await bridge.updateProject({ projectId, title });
}

async function deleteProject(projectId: string, force = false): Promise<void> {
  const bridge = getBridge();
  if (!bridge?.deleteProject) {
    return Promise.reject(new Error("Project removal is unavailable."));
  }
  await bridge.deleteProject({ projectId, ...(force ? { force: true } : {}) });
}

async function updateProjectScripts(
  projectId: string,
  scripts: ReadonlyArray<ProjectScript>,
): Promise<void> {
  const bridge = getBridge();
  if (!bridge?.updateProjectScripts) {
    return Promise.reject(new Error("Project action saving is unavailable."));
  }
  await bridge.updateProjectScripts({ projectId, scripts });
}

async function upsertKeybinding(
  input: ServerUpsertKeybindingInput,
): Promise<ServerUpsertKeybindingResult> {
  const bridge = getBridge();
  if (!bridge?.upsertKeybinding) {
    return Promise.reject(new Error("Keybinding saving is unavailable."));
  }
  return bridge.upsertKeybinding(input);
}

async function removeKeybinding(
  input: ServerRemoveKeybindingInput,
): Promise<ServerRemoveKeybindingResult> {
  const bridge = getBridge();
  if (!bridge?.removeKeybinding) {
    return Promise.reject(new Error("Keybinding removal is unavailable."));
  }
  return bridge.removeKeybinding(input);
}

async function openInEditor(cwd: string, editor: EditorId): Promise<void> {
  const bridge = getBridge();
  if (!bridge?.openInEditor) {
    return Promise.reject(new Error("Opening the project in an editor is unavailable."));
  }
  await bridge.openInEditor({ cwd, editor });
}

function browseFilesystem(input: FilesystemBrowseInput): Promise<FilesystemBrowseResult> {
  const bridge = getBridge();
  if (!bridge?.browseFilesystem) {
    return Promise.reject(new Error("Filesystem browsing is unavailable."));
  }
  return bridge.browseFilesystem(input);
}

function createAssetUrl(input: AssetCreateUrlInput): Promise<ConnectorAssetUrlResult> {
  const bridge = getBridge();
  if (!bridge?.createAssetUrl) {
    return Promise.reject(new Error("Asset loading is unavailable."));
  }
  return bridge.createAssetUrl(input);
}

function listProjectEntries(cwd: string): Promise<ProjectListEntriesResult> {
  const bridge = getBridge();
  if (!bridge?.listProjectEntries) {
    return Promise.reject(new Error("Project file listing is unavailable."));
  }
  return bridge.listProjectEntries({ cwd });
}

function searchProjectEntries(
  cwd: string,
  query: string,
  limit: number,
): Promise<ProjectSearchEntriesResult> {
  const bridge = getBridge();
  if (!bridge?.searchProjectEntries) {
    return Promise.reject(new Error("Project file search is unavailable."));
  }
  return bridge.searchProjectEntries({ cwd, query, limit, kind: "file" });
}

function searchComposerProjectEntries(
  cwd: string,
  query: string,
  limit: number,
): Promise<ProjectSearchEntriesResult> {
  const bridge = getBridge();
  if (!bridge?.searchProjectEntries) {
    return Promise.reject(new Error("Project context search is unavailable."));
  }
  return bridge.searchProjectEntries({ cwd, query, limit });
}

function readProjectFile(cwd: string, relativePath: string): Promise<ProjectReadFileResult> {
  const bridge = getBridge();
  if (!bridge?.readProjectFile) {
    return Promise.reject(new Error("Project file reading is unavailable."));
  }
  return bridge.readProjectFile({ cwd, relativePath });
}

function writeProjectFile(
  cwd: string,
  relativePath: string,
  contents: string,
): Promise<ProjectWriteFileResult> {
  const bridge = getBridge();
  if (!bridge?.writeProjectFile) {
    return Promise.reject(new Error("Project file writing is unavailable."));
  }
  return bridge.writeProjectFile({ cwd, relativePath, contents });
}

function getTurnDiff(
  input: OrchestrationGetTurnDiffInput,
): Promise<OrchestrationGetTurnDiffResult> {
  const bridge = getBridge();
  if (!bridge?.getTurnDiff) {
    return Promise.reject(new Error("Turn diff loading is unavailable."));
  }
  return bridge.getTurnDiff(input);
}

function getDiffPreview(input: ReviewDiffPreviewInput): Promise<ReviewDiffPreviewResult> {
  const bridge = getBridge();
  if (!bridge?.getDiffPreview) {
    return Promise.reject(new Error("Diff preview loading is unavailable."));
  }
  return bridge.getDiffPreview(input);
}

function readProjectBranch(cwd: string): Promise<ProjectRepoContext | null> {
  const bridge = getBridge();
  if (!bridge?.readProjectBranch) {
    return Promise.resolve(null);
  }
  return bridge.readProjectBranch({ cwd });
}

function readVcsStatus(cwd: string): Promise<VcsStatusResult | null> {
  const bridge = getBridge();
  if (!bridge?.readVcsStatus) {
    return Promise.resolve(null);
  }
  return bridge.readVcsStatus({ cwd });
}

async function initializeRepository(cwd: string): Promise<void> {
  const bridge = getBridge();
  if (!bridge?.initializeRepository) {
    throw new Error("Repository initialization is unavailable.");
  }
  await bridge.initializeRepository({ cwd });
  refreshVcsStatusProjection();
}

async function runGitAction(input: GitRunStackedActionInput): Promise<GitRunStackedActionResult> {
  const bridge = getBridge();
  if (!bridge?.runGitAction) {
    throw new Error("Git actions are unavailable.");
  }
  const result = await bridge.runGitAction(input);
  refreshVcsStatusProjection();
  return result;
}

function publishRepository(
  input: SourceControlPublishRepositoryInput,
): Promise<SourceControlPublishRepositoryResult> {
  const bridge = getBridge();
  if (!bridge?.publishRepository) {
    return Promise.reject(new Error("Repository publishing is unavailable."));
  }
  return bridge.publishRepository(input);
}

function lookupRepository(
  input: SourceControlRepositoryLookupInput,
): Promise<SourceControlRepositoryInfo> {
  const bridge = getBridge();
  if (!bridge?.lookupRepository) {
    return Promise.reject(new Error("Repository lookup is unavailable."));
  }
  return bridge.lookupRepository(input);
}

function cloneRepository(
  input: SourceControlCloneRepositoryInput,
): Promise<SourceControlCloneRepositoryResult> {
  const bridge = getBridge();
  if (!bridge?.cloneRepository) {
    return Promise.reject(new Error("Repository cloning is unavailable."));
  }
  return bridge.cloneRepository(input);
}

function discoverSourceControl(): Promise<SourceControlDiscoveryResult> {
  const bridge = getBridge();
  if (!bridge?.discoverSourceControl) {
    return Promise.reject(new Error("Source-control discovery is unavailable."));
  }
  return bridge.discoverSourceControl();
}

function createPairingCredential(label?: string): Promise<PairingCredentialResult> {
  const bridge = getBridge();
  if (!bridge?.createPairingCredential) {
    return Promise.reject(new Error("Pairing-link creation is unavailable."));
  }
  return bridge.createPairingCredential(label?.trim() ? { label: label.trim() } : undefined);
}

function revokePairingLink(id: string): Promise<boolean> {
  const bridge = getBridge();
  if (!bridge?.revokePairingLink) {
    return Promise.reject(new Error("Pairing-link revocation is unavailable."));
  }
  return bridge.revokePairingLink({ id });
}

function revokeClientSession(sessionId: string): Promise<boolean> {
  const bridge = getBridge();
  if (!bridge?.revokeClientSession) {
    return Promise.reject(new Error("Client-session revocation is unavailable."));
  }
  return bridge.revokeClientSession({ sessionId });
}

function revokeOtherClientSessions(): Promise<number> {
  const bridge = getBridge();
  if (!bridge?.revokeOtherClientSessions) {
    return Promise.reject(new Error("Client-session revocation is unavailable."));
  }
  return bridge.revokeOtherClientSessions();
}

function projectThreadModelSelection(
  threads: ReadonlyArray<ThreadSummary>,
  threadId: string | undefined,
  selection: ModelSelection | undefined,
): ReadonlyArray<ThreadSummary> {
  if (!threadId || !selection) return threads;
  return threads.map((thread) =>
    thread.id === threadId ? { ...thread, modelSelection: selection } : thread,
  );
}

function settleModelSelectionMutation(input: {
  readonly threadId: string | undefined;
  readonly selection: ModelSelection;
}): Promise<BridgeCallResult> {
  if (mainTransport) {
    return mainTransport.invokeSettled("setModelSelection", input);
  }
  const bridge = getBridge();
  if (!bridge?.setModelSelection) {
    return Promise.resolve({ ok: false, error: "Model selection updates are unavailable." });
  }
  try {
    return bridge.setModelSelection(input).then(
      (value) => ({ ok: true, value }) as const,
      (error: unknown) =>
        ({
          ok: false,
          error: modelSelectionMutationError(error),
        }) as const,
    );
  } catch (error) {
    return Promise.resolve({ ok: false, error: modelSelectionMutationError(error) });
  }
}

function persistModelSelectionMutation(input: {
  readonly previous: {
    readonly selectedModel: ModelInfo | undefined;
    readonly selection: ModelSelection | undefined;
    readonly threads: ReadonlyArray<ThreadSummary>;
  };
  readonly selectedModel: ModelInfo | undefined;
  readonly selection: ModelSelection;
  readonly threadId: string | undefined;
}): void {
  const sequence = ++modelSelectionMutationSequence;
  patchState({
    selectedModel: input.selectedModel,
    modelSelection: input.selection,
    modelSelectionError: null,
    modelSelectionPending: true,
    threads: projectThreadModelSelection(input.previous.threads, input.threadId, input.selection),
  });
  setPref("modelSelection", input.selection);
  const mutation = settleModelSelectionMutation({
    threadId: input.threadId,
    selection: input.selection,
  });
  void mutation.then((result) => {
    try {
      if (
        !shouldRollbackModelSelectionMutation({
          currentSequence: modelSelectionMutationSequence,
          failedSequence: sequence,
        })
      ) {
        return;
      }
      if (result.ok) {
        patchState({ modelSelectionError: null, modelSelectionPending: false });
        return;
      }
      patchState({
        selectedModel: input.previous.selectedModel,
        modelSelection: input.previous.selection,
        modelSelectionError: result.error,
        modelSelectionPending: false,
        threads: input.previous.threads,
      });
      setPref("modelSelection", input.previous.selection ?? null);
    } catch (error) {
      console.error("[t3-client] failed to settle model selection state", { error });
    }
  });
}

function setModelSelection(model: ModelInfo): void {
  const state = appAtomRegistry.get(t3ClientStateAtom);
  const threadId = state.activeThreadId;
  const selection = { instanceId: model.instanceId, model: model.slug };
  if (state.draftThread?.id === threadId) {
    const draftThread = projectDraftThreadModelSelection(state.draftThread, selection);
    patchState({
      draftThread,
      draftThreadsByProjectId: draftThread
        ? rememberLocalDraftThread(state.draftThreadsByProjectId, draftThread)
        : state.draftThreadsByProjectId,
      selectedModel: model,
      modelSelection: selection,
      modelSelectionError: null,
      modelSelectionPending: false,
    });
    setPref("modelSelection", selection);
    return;
  }
  persistModelSelectionMutation({
    previous: {
      selectedModel: state.selectedModel,
      selection: state.modelSelection,
      threads: state.threads,
    },
    selectedModel: model,
    selection,
    threadId,
  });
}

function setModelOptions(options: NonNullable<ModelSelection["options"]>): void {
  const state = appAtomRegistry.get(t3ClientStateAtom);
  const selection =
    state.modelSelection ??
    (state.selectedModel
      ? {
          instanceId: state.selectedModel.instanceId,
          model: state.selectedModel.slug,
        }
      : undefined);
  if (!selection) return;
  const nextSelection: ModelSelection = { ...selection, options };
  if (state.draftThread?.id === state.activeThreadId) {
    const draftThread = projectDraftThreadModelSelection(state.draftThread, nextSelection);
    patchState({
      draftThread,
      draftThreadsByProjectId: draftThread
        ? rememberLocalDraftThread(state.draftThreadsByProjectId, draftThread)
        : state.draftThreadsByProjectId,
      modelSelection: nextSelection,
      modelSelectionError: null,
      modelSelectionPending: false,
    });
    setPref("modelSelection", nextSelection);
    return;
  }
  persistModelSelectionMutation({
    previous: {
      selectedModel: state.selectedModel,
      selection: state.modelSelection,
      threads: state.threads,
    },
    selectedModel: state.selectedModel,
    selection: nextSelection,
    threadId: state.activeThreadId,
  });
}

function setThreadRuntimeMode(runtimeMode: RuntimeMode): void {
  const state = appAtomRegistry.get(t3ClientStateAtom);
  const threadId = state.activeThreadId;
  if (state.draftThread?.id === threadId) {
    const draftThread = projectDraftThreadRuntimeMode(state.draftThread, runtimeMode);
    patchState({
      draftThread,
      draftThreadsByProjectId: draftThread
        ? rememberLocalDraftThread(state.draftThreadsByProjectId, draftThread)
        : state.draftThreadsByProjectId,
    });
    return;
  }
  const previousMode = state.threads.find((thread) => thread.id === threadId)?.runtimeMode;
  const bridge = getBridge();
  if (!threadId || !previousMode || !bridge?.setThreadRuntimeMode) return;
  const setRuntimeMode = bridge.setThreadRuntimeMode;
  const mutation = setLatestPendingMutation(
    pendingThreadRuntimeModes,
    threadId,
    runtimeMode,
    previousMode,
  );
  patchState({ threads: projectThreadRuntimeMode(state.threads, threadId, runtimeMode) });
  void enqueueSerialMutation(pendingThreadModeCommands, threadId, () =>
    setRuntimeMode({ threadId, runtimeMode }),
  ).then(
    () => {
      markPendingMutationAccepted(mutation);
      const canonicalMode = canonicalThreadRuntimeModes.get(threadId);
      if (canonicalMode) {
        reconcilePendingMutation(pendingThreadRuntimeModes, threadId, canonicalMode);
      }
    },
    (error: unknown) => {
      const rejected = rejectPendingMutation(pendingThreadRuntimeModes, threadId, mutation);
      if (rejected.changed) {
        patchState({
          threads: projectThreadRuntimeMode(
            appAtomRegistry.get(t3ClientStateAtom).threads,
            threadId,
            rejected.value,
          ),
        });
      }
      console.error("[t3-client] failed to set runtime mode", { error });
    },
  );
}

function setThreadInteractionMode(interactionMode: ProviderInteractionMode): void {
  const state = appAtomRegistry.get(t3ClientStateAtom);
  const threadId = state.activeThreadId;
  if (state.draftThread?.id === threadId) {
    const draftThread = projectDraftThreadInteractionMode(state.draftThread, interactionMode);
    patchState({
      draftThread,
      draftThreadsByProjectId: draftThread
        ? rememberLocalDraftThread(state.draftThreadsByProjectId, draftThread)
        : state.draftThreadsByProjectId,
    });
    return;
  }
  const previousMode = state.threads.find((thread) => thread.id === threadId)?.interactionMode;
  const bridge = getBridge();
  if (!threadId || !previousMode || !bridge?.setThreadInteractionMode) return;
  const setInteractionMode = bridge.setThreadInteractionMode;
  const mutation = setLatestPendingMutation(
    pendingThreadInteractionModes,
    threadId,
    interactionMode,
    previousMode,
  );
  patchState({
    threads: projectThreadInteractionMode(state.threads, threadId, interactionMode),
  });
  void enqueueSerialMutation(pendingThreadModeCommands, threadId, () =>
    setInteractionMode({ threadId, interactionMode }),
  ).then(
    () => {
      markPendingMutationAccepted(mutation);
      const canonicalMode = canonicalThreadInteractionModes.get(threadId);
      if (canonicalMode) {
        reconcilePendingMutation(pendingThreadInteractionModes, threadId, canonicalMode);
      }
    },
    (error: unknown) => {
      const rejected = rejectPendingMutation(pendingThreadInteractionModes, threadId, mutation);
      if (rejected.changed) {
        patchState({
          threads: projectThreadInteractionMode(
            appAtomRegistry.get(t3ClientStateAtom).threads,
            threadId,
            rejected.value,
          ),
        });
      }
      console.error("[t3-client] failed to set interaction mode", { error });
    },
  );
}

function setProviderEnabled(instanceId: ProviderInstanceId, enabled: boolean): void {
  const bridge = getBridge();
  if (!bridge?.setProviderEnabled) return;
  patchState({
    providerUpdatePending: instanceId,
    providerSettingsError: null,
  });
  void bridge
    .setProviderEnabled({ instanceId, enabled })
    .then((config) => {
      applyServerConfig(config);
    })
    .catch((error: unknown) => {
      patchState({
        providerSettingsError: error instanceof Error ? error.message : String(error),
      });
    })
    .finally(() => {
      patchState({ providerUpdatePending: null });
    });
}

function updateProviderInstance(
  instanceId: ProviderInstanceId,
  instance: ProviderInstanceConfig,
): Promise<ServerConfig> {
  const state = appAtomRegistry.get(t3ClientStateAtom);
  const entry = state.providerEntries.find((candidate) => candidate.instanceId === instanceId);
  if (!state.settings || !entry) {
    return Promise.reject(new Error(`Provider instance is unavailable: ${instanceId}`));
  }
  patchState({
    providerUpdatePending: instanceId,
    providerSettingsError: null,
  });
  const patch = buildProviderInstanceUpdatePatch({
    settings: state.settings,
    instanceId,
    instance,
    driver: entry.driverKind,
    isDefault: entry.isDefault,
  });
  return updateServerSettings(patch)
    .catch((error: unknown) => {
      patchState({
        providerSettingsError: error instanceof Error ? error.message : String(error),
      });
      throw error;
    })
    .finally(() => {
      patchState({ providerUpdatePending: null });
    });
}

function createProviderInstance(
  instanceId: ProviderInstanceId,
  instance: ProviderInstanceConfig,
): Promise<ServerConfig> {
  const state = appAtomRegistry.get(t3ClientStateAtom);
  if (!state.settings) return Promise.reject(new Error("Provider settings are unavailable."));
  if (state.settings.providerInstances[instanceId]) {
    return Promise.reject(new Error(`Provider instance already exists: ${instanceId}`));
  }
  return updateServerSettings(
    buildProviderInstanceCreatePatch({
      settings: state.settings,
      instanceId,
      instance,
    }),
  );
}

function deleteProviderInstance(instanceId: ProviderInstanceId): Promise<ServerConfig> {
  const state = appAtomRegistry.get(t3ClientStateAtom);
  if (!state.settings) return Promise.reject(new Error("Provider settings are unavailable."));
  return updateServerSettings(
    buildProviderInstanceDeletePatch({
      settings: state.settings,
      instanceId,
    }),
  );
}

function refreshProviders(instanceId?: ProviderInstanceId): Promise<ServerConfig> {
  const bridge = getBridge();
  if (!bridge?.refreshProviders) {
    return Promise.reject(new Error("Provider refresh is unavailable."));
  }
  patchState({
    providersRefreshPending: true,
    providerSettingsError: null,
  });
  return bridge
    .refreshProviders(instanceId ? { instanceId } : undefined)
    .then((config) => {
      applyServerConfig(config);
      return config;
    })
    .catch((error: unknown) => {
      patchState({
        providerSettingsError: error instanceof Error ? error.message : String(error),
      });
      throw error;
    })
    .finally(() => {
      patchState({ providersRefreshPending: false });
    });
}

function updateProvider(instanceId: ProviderInstanceId): Promise<ServerConfig> {
  const state = appAtomRegistry.get(t3ClientStateAtom);
  const provider = state.providers.find((candidate) => candidate.instanceId === instanceId);
  const bridge = getBridge();
  if (!provider || !bridge?.updateProvider) {
    return Promise.reject(new Error(`Provider update is unavailable: ${instanceId}`));
  }
  patchState({
    providerUpdatePending: instanceId,
    providerSettingsError: null,
  });
  return bridge
    .updateProvider({
      provider: provider.driver,
      instanceId,
    })
    .then((config) => {
      applyServerConfig(config);
      return config;
    })
    .catch((error: unknown) => {
      patchState({
        providerSettingsError: error instanceof Error ? error.message : String(error),
      });
      throw error;
    })
    .finally(() => {
      patchState({ providerUpdatePending: null });
    });
}

function updateServerSettings(patch: ServerSettingsPatch): Promise<ServerConfig> {
  const bridge = getBridge();
  if (!bridge?.updateServerSettings) {
    return Promise.reject(new Error("Server settings updates are unavailable."));
  }
  patchState({
    settingsUpdatePending: true,
    settingsError: null,
  });
  return bridge
    .updateServerSettings({ patch })
    .then((config) => {
      applyServerConfig(config);
      return config;
    })
    .catch((error: unknown) => {
      patchState({
        settingsError: error instanceof Error ? error.message : String(error),
      });
      throw error;
    })
    .finally(() => {
      patchState({ settingsUpdatePending: false });
    });
}

async function restoreGeneralSettingsDefaults(): Promise<ReadonlyArray<string>> {
  const state = appAtomRegistry.get(t3ClientStateAtom);
  const restore = projectPortableGeneralSettingsRestore({
    clientSettings: getClientSettingsState(),
    serverSettings: state.settings ?? PORTABLE_SERVER_SETTINGS_DEFAULTS,
  });
  updateClientSettingsState(restore.clientPatch);
  if (!state.settings) {
    return restore.changedSettingLabels;
  }
  await updateServerSettings(restore.serverPatch);
  return restore.changedSettingLabels;
}

function openTerminal(input: TerminalOpenInput): Promise<TerminalSessionSnapshot> {
  const bridge = getBridge();
  if (!bridge?.openTerminal) return Promise.reject(new Error("Terminal is unavailable."));
  return bridge.openTerminal(input);
}

function writeTerminal(input: TerminalWriteInput): Promise<void> {
  const bridge = getBridge();
  if (!bridge?.writeTerminal) return Promise.reject(new Error("Terminal is unavailable."));
  return bridge.writeTerminal(input);
}

function resizeTerminal(input: TerminalResizeInput): Promise<void> {
  const bridge = getBridge();
  if (!bridge?.resizeTerminal) return Promise.reject(new Error("Terminal is unavailable."));
  return bridge.resizeTerminal(input);
}

function closeTerminal(input: TerminalCloseInput): Promise<void> {
  const bridge = getBridge();
  if (!bridge?.closeTerminal) return Promise.reject(new Error("Terminal is unavailable."));
  return bridge.closeTerminal(input);
}

export const t3ClientActions = {
  addComposerFileContext,
  addComposerAttachments,
  addComposerTerminalContext,
  archiveThread,
  browseFilesystem,
  createAssetUrl,
  cloneRepository,
  createPairingCredential,
  createProject,
  createProviderInstance,
  createThread,
  deleteProject,
  deleteThread,
  deleteProviderInstance,
  discoverSourceControl,
  getDiffPreview,
  getTurnDiff,
  initializeRepository,
  interrupt,
  listProjectEntries,
  lookupRepository,
  openTerminal,
  openInEditor,
  publishRepository,
  refreshProviders,
  readProjectFile,
  readProjectBranch,
  readVcsStatus,
  runGitAction,
  reconnect,
  revertCheckpoint,
  renameThread,
  regenerateThreadTitle,
  snoozeThread,
  respondToApproval,
  respondToUserInput,
  revokeClientSession,
  revokeOtherClientSessions,
  revokePairingLink,
  restoreGeneralSettingsDefaults,
  selectThread,
  sendPrompt,
  searchProjectEntries,
  searchComposerProjectEntries,
  writeTerminal,
  resizeTerminal,
  closeTerminal,
  clearComposerAttachments,
  clearComposerTerminalContexts,
  clearComposerFileContexts,
  clearComposerElementContexts,
  settleThread,
  unsettleThread,
  unsnoozeThread,
  setModelSelection,
  setModelOptions,
  setDraftStartFromOrigin,
  setComposerDraftText,
  setDraftWorkspaceMode,
  setProviderEnabled,
  setThreadInteractionMode,
  setThreadRuntimeMode,
  updateServerSettings,
  updateProviderInstance,
  updateProvider,
  updateProject,
  updateProjectScripts,
  upsertKeybinding,
  removeKeybinding,
  removeComposerAttachment,
  removeComposerTerminalContext,
  removeComposerFileContext,
  removeComposerElementContext,
  addComposerElementContext,
  writeProjectFile,
} as const;
