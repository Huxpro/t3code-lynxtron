// Projects the server's thread values into the thread model the Lynx UI
// state is written against (`@t3tools/lynx-logic/orchestration`). The server
// describes a thread as runs and turn items; the Lynx UI reduces messages,
// activities, proposed plans, checkpoints, a session and a latest turn. A run
// is shown as a turn, and each tool, request, plan and notice item as the
// activity the Lynx transcript and request panels read.
//
// Upstream's reducer keeps the identity of every item an event did not touch,
// so the row built from an item is kept with it: a streamed token rebuilds one
// row, not the thread.
import { presentThreadShell } from "@t3tools/client-runtime/state/models";
import { deriveThreadCheckpointSummaries } from "@t3tools/client-runtime/state/thread-checkpoints";
import {
  deriveThreadActivityRun,
  deriveThreadRuntime,
} from "@t3tools/client-runtime/state/thread-execution";
import {
  EnvironmentId,
  EventId,
  MessageId,
  type OrchestrationV2RunStatus,
  type OrchestrationV2ThreadProjection,
  type OrchestrationV2ThreadShell,
  type OrchestrationV2TurnItem,
  type RunId,
  TurnId,
} from "@t3tools/contracts";
import type {
  OrchestrationLatestTurn,
  OrchestrationMessage,
  OrchestrationProposedPlan,
  OrchestrationSessionStatus,
  OrchestrationThread,
  OrchestrationThreadActivity,
  OrchestrationThreadShell,
} from "@t3tools/lynx-logic/orchestration";
import * as DateTime from "effect/DateTime";

type RunStatus = OrchestrationV2RunStatus | "idle";

const iso = (value: DateTime.Utc): string => DateTime.formatIso(value);
const isoOrNull = (value: DateTime.Utc | null): string | null =>
  value === null ? null : DateTime.formatIso(value);
const turnIdOf = (runId: RunId | null): TurnId | null =>
  runId === null ? null : TurnId.make(runId);

function isActiveRunStatus(status: RunStatus): boolean {
  return (
    status === "preparing" || status === "starting" || status === "running" || status === "waiting"
  );
}

/** The session status the Lynx UI shows for a run status. */
export function sessionStatusForRun(status: RunStatus): OrchestrationSessionStatus {
  switch (status) {
    case "preparing":
    case "queued":
    case "starting":
      return "starting";
    case "running":
    case "waiting":
      return "running";
    case "interrupted":
      return "interrupted";
    case "failed":
      return "error";
    case "idle":
    case "completed":
    case "cancelled":
    case "rolled_back":
      return "ready";
  }
}

function latestTurnStateForRun(status: RunStatus): OrchestrationLatestTurn["state"] {
  if (status === "interrupted") return "interrupted";
  if (status === "failed") return "error";
  return isActiveRunStatus(status) || status === "queued" ? "running" : "completed";
}

const shellCache = new WeakMap<OrchestrationV2ThreadShell, OrchestrationThreadShell>();

// Upstream scopes a presented shell to an environment. The Lynx shell is scoped
// where it is read (`state/entities.lynx.ts`), so the id given here is dropped.
const UNSCOPED = EnvironmentId.make("primary");

/**
 * A sidebar thread as the Lynx UI state holds it: upstream's presented shell,
 * with the session and latest turn the Lynx sidebar logic reads. The result is
 * kept per shell value.
 */
