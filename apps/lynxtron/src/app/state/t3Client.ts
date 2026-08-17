import { useAtomValue } from "@effect/atom-react";
import { useEffect } from "@lynx-js/react";
import { Atom } from "effect/unstable/reactivity";
import {
  deriveModelPickerModels,
  deriveProviderModelSelectionProjection,
} from "@t3tools/client-runtime/presentation/model-picker";
import type { ProviderInstanceEntry } from "@t3tools/client-runtime/presentation/provider";
import type { AuthAccessPresentation } from "@t3tools/client-runtime/presentation/connections";
import {
  PORTABLE_SERVER_SETTINGS_DEFAULTS,
  projectPortableGeneralSettingsRestore,
} from "@t3tools/client-runtime/presentation/settings";
import type {
  ApprovalRequestId,
  EditorId,
  ModelSelection,
  OrchestrationCheckpointSummary,
  OrchestrationGetTurnDiffInput,
  OrchestrationGetTurnDiffResult,
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
  ProviderInstanceId,
  ServerConfig,
  ServerProvider,
  ServerSettings,
  ServerSettingsPatch,
  SourceControlDiscoveryResult,
  SourceControlPublishRepositoryInput,
  SourceControlPublishRepositoryResult,
  VcsStatusResult,
  RuntimeMode,
  ThreadTurnStartBootstrap,
  TurnId,
} from "@t3tools/contracts";

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
  type BridgeCallModule,
  type GlobalEventListenerRegistry,
  type MainConnectorTransport,
} from "./mainConnectorTransport";
import { CONNECTOR_COMMAND_NAMES } from "../../shared/connectorProtocol.ts";
import {
  availableThreadModels,
  findExactModelForSelection,
  modelSelectionMutationError,
  projectModelSelectionCandidates,
  resolveActiveThreadModelSelection,
  shouldRollbackModelSelectionMutation,
} from "./modelSelection.logic";
import { shouldReportVcsStatusReadFailure } from "./vcsStatusProjection.logic";
import type {
  ConnectorCommandName,
  ConnectorEventEnvelope,
  ConnectorSnapshot,
  ProjectRepoContext,
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
  providerUpdatePending: null,
  providerSettingsError: null,
  settingsUpdatePending: false,
  settingsError: null,
  activities: [],
  latestTurn: null,
  proposedPlans: [],
  activeTurnId: null,
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
let vcsStatusRequestSequence = 0;
let modelSelectionMutationSequence = 0;

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
  appAtomRegistry.set(t3ClientStateAtom, {
    ...appAtomRegistry.get(t3ClientStateAtom),
    ...partial,
  });
}

