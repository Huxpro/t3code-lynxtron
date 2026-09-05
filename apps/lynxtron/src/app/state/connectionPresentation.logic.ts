import type { ConnectionStatus } from "../bridge";

export function shouldRenderConnectionLifecycleBanner(): boolean {
  return true;
}

export function resolveConnectionScopedValue<T>(options: {
  readonly status: ConnectionStatus;
  readonly current: T | undefined;
  readonly lastKnown: T | undefined;
}): T | undefined {
  return options.current ?? (options.status === "ready" ? undefined : options.lastKnown);
}

/**
 * A selected thread owns its provider/model selection. Connection recovery may
 * retain a last-known value for an empty/new-thread Composer, but must never
 * replace a persisted thread's canonical selection with a stale preference.
 */
export function resolveThreadLockedConnectionValue<T>(options: {
  readonly hasActiveThread: boolean;
  readonly status: ConnectionStatus;
  readonly current: T | undefined;
  readonly lastKnown: T | undefined;
}): T | undefined {
  return options.hasActiveThread
    ? options.current
    : resolveConnectionScopedValue({
        status: options.status,
        current: options.current,
        lastKnown: options.lastKnown,
      });
}
