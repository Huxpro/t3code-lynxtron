// Contract-shaped values for the upstream state tests: the shell and thread
// values upstream's atoms hold, and the server values decoded from wire form.
import {
  AVAILABLE_CONNECTION_STATE,
  PrimaryConnectionTarget,
  type SupervisorConnectionState,
} from "@t3tools/client-runtime/connection";
import type { EnvironmentCatalogState } from "@t3tools/client-runtime/state/connections";
import type { EnvironmentShellState } from "@t3tools/client-runtime/state/shell";
import {
  applyTerminalAttachStreamEvent,
  EMPTY_TERMINAL_BUFFER_STATE,
  type TerminalBufferState,
} from "@t3tools/client-runtime/state/terminal";
import {
  EMPTY_THREAD_HISTORY_META,
  type EnvironmentThreadState,
} from "@t3tools/client-runtime/state/threads";
import {
  DEFAULT_SERVER_SETTINGS,
  EnvironmentId,
  MessageId,
  type OrchestrationV2ArchivedShellSnapshot,
  type OrchestrationV2ShellSnapshot,
  type OrchestrationV2ThreadProjection,
  type OrchestrationV2ThreadShell,
  type OrchestrationV2TurnItem,
  ProjectId,
  ProviderInstanceId,
  RunId,
  ThreadId,
  TurnItemId,
  type ServerConfig,
  ServerProvider,
  type TerminalAttachStreamEvent,
  TerminalSessionSnapshot,
  TerminalSummary,
  type VcsStatusResult,
  VcsStatusStreamEvent,
} from "@t3tools/contracts";
import { applyGitStatusStreamEvent } from "@t3tools/shared/git";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { AsyncResult } from "effect/unstable/reactivity";

import { projectThread, projectThreadShell } from "../../shared/orchestrationProjection.ts";
import type { ChatMessage } from "../bridge.ts";

const decodeTerminalSnapshot = Schema.decodeUnknownSync(TerminalSessionSnapshot);
const decodeTerminalSummary = Schema.decodeUnknownSync(TerminalSummary);
const decodeVcsStatusEvent = Schema.decodeUnknownSync(VcsStatusStreamEvent);
const decodeProvider = Schema.decodeUnknownSync(ServerProvider);

export interface WireThread {
  readonly id: string;
  readonly title?: string;
  readonly modelSelection?: { readonly instanceId: string; readonly model: string };
  /** Null for a thread nobody has written in. */
  readonly latestUserMessageAt?: string | null;
  readonly updatedAt?: string;
  readonly archivedAt?: string | null;
  readonly settledOverride?: "settled" | "active" | null;
  readonly settledAt?: string | null;
}

const utc = (value: string) => DateTime.makeUnsafe(value);
const utcOrNull = (value: string | null | undefined) =>
  value == null ? null : DateTime.makeUnsafe(value);

const CREATED_AT = "2026-10-01T00:00:00.000Z";

function wireModelSelection(thread: WireThread) {
  const selection = thread.modelSelection ?? { instanceId: "codex", model: "gpt-5" };
  return { instanceId: ProviderInstanceId.make(selection.instanceId), model: selection.model };
}

function wireThread(thread: WireThread): OrchestrationV2ThreadShell {
  const id = ThreadId.make(thread.id);
  const updatedAt = thread.updatedAt ?? CREATED_AT;
  const modelSelection = wireModelSelection(thread);
  return {
    id,
    projectId: ProjectId.make("project-1"),
    title: thread.title ?? `Thread ${thread.id}`,
    providerInstanceId: modelSelection.instanceId,
    modelSelection,
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    activeProviderThreadId: null,
    lineage: { rootThreadId: id, parentThreadId: null, relationshipToParent: null },
    forkedFrom: null,
    createdBy: "user",
    creationSource: "web",
    latestRunId: null,
    activeRunId: null,
    status: "idle",
    pendingRuntimeRequest: null,
    latestVisibleMessage: null,
    latestUserMessageAt: utcOrNull(
      thread.latestUserMessageAt === undefined ? updatedAt : thread.latestUserMessageAt,
    ),
    hasActionableProposedPlan: false,
    pendingBackgroundTasks: [],
    providerInstanceHistory: [],
    itemCount: 0,
    visibleItemCount: 0,
    createdAt: utc(CREATED_AT),
    updatedAt: utc(updatedAt),
    archivedAt: utcOrNull(thread.archivedAt),
    settledOverride: thread.settledOverride ?? null,
    settledAt: utcOrNull(thread.settledAt),
    deletedAt: null,
  };
}

