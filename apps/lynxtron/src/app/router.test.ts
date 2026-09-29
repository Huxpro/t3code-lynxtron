import { assert, describe, it } from "vite-plus/test";

import { getPathname, navigate, normalizeLynxPathname } from "./router";

describe("Lynx route authority", () => {
  it("normalizes the Settings root and unsupported sections synchronously", () => {
    assert.equal(normalizeLynxPathname("/settings"), "/settings/general");
    assert.equal(normalizeLynxPathname("/settings/"), "/settings/general");
    assert.equal(normalizeLynxPathname("/settings/providers"), "/settings/providers");
    assert.equal(normalizeLynxPathname("/settings/unknown"), "/settings/general");
  });

  it("keeps chat routes and rejects unsupported paths", () => {
    assert.equal(normalizeLynxPathname("/local/thread-1"), "/local/thread-1");
    assert.equal(normalizeLynxPathname("/unsupported"), "/");
  });

  it("uses one synchronous pathname authority", () => {
    navigate("/settings");
    assert.equal(getPathname(), "/settings/general");
    navigate("/settings/providers", { replace: true });
    assert.equal(getPathname(), "/settings/providers");
    navigate("/");
    assert.equal(getPathname(), "/");
  });
});
