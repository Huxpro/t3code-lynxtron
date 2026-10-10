import { assert, describe, it } from "vite-plus/test";

import { createStartupProjectStep, decideStartupProject } from "./startupProject.ts";
import {
  catalogAt,
  connection,
  serverConfig,
  shellSnapshot,
  shellState,
} from "./upstreamState.fixtures.ts";

const FIRST_SERVER = "http://127.0.0.1:4100/";
const SECOND_SERVER = "http://127.0.0.1:4207/";
const CWD = "/work/startup";

const empty = shellSnapshot([], []);
const withProject = shellSnapshot([], [{ id: "project-1", title: "startup" }]);
const archived = shellSnapshot([], []);

function primaryState(
  snapshot: typeof empty | null,
  options: {
    readonly httpBaseUrl?: string;
    readonly phase?: Parameters<typeof connection>[0];
    readonly status?: Parameters<typeof shellState>[0];
  } = {},
) {
  return {
    catalog: catalogAt(options.httpBaseUrl ?? FIRST_SERVER),
    connection: connection(options.phase ?? "connected"),
    shell: shellState(options.status ?? "live", snapshot),
    config: serverConfig(),
    archived,
  };
}

describe("decideStartupProject", () => {
  it("creates the project when the server's live shell has none", () => {
    assert.equal(decideStartupProject(primaryState(empty), CWD), "create");
  });

  it("leaves a server alone that has a project, for this directory or another", () => {
    assert.equal(decideStartupProject(primaryState(withProject), CWD), "skip");
    assert.equal(decideStartupProject(primaryState(withProject), "/elsewhere"), "skip");
  });

  it("does nothing when the host asked for no project", () => {
    assert.equal(decideStartupProject(primaryState(empty), null), "skip");
    assert.equal(
      decideStartupProject(primaryState(null, { status: "synchronizing" }), null),
      "skip",
    );
  });

  it("waits until upstream is connected and its shell is live", () => {
    assert.equal(decideStartupProject(primaryState(empty, { phase: "connecting" }), CWD), "wait");
    assert.equal(
      decideStartupProject(primaryState(null, { status: "synchronizing" }), CWD),
      "wait",
    );
    // A cached shell is not what the server holds now.
    assert.equal(decideStartupProject(primaryState(empty, { status: "cached" }), CWD), "wait");
    assert.equal(decideStartupProject({ ...primaryState(empty), config: null }, CWD), "wait");
  });
});

function deferred() {
  let resolve = () => {};
  let reject = (_error: Error) => {};
  const promise = new Promise<void>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function harness(requested: Readonly<Record<string, string>> = { [FIRST_SERVER]: CWD }) {
  const created: Array<string> = [];
  let pending = deferred();
  let settledCalls = 0;
  const step = createStartupProjectStep({
    requestedCwd: (httpBaseUrl) => requested[httpBaseUrl] ?? null,
    create: (workspaceRoot) => {
      created.push(workspaceRoot);
      pending = deferred();
      return pending.promise;
    },
    onSettled: () => {
      settledCalls += 1;
    },
  });
  return {
    step,
    created,
    // The command is sent a microtask after the state that called for it.
    succeed: async () => {
      await Promise.resolve();
      pending.resolve();
      await pending.promise;
    },
    fail: async (message: string) => {
      await Promise.resolve();
      pending.reject(new Error(message));
      await pending.promise.catch(() => undefined);
      await Promise.resolve();
    },
    settledCalls: () => settledCalls,
  };
}

describe("createStartupProjectStep", () => {
  it("creates the project once and is over when the shell shows it", async () => {
    const { step, created, succeed, settledCalls } = harness();
    assert.isFalse(step.observe(primaryState(empty)));
    // More state arrives while the command is on its way.
    assert.isFalse(step.observe(primaryState(empty)));
    await succeed();
    assert.isFalse(step.observe(primaryState(empty)));
    assert.isTrue(step.observe(primaryState(withProject)));
    assert.deepEqual(created, [CWD]);
    assert.equal(settledCalls(), 0);
  });

  it("is over at once for a server that has a project", () => {
    const { step, created } = harness();
    assert.isTrue(step.observe(primaryState(withProject)));
    assert.deepEqual(created, []);
  });

  it("is not repeated for the same server, even with no project left", () => {
    const { step, created } = harness();
    assert.isTrue(step.observe(primaryState(withProject)));
    // The user deleted the project and upstream's session reconnected.
    assert.isTrue(step.observe(primaryState(empty)));
    assert.deepEqual(created, []);
  });

  it("ends on a failure, says so, and does not try again", async () => {
    const { step, created, fail, settledCalls } = harness();
    assert.isFalse(step.observe(primaryState(empty)));
    await fail("Project already exists");
    assert.equal(settledCalls(), 1);
    assert.isTrue(step.observe(primaryState(empty)));
    assert.deepEqual(created, [CWD]);
  });

  it("finds the first server's project on the server a restart brings", async () => {
    const { step, created, succeed } = harness({ [FIRST_SERVER]: CWD, [SECOND_SERVER]: CWD });
    assert.isFalse(step.observe(primaryState(empty)));
    await succeed();
    assert.isTrue(step.observe(primaryState(withProject)));
    assert.isTrue(step.observe(primaryState(withProject, { httpBaseUrl: SECOND_SERVER })));
    assert.deepEqual(created, [CWD]);
  });

  it("creates nothing for a server the host named no directory for", () => {
    const { step, created } = harness({});
    assert.isTrue(step.observe(primaryState(empty)));
    assert.deepEqual(created, []);
  });
});
