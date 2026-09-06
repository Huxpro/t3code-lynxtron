/**
 * Typed main-owned connector protocol shared by the Lynxtron main process and
 * the Lynx renderer (AR1 spike).
 *
 * Transport legs:
 *   - renderer -> main: `NativeModules.bridge.call(method, params, cb)` against
 *     handlers registered with `lynxBridge.handle` in main.
 *   - main -> renderer: sequenced envelopes pushed with
 *     `LynxWindow.sendGlobalEvent(T3_CONNECTOR_EVENT, envelope)` and received
 *     through `lynx.getJSModule("GlobalEventEmitter")`.
 *
 * Every payload is JSON-serializable canonical state (contracts DTOs and
 * renderer-neutral presentations). No Effect values, functions, class
 * instances, or credentials cross the bridge.
 */
import type {
  AssetCreateUrlResult,
  OrchestrationCheckpointSummary,
  OrchestrationLatestTurn,
  OrchestrationMessage,
  OrchestrationProjectShell,
  OrchestrationProposedPlan,
  OrchestrationSessionStatus,
  OrchestrationThreadActivity,
  OrchestrationThreadShell,
  TerminalSessionStatus,
  TurnId,
} from "@t3tools/contracts";
import { ServerConfig, ServerSettingsPatch } from "@t3tools/contracts";
import type { AuthAccessPresentation } from "@t3tools/client-runtime/presentation/connections";
import type {
  ActivePlanState,
  LatestProposedPlanState,
} from "@t3tools/client-runtime/presentation/thread";
import * as Schema from "effect/Schema";

/** Main -> renderer push channel name (LynxWindow.sendGlobalEvent). */
export const T3_CONNECTOR_EVENT = "t3:connector-event";

/** Renderer -> main invoke method names (lynxBridge.handle). */
export const T3_CONNECTOR_METHODS = {
  /** Renderer readiness: returns one current snapshot plus the latest sequence. */
  ready: "t3:connector.ready",
  /** Sequence-gap recovery: returns one current snapshot plus the latest sequence. */
  resync: "t3:connector.resync",
  /** Typed command dispatch into the connector. */
  command: "t3:connector.command",
} as const;

export type ConnectorConnectionStatus =
  | "idle"
  | "starting-server"
  | "connecting"
  | "reconnecting"
  | "ready"
  | "error";

export interface ConnectorStatusPayload {
  readonly status: ConnectorConnectionStatus;
  readonly detail?: string;
}

export interface ConnectorShellPayload {
  readonly projects: ReadonlyArray<OrchestrationProjectShell>;
  readonly threads: ReadonlyArray<OrchestrationThreadShell>;
  readonly archivedThreads?: ReadonlyArray<OrchestrationThreadShell>;
}

export interface ConnectorAssetUrlResult {
  readonly url: string;
  readonly expiresAt: number;
}

export function resolveConnectorAssetUrl(
  baseUrl: string,
  result: AssetCreateUrlResult,
): ConnectorAssetUrlResult {
  const url = new URL(result.relativeUrl, baseUrl);
  url.protocol =
    url.protocol === "wss:" ? "https:" : url.protocol === "ws:" ? "http:" : url.protocol;
  return { url: url.toString(), expiresAt: result.expiresAt };
}

export interface ConnectorThreadPayload {
  readonly threadId: string;
  readonly messages: ReadonlyArray<OrchestrationMessage>;
  readonly checkpoints: ReadonlyArray<OrchestrationCheckpointSummary>;
  readonly sessionStatus: OrchestrationSessionStatus;
  readonly sessionError?: string | null;
  readonly activities?: ReadonlyArray<OrchestrationThreadActivity>;
  readonly activePlan?: ActivePlanState | null;
  readonly activeProposedPlan?: LatestProposedPlanState | null;
  readonly latestTurn?: OrchestrationLatestTurn | null;
  readonly proposedPlans?: ReadonlyArray<OrchestrationProposedPlan>;
  readonly activeTurnId?: TurnId | null;
}

export interface TerminalSessionPresentation {
  readonly threadId: string;
  readonly terminalId: string;
  readonly cwd: string;
  readonly status: TerminalSessionStatus | "closed";
  readonly history: string;
  readonly error: string | null;
  readonly updatedAt: string | null;
}

