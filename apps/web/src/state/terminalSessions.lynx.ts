import type { EnvironmentId, ThreadId } from "@t3tools/contracts";

/**
 * Lynxtron currently exposes the canonical project/thread snapshot through its
 * connector, but does not yet stream Web terminal-session metadata. Keep the
 * shared Sidebar composition intact and adapt only this unsupported host leaf.
 */
export function useThreadRunningTerminalIds(_input: {
  readonly environmentId: EnvironmentId | null;
  readonly threadId: ThreadId | null;
}): ReadonlyArray<string> {
  return [];
}
