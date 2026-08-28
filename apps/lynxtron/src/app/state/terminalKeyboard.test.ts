import { assert, describe, it, vi } from "vite-plus/test";

import { createTerminalReturnController } from "./terminalKeyboard.ts";

function enter(sequence: number) {
  return {
    type: "keydown" as const,
    key: "Enter",
    code: "Enter",
    modifiers: { meta: false, ctrl: false, shift: false, alt: false },
    repeat: false,
    source: { kind: "lynxtron-menu" as const, platform: "darwin" as const },
    sequence,
  };
}

describe("Terminal Return controller", () => {
  it("submits once only while the Terminal input is focused", () => {
    const focusStates: boolean[] = [];
    const submit = vi.fn(() => true);
    const controller = createTerminalReturnController({
      setHostFocus: async (focused) => focusStates.push(focused),
    });
    controller.setSubmitHandler(submit);

    assert.isFalse(controller.dispatch(enter(1)));
    controller.setFocused(true);
    assert.isTrue(controller.dispatch(enter(2)));
    assert.isFalse(controller.dispatch(enter(2)));
    controller.setFocused(false);
    assert.isFalse(controller.dispatch(enter(3)));
    assert.deepEqual(focusStates, [true, false]);
    assert.strictEqual(submit.mock.calls.length, 1);
  });

  it("does not consume Return when the current command cannot submit", () => {
    const controller = createTerminalReturnController({ setHostFocus: async () => undefined });
    controller.setFocused(true);
    controller.setSubmitHandler(() => false);
    assert.isFalse(controller.dispatch(enter(1)));
  });

  it("rejects modified Return and disables the host on dispose", () => {
    const focusStates: boolean[] = [];
    const controller = createTerminalReturnController({
      setHostFocus: async (focused) => focusStates.push(focused),
    });
    controller.setSubmitHandler(() => true);
    controller.setFocused(true);
    assert.isFalse(
      controller.dispatch({
        ...enter(1),
        modifiers: { meta: true, ctrl: false, shift: false, alt: false },
      }),
    );
    controller.dispose();
    assert.isFalse(controller.dispatch(enter(2)));
    assert.deepEqual(focusStates, [true, false]);
  });
});
