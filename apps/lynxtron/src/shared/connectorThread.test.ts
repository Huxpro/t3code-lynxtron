import { assert, describe, it } from "vite-plus/test";

import { threadDetail } from "../app/state/upstreamState.fixtures.ts";
import { projectConnectorThread } from "./connectorThread.ts";
import { projectThread } from "./orchestrationProjection.ts";

describe("projectConnectorThread", () => {
  it("carries the thread's rows as they are and reads the session's fields", () => {
    const thread = projectThread(
      threadDetail({
        messages: [{ id: "message-1", role: "user" }, { id: "message-2" }],
        runningRunId: "run-2",
      }),
    );
    const payload = projectConnectorThread(thread);
    assert.equal(payload.threadId, "thread-1");
    assert.strictEqual(payload.messages, thread.messages);
    assert.strictEqual(payload.activities, thread.activities);
    assert.equal(payload.sessionStatus, "running");
    assert.equal(payload.activeTurnId, "run-2");
    assert.equal(payload.sessionError, null);
  });

  it("reads a thread without a session as idle", () => {
    const payload = projectConnectorThread(projectThread(threadDetail()));
    assert.equal(payload.sessionStatus, "idle");
    assert.equal(payload.activeTurnId, null);
    assert.equal(payload.sessionError, null);
    assert.equal(payload.latestTurn, null);
  });

  it("hands a thinking trace over as a system message, in place", () => {
    const payload = projectConnectorThread(
      projectThread(
        threadDetail({
          messages: [
            { id: "message-1", role: "user" },
            { id: "message-2", role: "reasoning", text: "thinking" },
            { id: "message-3", role: "assistant" },
          ],
        }),
      ),
    );
    assert.deepEqual(
      payload.messages.map((message) => [message.role, message.text]),
      [
        ["user", "Text of message-1"],
        ["system", "thinking"],
        ["assistant", "Text of message-3"],
      ],
    );
  });
});
