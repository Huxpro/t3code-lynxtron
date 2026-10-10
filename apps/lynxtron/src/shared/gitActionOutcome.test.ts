import { GitActionProgressEvent } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { assert, describe, it } from "vite-plus/test";

import {
  applyGitActionProgress,
  EMPTY_GIT_ACTION_OUTCOME,
  resolveGitActionOutcome,
} from "./gitActionOutcome.ts";

const decodeEvent = Schema.decodeUnknownSync(GitActionProgressEvent);
const base = { actionId: "action-1", cwd: "/work/project-1", action: "commit" };
const result = {
  action: "commit",
  branch: { status: "skipped_not_requested" },
  commit: { status: "created", commitSha: "abc1234", subject: "Fix the thing" },
  push: { status: "skipped_not_requested" },
  pr: { status: "skipped_not_requested" },
  toast: { title: "Committed abc1234", cta: { kind: "none" } },
};

function outcomeOf(events: ReadonlyArray<unknown>) {
  return events
    .map((event) => decodeEvent(event))
    .reduce(applyGitActionProgress, EMPTY_GIT_ACTION_OUTCOME);
}

describe("git action outcome", () => {
  it("is the result of the finished event, whatever progress came before it", () => {
    const outcome = outcomeOf([
      { ...base, kind: "action_started", phases: ["commit"] },
      { ...base, kind: "phase_started", phase: "commit", label: "Committing" },
      { ...base, kind: "action_finished", result },
    ]);
    assert.equal(resolveGitActionOutcome(outcome).commit.status, "created");
  });

  it("fails with the server's message", () => {
    const outcome = outcomeOf([
      { ...base, kind: "action_started", phases: ["commit"] },
      { ...base, kind: "action_failed", phase: "commit", message: "nothing to commit" },
    ]);
    assert.throws(() => resolveGitActionOutcome(outcome), /nothing to commit/);
  });

  it("fails when the stream ends without a result", () => {
    const outcome = outcomeOf([{ ...base, kind: "action_started", phases: ["commit"] }]);
    assert.throws(() => resolveGitActionOutcome(outcome), /without a result/);
  });
});
