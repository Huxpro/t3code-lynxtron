// Contract-shaped values for the upstream state tests, decoded from the wire
// form the server sends so defaults and brands are the real ones.
import {
  AVAILABLE_CONNECTION_STATE,
  type SupervisorConnectionState,
} from "@t3tools/client-runtime/connection";
import type { EnvironmentShellState } from "@t3tools/client-runtime/state/shell";
import type { EnvironmentThreadState } from "@t3tools/client-runtime/state/threads";
import {
  DEFAULT_SERVER_SETTINGS,
  EnvironmentId,
  OrchestrationShellSnapshot,
  OrchestrationThread,
  type ServerConfig,
  ServerProvider,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { AsyncResult } from "effect/unstable/reactivity";

import type { ChatMessage } from "../bridge.ts";

const decodeShellSnapshot = Schema.decodeUnknownSync(OrchestrationShellSnapshot);
const decodeThread = Schema.decodeUnknownSync(OrchestrationThread);
const decodeProvider = Schema.decodeUnknownSync(ServerProvider);

export interface WireThread {
  readonly id: string;
  readonly title?: string;
  readonly latestUserMessageAt?: string;
  readonly updatedAt?: string;
  readonly archivedAt?: string | null;
  readonly settledOverride?: "settled" | "active" | null;
  readonly settledAt?: string | null;
}

function wireThread(thread: WireThread) {
  const updatedAt = thread.updatedAt ?? "2026-10-01T00:00:00.000Z";
  return {
    id: thread.id,
    projectId: "project-1",
    title: thread.title ?? `Thread ${thread.id}`,
    modelSelection: { instanceId: "codex", model: "gpt-5" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    latestTurn: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt,
    archivedAt: thread.archivedAt ?? null,
    settledOverride: thread.settledOverride ?? null,
    settledAt: thread.settledAt ?? null,
    session: null,
    latestUserMessageAt: thread.latestUserMessageAt ?? updatedAt,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
  };
}

export function shellSnapshot(
  threads: ReadonlyArray<WireThread>,
  projects: ReadonlyArray<{ readonly id: string; readonly title: string }> = [
    { id: "project-1", title: "T3 Code" },
  ],
): OrchestrationShellSnapshot {
  return decodeShellSnapshot({
    snapshotSequence: 7,
    projects: projects.map((project) => ({
      id: project.id,
      title: project.title,
      workspaceRoot: `/work/${project.id}`,
      defaultModelSelection: null,
      scripts: [],
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    })),
    threads: threads.map(wireThread),
    updatedAt: "2026-10-09T00:00:00.000Z",
  });
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

export function shellState(
  status: EnvironmentShellState["status"],
  snapshot: OrchestrationShellSnapshot | null,
): EnvironmentShellState {
  return { status, snapshot: Option.fromNullOr(snapshot), error: Option.none() };
}

export interface WireMessage {
  readonly id: string;
  readonly role?: "user" | "assistant" | "system" | "reasoning";
  readonly text?: string;
  readonly turnId?: string | null;
  readonly streaming?: boolean;
}

export interface WireThreadDetail {
  readonly id?: string;
  readonly messages?: ReadonlyArray<WireMessage>;
  readonly activities?: ReadonlyArray<{
    readonly id: string;
    readonly kind?: string;
    readonly payload?: unknown;
  }>;
  readonly session?: {
    readonly status:
      | "idle"
      | "starting"
      | "running"
      | "ready"
      | "interrupted"
      | "stopped"
      | "error";
    readonly activeTurnId?: string | null;
    readonly lastError?: string | null;
  } | null;
}

/** A thread with its detail, as the server's thread snapshot carries it. */
export function threadDetail(detail: WireThreadDetail = {}): OrchestrationThread {
  const id = detail.id ?? "thread-1";
  return decodeThread({
    ...wireThread({ id }),
    deletedAt: null,
    messages: (detail.messages ?? []).map((message) => ({
      id: message.id,
      role: message.role ?? "assistant",
      text: message.text ?? `Text of ${message.id}`,
      turnId: message.turnId ?? null,
      streaming: message.streaming ?? false,
      createdAt: "2026-10-09T00:00:00.000Z",
      updatedAt: "2026-10-09T00:00:00.000Z",
    })),
    proposedPlans: [],
    activities: (detail.activities ?? []).map((activity) => ({
      id: activity.id,
      tone: "tool",
      kind: activity.kind ?? "tool.completed",
      summary: `Summary of ${activity.id}`,
      payload: activity.payload ?? {},
      turnId: null,
      createdAt: "2026-10-09T00:00:00.000Z",
    })),
    checkpoints: [],
    session:
      detail.session == null
        ? null
        : {
            threadId: id,
            status: detail.session.status,
            providerName: "codex",
            runtimeMode: "full-access",
            activeTurnId: detail.session.activeTurnId ?? null,
            lastError: detail.session.lastError ?? null,
            updatedAt: "2026-10-09T00:00:00.000Z",
          },
  });
}

export function threadState(
  status: EnvironmentThreadState["status"],
  thread: OrchestrationThread | null,
  page: { readonly hasMore: boolean; readonly loadingOlder?: boolean } | null = null,
): EnvironmentThreadState {
  return {
    status,
    data: Option.fromNullOr(thread),
    error: Option.none(),
    page:
      page === null
        ? Option.none()
        : Option.some({
            beforeCursor: page.hasMore ? "cursor-1" : null,
            hasMore: page.hasMore,
            loadingOlder: page.loadingOlder ?? false,
          }),
  };
}

/** A thread's messages as the Lynx client's state holds them. */
export function clientMessages(thread: OrchestrationThread): ReadonlyArray<ChatMessage> {
  return thread.messages.filter(
    (message): message is typeof message & ChatMessage => message.role !== "reasoning",
  );
}
