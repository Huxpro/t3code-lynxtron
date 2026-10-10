// The connector commands the renderer can send to the server itself, through
// upstream's connection, instead of asking the main process to send them. It
// is used only when the host launches with `T3_LYNXTRON_UPSTREAM_STATE=1`, and
// only while upstream is connected: otherwise every command goes to the main
// connector as before.
//
// Each command here builds the request the connector builds for the same
// call. What reaches the server is described by `UpstreamCommandPort`, so the
// mapping can be exercised without a connection.
import type {
  EnvironmentRpcInput,
  EnvironmentRpcSuccess,
  EnvironmentUnaryRpcTag,
} from "@t3tools/client-runtime/rpc";
import {
  type ClientOrchestrationCommand,
  CommandId,
  type DispatchResult,
  type GitRunStackedActionInput,
  MessageId,
  type ModelSelection,
  ORCHESTRATION_WS_METHODS,
  type OrchestrationThreadShell,
  ProjectId,
  type ServerConfig,
  ThreadId,
  WS_METHODS,
} from "@t3tools/contracts";
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

/**
 * The commands sent through upstream. The rest stay with the main connector:
 * `reconnect` restarts the server it owns; the pairing and session commands
 * are HTTP calls made with the bearer it holds; `selectThread`, `openTerminal`
 * and `closeTerminal` manage its own subscriptions, which are what the client
 * falls back to; `createProject` resolves the path with Node; and
 * `createThread` uses its remembered project and model.
 */
export const UPSTREAM_COMMAND_NAMES = [
  "createAssetUrl",
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
  "writeTerminal",
  "resizeTerminal",
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
  /** One orchestration command. Commands for the same thread are sent in order. */
  readonly dispatch: (command: ClientOrchestrationCommand) => Promise<DispatchResult>;
  /** Runs a stacked git action to the end of its progress stream. */
  readonly gitAction: (input: GitRunStackedActionInput) => Promise<GitActionOutcome>;
}

