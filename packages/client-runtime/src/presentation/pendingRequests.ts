import {
  ApprovalRequestId,
  type OrchestrationThreadActivity,
  type UserInputQuestion,
} from "@t3tools/contracts";
import { compareActivitiesByOrder, workRequestKindFromRequestType } from "./transcript.ts";

export interface PendingApproval {
  readonly requestId: ApprovalRequestId;
  readonly requestKind: "command" | "file-read" | "file-change";
  readonly createdAt: string;
  readonly detail?: string;
}

export interface PendingUserInput {
  readonly requestId: ApprovalRequestId;
  readonly createdAt: string;
  readonly questions: ReadonlyArray<UserInputQuestion>;
}

function isStalePendingRequestFailureDetail(detail: string | undefined): boolean {
  const normalized = detail?.toLowerCase();
  return Boolean(
    normalized &&
    [
      "stale pending approval request",
      "stale pending user-input request",
      "unknown pending approval request",
      "unknown pending permission request",
      "unknown pending user-input request",
      "unknown pending user input request",
      "unknown pending codex user input request",
    ].some((fragment) => normalized.includes(fragment)),
  );
}

export function derivePendingApprovals(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): PendingApproval[] {
  const open = new Map<ApprovalRequestId, PendingApproval>();
  for (const activity of [...activities].sort(compareActivitiesByOrder)) {
    const payload =
      activity.payload && typeof activity.payload === "object"
        ? (activity.payload as Record<string, unknown>)
        : null;
    const requestId =
      payload && typeof payload.requestId === "string"
        ? ApprovalRequestId.make(payload.requestId)
        : null;
    const requestKind =
      payload &&
      (payload.requestKind === "command" ||
        payload.requestKind === "file-read" ||
        payload.requestKind === "file-change")
        ? payload.requestKind
        : payload
          ? workRequestKindFromRequestType(payload.requestType)
          : null;
    const detail = payload && typeof payload.detail === "string" ? payload.detail : undefined;
    if (activity.kind === "approval.requested" && requestId && requestKind) {
      open.set(requestId, {
        requestId,
        requestKind,
        createdAt: activity.createdAt,
        ...(detail ? { detail } : {}),
      });
    } else if (
      requestId &&
      (activity.kind === "approval.resolved" ||
        (activity.kind === "provider.approval.respond.failed" &&
          isStalePendingRequestFailureDetail(detail)))
    ) {
      open.delete(requestId);
    }
  }
  return [...open.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function parseUserInputQuestions(payload: Record<string, unknown> | null) {
  if (!Array.isArray(payload?.questions)) return null;
  const questions = payload.questions.flatMap((entry): UserInputQuestion[] => {
    if (!entry || typeof entry !== "object") return [];
    const question = entry as Record<string, unknown>;
    if (
      typeof question.id !== "string" ||
      typeof question.header !== "string" ||
      typeof question.question !== "string" ||
      !Array.isArray(question.options)
    )
      return [];
    const options = question.options.flatMap((entry): UserInputQuestion["options"] => {
      if (!entry || typeof entry !== "object") return [];
      const option = entry as Record<string, unknown>;
      return typeof option.label === "string" && typeof option.description === "string"
        ? [{ label: option.label, description: option.description }]
        : [];
    });
    return options.length > 0
      ? [
          {
            id: question.id,
            header: question.header,
            question: question.question,
            options,
            multiSelect: question.multiSelect === true,
          },
        ]
      : [];
  });
  return questions.length > 0 ? questions : null;
}

export function derivePendingUserInputs(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): PendingUserInput[] {
  const open = new Map<ApprovalRequestId, PendingUserInput>();
  for (const activity of [...activities].sort(compareActivitiesByOrder)) {
    const payload =
      activity.payload && typeof activity.payload === "object"
        ? (activity.payload as Record<string, unknown>)
        : null;
    const requestId =
      payload && typeof payload.requestId === "string"
        ? ApprovalRequestId.make(payload.requestId)
        : null;
    const detail = payload && typeof payload.detail === "string" ? payload.detail : undefined;
    if (activity.kind === "user-input.requested" && requestId) {
      const questions = parseUserInputQuestions(payload);
      if (questions) open.set(requestId, { requestId, createdAt: activity.createdAt, questions });
    } else if (
      requestId &&
      (activity.kind === "user-input.resolved" ||
        (activity.kind === "provider.user-input.respond.failed" &&
          isStalePendingRequestFailureDetail(detail)))
    ) {
      open.delete(requestId);
    }
  }
  return [...open.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}
