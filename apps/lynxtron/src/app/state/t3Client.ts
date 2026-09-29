import { useAtomValue } from "@effect/atom-react";
import { useEffect } from "@lynx-js/react";
import { Atom } from "effect/unstable/reactivity";
import { deriveProviderModelSelectionProjection } from "@t3tools/client-runtime/presentation/model-picker";
import type { ProviderInstanceEntry } from "@t3tools/client-runtime/presentation/provider";
import type { AuthAccessPresentation } from "@t3tools/client-runtime/presentation/connections";
import {
  PORTABLE_SERVER_SETTINGS_DEFAULTS,
  projectPortableGeneralSettingsRestore,
} from "@t3tools/client-runtime/presentation/settings";
import type {
  ModelSelection,
  OrchestrationCheckpointSummary,
  OrchestrationLatestTurn,
  OrchestrationProposedPlan,
  OrchestrationProposedPlanId,
  ProviderInteractionMode,
  ProjectListEntriesResult,
  ProjectReadFileResult,
  ProjectWriteFileResult,
  ProviderInstanceId,
  ApprovalRequestId,
  ProviderApprovalDecision,
  ProviderUserInputAnswers,
  ServerConfig,
  ServerProvider,
  ServerSettings,
  ServerSettingsPatch,
  SourceControlDiscoveryResult,
  RuntimeMode,
  VcsStatusResult,
  TurnId,
  UploadChatAttachment,
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
import { navigate } from "../router";
import { appAtomRegistry } from "./atomRegistry";
import { reportConnectionStatus } from "./connectionStatus";
import { LYNX_PRIMARY_ENVIRONMENT_ID } from "./environment";
import { getClientSettingsState, getPref, setPref, updateClientSettingsState } from "./prefsStore";
import {
  startMainConnectorTransport,
  type BridgeCallModule,
  type GlobalEventListenerRegistry,
  type MainConnectorTransport,
} from "./mainConnectorTransport";
import {
  CONNECTOR_COMMAND_NAMES,
  T3_CONNECTOR_METHODS,
  isConnectorSyncReply,
} from "../../shared/connectorProtocol.ts";
import { sendPromptWithThreadCreation } from "./sendPromptWithThreadCreation.ts";
import { composerDraftKey, moveComposerDraft } from "./composerDraftRegistry.ts";
import type {
  ConnectorCommandName,
  ConnectorEventEnvelope,
  ConnectorSnapshot,
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
  readonly projects: ReadonlyArray<ProjectSummary>;
  readonly threads: ReadonlyArray<ThreadSummary>;
  readonly archivedThreads: ReadonlyArray<ThreadSummary>;
  readonly activeThreadId?: string;
  readonly messages: ReadonlyArray<ChatMessage>;
  readonly checkpoints: ReadonlyArray<OrchestrationCheckpointSummary>;
  readonly sessionStatus: SessionStatus;
  readonly models: ReadonlyArray<ModelInfo>;
  readonly selectedModel?: ModelInfo;
  readonly modelSelection?: ModelSelection;
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
  projects: [],
  threads: [],
  archivedThreads: [],
  messages: [],
  checkpoints: [],
  sessionStatus: "idle",
  models: [],
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

function getPreloadBridge(): Partial<PollBridge> | undefined {
  "background only";
  try {
    return NativeModules?.nodejs?.exposed;
  } catch {
    return undefined;
  }
}

function getMainBridgeModule(): BridgeCallModule | undefined {
  "background only";
  try {
    return typeof NativeModules !== "undefined" ? NativeModules.bridge : undefined;
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

export function installT3ClientFixtureForDevTool(partial: Partial<T3ClientState>): void {
  started = true;
  patchState(partial);
}

export function installT3ClientSnapshotForDevTool(snapshot: ConnectorSnapshot): void {
  started = true;
  applyConnectorSnapshot(snapshot);
}

function resetActiveThreadState(activeThreadId?: string): void {
  threadFingerprint = "";
  const current = appAtomRegistry.get(t3ClientStateAtom);
  const thread = current.threads.find((candidate) => candidate.id === activeThreadId);
  const selectedModel = thread
    ? current.models.find(
        (model) =>
          model.instanceId === thread.modelSelection.instanceId &&
          model.slug === thread.modelSelection.model,
      )
    : current.selectedModel;
  patchState({
    activeThreadId,
    messages: [],
    checkpoints: [],
    sessionStatus: "idle",
    activePlan: undefined,
    activeProposedPlan: undefined,
    activities: [],
    latestTurn: null,
    proposedPlans: [],
    activeTurnId: null,
    ...(thread
      ? {
          modelSelection: thread.modelSelection,
          ...(selectedModel ? { selectedModel } : {}),
        }
      : {}),
  });
}

function applyServerConfig(config: ServerConfig, preferredSelection?: ModelSelection | null): void {
  const current = appAtomRegistry.get(t3ClientStateAtom);
  const projection = deriveProviderModelSelectionProjection(config, [
    preferredSelection,
    current.modelSelection,
    current.selectedModel
      ? {
          instanceId: current.selectedModel.instanceId,
          model: current.selectedModel.slug,
        }
      : null,
  ]);
  const selectedModel = projection.selectedModel;

  patchState({
    serverConfig: config,
    providers: config.providers,
    settings: config.settings,
    providerEntries: projection.entries,
    models: projection.models,
    selectedModel,
    modelSelection: projection.selection,
  });

  if (selectedModel) {
    const selection = projection.selection ?? {
      instanceId: selectedModel.instanceId,
      model: selectedModel.slug,
    };
    setPref("modelSelection", selection);
    void getBridge()?.setModelSelection?.({ selection });
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
  const activeModel = activeThread
    ? stateBeforeShell.models.find(
        (model) =>
          model.instanceId === activeThread.modelSelection.instanceId &&
          model.slug === activeThread.modelSelection.model,
      )
    : undefined;
  patchState({
    projects: shell.projects ?? [],
    threads,
    archivedThreads: shell.archivedThreads ?? [],
    ...(activeThread
      ? {
          modelSelection: activeThread.modelSelection,
          ...(activeModel ? { selectedModel: activeModel } : {}),
        }
      : {}),
  });
  const latest = appAtomRegistry.get(t3ClientStateAtom);
  if (!latest.activeThreadId && threads.length > 0) {
    selectThread(threads[0].id);
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
  (
    globalThis as {
      __T3_LYNXTRON_CONNECTOR_TRANSPORT__?: {
        kind: "main" | "unavailable";
        lastSeq: () => number;
        invoke: (method: string, params?: unknown) => Promise<unknown>;
      };
    }
  ).__T3_LYNXTRON_CONNECTOR_TRANSPORT__ = {
    kind: mainTransport ? ("main" as const) : ("unavailable" as const),
    lastSeq: () => mainTransport?.lastSeq ?? -1,
    invoke: (method, params) => {
      if (!mainTransport) return Promise.reject(new Error("main transport is not active"));
      return mainTransport.invoke(method as ConnectorCommandName, params);
    },
  };
}

function startT3Client(): void {
  if (started) return;
  started = true;
  installTransportDevToolHook();
  void bootstrapT3Client().catch((error) => {
    const detail = error instanceof Error ? error.message : String(error);
    installTransportDevToolHook();
    patchState({
      status: "error",
      statusDetail: `Main-owned connector bootstrap failed: ${detail}`,
    });
  });
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
    bridge: getMainBridgeModule(),
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
    patchState({
      status: "error",
      statusDetail:
        "Main-owned connector transport unavailable (typed bridge probe failed). The renderer cannot reach the backend.",
    });
    return;
  }
  mainTransport = transport;
  mainCommandBridge = buildMainCommandBridge(transport);
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

function selectThread(threadId: string): void {
  resetActiveThreadState(threadId);
  getBridge()?.selectThread?.(threadId);
  navigate(`/${LYNX_PRIMARY_ENVIRONMENT_ID}/${threadId}`);
}

async function createThread(projectId?: string): Promise<void> {
  const bridge = getBridge();
  if (!bridge?.createThread) return;
  const result = await bridge.createThread(projectId ? { projectId } : {});
  if (result?.threadId) selectThread(result.threadId);
}

function sendPrompt(
  text: string,
  attachments: ReadonlyArray<UploadChatAttachment> = [],
): Promise<void> {
  const trimmed = text.trim();
  const state = appAtomRegistry.get(t3ClientStateAtom);
  const bridge = getBridge();
  if (!trimmed && attachments.length === 0) return Promise.resolve();
  if (!bridge) {
    return Promise.reject(new Error("Sending a message is unavailable."));
  }
  return sendPromptWithThreadCreation({
    text: trimmed,
    activeThreadId: state.activeThreadId,
    projectId: state.projects[0]?.id,
    attachments,
    bridge,
    onThreadCreated: (threadId) => {
      moveComposerDraft(
        composerDraftKey({ projectId: state.projects[0]?.id }),
        composerDraftKey({ projectId: state.projects[0]?.id, threadId }),
      );
      selectThread(threadId);
    },
  });
}

function interrupt(): void {
  const threadId = appAtomRegistry.get(t3ClientStateAtom).activeThreadId;
  const bridge = getBridge();
  if (!threadId || !bridge?.interrupt) return;
  void bridge.interrupt({ threadId });
}

function respondToApproval(
  requestId: ApprovalRequestId,
  decision: ProviderApprovalDecision,
): Promise<void> {
  const state = appAtomRegistry.get(t3ClientStateAtom);
  const bridge = getBridge();
  if (!state.activeThreadId || !bridge?.respondToApproval) {
    return Promise.reject(new Error("Approval response is unavailable."));
  }
  return bridge.respondToApproval({ threadId: state.activeThreadId, requestId, decision });
}

function respondToUserInput(
  requestId: ApprovalRequestId,
  answers: ProviderUserInputAnswers,
): Promise<void> {
  const state = appAtomRegistry.get(t3ClientStateAtom);
  const bridge = getBridge();
  if (!state.activeThreadId || !bridge?.respondToUserInput) {
    return Promise.reject(new Error("User-input response is unavailable."));
  }
  return bridge.respondToUserInput({ threadId: state.activeThreadId, requestId, answers });
}

function implementProposedPlan(planId: OrchestrationProposedPlanId, prompt: string): Promise<void> {
  const state = appAtomRegistry.get(t3ClientStateAtom);
  const bridge = getBridge();
  if (!state.activeThreadId || !bridge?.implementProposedPlan) {
    return Promise.reject(new Error("Plan implementation is unavailable."));
  }
  return bridge.implementProposedPlan({ threadId: state.activeThreadId, planId, prompt });
}

async function implementProposedPlanInNewThread(
  planId: OrchestrationProposedPlanId,
  prompt: string,
  title: string,
): Promise<void> {
  const state = appAtomRegistry.get(t3ClientStateAtom);
  const bridge = getBridge();
  if (!state.activeThreadId || !bridge?.implementProposedPlanInNewThread) {
    throw new Error("Plan implementation in a new thread is unavailable.");
  }
  const result = await bridge.implementProposedPlanInNewThread({
    sourceThreadId: state.activeThreadId,
    planId,
    prompt,
    title,
  });
  selectThread(result.threadId);
}

async function reconnectConnector(): Promise<void> {
  if (!mainTransport) {
    patchState({
      status: "error",
      statusDetail: "Main-owned connector transport is unavailable. Restart T3 Code to retry.",
    });
    return;
  }
  patchState({ status: "connecting", statusDetail: "Restarting the local server…" });
  try {
    await mainTransport.reconnect();
  } catch (error) {
    patchState({
      status: "error",
      statusDetail: error instanceof Error ? error.message : String(error),
    });
  }
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

async function renameThread(threadId: string, title: string): Promise<void> {
  const bridge = getBridge();
  if (!bridge?.renameThread) return;
  await bridge.renameThread({ threadId, title });
}

function listProjectEntries(cwd: string): Promise<ProjectListEntriesResult> {
  const bridge = getBridge();
  if (!bridge?.listProjectEntries) {
    return Promise.reject(new Error("Project file listing is unavailable."));
  }
  return bridge.listProjectEntries({ cwd });
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

function discoverSourceControl(): Promise<SourceControlDiscoveryResult> {
  const bridge = getBridge();
  if (!bridge?.discoverSourceControl) {
    return Promise.reject(new Error("Source-control discovery is unavailable."));
  }
  return bridge.discoverSourceControl();
}

function refreshVcsStatus(cwd: string): Promise<VcsStatusResult> {
  const bridge = getBridge();
  if (!bridge?.refreshVcsStatus) {
    return Promise.reject(new Error("Version-control status is unavailable."));
  }
  return bridge.refreshVcsStatus({ cwd });
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

function setModelSelection(model: ModelInfo): void {
  const threadId = appAtomRegistry.get(t3ClientStateAtom).activeThreadId;
  const selection = { instanceId: model.instanceId, model: model.slug };
  patchState({ selectedModel: model, modelSelection: selection });
  setPref("modelSelection", selection);
  void getBridge()?.setModelSelection?.({ threadId, selection });
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
  patchState({ modelSelection: nextSelection });
  setPref("modelSelection", nextSelection);
  void getBridge()?.setModelSelection?.({
    threadId: state.activeThreadId,
    selection: nextSelection,
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
  interrupt,
  implementProposedPlan,
  implementProposedPlanInNewThread,
  listProjectEntries,
  readProjectFile,
  refreshVcsStatus,
  reconnectConnector,
  respondToApproval,
  respondToUserInput,
  renameThread,
  revokeClientSession,
  revokeOtherClientSessions,
  revokePairingLink,
  restoreGeneralSettingsDefaults,
  selectThread,
  sendPrompt,
  setModelSelection,
  setModelOptions,
  setProviderEnabled,
  setThreadInteractionMode,
  setThreadRuntimeMode,
  updateServerSettings,
  writeProjectFile,
} as const;