/** The shell as upstream's shell stream holds it. */
export function shellSnapshot(
  threads: ReadonlyArray<WireThread>,
  projects: ReadonlyArray<{ readonly id: string; readonly title: string }> = [
    { id: "project-1", title: "T3 Code" },
  ],
): OrchestrationV2ShellSnapshot {
  return {
    schemaVersion: 1,
    snapshotSequence: 7,
    projects: projects.map((project) => ({
      id: ProjectId.make(project.id),
      title: project.title,
      workspaceRoot: `/work/${project.id}`,
      defaultModelSelection: null,
      scripts: [],
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    })),
    threads: threads.map(wireThread),
    archivedThreads: [],
  };
}

/** The archived threads as upstream's archived snapshot holds them. */
export function archivedSnapshot(
  threads: ReadonlyArray<WireThread>,
): OrchestrationV2ArchivedShellSnapshot {
  const { schemaVersion, snapshotSequence, projects } = shellSnapshot([]);
  return { schemaVersion, snapshotSequence, projects, threads: threads.map(wireThread) };
}

/** A shell as the Lynx client's state holds it. */
export function clientShell(threads: ReadonlyArray<WireThread>) {
  return { threads: clientThreads(threads) };
}

/** The threads of a shell as the Lynx client's state holds them. */
export function clientThreads(threads: ReadonlyArray<WireThread>) {
  return threads.map((thread) => projectThreadShell(wireThread(thread)));
}

export function provider(
  instanceId: string,
  overrides: { readonly enabled?: boolean; readonly status?: ServerProvider["status"] } = {},
): ServerProvider {
  return decodeProvider({
    instanceId,
    driver: instanceId,
    enabled: overrides.enabled ?? true,
    installed: true,
    version: "1.0.0",
    status: overrides.status ?? "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-10-09T00:00:00.000Z",
    models: [],
  });
}

export function serverConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    environment: {
      environmentId: EnvironmentId.make("environment-1"),
      label: "Local",
      platform: { os: "darwin", arch: "arm64" },
      serverVersion: "0.0.0-test",
      capabilities: { repositoryIdentity: true },
    },
    auth: {
      policy: "loopback-browser",
      bootstrapMethods: ["one-time-token"],
      sessionMethods: ["browser-session-cookie"],
      sessionCookieName: "t3_test_session",
    },
    cwd: "/work",
    keybindingsConfigPath: "/work/keybindings.json",
    keybindings: [],
    issues: [],
    providers: [provider("codex"), provider("claudeAgent")],
    availableEditors: ["cursor", "vscode"],
    observability: {
      logsDirectoryPath: "/work/logs",
      localTracingEnabled: false,
      otlpTracesEnabled: false,
      otlpLogsEnabled: false,
      otlpMetricsEnabled: false,
    },
    settings: DEFAULT_SERVER_SETTINGS,
    ...overrides,
  };
}

export function connection(phase: SupervisorConnectionState["phase"]) {
  return AsyncResult.success({ ...AVAILABLE_CONNECTION_STATE, phase });
}

/** A catalog with the primary environment registered at `httpBaseUrl`. */
export function catalogAt(httpBaseUrl: string) {
  const environmentId = EnvironmentId.make("environment-local");
  const catalog: EnvironmentCatalogState = {
    isReady: true,
    entries: new Map([
      [
        environmentId,
        {
          target: new PrimaryConnectionTarget({
            environmentId,
            label: "Local",
            httpBaseUrl,
            wsBaseUrl: httpBaseUrl.replace("http", "ws"),
          }),
          profile: Option.none(),
          enabled: true,
        },
      ],
    ]),
  };
  return AsyncResult.success(catalog);
}

export function shellState(
  status: EnvironmentShellState["status"],
  snapshot: OrchestrationV2ShellSnapshot | null,
): EnvironmentShellState {
  return { status, snapshot: Option.fromNullOr(snapshot), error: Option.none() };
}

