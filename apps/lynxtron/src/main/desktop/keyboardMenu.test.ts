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
      ],
    );
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
});
