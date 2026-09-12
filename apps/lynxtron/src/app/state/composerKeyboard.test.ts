import { assert, describe, it, vi } from "vite-plus/test";

import { createComposerReturnController } from "./composerKeyboard.ts";

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

describe("Composer Return controller", () => {
  it("submits once only while the editor is focused", () => {
    const focusStates: boolean[] = [];
    const submit = vi.fn(() => true);
    const controller = createComposerReturnController({
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

  it("rejects modified Return and disables the host on dispose", () => {
    const focusStates: boolean[] = [];
    const controller = createComposerReturnController({
      setHostFocus: async (focused) => focusStates.push(focused),
    });
    controller.setSubmitHandler(() => true);
    controller.setFocused(true);
    assert.isFalse(
      controller.dispatch({
        ...enter(1),
        modifiers: { meta: false, ctrl: false, shift: true, alt: false },
      }),
    );
    controller.dispose();
    assert.isFalse(controller.dispatch(enter(2)));
    assert.deepEqual(focusStates, [true, false]);
  });
});