export interface WireMessage {
  readonly id: string;
  readonly role?: "user" | "assistant" | "reasoning";
  readonly text?: string;
  readonly streaming?: boolean;
}

export interface WireThreadDetail {
  readonly id?: string;
  readonly messages?: ReadonlyArray<WireMessage>;
  /** The run that is executing, if one is. */
  readonly runningRunId?: string;
}

const DETAIL_AT = "2026-10-09T00:00:00.000Z";

/** A thread with its detail, as upstream's thread state holds it. */
export function threadDetail(detail: WireThreadDetail = {}): OrchestrationV2ThreadProjection {
  const shell = wireThread({ id: detail.id ?? "thread-1" });
  const runId = detail.runningRunId === undefined ? null : RunId.make(detail.runningRunId);
  const turnItems = (detail.messages ?? []).map((message, ordinal): OrchestrationV2TurnItem => {
    const base = {
      id: TurnItemId.make(`item-${message.id}`),
      threadId: shell.id,
      runId,
      nodeId: null,
      providerThreadId: null,
      providerTurnId: null,
      nativeItemRef: null,
      parentItemId: null,
      ordinal,
      status: "completed" as const,
      title: null,
      startedAt: utc(DETAIL_AT),
      completedAt: utc(DETAIL_AT),
      updatedAt: utc(DETAIL_AT),
    };
    const text = message.text ?? `Text of ${message.id}`;
    const role = message.role ?? "assistant";
    if (role === "user") {
      return {
        ...base,
        type: "user_message",
        createdBy: "user",
        creationSource: "web",
        messageId: MessageId.make(message.id),
        inputIntent: "turn_start",
        text,
        attachments: [],
      };
    }
    if (role === "reasoning") {
      return { ...base, type: "reasoning", text, streaming: message.streaming ?? false };
    }
    return {
      ...base,
      type: "assistant_message",
      messageId: MessageId.make(message.id),
      text,
      streaming: message.streaming ?? false,
    };
  });
  const firstUserMessage = turnItems.find((item) => item.type === "user_message");
  return {
    thread: {
      id: shell.id,
      projectId: shell.projectId,
      title: shell.title,
      providerInstanceId: shell.providerInstanceId,
      modelSelection: shell.modelSelection,
      runtimeMode: shell.runtimeMode,
      interactionMode: shell.interactionMode,
      branch: null,
      worktreePath: null,
      activeProviderThreadId: null,
      lineage: shell.lineage,
      forkedFrom: null,
      createdBy: "user",
      creationSource: "web",
      createdAt: shell.createdAt,
      updatedAt: shell.updatedAt,
      archivedAt: null,
      settledOverride: null,
      settledAt: null,
      lastVisitedAt: null,
      deletedAt: null,
    },
    runs:
      runId === null
        ? []
        : [
            {
              id: runId,
              threadId: shell.id,
              ordinal: 1,
              providerInstanceId: shell.providerInstanceId,
              modelSelection: shell.modelSelection,
              providerThreadId: null,
              userMessageId:
                firstUserMessage?.type === "user_message"
                  ? firstUserMessage.messageId
                  : MessageId.make("message-0"),
              rootNodeId: null,
              activeAttemptId: null,
              status: "running",
              requestedAt: utc(DETAIL_AT),
              startedAt: utc(DETAIL_AT),
              completedAt: null,
              checkpointId: null,
              contextHandoffId: null,
            },
          ],
    attempts: [],
    nodes: [],
    subagents: [],
    providerSessions: [],
    providerThreads: [],
    providerTurns: [],
    runtimeRequests: [],
    messages: [],
    plans: [],
    turnItems,
    checkpointScopes: [],
    checkpoints: [],
    contextHandoffs: [],
    contextTransfers: [],
    visibleTurnItems: turnItems.map((item, position) => ({
      position,
      visibility: "local" as const,
      sourceThreadId: shell.id,
      sourceItemId: item.id,
      item,
    })),
    updatedAt: utc(DETAIL_AT),
  };
}