export function projectThreadShell(shell: OrchestrationV2ThreadShell): OrchestrationThreadShell {
  const cached = shellCache.get(shell);
  if (cached) return cached;
  const presented = presentThreadShell(UNSCOPED, shell);
  const { runtime, latestRun } = presented;
  const active = runtime !== null && isActiveRunStatus(runtime.status);
  const turnRunId = (active ? runtime.activeRunId : null) ?? latestRun?.runId ?? null;
  const backgroundTasks = presented.pendingBackgroundTasks;
  const projected: OrchestrationThreadShell = {
    id: presented.id,
    projectId: presented.projectId,
    title: presented.title,
    modelSelection: presented.modelSelection,
    runtimeMode: presented.runtimeMode,
    interactionMode: presented.interactionMode,
    branch: presented.branch,
    worktreePath: presented.worktreePath,
    linkedPullRequest: presented.linkedPullRequest ?? null,
    pullRequests: presented.pullRequests,
    branchPullRequest: presented.branchPullRequest ?? null,
    runtime,
    latestRun,
    latestTurn:
      turnRunId === null
        ? null
        : {
            turnId: TurnId.make(turnRunId),
            state: latestTurnStateForRun(active ? runtime.status : (latestRun?.status ?? "idle")),
            requestedAt: latestRun?.requestedAt ?? presented.updatedAt,
            startedAt: (active ? runtime.activityStartedAt : null) ?? latestRun?.startedAt ?? null,
            completedAt: active ? null : (latestRun?.completedAt ?? null),
            assistantMessageId: null,
          },
    createdAt: presented.createdAt,
    updatedAt: presented.updatedAt,
    archivedAt: presented.archivedAt,
    settledOverride: presented.settledOverride,
    settledAt: presented.settledAt,
    unsettledAt: presented.unsettledAt,
    snoozedUntil: presented.snoozedUntil,
    snoozedAt: presented.snoozedAt,
    pinnedAt: presented.pinnedAt,
    pinOrderKey: presented.pinOrderKey,
    activeOrderKey: presented.activeOrderKey,
    autoSettleDisabledAt: presented.autoSettleDisabledAt ?? null,
    titleRegeneration: presented.titleRegeneration ?? null,
    session:
      runtime === null
        ? null
        : {
            threadId: presented.id,
            status: sessionStatusForRun(runtime.status),
            providerName: runtime.providerName,
            providerInstanceId: runtime.providerInstanceId,
            runtimeMode: presented.runtimeMode,
            activeTurnId: active ? turnIdOf(runtime.activeRunId) : null,
            lastError: runtime.lastError,
            updatedAt: runtime.updatedAt,
          },
    latestUserMessageAt: presented.latestUserMessageAt,
    hasPendingApprovals: presented.hasPendingApprovals,
    hasPendingUserInput: presented.hasPendingUserInput,
    hasActionableProposedPlan: presented.hasActionableProposedPlan,
    backgroundLiveness:
      backgroundTasks.length === 0
        ? null
        : backgroundTasks.every((task) => task.kind === "monitor")
          ? "monitoring"
          : "working",
  };
  shellCache.set(shell, projected);
  return projected;
}

type ToolItem = Extract<
  OrchestrationV2TurnItem,
  {
    readonly type:
      | "command_execution"
      | "file_change"
      | "file_search"
      | "web_search"
      | "dynamic_tool"
      | "subagent";
  }
>;

function toolLifecycle(status: OrchestrationV2TurnItem["status"]) {
  switch (status) {
    case "completed":
      return { kind: "tool.completed", status: "completed" } as const;
    case "failed":
      return { kind: "tool.completed", status: "failed" } as const;
    case "cancelled":
    case "interrupted":
      return { kind: "tool.completed", status: "stopped" } as const;
    case "idle":
    case "pending":
    case "running":
    case "waiting":
      return { kind: "tool.updated", status: "inProgress" } as const;
  }
}

function firstLine(text: string): string {
  return text.trim().split(/\r?\n/u)[0]?.trim() ?? "";
}

function toolDescription(item: ToolItem): {
  readonly itemType: string;
  readonly summary: string;
  readonly detail: string | undefined;
  readonly data: Record<string, unknown>;
} {
  switch (item.type) {
    case "command_execution":
      return {
        itemType: "command_execution",
        summary: item.title ?? "Ran command",
        detail: item.input,
        data: {
          item: { command: item.input },
          ...(item.output === undefined ? {} : { rawOutput: { stdout: item.output } }),
        },
      };
    case "file_change":
      return {
        itemType: "file_change",
        summary: item.title ?? "Edited file",
        detail: item.fileName,
        data: {
          changes:
            item.changes === undefined || item.changes.length === 0
              ? [{ path: item.fileName }]
              : item.changes.map((change) => ({ path: change.path, oldPath: change.oldPath })),
        },
      };
    case "file_search":
      return {
        itemType: "dynamic_tool_call",
        summary: item.title ?? "Searched files",
        detail: item.pattern,
        data: { kind: "search" },
      };
    case "web_search":
      return {
        itemType: "web_search",
        summary: item.title ?? "Searched the web",
        detail: item.patterns?.join(", "),
        data: {},
      };
    case "subagent":
      return {
        itemType: "collab_agent_tool_call",
        summary: item.title ?? "Subagent",
        detail: firstLine(item.prompt),
        data: {},
      };
    case "dynamic_tool":
      return {
        itemType:
          item.viewedImagePath !== undefined
            ? "image_view"
            : item.toolSource?.kind === "integration"
              ? "mcp_tool_call"
              : "dynamic_tool_call",
        summary: item.title ?? item.toolName ?? "Tool call",
        detail: item.viewedImagePath,
        data: { item: { tool: item.toolName, input: item.input, result: item.output } },
      };
  }
}