function activeVcsCwd(state: T3ClientState): string | null {
  const activeThread = state.threads.find((thread) => thread.id === state.activeThreadId);
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
  const activeThread = current.threads.find((thread) => thread.id === current.activeThreadId);
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
  const threads = shell.threads ?? [];
  const stateBeforeShell = appAtomRegistry.get(t3ClientStateAtom);
  const activeThread = threads.find((thread) => thread.id === stateBeforeShell.activeThreadId);
  const projects = shell.projects ?? [];
  const modelProjection =
    !activeThread && stateBeforeShell.serverConfig
      ? deriveProviderModelSelectionProjection(
          stateBeforeShell.serverConfig,
          projectModelSelectionCandidates({
            currentSelection: stateBeforeShell.modelSelection,
            projects,
          }),
        )
      : null;
  const activeModels = availableThreadModels(stateBeforeShell);
  const activeProjection = activeThread
    ? resolveActiveThreadModelSelection(activeModels, activeThread.modelSelection, {
        selectedModel: stateBeforeShell.selectedModel,
        selection: stateBeforeShell.modelSelection,
      })
    : null;
  patchState({
    projects,
    threads,
    archivedThreads: shell.archivedThreads ?? [],
    ...(activeThread
      ? {
          modelSelection: activeProjection?.selection ?? activeThread.modelSelection,
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
    // renderer off a non-chat route (e.g. Settings) to do it. Force-navigating
    // here caused Settings to flash back to chat when the shell snapshot
    // arrived. On the chat route this still navigates to the selected thread.
    selectThread(threads[0].id, { navigate: getPathname().startsWith("/settings") === false });
  } else {
    refreshVcsStatusProjection();
  }
}

function applyThreadPayload(payload: ThreadEventPayload): void {
  const nextFingerprint = JSON.stringify(payload);
  if (nextFingerprint === threadFingerprint) return;
  threadFingerprint = nextFingerprint;
  patchState({
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
  if (snapshot.config) applyConfigPayload(snapshot.config, preferredSelection);
  applyAccessPayload(snapshot.access);
  applyShellPayload(snapshot.shell as ShellEventPayload);
  const activeThreadId = appAtomRegistry.get(t3ClientStateAtom).activeThreadId;
  const activeThread = activeThreadId ? snapshot.threads[activeThreadId] : undefined;
  if (activeThread) applyThreadPayload(activeThread as ThreadEventPayload);
}

function applyConnectorEvent(envelope: ConnectorEventEnvelope): void {
  switch (envelope.kind) {
    case "status":
      applyStatusPayload(envelope.payload as StatusEventPayload);
      return;
    case "config":
      applyConfigPayload(envelope.payload as ServerConfig);
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
    case "log":
      // Mirror host logs to the renderer console, matching the preload path.
      console.log(envelope.payload);
      return;
  }
}

function buildMainCommandBridge(transport: MainConnectorTransport): Partial<PollBridge> {
  const bridge: Record<string, (input?: unknown) => Promise<unknown>> = {};
  for (const method of CONNECTOR_COMMAND_NAMES) {
    bridge[method] = (input?: unknown) => transport.invoke(method, input);
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
      threadIds: ReadonlyArray<string>;
      archivedThreadIds: ReadonlyArray<string>;
      pairingLinkIds: ReadonlyArray<string>;
      pairingLinkCount: number;
      approvalReceipts: ReadonlyArray<{
        readonly kind: string;
        readonly requestId: string | null;
        readonly decision: string | null;
      }>;
      pendingApprovalRequests: ReadonlyArray<{
        readonly requestId: string;
        readonly requestKind: string | null;
      }>;
      selectedProvider?: {
        instanceId: string;
        showInteractionModeToggle: boolean | undefined;
      };
      modelCount: number;
      modelSelectionError: string | null;
      modelSelectionPending: boolean;
      providerCount: number;
      providerEntryCount: number;
      vcsStatus: VcsStatusResult | null;
      vcsStatusCwd: string | null;
      vcsStatusPending: boolean;
    };
    __T3_LYNXTRON_SELECT_THREAD__?: (threadId: string) => void;
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
    const activeThread = state.threads.find((thread) => thread.id === state.activeThreadId);
    const activeProject = state.projects.find((project) => project.id === activeThread?.projectId);
    const selectedProvider = state.providerEntries.find(
      (entry) =>
        entry.instanceId === (state.selectedModel?.instanceId ?? state.modelSelection?.instanceId),
    );
    return {
      activeThreadId: state.activeThreadId,
      sessionStatus: state.sessionStatus,
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
  refreshVcsStatusProjection();
  const activeThreadId = appAtomRegistry.get(t3ClientStateAtom).activeThreadId;
  if (activeThreadId) {
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

async function createThread(projectId?: string): Promise<void> {
  const bridge = getBridge();
  if (!bridge?.createThread) return;
  const result = await bridge.createThread(projectId ? { projectId } : {});
  if (result?.threadId) selectThread(result.threadId, { draftHero: true });
}

function reconnect(): Promise<void> {
  const bridge = getBridge();
  if (!bridge?.reconnect) {
    return Promise.reject(new Error("Backend reconnection is unavailable."));
  }
  return bridge.reconnect();
}

function sendPrompt(text: string, bootstrap?: ThreadTurnStartBootstrap): void {
  const trimmed = text.trim();
  const threadId = appAtomRegistry.get(t3ClientStateAtom).activeThreadId;
  const bridge = getBridge();
  if (!trimmed || !threadId || !bridge?.sendPrompt) return;
  patchState({ draftHeroThreadId: undefined });
  void bridge.sendPrompt({
    threadId,
    text: trimmed,
    ...(bootstrap ? { bootstrap } : {}),
  });
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

function respondToUserInput(
  requestId: ApprovalRequestId,
  answers: ProviderUserInputAnswers,
): Promise<void> {
  const threadId = appAtomRegistry.get(t3ClientStateAtom).activeThreadId;
  const bridge = getBridge();
  if (!threadId || !bridge?.respondToUserInput) {
    return Promise.reject(new Error("User-input response is unavailable."));
  }
  return bridge.respondToUserInput({ threadId, requestId, answers });
}

async function deleteThread(threadId: string): Promise<void> {
  const bridge = getBridge();
  if (!bridge?.deleteThread) return;
  if (appAtomRegistry.get(t3ClientStateAtom).activeThreadId === threadId) {
    resetActiveThreadState();
  }
  await bridge.deleteThread({ threadId });
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
  if (!bridge?.unsettleThread) return;
  await bridge.unsettleThread({ threadId });
}

async function renameThread(threadId: string, title: string): Promise<void> {
  const bridge = getBridge();
  if (!bridge?.renameThread) return;
  await bridge.renameThread({ threadId, title });
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

async function openInEditor(cwd: string, editor: EditorId): Promise<void> {
  const bridge = getBridge();
  if (!bridge?.openInEditor) {
    return Promise.reject(new Error("Opening the project in an editor is unavailable."));
  }
  await bridge.openInEditor({ cwd, editor });
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

function publishRepository(
  input: SourceControlPublishRepositoryInput,
): Promise<SourceControlPublishRepositoryResult> {
  const bridge = getBridge();
  if (!bridge?.publishRepository) {
    return Promise.reject(new Error("Repository publishing is unavailable."));
  }
  return bridge.publishRepository(input);
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
  const bridge = getBridge();
  const sequence = ++modelSelectionMutationSequence;
  patchState({
    selectedModel: input.selectedModel,
    modelSelection: input.selection,
    modelSelectionError: null,
    modelSelectionPending: true,
    threads: projectThreadModelSelection(input.previous.threads, input.threadId, input.selection),
  });
  setPref("modelSelection", input.selection);
  const mutation = bridge?.setModelSelection
    ? bridge.setModelSelection({ threadId: input.threadId, selection: input.selection })
    : Promise.reject(new Error("Model selection updates are unavailable."));
  void mutation
    .then(() => {
      if (
        shouldRollbackModelSelectionMutation({
          currentSequence: modelSelectionMutationSequence,
          failedSequence: sequence,
        })
      ) {
        patchState({ modelSelectionError: null, modelSelectionPending: false });
      }
    })
    .catch((error: unknown) => {
      if (
        !shouldRollbackModelSelectionMutation({
          currentSequence: modelSelectionMutationSequence,
          failedSequence: sequence,
        })
      ) {
        return;
      }
      patchState({
        selectedModel: input.previous.selectedModel,
        modelSelection: input.previous.selection,
        modelSelectionError: modelSelectionMutationError(error),
        modelSelectionPending: false,
        threads: input.previous.threads,
      });
      setPref("modelSelection", input.previous.selection ?? null);
    });
}

function setModelSelection(model: ModelInfo): void {
  const state = appAtomRegistry.get(t3ClientStateAtom);
  const threadId = state.activeThreadId;
  const selection = { instanceId: model.instanceId, model: model.slug };
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
  const threadId = appAtomRegistry.get(t3ClientStateAtom).activeThreadId;
  const bridge = getBridge();
  if (!threadId || !bridge?.setThreadRuntimeMode) return;
  void bridge.setThreadRuntimeMode({ threadId, runtimeMode });
}

function setThreadInteractionMode(interactionMode: ProviderInteractionMode): void {
  const threadId = appAtomRegistry.get(t3ClientStateAtom).activeThreadId;
  const bridge = getBridge();
  if (!threadId || !bridge?.setThreadInteractionMode) return;
  void bridge.setThreadInteractionMode({ threadId, interactionMode });
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

export const t3ClientActions = {
  archiveThread,
  createPairingCredential,
  createThread,
  deleteThread,
  discoverSourceControl,
  getTurnDiff,
  initializeRepository,
  interrupt,
  listProjectEntries,
  openInEditor,
  publishRepository,
  readProjectFile,
  readProjectBranch,
  readVcsStatus,
  reconnect,
  renameThread,
  respondToApproval,
  respondToUserInput,
  revokeClientSession,
  revokeOtherClientSessions,
  revokePairingLink,
  restoreGeneralSettingsDefaults,
  selectThread,
  sendPrompt,
  searchProjectEntries,
  settleThread,
  unsettleThread,
  setModelSelection,
  setModelOptions,
  setProviderEnabled,
  setThreadInteractionMode,
  setThreadRuntimeMode,
  updateServerSettings,
  updateProjectScripts,
  writeProjectFile,
} as const;
