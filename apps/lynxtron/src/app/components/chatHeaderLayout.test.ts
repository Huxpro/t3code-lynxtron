import { describe, expect, it } from "vite-plus/test";

import { EXPANDED_HEADER_ACTIONS_MIN_WIDTH, shouldCompactHeaderActions } from "./chatHeaderLayout";

describe("shouldCompactHeaderActions", () => {
  it("matches the Web @3xl/header-actions threshold", () => {
    expect(EXPANDED_HEADER_ACTIONS_MIN_WIDTH).toBe(768);
    expect(shouldCompactHeaderActions(767.9)).toBe(true);
    expect(shouldCompactHeaderActions(768)).toBe(false);
    expect(shouldCompactHeaderActions(1024)).toBe(false);
  });
});
