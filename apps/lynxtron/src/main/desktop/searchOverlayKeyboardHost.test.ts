import { assert, describe, it } from "vite-plus/test";

import { T3_SEARCH_OVERLAY_RETURN_FOCUS_METHOD } from "../../shared/searchOverlayKeyboardProtocol.ts";
import { startSearchOverlayKeyboardHost } from "./searchOverlayKeyboardHost.ts";

describe("Lynxtron search-overlay keyboard host", () => {
  it("enables Return only while a search overlay is mounted", () => {
    const handlers = new Map<string, (params: unknown) => unknown>();
    const removed: string[] = [];
    const enabledStates: boolean[] = [];
    const host = startSearchOverlayKeyboardHost(
      {
        handle: (method, handler) => handlers.set(method, handler),
        removeHandler: (method) => removed.push(method),
      },
      (enabled) => enabledStates.push(enabled),
    );

    assert.deepEqual(enabledStates, [false]);
    assert.isTrue(handlers.get(T3_SEARCH_OVERLAY_RETURN_FOCUS_METHOD)?.({ focused: true }));
    assert.deepEqual(enabledStates, [false, true]);
    assert.isFalse(handlers.get(T3_SEARCH_OVERLAY_RETURN_FOCUS_METHOD)?.({ focused: "yes" }));
    assert.isTrue(handlers.get(T3_SEARCH_OVERLAY_RETURN_FOCUS_METHOD)?.({ focused: false }));
    assert.deepEqual(enabledStates, [false, true, false]);

    host.dispose();
    assert.deepEqual(enabledStates, [false, true, false, false]);
    assert.deepEqual(removed, [T3_SEARCH_OVERLAY_RETURN_FOCUS_METHOD]);
  });
});