interface ActivityDraft {
  readonly idSuffix: string;
  readonly tone: OrchestrationThreadActivity["tone"];
  readonly kind: string;
  readonly summary: string;
  readonly payload: unknown;
}

function approvalRequestKind(kind: string): "command" | "file-read" | "file-change" {
  // The Lynx approval panel knows three kinds. A permission or elicitation
  // request is shown as a command approval with the provider's prompt.
  return kind === "file-read" || kind === "file-change" ? kind : "command";
}

/** The activities one turn item is shown as, before ids, order and time. */
function activityDrafts(
  item: OrchestrationV2TurnItem,
  requestIsPending: (requestId: string) => boolean,
): ReadonlyArray<ActivityDraft> {
  switch (item.type) {
    case "command_execution":
    case "file_change":
    case "file_search":
    case "web_search":
    case "dynamic_tool":
    case "subagent": {
      const lifecycle = toolLifecycle(item.status);
      const tool = toolDescription(item);
      return [
        {
          idSuffix: "",
          tone: "tool",
          kind: lifecycle.kind,
          summary: tool.summary,
          payload: {
            itemType: tool.itemType,
            status: lifecycle.status,
            title: tool.summary,
            ...(tool.detail ? { detail: tool.detail } : {}),
            toolCallId: item.id,
            data: tool.data,
          },
        },
      ];
    }
    case "approval_request": {
      const payload = {
        requestId: item.requestId,
        requestKind: approvalRequestKind(item.requestKind),
        ...(item.prompt ? { detail: item.prompt } : {}),
      };
      const requested: ActivityDraft = {
        idSuffix: "",
        tone: "approval",
        kind: "approval.requested",
        summary: item.title ?? "Approval requested",
        payload,
      };
      return requestIsPending(item.requestId)
        ? [requested]
        : [
            requested,
            {
              idSuffix: ":resolved",
              tone: "approval",
              kind: "approval.resolved",
              summary: "Approval resolved",
              payload,
            },
          ];
    }
    case "user_input_request": {
      const payload = {
        requestId: item.requestId,
        questions: item.questions.map((question) => ({
          id: question.id,
          header: question.header,
          question: question.question,
          options: question.options.map((option) => ({
            label: option.label,
            description: option.description,
          })),
          multiSelect: question.multiSelect === true,
        })),
      };
      const requested: ActivityDraft = {
        idSuffix: "",
        tone: "info",
        kind: "user-input.requested",
        summary: item.title ?? "User input requested",
        payload,
      };
      return requestIsPending(item.requestId)
        ? [requested]
        : [
            requested,
            {
              idSuffix: ":resolved",
              tone: "info",
              kind: "user-input.resolved",
              summary: "User input submitted",
              payload,
            },
          ];
    }
    case "todo_list":
      return [
        {
          idSuffix: "",
          tone: "info",
          kind: "turn.plan.updated",
          summary: "Plan updated",
          payload: {
            plan: item.steps.map((step) => ({
              step: step.text,
              status: step.status === "running" ? "inProgress" : step.status,
            })),
            ...(item.explanation === undefined ? {} : { explanation: item.explanation }),
          },
        },
      ];
    case "error":
      return [
        {
          idSuffix: "",
          tone: "error",
          kind: "runtime.error",
          summary: item.failure.message,
          payload: { message: item.failure.message, class: item.failure.class },
        },
      ];
    case "system_notice":
      return item.message.trim().length === 0
        ? []
        : [
            {
              idSuffix: "",
              tone: "info",
              kind: "runtime.warning",
              summary: item.message.trim(),
              payload: { message: item.message },
            },
          ];
    case "notification":
      return [
        {
          idSuffix: "",
          tone: item.outcome === "failed" ? "error" : "info",
          kind: "task.completed",
          summary: item.summary,
          payload: { summary: item.summary, ...(item.detail ? { detail: item.detail } : {}) },
        },
      ];
    case "compaction":
      return [
        {
          idSuffix: "",
          tone: "info",
          kind: "context-compaction",
          summary: "Context compacted",
          payload: {},
        },
      ];
    // Messages and proposed plans are rows of their own. A checkpoint is read
    // from the thread's checkpoints. Interrupt records, handoffs, forks and
    // created threads have no row in the Lynx transcript.
    case "user_message":
    case "assistant_message":
    case "reasoning":
    case "proposed_plan":
    case "checkpoint":
    case "run_interrupt_request":
    case "run_interrupt_result":
    case "handoff":
    case "fork":
    case "thread_created":
      return [];
  }
}

