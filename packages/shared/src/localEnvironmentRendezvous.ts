export interface LocalEnvironmentRendezvous {
  readonly version: 1;
  readonly ownerPid: number;
  readonly environmentId: string;
  readonly httpBaseUrl: string;
  readonly wsBaseUrl: string;
  readonly bootstrapCredential: string;
  readonly publishedAt: string;
}

export function parseLocalEnvironmentRendezvous(value: unknown): LocalEnvironmentRendezvous | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<LocalEnvironmentRendezvous>;
  if (
    candidate.version !== 1 ||
    !Number.isSafeInteger(candidate.ownerPid) ||
    (candidate.ownerPid ?? 0) <= 0 ||
    typeof candidate.environmentId !== "string" ||
    typeof candidate.httpBaseUrl !== "string" ||
    typeof candidate.wsBaseUrl !== "string" ||
    typeof candidate.bootstrapCredential !== "string" ||
    typeof candidate.publishedAt !== "string" ||
    !Number.isFinite(Date.parse(candidate.publishedAt))
  ) {
    return null;
  }
  try {
    const http = new URL(candidate.httpBaseUrl);
    const ws = new URL(candidate.wsBaseUrl);
    if (
      (http.protocol !== "http:" && http.protocol !== "https:") ||
      (ws.protocol !== "ws:" && ws.protocol !== "wss:")
    ) {
      return null;
    }
  } catch {
    return null;
  }
  return candidate as LocalEnvironmentRendezvous;
}

export function selectNewestLiveLocalEnvironmentRendezvous(
  values: ReadonlyArray<unknown>,
  isProcessAlive: (pid: number) => boolean,
): LocalEnvironmentRendezvous | null {
  return (
    values
      .flatMap((value) => {
        const descriptor = parseLocalEnvironmentRendezvous(value);
        return descriptor && isProcessAlive(descriptor.ownerPid) ? [descriptor] : [];
      })
      .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt))[0] ??
    null
  );
}
