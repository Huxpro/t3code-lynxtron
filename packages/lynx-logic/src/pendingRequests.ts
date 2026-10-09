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
  if (!normalized) return false;
  return (
    normalized.includes("stale pending approval request") ||
    normalized.includes("stale pending user-input request") ||
    normalized.includes("unknown pending approval request") ||
    normalized.includes("unknown pending permission request") ||
    normalized.includes("unknown pending user-input request") ||
    normalized.includes("unknown pending user input request") ||
    normalized.includes("unknown pending codex user input request")
  );
}

function activityPayload(activity: OrchestrationThreadActivity): Record<string, unknown> | null {
  return activity.payload && typeof activity.payload === "object"
    ? (activity.payload as Record<string, unknown>)
    : null;
}

export function derivePendingApprovals(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): PendingApproval[] {
  const openByRequestId = new Map<ApprovalRequestId, PendingApproval>();
  const ordered = [...activities].sort(compareActivitiesByOrder);

  for (const activity of ordered) {
    const payload = activityPayload(activity);
    const requestId =
      typeof payload?.requestId === "string" ? ApprovalRequestId.make(payload.requestId) : null;
    const requestKind =
      payload &&
      (payload.requestKind === "command" ||
        payload.requestKind === "file-read" ||
        payload.requestKind === "file-change")
        ? payload.requestKind
        : payload
          ? workRequestKindFromRequestType(payload.requestType)
          : null;
    const detail = typeof payload?.detail === "string" ? payload.detail : undefined;

    if (activity.kind === "approval.requested" && requestId && requestKind) {
      openByRequestId.set(requestId, {
        requestId,
        requestKind,
        createdAt: activity.createdAt,
        ...(detail ? { detail } : {}),
      });
    } else if (activity.kind === "approval.resolved" && requestId) {
      openByRequestId.delete(requestId);
    } else if (
      activity.kind === "provider.approval.respond.failed" &&
      requestId &&
      isStalePendingRequestFailureDetail(detail)
    ) {
      openByRequestId.delete(requestId);
    }
  }

  return [...openByRequestId.values()].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );
}

function parseUserInputQuestions(
  payload: Record<string, unknown> | null,
): ReadonlyArray<UserInputQuestion> | null {
  if (!Array.isArray(payload?.questions)) return null;
  const parsed = payload.questions
    .map<UserInputQuestion | null>((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const question = entry as Record<string, unknown>;
      if (
        typeof question.id !== "string" ||
        typeof question.header !== "string" ||
        typeof question.question !== "string" ||
        !Array.isArray(question.options)
      ) {
        return null;
      }
      const options = question.options
        .map<UserInputQuestion["options"][number] | null>((option) => {
          if (!option || typeof option !== "object") return null;
          const value = option as Record<string, unknown>;
          return typeof value.label === "string" && typeof value.description === "string"
            ? { label: value.label, description: value.description }
            : null;
        })
        .filter((option): option is UserInputQuestion["options"][number] => option !== null);
      return options.length > 0
        ? {
            id: question.id,
            header: question.header,
            question: question.question,
            options,
            multiSelect: question.multiSelect === true,
          }
        : null;
    })
    .filter((question): question is UserInputQuestion => question !== null);
  return parsed.length > 0 ? parsed : null;
}

export function derivePendingUserInputs(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): PendingUserInput[] {
  const openByRequestId = new Map<ApprovalRequestId, PendingUserInput>();
  const ordered = [...activities].sort(compareActivitiesByOrder);

  for (const activity of ordered) {
    const payload = activityPayload(activity);
    const requestId =
      typeof payload?.requestId === "string" ? ApprovalRequestId.make(payload.requestId) : null;
    const detail = typeof payload?.detail === "string" ? payload.detail : undefined;

    if (activity.kind === "user-input.requested" && requestId) {
      const questions = parseUserInputQuestions(payload);
      if (questions) {
        openByRequestId.set(requestId, {
          requestId,
          createdAt: activity.createdAt,
          questions,
        });
      }
    } else if (activity.kind === "user-input.resolved" && requestId) {
      openByRequestId.delete(requestId);
    } else if (
      activity.kind === "provider.user-input.respond.failed" &&
      requestId &&
      isStalePendingRequestFailureDetail(detail)
    ) {
      openByRequestId.delete(requestId);
    }
  }

  return [...openByRequestId.values()].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );
}
