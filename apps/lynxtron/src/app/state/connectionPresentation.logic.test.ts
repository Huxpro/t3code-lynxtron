import { assert, describe, it } from "vite-plus/test";

import {
  resolveConnectionScopedValue,
  resolveThreadLockedConnectionValue,
  shouldRenderConnectionLifecycleBanner,
} from "./connectionPresentation.logic";

describe("connection-scoped presentation", () => {
  it("renders connection recovery in both draft and existing-thread composers", () => {
    assert.isTrue(shouldRenderConnectionLifecycleBanner());
  });

  it("retains the last known presentation only while the connection is unavailable", () => {
    assert.equal(
      resolveConnectionScopedValue({
        status: "reconnecting",
        current: undefined,
        lastKnown: "Claude Fable 5",
      }),
      "Claude Fable 5",
    );
    assert.isUndefined(
      resolveConnectionScopedValue({
        status: "ready",
        current: undefined,
        lastKnown: "Claude Fable 5",
      }),
    );
    assert.equal(
      resolveConnectionScopedValue({
        status: "ready",
        current: "Claude Opus 5",
        lastKnown: "Claude Fable 5",
      }),
      "Claude Opus 5",
    );
  });

  it("does not let recovery fallback replace an active thread selection", () => {
    assert.isUndefined(
      resolveThreadLockedConnectionValue({
        hasActiveThread: true,
        status: "reconnecting",
        current: undefined,
        lastKnown: "Claude Fable 5",
      }),
    );
    assert.equal(
      resolveThreadLockedConnectionValue({
        hasActiveThread: true,
        status: "reconnecting",
        current: "GPT-5.6-Sol",
        lastKnown: "Claude Fable 5",
      }),
      "GPT-5.6-Sol",
    );
    assert.equal(
      resolveThreadLockedConnectionValue({
        hasActiveThread: false,
        status: "reconnecting",
        current: undefined,
        lastKnown: "Claude Fable 5",
      }),
      "Claude Fable 5",
    );
  });
});
