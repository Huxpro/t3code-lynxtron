import { assert, describe, it } from "vite-plus/test";

import { matchesViewportMediaQuery, normalizeMediaQuery, viewportTier } from "./mediaQuery.ts";

const desktop = { width: 1280, height: 820, pointer: "fine" as const };

describe("responsive media query projection", () => {
  it("normalizes the shared breakpoint shorthand", () => {
    assert.equal(normalizeMediaQuery("max-md"), "(max-width: 767px)");
    assert.equal(normalizeMediaQuery("sm:max-lg"), "(min-width: 640px) and (max-width: 1023px)");
    assert.equal(
      normalizeMediaQuery({ min: 620, max: 780 }),
      "(min-width: 620px) and (max-width: 779px)",
    );
  });

  it("matches width and pointer clauses from a host snapshot", () => {
    assert.equal(matchesViewportMediaQuery(desktop, "xl"), true);
    assert.equal(matchesViewportMediaQuery(desktop, "(max-width: 980px)"), false);
    assert.equal(matchesViewportMediaQuery(desktop, { min: "lg", pointer: "fine" }), true);
    assert.equal(matchesViewportMediaQuery(desktop, { pointer: "coarse" }), false);
  });

  it("projects stable viewport tiers", () => {
    assert.equal(viewportTier(639), "base");
    assert.equal(viewportTier(640), "sm");
    assert.equal(viewportTier(768), "md");
    assert.equal(viewportTier(1024), "lg");
    assert.equal(viewportTier(1280), "xl");
  });
});