export type ConnectorServerConfig = typeof ServerConfig.Encoded;
export type ConnectorServerSettingsPatch = typeof ServerSettingsPatch.Encoded;

const encodeServerConfig = Schema.encodeSync(ServerConfig);
const decodeServerConfig = Schema.decodeUnknownSync(ServerConfig);
const encodeServerSettingsPatch = Schema.encodeSync(ServerSettingsPatch);
const decodeServerSettingsPatch = Schema.decodeUnknownSync(ServerSettingsPatch);

export function encodeConnectorServerConfig(
  config: typeof ServerConfig.Type,
): ConnectorServerConfig {
  return encodeServerConfig(config);
}

export function decodeConnectorServerConfig(config: unknown): typeof ServerConfig.Type {
  return decodeServerConfig(config);
}

export function encodeConnectorServerSettingsPatch(
  patch: typeof ServerSettingsPatch.Type,
): ConnectorServerSettingsPatch {
  return encodeServerSettingsPatch(patch);
}

export function decodeConnectorServerSettingsPatch(
  patch: unknown,
): typeof ServerSettingsPatch.Type {
  return decodeServerSettingsPatch(patch);
}

export function encodeConnectorCommandParams(
  method: ConnectorCommandName,
  params: unknown,
): unknown {
  if (method !== "updateServerSettings") return params;
  const input = params as { readonly patch?: typeof ServerSettingsPatch.Type } | null | undefined;
  return {
    patch: encodeConnectorServerSettingsPatch(input?.patch ?? {}),
  };
}

export function decodeConnectorCommandParams(
  method: ConnectorCommandName,
  params: unknown,
): unknown {
  if (method !== "updateServerSettings") return params;
  const input = params as { readonly patch?: unknown } | null | undefined;
  return {
    patch: decodeConnectorServerSettingsPatch(input?.patch ?? {}),
  };
}

const SERVER_CONFIG_COMMANDS: ReadonlySet<ConnectorCommandName> = new Set([
  "refreshProviders",
  "updateProvider",
  "setProviderEnabled",
  "updateServerSettings",
]);

export function encodeConnectorCommandResult(
  method: ConnectorCommandName,
  result: unknown,
): unknown {
  return SERVER_CONFIG_COMMANDS.has(method)
    ? encodeConnectorServerConfig(result as typeof ServerConfig.Type)
    : result;
}

export function decodeConnectorCommandResult(
  method: ConnectorCommandName,
  result: unknown,
): unknown {
  return SERVER_CONFIG_COMMANDS.has(method) ? decodeConnectorServerConfig(result) : result;
}

export type ConnectorEventKind =
  | "status"
  | "config"
  | "access"
  | "shell"
  | "thread"
  | "terminal"
  | "log";

export type ConnectorEventPayload =
  | { readonly kind: "status"; readonly payload: ConnectorStatusPayload }
  | { readonly kind: "config"; readonly payload: ConnectorServerConfig }
  | { readonly kind: "access"; readonly payload: AuthAccessPresentation }
  | { readonly kind: "shell"; readonly payload: ConnectorShellPayload }
  | { readonly kind: "thread"; readonly threadId: string; readonly payload: ConnectorThreadPayload }
  | {
      readonly kind: "terminal";
      readonly threadId: string;
      readonly terminalId: string;
      readonly payload: TerminalSessionPresentation;
    }
  | { readonly kind: "log"; readonly payload: string };

/** One sequenced main -> renderer event. `seq` is strictly monotonic per window. */
export type ConnectorEventEnvelope = ConnectorEventPayload & { readonly seq: number };

/** Serializable mirror of the connector state used for ready/resync replies. */
export interface ConnectorSnapshot {
  readonly status: ConnectorStatusPayload;
  readonly config: ConnectorServerConfig | null;
  readonly access: AuthAccessPresentation;
  readonly shell: ConnectorShellPayload;
  readonly threads: Readonly<Record<string, ConnectorThreadPayload>>;
  readonly terminals: Readonly<Record<string, TerminalSessionPresentation>>;
}

export interface ConnectorSyncRequest {
  /** Renderer-observed latest sequence; informational for main-side diagnostics. */
  readonly lastSeq?: number;
}

