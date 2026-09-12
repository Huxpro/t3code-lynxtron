import { assert, describe, it, vi } from "vite-plus/test";

import { createSearchOverlayReturnController } from "./searchOverlayKeyboard.ts";

function key(key: string, sequence: number) {
  return {
    type: "keydown" as const,
    key,
    code: key === "Enter" ? "Enter" : key,
    modifiers: { meta: false, ctrl: false, shift: false, alt: false },
    repeat: false,
    source: { kind: "lynxtron-menu" as const, platform: "darwin" as const },
    sequence,
  };
}

describe("search overlay Return controller", () => {
  it("dispatches one unmodified Return while mounted", () => {
    const focusStates: boolean[] = [];
    const submit = vi.fn(() => true);
    const controller = createSearchOverlayReturnController({
      setHostFocus: async (focused) => focusStates.push(focused),
    });

    assert.isFalse(controller.dispatch(key("Enter", 1)));
    const unmount = controller.mount(submit);
    assert.isTrue(controller.dispatch(key("Enter", 2)));
    assert.isFalse(controller.dispatch(key("Enter", 2)));
    assert.isFalse(controller.dispatch(key("ArrowDown", 3)));
    unmount();
    assert.isFalse(controller.dispatch(key("Enter", 4)));
    assert.deepEqual(focusStates, [true, false]);
    assert.strictEqual(submit.mock.calls.length, 1);
  });

  it("does not consume modified Return or a rejected action", () => {
    const controller = createSearchOverlayReturnController({
      setHostFocus: async () => undefined,
    });
    controller.mount(() => false);
    assert.isFalse(controller.dispatch(key("Enter", 1)));
    assert.isFalse(
      controller.dispatch({
        ...key("Enter", 2),
        modifiers: { meta: true, ctrl: false, shift: false, alt: false },
      }),
    );
  });
});
