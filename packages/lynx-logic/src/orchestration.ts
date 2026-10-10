// The thread model the Lynx UI state is written against: a thread as messages,
// activities, proposed plans, checkpoints, a session and a latest turn.
// Upstream's contract used to carry these shapes and now carries runs and turn
// items (`orchestrationV2.ts`). The Lynx client projects the server's values
// into these in `apps/lynxtron/src/shared/orchestrationProjection.ts`, so the
// UI state, the transcript and the sidebar keep one model. A turn is a run:
// `turnId` holds the run's id.
import type { ThreadRunSummary, ThreadRuntimeSummary } from "@t3tools/client-runtime/state/models";
import type {
  ChatAttachment,
  CheckpointRef,
  EnvironmentId,
  EventId,
  MessageId,
  ModelSelection,
  OrchestrationMessageContext,
  OrchestrationProjectShell,
  ProjectId,
  ProviderInstanceId,
  ProviderInteractionMode,
  RuntimeMode,
  ThreadId,
  ThreadLinkedPullRequest,
  ThreadPullRequestLink,
  TurnId,
} from "@t3tools/contracts";

export type OrchestrationMessageRole = "user" | "assistant" | "system" | "reasoning";

export interface OrchestrationMessage {
  readonly id: MessageId;
  readonly role: OrchestrationMessageRole;
  readonly text: string;
  readonly attachments?: ReadonlyArray<ChatAttachment> | undefined;
  readonly context?: OrchestrationMessageContext | undefined;
  readonly turnId: TurnId | null;
  readonly streaming: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type OrchestrationProposedPlanId = string;

export interface OrchestrationProposedPlan {
  readonly id: OrchestrationProposedPlanId;
  readonly turnId: TurnId | null;
  readonly planMarkdown: string;
  readonly implementedAt: string | null;
  readonly implementationThreadId: ThreadId | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type OrchestrationSessionStatus =
  | "idle"
  | "starting"
  | "running"
  | "ready"
  | "interrupted"
  | "stopped"
  | "error";

export interface OrchestrationSession {
  readonly threadId: ThreadId;
  readonly status: OrchestrationSessionStatus;
  readonly providerName: string | null;
  readonly providerInstanceId?: ProviderInstanceId | undefined;
  readonly runtimeMode: RuntimeMode;
  readonly activeTurnId: TurnId | null;
  readonly lastError: string | null;
  readonly updatedAt: string;
}

export interface OrchestrationCheckpointFile {
  readonly path: string;
  readonly kind: string;
  readonly additions: number;
  readonly deletions: number;
}

export type OrchestrationCheckpointStatus = "ready" | "missing" | "error";

export interface OrchestrationCheckpointSummary {
  readonly turnId: TurnId;
  readonly checkpointTurnCount: number;
  readonly checkpointRef: CheckpointRef;
  readonly status: OrchestrationCheckpointStatus;
  readonly files: ReadonlyArray<OrchestrationCheckpointFile>;
  readonly assistantMessageId: MessageId | null;
  readonly completedAt: string;
}

export type OrchestrationThreadActivityTone = "info" | "tool" | "approval" | "error";

export interface OrchestrationThreadActivity {
  readonly id: EventId;
  readonly tone: OrchestrationThreadActivityTone;
  readonly kind: string;
  readonly summary: string;
  readonly payload: unknown;
  readonly turnId: TurnId | null;
  readonly sequence?: number | undefined;
  readonly createdAt: string;
}

export type OrchestrationLatestTurnState = "running" | "interrupted" | "completed" | "error";

export interface OrchestrationLatestTurn {
  readonly turnId: TurnId;
  readonly state: OrchestrationLatestTurnState;
  readonly requestedAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly assistantMessageId: MessageId | null;
  readonly sourceProposedPlan?:
    | { readonly threadId: ThreadId; readonly planId: OrchestrationProposedPlanId }
    | undefined;
}

interface ThreadCommonFields {
  readonly id: ThreadId;
  readonly projectId: ProjectId;
  readonly title: string;
  readonly modelSelection: ModelSelection;
  readonly runtimeMode: RuntimeMode;
  readonly interactionMode: ProviderInteractionMode;
  readonly branch: string | null;
  readonly worktreePath: string | null;
  readonly linkedPullRequest?: ThreadLinkedPullRequest | null;
  readonly pullRequests: ReadonlyArray<ThreadPullRequestLink>;
  readonly branchPullRequest?: ThreadLinkedPullRequest | null;
  readonly latestTurn: OrchestrationLatestTurn | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedAt: string | null;
  readonly settledOverride: "settled" | "active" | null;
  readonly settledAt: string | null;
  readonly unsettledAt?: string | null;
  readonly snoozedUntil?: string | null;
  readonly snoozedAt?: string | null;
  readonly pinnedAt?: string | null;
  readonly pinOrderKey?: string | null;
  readonly activeOrderKey?: string | null;
  readonly autoSettleDisabledAt?: string | null;
  /** Set while the server is generating a new title. */
  readonly titleRegeneration?: { readonly requestId: string; readonly startedAt: string } | null;
  readonly session: OrchestrationSession | null;
}

export interface OrchestrationThread extends ThreadCommonFields {
  readonly deletedAt: string | null;
  readonly messages: ReadonlyArray<OrchestrationMessage>;
  readonly proposedPlans: ReadonlyArray<OrchestrationProposedPlan>;
  readonly activities: ReadonlyArray<OrchestrationThreadActivity>;
  readonly checkpoints: ReadonlyArray<OrchestrationCheckpointSummary>;
}

export interface OrchestrationThreadShell extends ThreadCommonFields {
  /**
   * The thread's run state as upstream's clients read it. Upstream's sidebar
   * logic, which the Lynx sidebar runs in place, takes these two; `session`
   * and `latestTurn` say the same in the Lynx model.
   */
  readonly runtime: ThreadRuntimeSummary | null;
  readonly latestRun: ThreadRunSummary | null;
  readonly latestUserMessageAt: string | null;
  readonly hasPendingApprovals: boolean;
  readonly hasPendingUserInput: boolean;
  readonly hasActionableProposedPlan: boolean;
  /** Background work alive after the turn settled. */
  readonly backgroundLiveness?: "working" | "monitoring" | null | undefined;
  readonly planProgress?:
    | {
        readonly step: string;
        readonly completedSteps: number;
        readonly totalSteps: number;
      }
    | null
    | undefined;
}

/** A sidebar thread with the environment it belongs to. */
export interface EnvironmentThreadShell extends OrchestrationThreadShell {
  readonly environmentId: EnvironmentId;
}

export interface OrchestrationShellSnapshot {
  readonly snapshotSequence: number;
  readonly projects: ReadonlyArray<OrchestrationProjectShell>;
  readonly threads: ReadonlyArray<OrchestrationThreadShell>;
  readonly updatedAt: string;
}

/** What a first turn asks the server to set up before it starts. */
export interface ThreadTurnStartBootstrap {
  readonly createThread?: {
    readonly projectId: ProjectId;
    readonly title: string;
    readonly modelSelection: ModelSelection;
    readonly runtimeMode: RuntimeMode;
    readonly interactionMode: ProviderInteractionMode;
    readonly branch: string | null;
    readonly worktreePath: string | null;
    readonly createdAt: string;
  };
  readonly prepareWorktree?: {
    readonly projectCwd: string;
    readonly baseBranch: string;
    readonly branch?: string;
    readonly startFromOrigin?: boolean;
    readonly requireWorktree?: boolean;
  };
  readonly runSetupScript?: boolean;
}
