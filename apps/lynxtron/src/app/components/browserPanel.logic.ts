import {
  describePreviewError,
  normalizePreviewUrl,
  resolvePreviewActionUrl,
} from "@t3tools/shared/preview";

export function resolveBrowserNavigation(
  rawUrl: string,
): { readonly ok: true; readonly url: string } | { readonly ok: false; readonly message: string } {
  try {
    return { ok: true, url: normalizePreviewUrl(rawUrl) };
  } catch {
    return { ok: false, message: "Enter a valid HTTP or HTTPS URL." };
  }
}

export function browserEventUrl(event: unknown): string | null {
  if (!event || typeof event !== "object" || !("detail" in event)) return null;
  const detail = event.detail;
  if (!detail || typeof detail !== "object" || !("url" in detail)) return null;
  return typeof detail.url === "string" ? detail.url : null;
}

export function browserEventError(event: unknown): string {
  if (!event || typeof event !== "object" || !("detail" in event)) {
    return "The page could not be loaded.";
  }
  const detail = event.detail;
  if (!detail || typeof detail !== "object" || !("errorMsg" in detail)) {
    return "The page could not be loaded.";
  }
  return typeof detail.errorMsg === "string" ? detail.errorMsg : "The page could not be loaded.";
}

export interface BrowserLoadFailure {
  readonly code: number | null;
  readonly message: string;
}

export function selectWarmBrowserSurfaceIds(
  browserSurfaceIds: ReadonlyArray<string>,
  activeSurfaceId: string | null,
  previousActiveBrowserId: string | null,
  inactiveBrowserExpired = false,
): ReadonlyArray<string> {
  const available = new Set(browserSurfaceIds);
  const hasActiveBrowser = activeSurfaceId !== null && available.has(activeSurfaceId);
  if (!hasActiveBrowser && inactiveBrowserExpired) return [];
  const selected: string[] = [];
  if (hasActiveBrowser) selected.push(activeSurfaceId);
  if (
    previousActiveBrowserId &&
    available.has(previousActiveBrowserId) &&
    previousActiveBrowserId !== activeSurfaceId
  ) {
    selected.push(previousActiveBrowserId);
  }
  if (selected.length === 0) {
    const fallback = browserSurfaceIds.at(-1);
    if (fallback) selected.push(fallback);
  } else if (selected.length === 1 && hasActiveBrowser) {
    const fallback = browserSurfaceIds.findLast((surfaceId) => surfaceId !== activeSurfaceId);
    if (fallback) selected.push(fallback);
  }
  return selected;
}

/** Matches Electron's did-fail-load policy: aborted navigations are not user-visible failures. */
export function browserEventFailure(event: unknown): BrowserLoadFailure | null {
  const detail =
    event && typeof event === "object" && "detail" in event && event.detail ? event.detail : null;
  const code =
    detail && typeof detail === "object" && "errorCode" in detail
      ? typeof detail.errorCode === "number"
        ? detail.errorCode
        : null
      : null;
  if (code === -3) return null;
  return { code, message: browserEventError(event) };
}

export function browserFailurePresentation(url: string, failure: BrowserLoadFailure) {
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    // Preserve the original value when the runtime reports a malformed URL.
  }
  return {
    host,
    description: describePreviewError(failure.message),
    errorLabel:
      failure.message.length > 0
        ? failure.message
        : `ERR_${Math.abs(failure.code ?? 0) || "FAILED"}`,
  };
}

export function browserActionUrl(url: string): string | null {
  return resolvePreviewActionUrl(url);
}
