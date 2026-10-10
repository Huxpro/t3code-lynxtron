import { assert, describe, it } from "vite-plus/test";

import { clientSelection, olderTurnsCursor } from "./upstreamSelected.ts";
import { shellSnapshot, threadDetail, threadState } from "./upstreamState.fixtures.ts";

describe("clientSelection", () => {
  const threads = shellSnapshot([{ id: "thread-a" }]).threads;
  const archivedThreads = shellSnapshot([{ id: "thread-archived" }]).threads;

  it("follows the selected thread when the server has it, listed or archived", () => {
    assert.deepEqual(clientSelection({ activeThreadId: "thread-a", threads, archivedThreads }), {
      threadId: "thread-a",
      terminalThreadId: "thread-a",
    });
    assert.deepEqual(
      clientSelection({ activeThreadId: "thread-archived", threads, archivedThreads }),
      { threadId: "thread-archived", terminalThreadId: "thread-archived" },
    );
  });

  it("follows a local draft's terminals but not its thread, which the server lacks", () => {
    assert.deepEqual(clientSelection({ activeThreadId: "draft-1", threads, archivedThreads }), {
      threadId: null,
      terminalThreadId: "draft-1",
    });
  });

  it("follows nothing with no selection", () => {
    assert.deepEqual(clientSelection({ threads, archivedThreads }), {
      threadId: null,
      terminalThreadId: null,
    });
  });
});

describe("olderTurnsCursor", () => {
  const thread = threadDetail();

  it("asks for the next older page of a live windowed thread", () => {
    assert.equal(olderTurnsCursor(threadState("live", thread, { hasMore: true })), "cursor-1");
  });

  it("asks for nothing while a page is loading or the thread is not live", () => {
    assert.equal(
      olderTurnsCursor(threadState("live", thread, { hasMore: true, loadingOlder: true })),
      null,
    );
    assert.equal(olderTurnsCursor(threadState("cached", thread, { hasMore: true })), null);
    assert.equal(olderTurnsCursor(threadState("synchronizing", thread, { hasMore: true })), null);
  });

  it("asks for nothing once the thread is whole", () => {
    assert.equal(olderTurnsCursor(threadState("live", thread, { hasMore: false })), null);
    assert.equal(olderTurnsCursor(threadState("live", thread)), null);
  });
});
