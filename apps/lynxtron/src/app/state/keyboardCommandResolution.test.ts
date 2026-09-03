import { assert, describe, it } from "vite-plus/test";

import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";
import {
  DISCRETE_KEYBOARD_ACCELERATORS,
  createDiscreteKeyboardPacket,
} from "../../main/desktop/keyboardMenu.ts";
import { resolveKeyboardPacketCommand } from "./keyboardCommandResolution.ts";

describe("Lynxtron keyboard command resolution", () => {
  it("feeds each native menu packet through the canonical resolver", () => {
    const expected = {
      "terminal-submit": null,
      "dismiss-overlay": null,
      "file-picker": "filePicker.toggle",
      "new-thread": "chat.new",
      "quick-switch": "commandPalette.toggle",
      "open-settings": "settings.open",
      "toggle-sidebar": "sidebar.toggle",
      "thread-jump-1": "thread.jump.1",
      "thread-jump-2": "thread.jump.2",
      "thread-jump-3": "thread.jump.3",
      "thread-jump-4": "thread.jump.4",
      "thread-jump-5": "thread.jump.5",
      "thread-jump-6": "thread.jump.6",
      "thread-jump-7": "thread.jump.7",
      "thread-jump-8": "thread.jump.8",
      "thread-jump-9": "thread.jump.9",
    } as const;

    for (const [index, accelerator] of DISCRETE_KEYBOARD_ACCELERATORS.entries()) {
      const packet = createDiscreteKeyboardPacket({
        accelerator,
        platform: "darwin",
        sequence: index + 1,
      });
      assert.equal(
        resolveKeyboardPacketCommand(packet, DEFAULT_RESOLVED_KEYBINDINGS),
        expected[accelerator.id as keyof typeof expected],
      );
    }
  });

  it("rejects incomplete packets", () => {
    assert.isNull(
      resolveKeyboardPacketCommand(
        { type: "keydown", key: "k", sequence: 1 },
        DEFAULT_RESOLVED_KEYBINDINGS,
      ),
    );
  });

  it("does not execute a command for the paired keyup packet", () => {
    const accelerator = DISCRETE_KEYBOARD_ACCELERATORS.find(
      (entry) => entry.id === "thread-jump-2",
    );
    assert.isDefined(accelerator);
    assert.isNull(
      resolveKeyboardPacketCommand(
        createDiscreteKeyboardPacket({
          accelerator: accelerator!,
          platform: "darwin",
          sequence: 99,
          type: "keyup",
        }),
        DEFAULT_RESOLVED_KEYBINDINGS,
      ),
    );
  });

  it("prefers model jumps while the model picker is open", () => {
    const accelerator = DISCRETE_KEYBOARD_ACCELERATORS.find(
      (entry) => entry.id === "thread-jump-2",
    );
    assert.isDefined(accelerator);
    const packet = createDiscreteKeyboardPacket({
      accelerator: accelerator!,
      platform: "darwin",
      sequence: 100,
    });

    assert.equal(
      resolveKeyboardPacketCommand(packet, DEFAULT_RESOLVED_KEYBINDINGS, {
        modelPickerOpen: true,
      }),
      "modelPicker.jump.2",
    );
    assert.equal(
      resolveKeyboardPacketCommand(packet, DEFAULT_RESOLVED_KEYBINDINGS, {
        modelPickerOpen: false,
      }),
      "thread.jump.2",
    );
  });
});
