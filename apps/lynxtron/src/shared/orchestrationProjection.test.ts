import {
  MessageId,
  NodeId,
  type OrchestrationV2ThreadProjection,
  type OrchestrationV2TurnItem,
  PlanId,
  RuntimeRequestId,
  TurnItemId,
} from "@t3tools/contracts";
import { derivePendingApprovals } from "@t3tools/lynx-logic/pendingRequests";
import { deriveActivePlanState } from "@t3tools/lynx-logic/thread";
import { deriveWorkLogEntries } from "@t3tools/lynx-logic/transcript";
import * as DateTime from "effect/DateTime";
import { assert, describe, it } from "vite-plus/test";

import { shellSnapshot, threadDetail } from "../app/state/upstreamState.fixtures.ts";
import {
  projectThread,
  projectThreadShell,
  sessionStatusForRun,
} from "./orchestrationProjection.ts";

const AT = DateTime.makeUnsafe("2026-10-09T00:00:00.000Z");

type ItemBody = OrchestrationV2TurnItem extends infer Item
  ? Item extends OrchestrationV2TurnItem
    ? Omit<Item, keyof ReturnType<typeof itemBase>>
    : never
  : never;

function itemBase(base: OrchestrationV2ThreadProjection, id: string, ordinal: number) {
  return {
    id: TurnItemId.make(id),
    threadId: base.thread.id,
    runId: null,
    nodeId: null,
    providerThreadId: null,
    providerTurnId: null,
    nativeItemRef: null,
    parentItemId: null,
    ordinal,
    status: "completed" as const,
    title: null,
    startedAt: AT,
    completedAt: AT,
    updatedAt: AT,
  };
}

/** A thread whose timeline is the messages of `base` followed by `bodies`. */
function withItems(
  base: OrchestrationV2ThreadProjection,
  bodies: ReadonlyArray<ItemBody & { readonly status?: OrchestrationV2TurnItem["status"] }>,
  runtimeRequests: OrchestrationV2ThreadProjection["runtimeRequests"] = [],
): OrchestrationV2ThreadProjection {
  const offset = base.visibleTurnItems.length;
  const items = bodies.map(
    (body, index) =>
      ({
        ...itemBase(base, `item-${index}`, offset + index),
        ...body,
      }) as OrchestrationV2TurnItem,
  );
  return {
    ...base,
    runtimeRequests,
    turnItems: [...base.turnItems, ...items],
    visibleTurnItems: [
      ...base.visibleTurnItems,
      ...items.map((item, index) => ({
        position: offset + index,
        visibility: "local" as const,
        sourceThreadId: base.thread.id,
        sourceItemId: item.id,
        item,
      })),
    ],
  };
}

describe("projectThread", () => {
  it("shows a tool item as the work row the Lynx transcript reads", () => {
    const thread = projectThread(
      withItems(threadDetail({ messages: [{ id: "message-1", role: "user" }] }), [
        { type: "command_execution", input: "pnpm test", output: "ok", status: "running" },
        { type: "file_change", fileName: "src/a.ts" },
      ]),
    );
    const [command, edit] = deriveWorkLogEntries(thread.activities);
    assert.deepInclude(command, {
      command: "pnpm test",
      itemType: "command_execution",
      toolLifecycleStatus: "inProgress",
    });
    assert.deepInclude(edit, { itemType: "file_change", toolLifecycleStatus: "completed" });
    assert.deepEqual(edit?.changedFiles, ["src/a.ts"]);
  });

  it("keeps the server's order when items share a time", () => {
    const thread = projectThread(
      withItems(threadDetail({ messages: [{ id: "message-1", role: "user" }] }), [
        { type: "command_execution", input: "ls" },
        {
          type: "assistant_message",
          messageId: MessageId.make("message-2"),
          text: "done",
          streaming: false,
        },
      ]),
    );
    const times = [
      thread.messages[0]?.createdAt,
      thread.activities[0]?.createdAt,
      thread.messages[1]?.createdAt,
    ];
    assert.deepEqual(times, times.toSorted());
    assert.equal(new Set(times).size, 3);
  });

  it("holds an approval open until the server resolves its request", () => {
    const requestId = RuntimeRequestId.make("request-1");
    const request = {
      id: requestId,
      nodeId: NodeId.make("node-1"),
      providerTurnId: null,
      nativeRequestRef: null,
      kind: "command" as const,
      status: "pending" as const,
      responseCapability: { type: "message" as const },
      createdAt: AT,
      resolvedAt: null,
    };
    const approval = {
      type: "approval_request" as const,
      requestId,
      requestKind: "command" as const,
      prompt: "rm -rf build",
    };
    const pending = projectThread(withItems(threadDetail(), [approval], [request]));
    assert.deepEqual(
      derivePendingApprovals(pending.activities).map((entry) => [entry.requestId, entry.detail]),
      [["request-1", "rm -rf build"]],
    );
    const resolved = projectThread(
      withItems(threadDetail(), [approval], [{ ...request, status: "resolved", resolvedAt: AT }]),
    );
    assert.deepEqual(derivePendingApprovals(resolved.activities), []);
  });

  it("reads a todo list as the active plan", () => {
    const thread = projectThread(
      withItems(threadDetail(), [
        {
          type: "todo_list",
          planId: PlanId.make("plan-1"),
          steps: [
            { id: "step-1", text: "Read", status: "completed" },
            { id: "step-2", text: "Write", status: "running" },
          ],
        },
      ]),
    );
    assert.deepEqual(deriveActivePlanState(thread.activities, undefined)?.steps, [
      { step: "Read", status: "completed" },
      { step: "Write", status: "inProgress" },
    ]);
  });

  it("builds a row again only for the item that changed", () => {
    const base = withItems(threadDetail({ messages: [{ id: "message-1", role: "user" }] }), [
      { type: "command_execution", input: "ls" },
    ]);
    const first = projectThread(base);
    const second = projectThread({ ...base, updatedAt: AT });
    assert.strictEqual(second.messages[0], first.messages[0]);
    assert.strictEqual(second.activities[0], first.activities[0]);
  });
});

describe("projectThreadShell", () => {
  it("reads an idle thread as one without a session, once per shell value", () => {
    const [shell] = shellSnapshot([{ id: "thread-1" }]).threads;
    assert.ok(shell);
    const projected = projectThreadShell(shell);
    assert.deepInclude(projected, { session: null, latestTurn: null, runtime: null });
    assert.equal(projected.updatedAt, "2026-10-01T00:00:00.000Z");
    assert.strictEqual(projectThreadShell(shell), projected);
  });

  it("names the session status the Lynx UI shows for each run status", () => {
    assert.deepEqual(
      (["queued", "running", "waiting", "interrupted", "failed", "completed"] as const).map(
        sessionStatusForRun,
      ),
      ["starting", "running", "running", "interrupted", "error", "ready"],
    );
  });
});
