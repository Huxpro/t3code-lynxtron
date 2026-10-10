import type { ThreadTurnStartBootstrap } from "@t3tools/contracts";
import { buildTemporaryWorktreeBranchName } from "@t3tools/shared/git";

/**
 * Names the temporary branch of a worktree the turn is about to prepare, when
 * the caller did not choose one. `randomHex` supplies the branch's token.
 */
export function materializeTurnBootstrap(
  bootstrap: ThreadTurnStartBootstrap | undefined,
  randomHex: (byteLength: number) => string,
): ThreadTurnStartBootstrap | undefined {
  if (!bootstrap?.prepareWorktree) return bootstrap;
  return {
    ...bootstrap,
    prepareWorktree: {
      ...bootstrap.prepareWorktree,
      branch: bootstrap.prepareWorktree.branch ?? buildTemporaryWorktreeBranchName(randomHex),
    },
  };
}
