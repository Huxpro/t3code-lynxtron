import {
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  type ModelSelection,
  type OrchestrationThreadShell,
  type ProjectId,
  type ProviderInteractionMode,
  type RuntimeMode,
  type ThreadId,
  type ThreadTurnStartBootstrap,
} from "@t3tools/contracts";

export type LocalDraftThreadEnvMode = "local" | "worktree";

export interface LocalDraftThread extends OrchestrationThreadShell {
  readonly envMode: LocalDraftThreadEnvMode;
  readonly startFromOrigin: boolean;
}

export type LocalDraftThreadsByProjectId = Readonly<Record<string, LocalDraftThread>>;

export function readLocalDraftThreadForProject(
  draftsByProjectId: LocalDraftThreadsByProjectId,
  projectId: ProjectId,
): LocalDraftThread | undefined {
  return draftsByProjectId[projectId];
}

export function rememberLocalDraftThread(
  draftsByProjectId: LocalDraftThreadsByProjectId,
  draft: LocalDraftThread,
): LocalDraftThreadsByProjectId {
  return {
    ...draftsByProjectId,
    [draft.projectId]: draft,
  };
}

export function forgetLocalDraftThread(
  draftsByProjectId: LocalDraftThreadsByProjectId,
  draft: LocalDraftThread,
): LocalDraftThreadsByProjectId {
  if (draftsByProjectId[draft.projectId]?.id !== draft.id) {
    return draftsByProjectId;
  }
  const { [draft.projectId]: _forgotten, ...remaining } = draftsByProjectId;
  return remaining;
}

export function createLocalDraftThread(input: {
  readonly threadId: ThreadId;
  readonly projectId: ProjectId;
  readonly modelSelection: ModelSelection;
  readonly createdAt: string;
  readonly runtimeMode?: RuntimeMode;
  readonly interactionMode?: ProviderInteractionMode;
  readonly branch?: string | null;
  readonly worktreePath?: string | null;
  readonly envMode?: LocalDraftThreadEnvMode;
  readonly startFromOrigin?: boolean;
}): LocalDraftThread {
  return {
    id: input.threadId,
    projectId: input.projectId,
    title: "New thread",
    modelSelection: input.modelSelection,
    runtimeMode: input.runtimeMode ?? DEFAULT_RUNTIME_MODE,
    interactionMode: input.interactionMode ?? DEFAULT_PROVIDER_INTERACTION_MODE,
    branch: input.branch ?? null,
    worktreePath: input.worktreePath ?? null,
    latestTurn: null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    session: null,
    latestUserMessageAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
    envMode: input.envMode ?? (input.worktreePath ? "worktree" : "local"),
    startFromOrigin: input.startFromOrigin ?? false,
  };
}

export function buildDraftThreadTurnBootstrap(
  draft: LocalDraftThread,
  title: string,
  existing?: ThreadTurnStartBootstrap,
): ThreadTurnStartBootstrap {
  return {
    ...existing,
    createThread: {
      projectId: draft.projectId,
      title,
      modelSelection: draft.modelSelection,
      runtimeMode: draft.runtimeMode,
      interactionMode: draft.interactionMode,
      branch: draft.branch,
      worktreePath: draft.worktreePath,
      createdAt: draft.createdAt,
    },
  };
}

export function shouldFinalizePromotedDraftThread(input: {
  readonly draftThreadId: ThreadId | undefined;
  readonly payloadThreadId: ThreadId;
  readonly messageCount: number;
  readonly sessionStatus: string;
}): boolean {
  return (
    input.draftThreadId === input.payloadThreadId &&
    (input.messageCount > 0 || input.sessionStatus !== "idle")
  );
}

export function projectDraftThreadModelSelection(
  draft: LocalDraftThread | undefined,
  selection: ModelSelection,
): LocalDraftThread | undefined {
  return draft ? { ...draft, modelSelection: selection } : undefined;
}

export function projectDraftThreadRuntimeMode(
  draft: LocalDraftThread | undefined,
  runtimeMode: RuntimeMode,
): LocalDraftThread | undefined {
  return draft ? { ...draft, runtimeMode } : undefined;
}

export function projectDraftThreadInteractionMode(
  draft: LocalDraftThread | undefined,
  interactionMode: ProviderInteractionMode,
): LocalDraftThread | undefined {
  return draft ? { ...draft, interactionMode } : undefined;
}

export function projectDraftThreadWorkspace(
  draft: LocalDraftThread | undefined,
  input: {
    readonly branch?: string | null;
    readonly worktreePath?: string | null;
    readonly envMode?: LocalDraftThreadEnvMode;
    readonly startFromOrigin?: boolean;
  },
): LocalDraftThread | undefined {
  if (!draft) return undefined;
  const envMode = input.envMode ?? draft.envMode;
  return {
    ...draft,
    envMode,
    startFromOrigin:
      envMode === "worktree" ? (input.startFromOrigin ?? draft.startFromOrigin) : false,
    branch: envMode === "local" ? null : (input.branch ?? draft.branch),
    worktreePath: envMode === "local" ? null : (input.worktreePath ?? draft.worktreePath),
  };
}