function messageFromItem(item: OrchestrationV2TurnItem, createdAt: string) {
  const base = { turnId: turnIdOf(item.runId), createdAt, updatedAt: iso(item.updatedAt) };
  switch (item.type) {
    case "user_message":
      return {
        ...base,
        id: item.messageId,
        role: "user",
        text: item.text,
        attachments: item.attachments,
        ...(item.context === undefined ? {} : { context: item.context }),
        streaming: false,
      } satisfies OrchestrationMessage;
    case "assistant_message":
      return {
        ...base,
        id: item.messageId,
        role: "assistant",
        text: item.text,
        ...(item.attachments === undefined ? {} : { attachments: item.attachments }),
        streaming: item.streaming,
      } satisfies OrchestrationMessage;
    // The Lynx transcript shows a thinking trace as a system message.
    case "reasoning":
      return {
        ...base,
        id: MessageId.make(item.id),
        role: "system",
        text: item.text,
        streaming: item.streaming,
      } satisfies OrchestrationMessage;
    default:
      return null;
  }
}

interface ItemRows {
  readonly createdAt: string;
  readonly position: number;
  readonly requestPending: boolean;
  readonly message: OrchestrationMessage | null;
  readonly plan: OrchestrationProposedPlan | null;
  readonly activities: ReadonlyArray<OrchestrationThreadActivity>;
}

const itemRowsCache = new WeakMap<OrchestrationV2TurnItem, ItemRows>();

function itemRequestId(item: OrchestrationV2TurnItem): string | null {
  return item.type === "approval_request" || item.type === "user_input_request"
    ? item.requestId
    : null;
}

function buildItemRows(
  item: OrchestrationV2TurnItem,
  createdAt: string,
  position: number,
  requestPending: boolean,
): ItemRows {
  const turnId = turnIdOf(item.runId);
  return {
    createdAt,
    position,
    requestPending,
    message: messageFromItem(item, createdAt),
    plan:
      item.type === "proposed_plan" && item.markdown.trim().length > 0
        ? {
            id: item.planId,
            turnId,
            planMarkdown: item.markdown,
            implementedAt: null,
            implementationThreadId: null,
            createdAt,
            updatedAt: iso(item.updatedAt),
          }
        : null,
    activities: activityDrafts(item, () => requestPending).map((draft, index) => ({
      id: EventId.make(`${item.id}${draft.idSuffix}`),
      tone: draft.tone,
      kind: draft.kind,
      summary: draft.summary,
      payload: draft.payload,
      turnId,
      // Two activities of one item keep their order; items are a position apart.
      sequence: position * 2 + index,
      createdAt,
    })),
  };
}

function nextMillisecond(isoTime: string): string {
  return new Date(Date.parse(isoTime) + 1).toISOString();
}

/**
 * The selected thread as the Lynx UI state holds it. Rows follow the server's
 * visible order: the Lynx transcript orders rows by time, so a row is never
 * given a time at or before the row above it.
 */
