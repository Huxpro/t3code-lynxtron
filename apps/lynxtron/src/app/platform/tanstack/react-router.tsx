// Lynx implementation of the parts of `@tanstack/react-router` that upstream
// components import, backed by the Lynx pathname router. ReactLynx cannot mount
// TanStack's RouterProvider (compat-matrix R4), so the build and typecheck
// resolve the package specifier to this module.
//
// A Lynx location is a pathname: no search, no hash, no history state, no
// history stack. Whatever needs one of those throws with the name of the API
// that was asked, so an upstream component never runs on an invented answer.
// Route patterns and params are mapped in `routePaths.ts`.
import { createElement, type ReactElement, type ReactNode } from "@lynx-js/react";

import { getPathname, navigate as navigateLynx, usePathname } from "../../router";
import { div as HostDiv } from "../hostDom";
import { resolveNavigationPathname, routeParams, type RouteParams } from "./routePaths";

export interface LynxLocation {
  readonly pathname: string;
  /** The pathname: a Lynx location has nothing after it. */
  readonly href: string;
  readonly hash: "";
  readonly search: Readonly<Record<string, never>>;
  readonly state: Readonly<Record<string, unknown>>;
}

const NO_SEARCH: LynxLocation["search"] = {};
const NO_STATE: LynxLocation["state"] = {};

function locationOf(pathname: string): LynxLocation {
  return { pathname, href: pathname, hash: "", search: NO_SEARCH, state: NO_STATE };
}

export interface NavigateOptions {
  /** An upstream route pattern, such as `/settings/providers` or `/$environmentId/$threadId`. */
  readonly to?: string | undefined;
  readonly params?: Readonly<Record<string, unknown>> | undefined;
  /** A pathname to go to as it is; an alternative to `to`. */
  readonly href?: string | undefined;
  /** Upstream passes typed search objects; any with a key is refused. */
  readonly search?: object | undefined;
  readonly hash?: string | undefined;
  readonly state?: Readonly<Record<string, unknown>> | undefined;
  /** Accepted and without effect: Lynx keeps no history stack and no scroll restoration. */
  readonly replace?: boolean | undefined;
  readonly resetScroll?: boolean | undefined;
  readonly hashScrollIntoView?: boolean | undefined;
}

function hasKeys(value: object | undefined): boolean {
  return value !== undefined && Object.keys(value).length > 0;
}

function targetPathname(caller: string, options: NavigateOptions): string | null {
  if (hasKeys(options.search)) {
    throw new Error(`${caller}: Lynx routes carry no search params (${options.to ?? "."}).`);
  }
  if (options.hash !== undefined && options.hash !== "") {
    throw new Error(`${caller}: Lynx routes carry no hash (#${options.hash}).`);
  }
  if (hasKeys(options.state)) {
    throw new Error(`${caller}: Lynx routes carry no history state.`);
  }
  if (options.href !== undefined) return resolveNavigationPathname(caller, options.href);
  if (options.to !== undefined) {
    return resolveNavigationPathname(caller, options.to, options.params);
  }
  // Only clearing a hash or state that a Lynx location never has: stay put.
  return null;
}

function navigateTo(caller: string, options: NavigateOptions): Promise<void> {
  const pathname = targetPathname(caller, options);
  if (pathname !== null) navigateLynx(pathname, { replace: options.replace });
  return Promise.resolve();
}

function navigate(options: NavigateOptions): Promise<void> {
  return navigateTo("useNavigate", options);
}

/** Navigates by upstream route pattern. The function is the same on every render. */
export function useNavigate(): (options: NavigateOptions) => Promise<void> {
  return navigate;
}

export function useLocation(): LynxLocation;
export function useLocation<Selected>(options: {
  readonly select: (location: LynxLocation) => Selected;
}): Selected;
export function useLocation<Selected>(options?: {
  readonly select?: ((location: LynxLocation) => Selected) | undefined;
}): Selected | LynxLocation {
  const location = locationOf(usePathname());
  return options?.select ? options.select(location) : location;
}

/**
 * The params of the current pathname, read the way upstream reads them outside
 * a route component: `strict: false`. A strict or `from`-scoped read asks for a
 * route match, which the Lynx router does not have, and throws.
 */
export function useParams(options: { readonly strict: false }): RouteParams;
export function useParams<Selected>(options: {
  readonly strict: false;
  readonly select: (params: RouteParams) => Selected;
}): Selected;
export function useParams<Selected>(options: {
  readonly strict: false;
  readonly select?: ((params: RouteParams) => Selected) | undefined;
}): Selected | RouteParams {
  const pathname = usePathname();
  if (options.strict !== false) {
    throw new Error("useParams: only { strict: false } is supported on Lynx.");
  }
  const params = routeParams(pathname);
  return options.select ? options.select(params) : params;
}

export interface LynxRouter {
  readonly navigate: (options: NavigateOptions) => Promise<void>;
  /** Where a navigation would land, without going there. */
  readonly buildLocation: (options: NavigateOptions) => LynxLocation;
  /** The location at the time it is read. */
  readonly state: { readonly location: LynxLocation };
}

const router: LynxRouter = {
  navigate: (options) => navigateTo("useRouter().navigate", options),
  buildLocation: (options) =>
    locationOf(targetPathname("useRouter().buildLocation", options) ?? getPathname()),
  get state() {
    return { location: locationOf(getPathname()) };
  },
};

/** The router object. Like upstream's, it does not re-render its reader on navigation. */
export function useRouter(): LynxRouter {
  return router;
}

/**
 * Upstream's `<Link>` is an anchor; on Lynx it is a box that navigates on tap.
 * `onClick` runs first and takes no event, so it cannot cancel the navigation.
 */
export function Link({
  to,
  params,
  replace,
  onClick,
  children,
  ...props
}: {
  readonly to: string;
  readonly params?: Readonly<Record<string, unknown>> | undefined;
  readonly replace?: boolean | undefined;
  readonly onClick?: (() => void) | undefined;
  readonly children?: ReactNode | undefined;
  readonly className?: string | undefined;
  readonly "aria-label"?: string | undefined;
}): ReactElement {
  return createElement(
    HostDiv,
    {
      ...props,
      onClick: () => {
        onClick?.();
        void navigateTo("Link", { to, params, replace });
      },
    },
    children,
  );
}
