import { afterEach, describe, expect, it } from "vite-plus/test";

import { SETTINGS_NAV_ITEMS } from "../../../web/src/components/settings/SettingsNavigationContent.logic";
import { getPathname, navigate, normalizeLynxPathname } from "./router";

declare global {
  var __T3_LYNXTRON_NAVIGATE__: ((to: string) => void) | undefined;
  var __T3_LYNXTRON_ROUTE__: (() => string) | undefined;
}

afterEach(() => navigate("/", { replace: true }));

describe("Lynx pathname authority", () => {
  it("normalizes the Settings entry synchronously", () => {
    navigate("/settings");
    expect(getPathname()).toBe("/settings/general");
    expect(globalThis.__T3_LYNXTRON_ROUTE__?.()).toBe("/settings/general");
  });

  it("preserves every shared Settings section intent", () => {
    for (const item of SETTINGS_NAV_ITEMS) {
      navigate(item.to, { replace: true });
      expect(getPathname()).toBe(item.to);
    }
  });

  it("keeps thread routes and canonicalizes the archived alias", () => {
    expect(normalizeLynxPathname("/settings/archive")).toBe("/settings/archived");
    navigate("/local/thread-42");
    expect(getPathname()).toBe("/local/thread-42");
  });

  it("exposes the shared Components Lab route", () => {
    globalThis.__T3_LYNXTRON_NAVIGATE__?.("/components-lab");
    expect(getPathname()).toBe("/components-lab");
  });

  it("routes the DevTool writer through the same normalization boundary", () => {
    globalThis.__T3_LYNXTRON_NAVIGATE__?.("/settings");
    expect(getPathname()).toBe("/settings/general");

    globalThis.__T3_LYNXTRON_NAVIGATE__?.("/not-a-supported-probe-route");
    expect(getPathname()).toBe("/settings/general");
  });
});
