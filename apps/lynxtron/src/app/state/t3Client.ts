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
  ProviderInteractionMode,
  ProjectListEntriesResult,
  ProjectReadFileResult,
  ProjectWriteFileResult,
  ProviderInstanceId,
  ServerConfig,
  ServerProvider,
  ServerSettings,
  ServerSettingsPatch,
  SourceControlDiscoveryResult,
  RuntimeMode,
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
import { LYNX_PRIMARY_ENVIRONMENT_ID } from "./environment";
import { getClientSettingsState, getPref, setPref, updateClientSettingsState } from "./prefsStore";

interface PollBridge extends T3Bridge {
  getStatus: () => StatusEventPayload;
  getConfig: () => ServerConfig | null;
  getAccess: () => AuthAccessPresentation;
  getShell: () => ShellEventPayload;
  getThread: (threadId: string) => ThreadEventPayload | null;
}

declare const NativeModules: {
  nodejs?: { exposed?: Partial<PollBridge> };
} & Record<string, unknown>;

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
};

export const t3ClientStateAtom = Atom.make<T3ClientState>(INITIAL_T3_CLIENT_STATE).pipe(
  Atom.withLabel("lynx-t3-client-state"),
);

let started = false;
let configFingerprint = "";
let accessFingerprint = "";
let shellFingerprint = "";
let threadFingerprint = "";

function getBridge(): Partial<PollBridge> | undefined {
  "background only";
  try {
    return NativeModules?.nodejs?.exposed;
  } catch {
    return undefined;
  }
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

function pollOnce(): void {
  const bridge = getBridge();
  if (!bridge) return;
  const current = appAtomRegistry.get(t3ClientStateAtom);
  const status = bridge.getStatus?.();
  if (status && (status.status !== current.status || status.detail !== current.statusDetail)) {
    patchState({ status: status.status, statusDetail: status.detail });
  }

  const config = bridge.getConfig?.();
  if (config) {
    const nextFingerprint = JSON.stringify(config);
    if (nextFingerprint !== configFingerprint) {
      configFingerprint = nextFingerprint;
      applyServerConfig(config);
    }
  }

  const access = bridge.getAccess?.();
  if (access) {
    const nextFingerprint = JSON.stringify(access);
    if (nextFingerprint !== accessFingerprint) {
      accessFingerprint = nextFingerprint;
      patchState({ authAccess: access });
    }
  }

  const shell = bridge.getShell?.();
  if (shell) {
    const nextFingerprint = JSON.stringify(shell);
    if (nextFingerprint !== shellFingerprint) {
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
  }

  const activeThreadId = appAtomRegistry.get(t3ClientStateAtom).activeThreadId;
  if (!activeThreadId) return;
  const thread = bridge.getThread?.(activeThreadId);
  if (!thread) return;
  const nextFingerprint = JSON.stringify(thread);
  if (nextFingerprint === threadFingerprint) return;
  threadFingerprint = nextFingerprint;
  patchState({
    messages: thread.messages ?? [],
    checkpoints: thread.checkpoints ?? [],
    sessionStatus: thread.sessionStatus ?? "idle",
    activePlan: thread.activePlan ?? undefined,
    activeProposedPlan: thread.activeProposedPlan ?? undefined,
    activities: thread.activities ?? [],
  });
}

function startT3Client(): void {
  if (started) return;
  started = true;

  const bridge = getBridge();
  if (!bridge?.connect) {
    patchState({
      status: "error",
      statusDetail: "Backend bridge unavailable (NativeModules.nodejs.exposed missing).",
    });
    return;
  }

  patchState({ status: "connecting" });
  bridge
    .connect()
    .then((result) => {
      const saved = getPref<ModelSelection | null>("modelSelection", null);
      patchState({
        status: result.status,
        statusDetail: result.detail,
      });
      if (result.config) {
        configFingerprint = JSON.stringify(result.config);
        applyServerConfig(result.config, saved);
      }
    })
    .catch((error: unknown) => {
      patchState({
        status: "error",
        statusDetail: error instanceof Error ? error.message : String(error),
      });
    });

  setInterval(pollOnce, 400);
}

export function useT3ClientState(): T3ClientState {
  const state = useAtomValue(t3ClientStateAtom);
  useEffect(() => {
    startT3Client();
  }, []);
  return state;
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

function sendPrompt(text: string): void {
  const trimmed = text.trim();
  const threadId = appAtomRegistry.get(t3ClientStateAtom).activeThreadId;
  const bridge = getBridge();
  if (!trimmed || !threadId || !bridge?.sendPrompt) return;
  void bridge.sendPrompt({ threadId, text: trimmed });
}

function interrupt(): void {
  const threadId = appAtomRegistry.get(t3ClientStateAtom).activeThreadId;
  const bridge = getBridge();
  if (!threadId || !bridge?.interrupt) return;
  void bridge.interrupt({ threadId });
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
  listProjectEntries,
  readProjectFile,
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
