// Upstream's route paths (`apps/web/src/routes`) mapped onto the Lynx pathname
// router (`src/app/router.ts`). Upstream components name a route by its pattern
// (`to: "/$environmentId/$threadId"`, `params`); the Lynx router knows only a
// pathname. This module turns one into the other and back, and says which
// upstream routes the Lynx app has no screen for.

// Static paths first: a pathname is matched against these in order, so
// `/settings/general` is never read as an environment and a thread.
const ROUTE_PATTERNS = [
  "/",
  "/settings",
  "/settings/$section",
  "/usage",
  "/pull-requests",
  "/connect",
  "/pair",
  "/welcome",
  "/draft/$draftId",
  "/projects/$projectKey",
  "/$environmentId/$threadId",
] as const;

type RoutePattern = (typeof ROUTE_PATTERNS)[number];

// Upstream routes `src/app/index.tsx` does not render. Its switch would show
// the chat view under their pathname, so navigating to one is refused.
const ROUTES_WITHOUT_LYNX_SCREEN: ReadonlySet<RoutePattern> = new Set([
  "/usage",
  "/pull-requests",
  "/connect",
  "/pair",
  "/welcome",
  "/draft/$draftId",
]);

export type RouteParams = Readonly<Record<string, string>>;

function segmentsOf(path: string): string[] {
  return path.split("/").filter((segment) => segment.length > 0);
}

function matchPattern(pattern: RoutePattern, segments: readonly string[]): RouteParams | null {
  const patternSegments = segmentsOf(pattern);
  if (patternSegments.length !== segments.length) return null;
  const params: Record<string, string> = {};
  for (const [index, patternSegment] of patternSegments.entries()) {
    const segment = segments[index] ?? "";
    if (!patternSegment.startsWith("$")) {
      if (patternSegment !== segment) return null;
      continue;
    }
    try {
      params[patternSegment.slice(1)] = decodeURIComponent(segment);
    } catch {
      return null;
    }
  }
  return params;
}

/** The upstream route a pathname belongs to and its params, or null for a Lynx-only pathname. */
export function matchRoute(
  pathname: string,
): { readonly pattern: RoutePattern; readonly params: RouteParams } | null {
  const segments = segmentsOf(pathname);
  for (const pattern of ROUTE_PATTERNS) {
    const params = matchPattern(pattern, segments);
    if (params) return { pattern, params };
  }
  return null;
}

/**
 * The params upstream's `useParams({ strict: false })` reports for a pathname:
 * `environmentId` and `threadId` on a thread, `draftId` on a draft,
 * `projectKey` on a project page, and nothing elsewhere. The settings section
 * is part of upstream's static paths, not a param.
 */
export function routeParams(pathname: string): RouteParams {
  const match = matchRoute(pathname);
  return match === null || match.pattern === "/settings/$section" ? {} : match.params;
}

/**
 * The pathname for an upstream `to` and its `params`, as TanStack Router builds
 * it: each `$name` segment is replaced by its encoded param. `caller` names the
 * router API in the error when the route is relative or a param is missing.
 */
export function buildPathname(
  caller: string,
  to: string,
  params: Readonly<Record<string, unknown>> = {},
): string {
  if (!to.startsWith("/")) {
    throw new Error(`${caller}: relative route "${to}" is not supported on Lynx.`);
  }
  if (/[?#]/u.test(to)) {
    throw new Error(`${caller}: "${to}" carries a search or hash, which Lynx routes do not have.`);
  }
  const segments = segmentsOf(to).map((segment) => {
    if (!segment.startsWith("$")) return segment;
    const value = params[segment.slice(1)];
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`${caller}: route "${to}" needs the param "${segment.slice(1)}".`);
    }
    return encodeURIComponent(value);
  });
  return `/${segments.join("/")}`;
}

/**
 * The Lynx pathname a navigation to an upstream route lands on. Throws, naming
 * `caller`, for a route upstream does not have or Lynx has no screen for.
 */
export function resolveNavigationPathname(
  caller: string,
  to: string,
  params?: Readonly<Record<string, unknown>>,
): string {
  const pathname = buildPathname(caller, to, params);
  const match = matchRoute(pathname);
  if (match === null) {
    throw new Error(`${caller}: "${pathname}" is not a route of the app.`);
  }
  if (ROUTES_WITHOUT_LYNX_SCREEN.has(match.pattern)) {
    throw new Error(`${caller}: the Lynx app has no screen for "${match.pattern}".`);
  }
  return pathname;
}
