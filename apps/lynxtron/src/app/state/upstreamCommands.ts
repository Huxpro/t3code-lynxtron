// The client's commands as the renderer sends them to the server itself,
// through upstream's connection. While upstream is not connected a command
// fails, as it does in upstream's own clients.
//
// An orchestration command is sent with upstream's own operation for it, the
// one Web and mobile use, so its shape, id and timestamp are upstream's. What
// reaches the server is described by `UpstreamCommandPort`, so the mapping
// can be exercised without a connection.
import type {
  EnvironmentRpcInput,
  EnvironmentRpcSuccess,
  EnvironmentUnaryRpcTag,
} from "@t3tools/client-runtime/rpc";
import { buildProjectCreateCommand } from "@t3tools/client-runtime/operations/projects";
import { findProjectByPath } from "@t3tools/client-runtime/state/projects";
import {
  type AuthClientSessionRevokeResult,
  type AuthCreatePairingCredentialInput,
  type AuthOtherClientSessionsRevokeResult,
  type AuthPairingCredentialResult,
  type AuthPairingLinkRevokeResult,
  type AuthRevokeClientSessionInput,
  type AuthRevokePairingLinkInput,
  AuthSessionId,
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  type DispatchResult,
  type GitRunStackedActionInput,
  MessageId,
  type ModelSelection,
  ORCHESTRATION_WS_METHODS,
  type OrchestrationProjectShell,
  type OrchestrationThreadShell,
  ProjectId,
  type ServerConfig,
  type TerminalCloseInput,
  type TerminalOpenInput,
  type TerminalSessionSnapshot,
  ThreadId,
  WS_METHODS,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { deriveProviderModelSelectionProjection } from "@t3tools/lynx-logic/modelPicker";
import { buildProviderInstanceEnabledPatch } from "@t3tools/lynx-logic/providerSettings";
import { buildThreadTurnStartCommand } from "@t3tools/lynx-logic/threadDispatch";

import {
  type ConnectorCommandName,
  decodeConnectorCommandParams,
  projectRepoContext,
  resolveConnectorAssetUrl,
} from "../../shared/connectorProtocol.ts";
import { type GitActionOutcome, resolveGitActionOutcome } from "../../shared/gitActionOutcome.ts";
import { materializeTurnBootstrap } from "../../shared/turnBootstrap.ts";
import type { T3ConnectorCommandBridge } from "../bridge.ts";
import type { UpstreamOperationInputs, UpstreamOperationName } from "./upstreamOperations.ts";

/**
 * The commands sent through upstream: every connector command but
 * `reconnect`, which restarts the server the main process owns.
 */
export const UPSTREAM_COMMAND_NAMES = [
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
  "pinThread",
  "unpinThread",
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
] as const satisfies ReadonlyArray<ConnectorCommandName>;

export type UpstreamCommandName = (typeof UPSTREAM_COMMAND_NAMES)[number];
export type UpstreamCommandBridge = Pick<T3ConnectorCommandBridge, UpstreamCommandName>;

/** How a command reaches the primary environment's server. */
export interface UpstreamCommandPort {
  /** One unary RPC on upstream's session. Rejects with the server's error. */
  readonly request: <Tag extends EnvironmentUnaryRpcTag>(
    tag: Tag,
    input: EnvironmentRpcInput<Tag>,
  ) => Promise<EnvironmentRpcSuccess<Tag>>;
  /**
   * One of upstream's orchestration operations, which builds the command and
   * sends it. Commands for the same thread are sent in order.
   */
  readonly operation: <Name extends UpstreamOperationName>(
    name: Name,
    input: UpstreamOperationInputs[Name],
  ) => Promise<DispatchResult>;
  /** Runs a stacked git action to the end of its progress stream. */
  readonly gitAction: (input: GitRunStackedActionInput) => Promise<GitActionOutcome>;
  /**
   * Upstream's terminal lifecycle commands, which it runs one at a time per
   * thread. Opening starts the process when it is not running; the session is
   * then read through upstream's attach, as in Web's terminal drawer.
   */
  readonly terminal: {
    readonly open: (input: TerminalOpenInput) => Promise<TerminalSessionSnapshot>;
    readonly close: (input: TerminalCloseInput) => Promise<void>;
  };
  /**
   * The environment's HTTP auth endpoints, called with the bearer upstream's
   * `PrimaryEnvironmentAuth` supplies.
   */
  readonly auth: {
    readonly createPairingCredential: (
      input: AuthCreatePairingCredentialInput,
    ) => Promise<AuthPairingCredentialResult>;
    readonly revokePairingLink: (
      input: AuthRevokePairingLinkInput,
    ) => Promise<AuthPairingLinkRevokeResult>;
    readonly revokeClient: (
      input: AuthRevokeClientSessionInput,
    ) => Promise<AuthClientSessionRevokeResult>;
    readonly revokeOtherClients: () => Promise<AuthOtherClientSessionsRevokeResult>;
  };
}

/** What the commands read from upstream's state and from this client. */
export interface UpstreamCommandContext {
  /** The server's threads, archived ones included, as upstream holds them. */
  readonly threads: () => ReadonlyArray<OrchestrationThreadShell>;
  /** The server's projects, as upstream holds them. */
  readonly projects: () => ReadonlyArray<OrchestrationProjectShell>;
  readonly config: () => ServerConfig | null;
  /** The primary environment's HTTP address, which asset URLs are relative to. */
  readonly httpBaseUrl: () => string | null;
  /**
   * Selections shown until the server confirms them. A command adds its
   * selection before it is sent; the shell source removes it once confirmed.
   */
  readonly pendingModelSelections: Map<string, ModelSelection>;
  /** The model the client would start a new thread with. */
  readonly modelSelection: () => ModelSelection | undefined;
  /**
   * The absolute path a typed workspace root names on the host: `~` expanded
   * and a relative path resolved, which only Node can do.
   */
  readonly resolveWorkspacePath: (workspaceRoot: string) => string;
  /**
   * Called once the server has closed a terminal. Upstream stops listing a
   * closed terminal; the client still shows its session, which this ends.
   */
  readonly terminalClosed: (terminal: {
    readonly threadId: string;
    readonly terminalId: string;
  }) => void;
  /** An id for what the client names itself: a message, a project, a thread. */
  readonly newId: () => string;
  readonly randomHex: (byteLength: number) => string;
  readonly now: () => string;
}

function requireConfig(context: UpstreamCommandContext): ServerConfig {
  const config = context.config();
  if (!config) throw new Error("not connected");
  return config;
}

export function createUpstreamCommandBridge(
  port: UpstreamCommandPort,
  context: UpstreamCommandContext,
): UpstreamCommandBridge {
  const send = async <Name extends UpstreamOperationName>(
    name: Name,
    input: UpstreamOperationInputs[Name],
  ): Promise<void> => {
    await port.operation(name, input);
  };

  const updateServerSettings: UpstreamCommandBridge["updateServerSettings"] = async (input) => {
    requireConfig(context);
    const settings = await port.request(WS_METHODS.serverUpdateSettings, { patch: input.patch });
    const refreshed = await port.request(WS_METHODS.serverGetConfig, {});
    return { ...refreshed, settings };
  };

  return {
    async createAssetUrl(input) {
      const httpBaseUrl = context.httpBaseUrl();
      if (!httpBaseUrl) throw new Error("not connected");
      return resolveConnectorAssetUrl(
        httpBaseUrl,
        await port.request(WS_METHODS.assetsCreateUrl, input),
      );
    },

    // As mobile's add-project flow: an existing project for the path is
    // returned, and a new one is created with upstream's command for it.
    async createProject(input) {
      const workspaceRoot = context.resolveWorkspacePath(input.workspaceRoot);
      const existing = findProjectByPath(context.projects(), workspaceRoot);
      if (existing) return { projectId: existing.id };
      const command = buildProjectCreateCommand({
        commandId: CommandId.make(context.newId()),
        projectId: ProjectId.make(context.newId()),
        workspaceRoot,
        createdAt: context.now(),
      });
      await port.operation("createProject", command);
      return { projectId: command.projectId };
    },

    async createThread(input) {
      const projectId = input.projectId ?? context.projects()[0]?.id;
      if (!projectId) throw new Error("no project available");
      const modelSelection = context.modelSelection();
      if (!modelSelection) throw new Error("no model available");
      const threadId = ThreadId.make(context.newId());
      await port.operation("createThread", {
        threadId,
        projectId: ProjectId.make(projectId),
        title: input.title ?? "New thread",
        modelSelection,
        runtimeMode: DEFAULT_RUNTIME_MODE,
        interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
        branch: null,
        worktreePath: null,
      });
      return { threadId };
    },

    // Upstream follows the thread the client shows by itself; there is no
    // subscription to ask for.
    async selectThread() {},

    async sendPrompt(rawInput) {
      // A draft thread's branch and worktree arrive absent when unset; the
      // server expects them as null, as the connector's decoder supplies them.
      const input = decodeConnectorCommandParams("sendPrompt", rawInput) as typeof rawInput;
      const bootstrap = materializeTurnBootstrap(input.bootstrap, context.randomHex);
      const thread = context.threads().find((candidate) => candidate.id === input.threadId);
      const pendingModelSelection = context.pendingModelSelections.get(input.threadId);
      const command = buildThreadTurnStartCommand({
        threadId: ThreadId.make(input.threadId),
        text: input.text,
        ...(input.attachments ? { attachments: input.attachments } : {}),
        thread,
        ...(pendingModelSelection ? { pendingModelSelection } : {}),
        ...(bootstrap ? { bootstrap } : {}),
        planModeEnabled: input.planModeEnabled,
        commandId: CommandId.make(context.newId()),
        messageId: MessageId.make(context.newId()),
        createdAt: context.now(),
      });
      if (!command) {
        throw new Error(`thread ${input.threadId} is not present in the canonical snapshot`);
      }
      await port.operation("startThreadTurn", command);
    },

    interrupt: (input) =>
      send("interruptThreadTurn", {
        threadId: ThreadId.make(input.threadId),
        ...(input.turnId ? { turnId: input.turnId } : {}),
      }),

    revertCheckpoint: (input) =>
      send("revertThreadCheckpoint", {
        threadId: ThreadId.make(input.threadId),
        turnCount: input.turnCount,
      }),

    respondToApproval: (input) =>
      send("respondToThreadApproval", {
        threadId: ThreadId.make(input.threadId),
        requestId: input.requestId,
        decision: input.decision,
      }),

    respondToUserInput: (input) =>
      send("respondToThreadUserInput", {
        threadId: ThreadId.make(input.threadId),
        requestId: input.requestId,
        answers: input.answers,
      }),

    async setModelSelection(input) {
      // Without a thread there is nothing to tell the server: the client keeps
      // the selection a new thread starts with.
      const threadId = input.threadId;
      if (!threadId) return;
      context.pendingModelSelections.set(threadId, input.selection);
      try {
        await port.operation("updateThreadMetadata", {
          threadId: ThreadId.make(threadId),
          modelSelection: input.selection,
        });
      } catch (error) {
        if (context.pendingModelSelections.get(threadId) === input.selection) {
          context.pendingModelSelections.delete(threadId);
        }
        throw error;
      }
    },

    setThreadRuntimeMode: (input) =>
      send("setThreadRuntimeMode", {
        threadId: ThreadId.make(input.threadId),
        runtimeMode: input.runtimeMode,
      }),

    setThreadInteractionMode: (input) =>
      send("setThreadInteractionMode", {
        threadId: ThreadId.make(input.threadId),
        interactionMode: input.interactionMode,
      }),

    async refreshProviders(input) {
      const config = requireConfig(context);
      const result = await port.request(
        WS_METHODS.serverRefreshProviders,
        input?.instanceId ? { instanceId: input.instanceId } : {},
      );
      return { ...config, providers: result.providers };
    },

    async updateProvider(input) {
      const config = requireConfig(context);
      const result = await port.request(WS_METHODS.serverUpdateProvider, input);
      return { ...config, providers: result.providers };
    },

    async setProviderEnabled(input) {
      const config = requireConfig(context);
      const entry = deriveProviderModelSelectionProjection(config).entries.find(
        (candidate) => candidate.instanceId === input.instanceId,
      );
      if (!entry) throw new Error(`provider instance not found: ${input.instanceId}`);
      return updateServerSettings({
        patch: buildProviderInstanceEnabledPatch({
          settings: config.settings,
          entry,
          enabled: input.enabled,
        }),
      });
    },

    updateServerSettings,

    async deleteThread(input) {
      await port.operation("deleteThread", { threadId: ThreadId.make(input.threadId) });
      context.pendingModelSelections.delete(input.threadId);
    },

    archiveThread: (input) =>
      send(input.unarchive ? "unarchiveThread" : "archiveThread", {
        threadId: ThreadId.make(input.threadId),
      }),

    settleThread: (input) => send("settleThread", { threadId: ThreadId.make(input.threadId) }),

    unsettleThread: (input) =>
      send("unsettleThread", { threadId: ThreadId.make(input.threadId), reason: "user" }),

    pinThread: (input) =>
      send("pinThread", {
        threadId: ThreadId.make(input.threadId),
        ...(input.orderKey ? { orderKey: input.orderKey } : {}),
      }),

    unpinThread: (input) => send("unpinThread", { threadId: ThreadId.make(input.threadId) }),

    async renameThread(input) {
      const title = input.title.trim();
      if (!title) return;
      await send("updateThreadMetadata", { threadId: ThreadId.make(input.threadId), title });
    },

    regenerateThreadTitle: (input) =>
      send("updateThreadMetadata", {
        threadId: ThreadId.make(input.threadId),
        regenerateTitle: true,
      }),

    snoozeThread: (input) =>
      send("snoozeThread", {
        threadId: ThreadId.make(input.threadId),
        snoozedUntil: input.snoozedUntil,
      }),

    unsnoozeThread: (input) =>
      send("unsnoozeThread", { threadId: ThreadId.make(input.threadId), reason: "user" }),

    async updateProject(input) {
      const title = input.title.trim();
      if (!title) return;
      await send("updateProject", { projectId: ProjectId.make(input.projectId), title });
    },

    deleteProject: (input) =>
      send("deleteProject", {
        projectId: ProjectId.make(input.projectId),
        ...(input.force === true ? { force: true } : {}),
      }),

    updateProjectScripts: (input) =>
      send("updateProject", {
        projectId: ProjectId.make(input.projectId),
        scripts: [...input.scripts],
      }),

    upsertKeybinding: (input) => port.request(WS_METHODS.serverUpsertKeybinding, input),
    removeKeybinding: (input) => port.request(WS_METHODS.serverRemoveKeybinding, input),

    async openInEditor(input) {
      await port.request(WS_METHODS.shellOpenInEditor, input);
    },

    browseFilesystem: (input) => port.request(WS_METHODS.filesystemBrowse, input),
    listProjectEntries: (input) => port.request(WS_METHODS.projectsListEntries, { cwd: input.cwd }),
    searchProjectEntries: (input) => port.request(WS_METHODS.projectsSearchEntries, input),
    readProjectFile: (input) =>
      port.request(WS_METHODS.projectsReadFile, {
        cwd: input.cwd,
        relativePath: input.relativePath,
      }),
    writeProjectFile: (input) => port.request(WS_METHODS.projectsWriteFile, input),
    getTurnDiff: (input) => port.request(ORCHESTRATION_WS_METHODS.getTurnDiff, input),
    getDiffPreview: (input) => port.request(WS_METHODS.reviewGetDiffPreview, input),

    async readProjectBranch(input) {
      return projectRepoContext(await port.request(WS_METHODS.vcsRefreshStatus, input));
    },

    readVcsStatus: (input) => port.request(WS_METHODS.vcsRefreshStatus, input),

    async initializeRepository(input) {
      await port.request(WS_METHODS.vcsInit, input);
    },

    async runGitAction(input) {
      return resolveGitActionOutcome(await port.gitAction(input));
    },

    publishRepository: (input) => port.request(WS_METHODS.sourceControlPublishRepository, input),
    lookupRepository: (input) => port.request(WS_METHODS.sourceControlLookupRepository, input),
    cloneRepository: (input) => port.request(WS_METHODS.sourceControlCloneRepository, input),
    discoverSourceControl: () => port.request(WS_METHODS.serverDiscoverSourceControl, {}),

    async createPairingCredential(input) {
      const label = input?.label?.trim();
      const created = await port.auth.createPairingCredential(label ? { label } : {});
      return {
        id: created.id,
        credential: created.credential,
        ...(created.label === undefined ? {} : { label: created.label }),
        expiresAt: DateTime.formatIso(created.expiresAt),
      };
    },

    async revokePairingLink(input) {
      return (await port.auth.revokePairingLink({ id: input.id })).revoked;
    },

    async revokeClientSession(input) {
      const sessionId = AuthSessionId.make(input.sessionId);
      return (await port.auth.revokeClient({ sessionId })).revoked;
    },

    async revokeOtherClientSessions() {
      return (await port.auth.revokeOtherClients()).revokedCount;
    },

    openTerminal: (input) => port.terminal.open(input),

    async writeTerminal(input) {
      await port.request(WS_METHODS.terminalWrite, input);
    },

    async resizeTerminal(input) {
      await port.request(WS_METHODS.terminalResize, input);
    },

    async closeTerminal(input) {
      await port.terminal.close(input);
      if (input.terminalId) {
        context.terminalClosed({ threadId: input.threadId, terminalId: input.terminalId });
      }
    },
  };
}

type Command = (input?: unknown) => Promise<unknown>;
