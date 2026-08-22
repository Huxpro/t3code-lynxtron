export interface LatestPendingMutation<Value> {
  readonly value: Value;
  previous: LatestPendingMutation<Value> | undefined;
  fallback: Value;
  accepted: boolean;
  rejected: boolean;
}

export function setLatestPendingMutation<Key, Value>(
  pendingMutations: Map<Key, LatestPendingMutation<Value>>,
  key: Key,
  value: Value,
  fallback: Value,
): LatestPendingMutation<Value> {
  const previous = pendingMutations.get(key);
  const mutation = {
    value,
    previous,
    fallback: previous?.fallback ?? fallback,
    accepted: false,
    rejected: false,
  };
  pendingMutations.set(key, mutation);
  return mutation;
}

export function markPendingMutationAccepted<Value>(mutation: LatestPendingMutation<Value>): void {
  mutation.accepted = true;
}

export function rejectPendingMutation<Key, Value>(
  pendingMutations: Map<Key, LatestPendingMutation<Value>>,
  key: Key,
  mutation: LatestPendingMutation<Value>,
): { readonly changed: false } | { readonly changed: true; readonly value: Value } {
  mutation.rejected = true;
  if (pendingMutations.get(key) !== mutation) return { changed: false };
  let previous = mutation.previous;
  while (previous?.rejected) previous = previous.previous;
  if (previous) {
    pendingMutations.set(key, previous);
    return { changed: true, value: previous.value };
  }
  pendingMutations.delete(key);
  return { changed: true, value: mutation.fallback };
}

export function reconcilePendingMutation<Key, Value>(
  pendingMutations: Map<Key, LatestPendingMutation<Value>>,
  key: Key,
  canonicalValue: Value,
): void {
  const latest = pendingMutations.get(key);
  if (!latest) return;
  const mutations: Array<LatestPendingMutation<Value>> = [];
  for (
    let mutation: LatestPendingMutation<Value> | undefined = latest;
    mutation;
    mutation = mutation.previous
  ) {
    mutations.push(mutation);
  }
  const confirmedIndex = mutations.findLastIndex(
    (mutation) =>
      mutation.accepted && !mutation.rejected && Object.is(mutation.value, canonicalValue),
  );
  if (confirmedIndex === 0) {
    pendingMutations.delete(key);
    return;
  }
  if (confirmedIndex > 0) {
    const oldestRemaining = mutations[confirmedIndex - 1]!;
    oldestRemaining.previous = undefined;
    oldestRemaining.fallback = canonicalValue;
  }
}

export function acknowledgePendingMutationAtSequence<Key, Value>(options: {
  readonly pendingMutations: Map<Key, LatestPendingMutation<Value>>;
  readonly key: Key;
  readonly mutation: LatestPendingMutation<Value>;
  readonly canonicalValue: Value | undefined;
  readonly canonicalSequence: number | undefined;
  readonly mutationSequence: number;
}): void {
  markPendingMutationAccepted(options.mutation);
  if (
    options.canonicalValue !== undefined &&
    options.canonicalSequence !== undefined &&
    options.canonicalSequence >= options.mutationSequence
  ) {
    reconcilePendingMutation(options.pendingMutations, options.key, options.canonicalValue);
  }
}

export function enqueueSerialMutation<Key, Result>(
  pendingQueues: Map<Key, Promise<unknown>>,
  key: Key,
  dispatch: () => Promise<Result>,
): Promise<Result> {
  const previous = pendingQueues.get(key) ?? Promise.resolve();
  const queued = previous.catch(() => undefined).then(dispatch);
  const tracked = queued.finally(() => {
    if (pendingQueues.get(key) === tracked) pendingQueues.delete(key);
  });
  pendingQueues.set(key, tracked);
  return tracked;
}
