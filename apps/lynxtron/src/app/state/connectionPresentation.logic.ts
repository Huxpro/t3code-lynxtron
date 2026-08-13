import type { ConnectionStatus } from "../bridge";

export function shouldRenderConnectionLifecycleBanner(options: {
  readonly hero: boolean;
}): boolean {
  return !options.hero;
}

export function resolveConnectionScopedValue<T>(options: {
  readonly status: ConnectionStatus;
  readonly current: T | undefined;
  readonly lastKnown: T | undefined;
}): T | undefined {
  return options.current ?? (options.status === "ready" ? undefined : options.lastKnown);
}
