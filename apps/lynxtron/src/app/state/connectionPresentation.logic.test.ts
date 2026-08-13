import { assert, describe, it } from "vite-plus/test";

import {
  resolveConnectionScopedValue,
  shouldRenderConnectionLifecycleBanner,
} from "./connectionPresentation.logic";

describe("connection-scoped presentation", () => {
  it("keeps the draft hero centered when connection state changes", () => {
    assert.isFalse(shouldRenderConnectionLifecycleBanner({ hero: true }));
    assert.isTrue(shouldRenderConnectionLifecycleBanner({ hero: false }));
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
});
