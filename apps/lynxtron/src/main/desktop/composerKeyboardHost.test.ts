import { assert, describe, it } from "vite-plus/test";

import { T3_COMPOSER_RETURN_FOCUS_METHOD } from "../../shared/composerKeyboardProtocol.ts";
import { startComposerKeyboardHost } from "./composerKeyboardHost.ts";

describe("Lynxtron Composer keyboard host", () => {
  it("enables Return only while the Composer editor is focused", () => {
    const handlers = new Map<string, (params: unknown) => unknown>();
    const removed: string[] = [];
    const enabledStates: boolean[] = [];
    const host = startComposerKeyboardHost(
      {
        handle: (method, handler) => handlers.set(method, handler),
        removeHandler: (method) => removed.push(method),
      },
      (enabled) => enabledStates.push(enabled),
    );

    assert.deepEqual(enabledStates, [false]);
    assert.isTrue(handlers.get(T3_COMPOSER_RETURN_FOCUS_METHOD)?.({ focused: true }));
    assert.isFalse(handlers.get(T3_COMPOSER_RETURN_FOCUS_METHOD)?.({ focused: "yes" }));
    assert.isTrue(handlers.get(T3_COMPOSER_RETURN_FOCUS_METHOD)?.({ focused: false }));
    assert.deepEqual(enabledStates, [false, true, false]);
    host.dispose();
    assert.deepEqual(enabledStates, [false, true, false, false]);
    assert.deepEqual(removed, [T3_COMPOSER_RETURN_FOCUS_METHOD]);
  });
});