/** What the commands read from upstream's state and from this client. */
export interface UpstreamCommandContext {
  /** The server's threads, archived ones included, as upstream holds them. */
  readonly threads: () => ReadonlyArray<OrchestrationThreadShell>;
  readonly config: () => ServerConfig | null;
  /** The primary environment's HTTP address, which asset URLs are relative to. */
  readonly httpBaseUrl: () => string | null;
  /**
   * Selections shown until the server confirms them. A command adds its
   * selection before it is sent; the shell source removes it once confirmed.
   */
  readonly pendingModelSelections: Map<string, ModelSelection>;
  /** The main connector, which still follows threads and remembers the model. */
  readonly connector: Partial<Pick<T3ConnectorCommandBridge, "selectThread" | "setModelSelection">>;
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
  const commandId = () => CommandId.make(context.newId());
  const send = async (command: ClientOrchestrationCommand): Promise<void> => {
    await port.dispatch(command);
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
        commandId: commandId(),
        messageId: MessageId.make(context.newId()),
        createdAt: context.now(),
      });
      if (!command) {
        throw new Error(`thread ${input.threadId} is not present in the canonical snapshot`);
      }
      await port.dispatch(command);
      if (!thread && bootstrap?.createThread) {
        void context.connector.selectThread?.(input.threadId)?.catch(() => undefined);
      }
    },

    interrupt: (input) =>
      send({
        type: "thread.turn.interrupt",
        commandId: commandId(),
        threadId: ThreadId.make(input.threadId),
        ...(input.turnId ? { turnId: input.turnId } : {}),
        createdAt: context.now(),
      }),

    revertCheckpoint: (input) =>
      send({
        type: "thread.checkpoint.revert",
        commandId: commandId(),
        threadId: ThreadId.make(input.threadId),
        turnCount: input.turnCount,
        createdAt: context.now(),
      }),

    respondToApproval: (input) =>
      send({
        type: "thread.approval.respond",
        commandId: commandId(),
        threadId: ThreadId.make(input.threadId),
        requestId: input.requestId,
        decision: input.decision,
        createdAt: context.now(),
      }),

    respondToUserInput: (input) =>
      send({
        type: "thread.user-input.respond",
        commandId: commandId(),
        threadId: ThreadId.make(input.threadId),
        requestId: input.requestId,
        answers: input.answers,
        createdAt: context.now(),
      }),

    async setModelSelection(input) {
      // The connector keeps the last selection for the projects and threads
      // it still creates; telling it without a thread sends nothing.
      const remembered = context.connector.setModelSelection?.({ selection: input.selection });
      const threadId = input.threadId;
      if (!threadId) {
        await remembered;
        return;
      }
      void remembered?.catch(() => undefined);
      context.pendingModelSelections.set(threadId, input.selection);
      try {
        await port.dispatch({
          type: "thread.meta.update",
          commandId: commandId(),
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
      send({
        type: "thread.runtime-mode.set",
        commandId: commandId(),
        threadId: ThreadId.make(input.threadId),
        runtimeMode: input.runtimeMode,
        createdAt: context.now(),
      }),

    setThreadInteractionMode: (input) =>
      send({
        type: "thread.interaction-mode.set",
        commandId: commandId(),
        threadId: ThreadId.make(input.threadId),
        interactionMode: input.interactionMode,
        createdAt: context.now(),
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
      await port.dispatch({
        type: "thread.delete",
        commandId: commandId(),
        threadId: ThreadId.make(input.threadId),
      });
      context.pendingModelSelections.delete(input.threadId);
    },

    archiveThread: (input) =>
      send({
        type: input.unarchive ? "thread.unarchive" : "thread.archive",
        commandId: commandId(),
        threadId: ThreadId.make(input.threadId),
      }),

    settleThread: (input) =>
      send({
        type: "thread.settle",
        commandId: commandId(),
        threadId: ThreadId.make(input.threadId),
      }),

    unsettleThread: (input) =>
      send({
        type: "thread.unsettle",
        commandId: commandId(),
        threadId: ThreadId.make(input.threadId),
        reason: "user",
      }),

    pinThread: (input) =>
      send({
        type: "thread.pin",
        commandId: commandId(),
        threadId: ThreadId.make(input.threadId),
        ...(input.orderKey ? { orderKey: input.orderKey } : {}),
      }),

    unpinThread: (input) =>
      send({
        type: "thread.unpin",
        commandId: commandId(),
        threadId: ThreadId.make(input.threadId),
      }),

    async renameThread(input) {
      const title = input.title.trim();
      if (!title) return;
      await send({
        type: "thread.meta.update",
        commandId: commandId(),
        threadId: ThreadId.make(input.threadId),
        title,
      });
    },

    regenerateThreadTitle: (input) =>
      send({
        type: "thread.meta.update",
        commandId: commandId(),
        threadId: ThreadId.make(input.threadId),
        regenerateTitle: true,
      }),

    snoozeThread: (input) =>
      send({
        type: "thread.snooze",
        commandId: commandId(),
        threadId: ThreadId.make(input.threadId),
        snoozedUntil: input.snoozedUntil,
      }),

    unsnoozeThread: (input) =>
      send({
        type: "thread.unsnooze",
        commandId: commandId(),
        threadId: ThreadId.make(input.threadId),
        reason: "user",
      }),

    async updateProject(input) {
      const title = input.title.trim();
      if (!title) return;
      await send({
        type: "project.meta.update",
        commandId: commandId(),
        projectId: ProjectId.make(input.projectId),
        title,
      });
    },

    deleteProject: (input) =>
      send({
        type: "project.delete",
        commandId: commandId(),
        projectId: ProjectId.make(input.projectId),
        ...(input.force === true ? { force: true } : {}),
      }),

    updateProjectScripts: (input) =>
      send({
        type: "project.meta.update",
        commandId: commandId(),
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

    async writeTerminal(input) {
      await port.request(WS_METHODS.terminalWrite, input);
    },

    async resizeTerminal(input) {
      await port.request(WS_METHODS.terminalResize, input);
    },
  };
}

type Command = (input?: unknown) => Promise<unknown>;

/**
 * The command bridge the renderer calls: each command `upstream` implements
 * goes to it while `useUpstream()` holds, asked at the moment of the call,
 * and to `connector` otherwise. Every other command is the connector's own.
 */
export function routeCommandBridge<Bridge extends Partial<T3ConnectorCommandBridge>>(input: {
  readonly connector: Bridge;
  readonly upstream: Partial<UpstreamCommandBridge>;
  readonly useUpstream: () => boolean;
}): Bridge {
  const connector = input.connector as Record<string, Command | undefined>;
  const upstream = input.upstream as Record<string, Command | undefined>;
  const routed: Record<string, Command | undefined> = { ...connector };
  for (const name of UPSTREAM_COMMAND_NAMES) {
    const viaConnector = connector[name];
    const viaUpstream = upstream[name];
    if (!viaConnector || !viaUpstream) continue;
    routed[name] = (params) => (input.useUpstream() ? viaUpstream(params) : viaConnector(params));
  }
  return routed as Bridge;
}
