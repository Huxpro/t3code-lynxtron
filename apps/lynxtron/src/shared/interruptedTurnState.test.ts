import { describe, expect, it } from "vite-plus/test";

import { applyThreadDetailEvent } from "@t3tools/client-runtime/state/threads";
import {
  EventId,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";
import type { OrchestrationThread } from "@t3tools/contracts";

const turnId = TurnId.make("turn-1");
const messageId = MessageId.make("assistant-1");

const interruptedThread: OrchestrationThread = {
  id: ThreadId.make("thread-1"),
  projectId: ProjectId.make("project-1"),
  title: "Interrupted",
  modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
  runtimeMode: "full-access",
  interactionMode: "default",
  branch: null,
  worktreePath: null,
  latestTurn: {
    turnId,
    state: "interrupted",
    requestedAt: "2026-04-01T06:59:00.000Z",
    startedAt: "2026-04-01T06:59:00.000Z",
    completedAt: "2026-04-01T07:00:00.000Z",
    assistantMessageId: messageId,
  },
  createdAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-04-01T07:00:00.000Z",
  archivedAt: null,
  settledOverride: null,
  settledAt: null,
  pullRequests: [],
  deletedAt: null,
  messages: [
    {
      id: messageId,
      role: "assistant",
      text: "partial",
      turnId,
      streaming: true,
      createdAt: "2026-04-01T06:59:30.000Z",
      updatedAt: "2026-04-01T06:59:30.000Z",
    },
  ],
  proposedPlans: [],
  activities: [],
  checkpoints: [],
  session: null,
};

function assistantChunk(thread: OrchestrationThread, sequence: number, streaming: boolean) {
  const result = applyThreadDetailEvent(thread, {
    eventId: EventId.make(`event-${sequence}`),
    commandId: null,
    causationEventId: null,
    correlationId: null,
    metadata: {},
    sequence,
    occurredAt: "2026-04-01T07:00:01.000Z",
    aggregateKind: "thread",
    aggregateId: thread.id,
    type: "thread.message-sent",
    payload: {
      threadId: thread.id,
      messageId,
      role: "assistant",
      text: streaming ? " tail" : "",
      turnId,
      streaming,
      createdAt: "2026-04-01T06:59:30.000Z",
      updatedAt: "2026-04-01T07:00:01.000Z",
    },
  });
  if (result.kind !== "updated") throw new Error(`expected an update, got ${result.kind}`);
  return result.thread;
}

describe("a turn that was interrupted", () => {
  it("stays interrupted when the provider flushes late assistant text", () => {
    const afterLateDelta = assistantChunk(interruptedThread, 10, true);
    expect(afterLateDelta.latestTurn?.state).toBe("interrupted");
    const afterFinalChunk = assistantChunk(afterLateDelta, 11, false);
    expect(afterFinalChunk.latestTurn?.state).toBe("interrupted");
    expect(afterFinalChunk.messages[0]?.text).toBe("partial tail");
  });
});
