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
      "new-thread": "chat.new",
      "quick-switch": "commandPalette.toggle",
      "open-settings": "settings.open",
    } as const;

    for (const [index, accelerator] of DISCRETE_KEYBOARD_ACCELERATORS.entries()) {
      const packet = createDiscreteKeyboardPacket({
        accelerator,
        platform: "darwin",
        sequence: index + 1,
      });
      assert.equal(
        resolveKeyboardPacketCommand(packet, DEFAULT_RESOLVED_KEYBINDINGS),
        expected[accelerator.id],
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
});