export function threadState(
  status: EnvironmentThreadState["status"],
  thread: OrchestrationV2ThreadProjection | null,
  history: {
    readonly hasMore: boolean;
    readonly loading?: boolean;
    readonly error?: string;
  } | null = null,
): EnvironmentThreadState {
  return {
    status,
    data: Option.fromNullOr(thread),
    error: Option.none(),
    history:
      history === null
        ? EMPTY_THREAD_HISTORY_META
        : {
            ...EMPTY_THREAD_HISTORY_META,
            historyCursor: history.hasMore ? "cursor-1" : null,
            hasMoreHistory: history.hasMore,
            loading: history.loading ?? false,
            error: history.error ?? null,
          },
  };
}

/** A thread's messages as the Lynx client's state holds them. */
export function clientMessages(
  thread: OrchestrationV2ThreadProjection,
): ReadonlyArray<ChatMessage> {
  return projectThread(thread).messages.filter(
    (message): message is typeof message & ChatMessage => message.role !== "reasoning",
  );
}

export interface WireTerminal {
  readonly terminalId: string;
  readonly threadId?: string;
  readonly cwd?: string;
  readonly status?: "starting" | "running" | "exited" | "error";
  /** The history in the attach stream's first snapshot. */
  readonly history?: string;
  /** Output chunks that arrived after the snapshot. */
  readonly output?: ReadonlyArray<string>;
  /** Other attach events that arrived after the output. */
  readonly then?: ReadonlyArray<"exited" | "closed" | "cleared">;
}

/**
 * A terminal as the server lists it, with the buffer upstream's attach stream
 * reduces from the server's events. `attached: false` is a terminal whose
 * stream has not delivered its snapshot yet.
 */
export function terminal(
  wire: WireTerminal,
  attached = true,
): { readonly summary: TerminalSummary; readonly buffer: TerminalBufferState | null } {
  const base = {
    threadId: wire.threadId ?? "thread-1",
    terminalId: wire.terminalId,
    cwd: wire.cwd ?? "/work/project-1",
    worktreePath: null,
    status: wire.status ?? "running",
    pid: 4242,
    exitCode: null,
    exitSignal: null,
    label: "zsh",
    updatedAt: "2026-10-09T00:00:00.000Z",
  };
  const summary = decodeTerminalSummary({ ...base, hasRunningSubprocess: false });
  if (!attached) return { summary, buffer: null };
  const target = { threadId: base.threadId, terminalId: base.terminalId };
  const events: ReadonlyArray<TerminalAttachStreamEvent> = [
    {
      type: "snapshot",
      snapshot: decodeTerminalSnapshot({ ...base, history: wire.history ?? "" }),
    },
    ...(wire.output ?? []).map((data) => ({ ...target, type: "output" as const, data })),
    ...(wire.then ?? []).map((type) =>
      type === "exited" ? { ...target, type, exitCode: 0, exitSignal: null } : { ...target, type },
    ),
  ];
  return {
    summary,
    buffer: events.reduce(
      (buffer, event) => applyTerminalAttachStreamEvent(buffer, event),
      EMPTY_TERMINAL_BUFFER_STATE,
    ),
  };
}

export interface WireVcsStatus {
  readonly refName?: string;
  readonly files?: ReadonlyArray<string>;
  readonly aheadCount?: number;
  readonly pr?: { readonly number: number; readonly title: string } | null;
}

/** A status as upstream's stream reduces it from the server's snapshot event. */
export function vcsStatus(wire: WireVcsStatus = {}): VcsStatusResult {
  const files = (wire.files ?? []).map((path) => ({ path, insertions: 2, deletions: 1 }));
  const refName = wire.refName ?? "main";
  return applyGitStatusStreamEvent(
    null,
    decodeVcsStatusEvent({
      _tag: "snapshot",
      local: {
        isRepo: true,
        hasPrimaryRemote: true,
        isDefaultRef: refName === "main",
        refName,
        hasWorkingTreeChanges: files.length > 0,
        workingTree: { files, insertions: files.length * 2, deletions: files.length },
      },
      remote: {
        hasUpstream: true,
        aheadCount: wire.aheadCount ?? 0,
        behindCount: 0,
        pr:
          wire.pr == null
            ? null
            : {
                ...wire.pr,
                url: `https://example.test/pr/${wire.pr.number}`,
                baseRef: "main",
                headRef: refName,
                state: "open",
              },
      },
    }),
  );
}
