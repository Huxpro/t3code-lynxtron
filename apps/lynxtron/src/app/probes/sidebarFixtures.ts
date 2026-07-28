import type {
  ProjectId,
  ProviderInstanceId,
  ServerConfig,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";

import type { T3ClientState } from "../state/t3Client";

const NOW = "2026-07-28T12:00:00.000Z";
const EARLIER = "2026-07-28T10:00:00.000Z";
const MODEL_SELECTION = {
  instanceId: "codex" as ProviderInstanceId,
  model: "gpt-5.6-sol",
} as const;

const projectId = "t3code" as ProjectId;

const defaultProject: T3ClientState["projects"][number] = {
  id: projectId,
  title: "t3code",
  workspaceRoot: "/Users/bytedance/github/t3code",
  repositoryIdentity: null,
  defaultModelSelection: MODEL_SELECTION,
  scripts: [],
  createdAt: EARLIER,
  updatedAt: NOW,
};

function thread(
  id: string,
  title: string,
  updatedAt: string,
  running = false,
): T3ClientState["threads"][number] {
  return {
    id: id as ThreadId,
    projectId,
    title,
    modelSelection: MODEL_SELECTION,
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: "huxcx/lynxtron-port",
    worktreePath: "/Users/bytedance/.codex/worktrees/f409/t3code",
    latestTurn: running
      ? {
          turnId: `${id}-turn` as TurnId,
          state: "running",
          requestedAt: updatedAt,
          startedAt: updatedAt,
          completedAt: null,
          assistantMessageId: null,
        }
      : null,
    createdAt: EARLIER,
    updatedAt,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    session: null,
    latestUserMessageAt: updatedAt,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
  };
}

const baseFixture: Partial<T3ClientState> = {
  status: "ready",
  serverConfig: {
    environment: {
      serverVersion: "0.0.0-nightly.20260728.1",
    },
  } as ServerConfig,
  projects: [defaultProject],
  archivedThreads: [],
  messages: [],
  checkpoints: [],
  sessionStatus: "idle",
  activities: [],
};

export const sidebarDefaultFixture: Partial<T3ClientState> = {
  ...baseFixture,
  threads: [],
};

export const sidebarPopulatedFixture: Partial<T3ClientState> = {
  ...baseFixture,
  threads: [
    thread(
      "thread-running",
      "Finish the in-monorepo Lynxtron UI migration",
      "2026-07-28T12:00:00.000Z",
      true,
    ),
    thread(
      "thread-long",
      "Investigate an intentionally long thread title that must truncate without moving actions",
      "2026-07-28T11:20:00.000Z",
    ),
    thread("thread-keyboard", "Global keyboard bridge and focus order", "2026-07-28T10:40:00.000Z"),
  ],
  activeThreadId: "thread-running",
};
