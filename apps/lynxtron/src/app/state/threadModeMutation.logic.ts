import type { ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";

import type { ThreadSummary } from "../bridge";

export function projectThreadRuntimeMode(
  threads: ReadonlyArray<ThreadSummary>,
  threadId: string,
  runtimeMode: RuntimeMode,
): ReadonlyArray<ThreadSummary> {
  return threads.map((thread) => (thread.id === threadId ? { ...thread, runtimeMode } : thread));
}

export function projectThreadInteractionMode(
  threads: ReadonlyArray<ThreadSummary>,
  threadId: string,
  interactionMode: ProviderInteractionMode,
): ReadonlyArray<ThreadSummary> {
  return threads.map((thread) =>
    thread.id === threadId ? { ...thread, interactionMode } : thread,
  );
}

export function rollbackThreadModeMutation(
  current: ReadonlyArray<ThreadSummary>,
  previous: ReadonlyArray<ThreadSummary>,
  threadId: string,
  mode: "runtimeMode" | "interactionMode",
  optimisticValue: RuntimeMode | ProviderInteractionMode,
): ReadonlyArray<ThreadSummary> {
  const currentThread = current.find((thread) => thread.id === threadId);
  if (currentThread?.[mode] !== optimisticValue) return current;
  const previousThread = previous.find((thread) => thread.id === threadId);
  if (!previousThread) return current;
  return current.map((thread) =>
    thread.id === threadId ? { ...thread, [mode]: previousThread[mode] } : thread,
  );
}
