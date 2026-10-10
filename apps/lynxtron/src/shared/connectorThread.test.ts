import { assert, describe, it } from "vite-plus/test";

import { threadDetail } from "../app/state/upstreamState.fixtures.ts";
import { projectConnectorThread } from "./connectorThread.ts";

describe("projectConnectorThread", () => {
  it("carries the thread's rows as they are and reads the session's fields", () => {
    const thread = threadDetail({
      messages: [{ id: "message-1", role: "user" }, { id: "message-2" }],
      activities: [{ id: "activity-1" }],
      session: { status: "running", activeTurnId: "turn-2", lastError: "boom" },
    });
    const payload = projectConnectorThread(thread);
    assert.equal(payload.threadId, "thread-1");
    assert.strictEqual(payload.messages, thread.messages);
    assert.strictEqual(payload.activities, thread.activities);
    assert.equal(payload.sessionStatus, "running");
    assert.equal(payload.activeTurnId, "turn-2");
    assert.equal(payload.sessionError, "boom");
  });

  it("reads a thread without a session as idle", () => {
    const payload = projectConnectorThread(threadDetail());
    assert.equal(payload.sessionStatus, "idle");
    assert.equal(payload.activeTurnId, null);
    assert.equal(payload.sessionError, null);
    assert.equal(payload.latestTurn, null);
  });

  it("hands reasoning messages over as system messages, in place", () => {
    const payload = projectConnectorThread(
      threadDetail({
        messages: [
          { id: "message-1", role: "user" },
          { id: "message-2", role: "reasoning", text: "thinking" },
          { id: "message-3", role: "assistant" },
        ],
      }),
    );
    assert.deepEqual(
      payload.messages.map((message) => [message.id, message.role, message.text]),
      [
        ["message-1", "user", "Text of message-1"],
        ["message-2", "system", "thinking"],
        ["message-3", "assistant", "Text of message-3"],
      ],
    );
  });
});
