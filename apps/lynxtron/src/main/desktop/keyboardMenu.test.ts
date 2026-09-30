import { assert, describe, it } from "vite-plus/test";

import {
  DISCRETE_KEYBOARD_ACCELERATORS,
  createDiscreteKeyboardPacket,
  findDiscreteAccelerator,
} from "./keyboardMenu.ts";

describe("Lynxtron discrete keyboard menu", () => {
  it("covers only the certified discrete command set", () => {
    assert.deepEqual(
      DISCRETE_KEYBOARD_ACCELERATORS.map((entry) => entry.id),
      ["open-settings", "new-thread", "quick-switch"],
    );
  });

  it("encodes macOS accelerators as renderer-neutral packets", () => {
    const accelerator = DISCRETE_KEYBOARD_ACCELERATORS.find((entry) => entry.id === "quick-switch");
    assert.isDefined(accelerator);
    const packet = createDiscreteKeyboardPacket({
      accelerator: accelerator!,
      platform: "darwin",
      sequence: 7,
    });
    assert.deepInclude(packet, {
      type: "keydown",
      key: "k",
      code: "KeyK",
      modifiers: { meta: true, ctrl: false, shift: false, alt: false },
      repeat: false,
      source: { kind: "lynxtron-menu", platform: "darwin" },
      sequence: 7,
    });
  });

  it("encodes non-macOS mod accelerators as ctrl", () => {
    const accelerator = DISCRETE_KEYBOARD_ACCELERATORS.find((entry) => entry.id === "new-thread");
    assert.isDefined(accelerator);
    const packet = createDiscreteKeyboardPacket({
      accelerator: accelerator!,
      platform: "linux",
      sequence: 8,
    });
    assert.deepInclude(packet.modifiers, { meta: false, ctrl: true });
  });

  it("matches forwarded key presses on Linux with Control", () => {
    assert.equal(
      findDiscreteAccelerator({ code: "KeyK", ctrlKey: true, platform: "linux" })?.id,
      "quick-switch",
    );
    assert.equal(
      findDiscreteAccelerator({ code: "Comma", ctrlKey: true, platform: "linux" })?.id,
      "open-settings",
    );
  });

  it("ignores plain, shifted, or foreign-modifier presses", () => {
    assert.isUndefined(findDiscreteAccelerator({ code: "KeyK", platform: "linux" }));
    assert.isUndefined(
      findDiscreteAccelerator({ code: "KeyK", ctrlKey: true, shiftKey: true, platform: "linux" }),
    );
    assert.isUndefined(
      findDiscreteAccelerator({ code: "KeyK", ctrlKey: true, metaKey: true, platform: "linux" }),
    );
    assert.isUndefined(
      findDiscreteAccelerator({ code: "KeyK", ctrlKey: true, platform: "darwin" }),
    );
  });
});
