import { assert, describe, it } from "vite-plus/test";

import { clientSelection, olderTurnsCursor } from "./upstreamSelected.ts";
import { shellSnapshot, threadDetail, threadState } from "./upstreamState.fixtures.ts";

describe("clientSelection", () => {
  const client = {
    threads: shellSnapshot([{ id: "thread-a" }]).threads,
    archivedThreads: shellSnapshot([{ id: "thread-archived" }]).threads,
    vcsStatusCwd: "/work/project-1",
  };

  it("follows the selected thread when the server has it, listed or archived", () => {
    assert.deepEqual(clientSelection({ ...client, activeThreadId: "thread-a" }), {
      threadId: "thread-a",
      terminalThreadId: "thread-a",
      vcsCwd: "/work/project-1",
    });
    assert.equal(
      clientSelection({ ...client, activeThreadId: "thread-archived" }).threadId,
      "thread-archived",
    );
  });

  it("follows a local draft's terminals but not its thread, which the server lacks", () => {
    assert.deepEqual(clientSelection({ ...client, activeThreadId: "draft-1" }), {
      threadId: null,
      terminalThreadId: "draft-1",
      vcsCwd: "/work/project-1",
    });
  });

  it("follows nothing with no selection and no directory", () => {
    assert.deepEqual(clientSelection({ ...client, vcsStatusCwd: null }), {
      threadId: null,
      terminalThreadId: null,
      vcsCwd: null,
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
