import { assert, describe, it } from "vite-plus/test";

import { T3_TERMINAL_RETURN_FOCUS_METHOD } from "../../shared/terminalKeyboardProtocol.ts";
import { startTerminalKeyboardHost } from "./terminalKeyboardHost.ts";

describe("Lynxtron Terminal keyboard host", () => {
  it("enables Return only while the renderer reports Terminal focus", () => {
    const handlers = new Map<string, (params: unknown) => unknown>();
    const removed: string[] = [];
    const enabledStates: boolean[] = [];
    const host = startTerminalKeyboardHost(
      {
        handle: (method, handler) => handlers.set(method, handler),
        removeHandler: (method) => removed.push(method),
      },
      (enabled) => enabledStates.push(enabled),
    );

    assert.deepEqual(enabledStates, [false]);
    assert.isTrue(handlers.get(T3_TERMINAL_RETURN_FOCUS_METHOD)?.({ focused: true }));
    assert.deepEqual(enabledStates, [false, true]);
    assert.isFalse(handlers.get(T3_TERMINAL_RETURN_FOCUS_METHOD)?.({ focused: "yes" }));
    assert.deepEqual(enabledStates, [false, true]);
    assert.isTrue(handlers.get(T3_TERMINAL_RETURN_FOCUS_METHOD)?.({ focused: false }));
    assert.deepEqual(enabledStates, [false, true, false]);

    host.dispose();
    assert.deepEqual(enabledStates, [false, true, false, false]);
    assert.deepEqual(removed, [T3_TERMINAL_RETURN_FOCUS_METHOD]);
  });
});
