import { describe, expect, it } from "vite-plus/test";

import { SETTINGS_NAV_ITEMS } from "../../../../../web/src/components/settings/SettingsNavigationContent.logic";
import { parseProjectSettingsPath, projectSettingsPath } from "../../projectSettingsRoute";
import { normalizeLynxPathname } from "../../router";
import { buildPathname, matchRoute, resolveNavigationPathname, routeParams } from "./routePaths";

describe("routeParams", () => {
  it("reads a thread route's environment and thread", () => {
    expect(routeParams("/local/thread-42")).toEqual({
      environmentId: "local",
      threadId: "thread-42",
    });
  });

  it("reads a draft and a project page", () => {
    expect(routeParams("/draft/draft-7")).toEqual({ draftId: "draft-7" });
    expect(routeParams("/projects/primary%3A%2Frepo")).toEqual({ projectKey: "primary:/repo" });
  });

  it("reports no params on the thread list, settings, and Lynx-only pathnames", () => {
    expect(routeParams("/")).toEqual({});
    expect(routeParams("/settings/general")).toEqual({});
    expect(routeParams("/settings/providers")).toEqual({});
    expect(routeParams("/usage")).toEqual({});
    expect(routeParams("/components-lab")).toEqual({});
  });

  it("never reads a settings section or a project page as a thread", () => {
    for (const item of SETTINGS_NAV_ITEMS) {
      expect(routeParams(item.to)).toEqual({});
      expect(matchRoute(item.to)?.pattern).toBe("/settings/$section");
    }
    expect(matchRoute("/projects/key")?.pattern).toBe("/projects/$projectKey");
    expect(matchRoute("/draft/d")?.pattern).toBe("/draft/$draftId");
  });

  it("answers no params for a segment that does not decode", () => {
    expect(routeParams("/local/%E0%A4%A")).toEqual({});
  });
});

describe("buildPathname", () => {
  it("fills a thread route from its params", () => {
    expect(
      buildPathname("useNavigate", "/$environmentId/$threadId", {
        environmentId: "local",
        threadId: "thread-42",
      }),
    ).toBe("/local/thread-42");
  });

  it("encodes a param the way the Lynx project route spells it", () => {
    const pathname = buildPathname("useNavigate", "/projects/$projectKey", {
      projectKey: "primary:/repo",
    });
    expect(pathname).toBe(projectSettingsPath("primary:/repo"));
    expect(parseProjectSettingsPath(pathname)).toBe("primary:/repo");
  });

  it("round-trips params through the pathname", () => {
    const params = { environmentId: "env a/b", threadId: "t#1?x" };
    expect(routeParams(buildPathname("useNavigate", "/$environmentId/$threadId", params))).toEqual(
      params,
    );
  });

  it("names the caller when a param is missing or the route is relative", () => {
    expect(() =>
      buildPathname("useNavigate", "/$environmentId/$threadId", { environmentId: "local" }),
    ).toThrow(/^useNavigate: route "\/\$environmentId\/\$threadId" needs the param "threadId"/u);
    expect(() => buildPathname("Link", "..")).toThrow(/^Link: relative route/u);
    expect(() => buildPathname("Link", "/settings?tab=1")).toThrow(/search or hash/u);
  });
});

describe("resolveNavigationPathname", () => {
  it("lands on the pathname the Lynx router keeps", () => {
    expect(resolveNavigationPathname("useNavigate", "/")).toBe("/");
    expect(resolveNavigationPathname("useNavigate", "/settings/providers")).toBe(
      "/settings/providers",
    );
    expect(normalizeLynxPathname(resolveNavigationPathname("useNavigate", "/settings"))).toBe(
      "/settings/general",
    );
    expect(
      resolveNavigationPathname("useNavigate", "/$environmentId/$threadId", {
        environmentId: "local",
        threadId: "t1",
      }),
    ).toBe("/local/t1");
  });

  it("reaches every settings section upstream lists", () => {
    for (const item of SETTINGS_NAV_ITEMS) {
      expect(resolveNavigationPathname("useNavigate", item.to)).toBe(item.to);
    }
  });

  it("refuses upstream routes the Lynx app has no screen for, naming the caller", () => {
    for (const to of ["/usage", "/pull-requests", "/connect", "/pair", "/welcome"]) {
      expect(() => resolveNavigationPathname("useNavigate", to)).toThrow(
        /^useNavigate: the Lynx app has no screen for/u,
      );
    }
    expect(() =>
      resolveNavigationPathname("useRouter().navigate", "/draft/$draftId", { draftId: "d1" }),
    ).toThrow(/^useRouter\(\)\.navigate: the Lynx app has no screen for "\/draft\/\$draftId"/u);
  });

  it("refuses a pathname that is no route of the app", () => {
    expect(() => resolveNavigationPathname("useNavigate", "/a/b/c")).toThrow(
      /^useNavigate: "\/a\/b\/c" is not a route of the app/u,
    );
  });
});
