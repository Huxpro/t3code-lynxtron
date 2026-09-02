import { assert, describe, it } from "vite-plus/test";

import { DISCRETE_KEYBOARD_ACCELERATORS, createDiscreteKeyboardPacket } from "./keyboardMenu.ts";

describe("Lynxtron discrete keyboard menu", () => {
  it("covers only the certified discrete command set", () => {
    assert.deepEqual(
      DISCRETE_KEYBOARD_ACCELERATORS.map((entry) => entry.id),
      [
        "terminal-submit",
        "dismiss-overlay",
        "open-settings",
        "new-thread",
        "quick-switch",
        "file-picker",
        "toggle-sidebar",
        "thread-jump-1",
        "thread-jump-2",
        "thread-jump-3",
        "thread-jump-4",
        "thread-jump-5",
        "thread-jump-6",
        "thread-jump-7",
        "thread-jump-8",
        "thread-jump-9",
      ],
    );
  });

  it("registers hidden thread jump accelerators", () => {
    const jumps = DISCRETE_KEYBOARD_ACCELERATORS.filter((entry) =>
      entry.id.startsWith("thread-jump-"),
    );
    assert.equal(jumps.length, 9);
    assert.deepInclude(jumps[0]!, {
      accelerator: "CommandOrControl+1",
      key: "1",
      code: "Digit1",
      visible: false,
      acceleratorWorksWhenHidden: true,
    });
  });

  it("keeps physical Return disabled until Terminal focus is reported", () => {
    const accelerator = DISCRETE_KEYBOARD_ACCELERATORS.find(
      (entry) => entry.id === "terminal-submit",
    );
    assert.deepInclude(accelerator!, {
      accelerator: "Return",
      key: "Enter",
      usesCommandModifier: false,
      visible: false,
      enabled: false,
    });
  });

  it("encodes Escape as a hidden modifier-free accelerator", () => {
    const accelerator = DISCRETE_KEYBOARD_ACCELERATORS.find(
      (entry) => entry.id === "dismiss-overlay",
    );
    assert.isDefined(accelerator);
    assert.deepInclude(accelerator!, {
      accelerator: "Esc",
      visible: false,
      acceleratorWorksWhenHidden: true,
      usesCommandModifier: false,
    });
    const packet = createDiscreteKeyboardPacket({
      accelerator: accelerator!,
      platform: "darwin",
      sequence: 9,
    });
    assert.deepInclude(packet, {
      key: "Escape",
      code: "Escape",
      modifiers: { meta: false, ctrl: false, shift: false, alt: false },
    });
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

  it("encodes a modifier-clearing keyup packet after a menu accelerator", () => {
    const accelerator = DISCRETE_KEYBOARD_ACCELERATORS.find(
      (entry) => entry.id === "thread-jump-2",
    );
    assert.isDefined(accelerator);
    const packet = createDiscreteKeyboardPacket({
      accelerator: accelerator!,
      platform: "darwin",
      sequence: 10,
      type: "keyup",
    });
    assert.deepInclude(packet, {
      type: "keyup",
      key: "2",
      modifiers: { meta: false, ctrl: false, shift: false, alt: false },
    });
  });
});
