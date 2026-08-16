import type { VcsStatusResult } from "@t3tools/contracts";
import { assert, describe, it } from "vite-plus/test";

import { resolveQuickAction } from "./gitActions.js";

function status(overrides: Partial<VcsStatusResult> = {}): VcsStatusResult {
  return {
    isRepo: true,
    hasPrimaryRemote: true,
    isDefaultRef: false,
    refName: "feature/test",
    hasWorkingTreeChanges: false,
    workingTree: {
      files: [],
      insertions: 0,
      deletions: 0,
    },
    hasUpstream: true,
    aheadCount: 0,
    behindCount: 0,
    pr: null,
    ...overrides,
  };
}

describe("shared Git quick action", () => {
  it("projects Publish repository for a clean repository without a primary remote", () => {
    assert.deepEqual(
      resolveQuickAction(
        status({
          hasPrimaryRemote: false,
          hasUpstream: false,
        }),
        false,
        false,
        false,
      ),
      {
        label: "Publish repository",
        disabled: false,
        kind: "open_publish",
      },
    );
  });

  it("keeps a local-only dirty repository committable", () => {
    assert.deepEqual(
      resolveQuickAction(
        status({
          hasPrimaryRemote: false,
          hasUpstream: false,
          hasWorkingTreeChanges: true,
        }),
        false,
        false,
        false,
      ),
      {
        label: "Commit",
        disabled: false,
        kind: "run_action",
        action: "commit",
      },
    );
  });

  it("retains remote-backed push and change-request behavior", () => {
    assert.deepInclude(resolveQuickAction(status({ aheadCount: 2 }), false), {
      label: "Push & create PR",
      disabled: false,
      kind: "run_action",
      action: "create_pr",
    });
  });
});
