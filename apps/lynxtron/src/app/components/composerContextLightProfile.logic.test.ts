import { describe, expect, it } from "vite-plus/test";

import { COMPOSER_CONTEXT_LIGHT_PROFILE } from "./composerContextLightProfile.logic";

describe("Composer light Context profile", () => {
  it("matches the current Web shadow ramp one physical pixel at a time", () => {
    expect(COMPOSER_CONTEXT_LIGHT_PROFILE).toHaveLength(31);
    expect(COMPOSER_CONTEXT_LIGHT_PROFILE[0]).toBe(222);
    expect(COMPOSER_CONTEXT_LIGHT_PROFILE.at(-1)).toBe(255);
    expect(COMPOSER_CONTEXT_LIGHT_PROFILE).toEqual(
      [...COMPOSER_CONTEXT_LIGHT_PROFILE].sort((left, right) => left - right),
    );
  });
});