export function projectThread(projection: OrchestrationV2ThreadProjection): OrchestrationThread {
  const { thread } = projection;
  const pendingRequests = new Set<string>();
  for (const request of projection.runtimeRequests) {
    if (request.status === "pending") pendingRequests.add(request.id);
  }
  const implementedPlans = new Map<string, string>();
  for (const run of projection.runs) {
    if (run.sourcePlanRef?.threadId === thread.id) {
      implementedPlans.set(run.sourcePlanRef.planId, iso(run.requestedAt));
    }
  }

  const messages: OrchestrationMessage[] = [];
  const proposedPlans: OrchestrationProposedPlan[] = [];
  const activities: OrchestrationThreadActivity[] = [];
  let previousCreatedAt = "";
  for (const [position, row] of projection.visibleTurnItems.entries()) {
    const item = row.item;
    const own = iso(item.startedAt ?? item.updatedAt);
    const createdAt = own > previousCreatedAt ? own : nextMillisecond(previousCreatedAt);
    previousCreatedAt = createdAt;
    const requestId = itemRequestId(item);
    const requestPending = requestId !== null && pendingRequests.has(requestId);
    let rows = itemRowsCache.get(item);
    if (
      rows === undefined ||
      rows.createdAt !== createdAt ||
      rows.position !== position ||
      rows.requestPending !== requestPending
    ) {
      rows = buildItemRows(item, createdAt, position, requestPending);
      itemRowsCache.set(item, rows);
    }
    if (rows.message !== null) messages.push(rows.message);
    if (rows.plan !== null) {
      const implementedAt = implementedPlans.get(rows.plan.id);
      proposedPlans.push(
        implementedAt === undefined
          ? rows.plan
          : { ...rows.plan, implementedAt, implementationThreadId: thread.id },
      );
    }
    for (const activity of rows.activities) activities.push(activity);
  }

  const runtime = deriveThreadRuntime(projection);
  const activityRun = deriveThreadActivityRun(projection);
  const latestTurn: OrchestrationLatestTurn | null =
    activityRun === null
      ? null
      : {
          turnId: TurnId.make(activityRun.runId),
          state: latestTurnStateForRun(activityRun.status),
          requestedAt: activityRun.requestedAt ?? iso(thread.updatedAt),
          startedAt: activityRun.startedAt,
          completedAt: activityRun.completedAt,
          assistantMessageId: activityRun.assistantMessageId,
          ...(activityRun.sourcePlanRef === undefined
            ? {}
            : { sourceProposedPlan: activityRun.sourcePlanRef }),
        };

  return {
    id: thread.id,
    projectId: thread.projectId,
    title: thread.title,
    modelSelection: thread.modelSelection,
    runtimeMode: thread.runtimeMode,
    interactionMode: thread.interactionMode,
    branch: thread.branch,
    worktreePath: thread.worktreePath,
    linkedPullRequest: thread.linkedPullRequest ?? null,
    pullRequests: thread.pullRequests ?? [],
    branchPullRequest: thread.branchPullRequest ?? null,
    latestTurn,
    createdAt: iso(thread.createdAt),
    updatedAt: iso(thread.updatedAt),
    archivedAt: isoOrNull(thread.archivedAt),
    settledOverride: thread.settledOverride,
    settledAt: isoOrNull(thread.settledAt),
    unsettledAt: isoOrNull(thread.unsettledAt ?? null),
    snoozedUntil: isoOrNull(thread.snoozedUntil ?? null),
    snoozedAt: isoOrNull(thread.snoozedAt ?? null),
    pinnedAt: isoOrNull(thread.pinnedAt ?? null),
    pinOrderKey: thread.pinOrderKey ?? null,
    activeOrderKey: thread.activeOrderKey ?? null,
    autoSettleDisabledAt: isoOrNull(thread.autoSettleDisabledAt ?? null),
    deletedAt: isoOrNull(thread.deletedAt),
    messages,
    proposedPlans,
    activities,
    checkpoints: deriveThreadCheckpointSummaries(projection).map((checkpoint) => ({
      turnId: TurnId.make(checkpoint.runId),
      checkpointTurnCount: checkpoint.checkpointTurnCount,
      checkpointRef: checkpoint.checkpointRef,
      status: checkpoint.status === "stale" ? "missing" : checkpoint.status,
      files: checkpoint.files,
      assistantMessageId: checkpoint.assistantMessageId,
      completedAt: checkpoint.completedAt,
    })),
    session:
      runtime === null
        ? null
        : {
            threadId: thread.id,
            status: sessionStatusForRun(runtime.status),
            providerName: runtime.providerName,
            providerInstanceId: runtime.providerInstanceId,
            runtimeMode: thread.runtimeMode,
            activeTurnId:
              activityRun !== null && isActiveRunStatus(runtime.status)
                ? TurnId.make(activityRun.runId)
                : null,
            lastError: runtime.lastError,
            updatedAt: runtime.updatedAt,
          },
  };
}