export interface ConnectorSyncReply {
  readonly snapshot: ConnectorSnapshot;
  readonly seq: number;
}

export interface ProjectRepoContext {
  readonly isRepo: boolean;
  readonly branch: string | null;
}

export function projectRepoContext(input: {
  readonly isRepo: boolean;
  readonly refName: string | null | undefined;
}): ProjectRepoContext {
  return {
    isRepo: input.isRepo,
    branch: input.refName ?? null,
  };
}

/** Allowlisted connector commands the renderer may invoke through main. */
export const CONNECTOR_COMMAND_NAMES = [
  "reconnect",
  "createAssetUrl",
  "createProject",
  "createThread",
  "selectThread",
  "sendPrompt",
  "interrupt",
  "revertCheckpoint",
  "respondToApproval",
  "respondToUserInput",
  "setModelSelection",
  "setThreadRuntimeMode",
  "setThreadInteractionMode",
  "refreshProviders",
  "updateProvider",
  "setProviderEnabled",
  "updateServerSettings",
  "deleteThread",
  "archiveThread",
  "settleThread",
  "unsettleThread",
  "renameThread",
  "regenerateThreadTitle",
  "snoozeThread",
  "unsnoozeThread",
  "updateProject",
  "deleteProject",
  "updateProjectScripts",
  "upsertKeybinding",
  "removeKeybinding",
  "openInEditor",
  "browseFilesystem",
  "listProjectEntries",
  "searchProjectEntries",
  "readProjectFile",
  "writeProjectFile",
  "getTurnDiff",
  "getDiffPreview",
  "readProjectBranch",
  "readVcsStatus",
  "initializeRepository",
  "runGitAction",
  "publishRepository",
  "lookupRepository",
  "cloneRepository",
  "discoverSourceControl",
  "createPairingCredential",
  "revokePairingLink",
  "revokeClientSession",
  "revokeOtherClientSessions",
  "openTerminal",
  "writeTerminal",
  "resizeTerminal",
  "closeTerminal",
] as const;

export type ConnectorCommandName = (typeof CONNECTOR_COMMAND_NAMES)[number];

export interface ConnectorCommandRequest {
  readonly method: ConnectorCommandName;
  readonly params?: unknown;
}

export function isConnectorCommandName(value: unknown): value is ConnectorCommandName {
  return (
    typeof value === "string" && (CONNECTOR_COMMAND_NAMES as ReadonlyArray<string>).includes(value)
  );
}

export type ConnectorSequenceDisposition = "apply" | "duplicate" | "gap";

/**
 * Renderer-side sequence gate: apply in-order events, drop duplicates, and
 * treat anything ahead of the expected next sequence as a gap requiring a
 * full resync (event payloads are state snapshots, so a resync is always
 * sufficient — no per-event replay is needed).
 */
export function classifyConnectorSequence(
  lastSeq: number,
  incomingSeq: number,
): ConnectorSequenceDisposition {
  if (incomingSeq <= lastSeq) return "duplicate";
  if (incomingSeq === lastSeq + 1) return "apply";
  return "gap";
}

export function isConnectorEventEnvelope(value: unknown): value is ConnectorEventEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { seq?: unknown; kind?: unknown };
  return (
    typeof candidate.seq === "number" &&
    Number.isInteger(candidate.seq) &&
    candidate.seq > 0 &&
    typeof candidate.kind === "string" &&
    ["status", "config", "access", "shell", "thread", "terminal", "log"].includes(candidate.kind)
  );
}

export function isConnectorSyncReply(value: unknown): value is ConnectorSyncReply {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { seq?: unknown; snapshot?: unknown };
  if (typeof candidate.seq !== "number" || !Number.isInteger(candidate.seq) || candidate.seq < 0) {
    return false;
  }
  if (typeof candidate.snapshot !== "object" || candidate.snapshot === null) return false;
  const snapshot = candidate.snapshot as {
    status?: unknown;
    shell?: unknown;
    threads?: unknown;
  };
  return (
    typeof snapshot.status === "object" &&
    snapshot.status !== null &&
    typeof snapshot.shell === "object" &&
    snapshot.shell !== null &&
    typeof snapshot.threads === "object" &&
    snapshot.threads !== null
  );
}
