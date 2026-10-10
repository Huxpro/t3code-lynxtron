// How a stacked git action's progress stream ends: with the result of its
// `action_finished` event, or as an error carrying the server's own message.
import type { GitActionProgressEvent, GitRunStackedActionResult } from "@t3tools/contracts";

export interface GitActionOutcome {
  readonly result: GitRunStackedActionResult | null;
  readonly failure: string | null;
}

export const EMPTY_GIT_ACTION_OUTCOME: GitActionOutcome = { result: null, failure: null };

export function applyGitActionProgress(
  outcome: GitActionOutcome,
  event: GitActionProgressEvent,
): GitActionOutcome {
  if (event.kind === "action_finished") return { ...outcome, result: event.result };
  if (event.kind === "action_failed") return { ...outcome, failure: event.message };
  return outcome;
}

/** The action's result once its stream has ended; throws if it failed or never finished. */
export function resolveGitActionOutcome(outcome: GitActionOutcome): GitRunStackedActionResult {
  if (outcome.failure) throw new Error(outcome.failure);
  if (!outcome.result) throw new Error("Git action completed without a result.");
  return outcome.result;
}
