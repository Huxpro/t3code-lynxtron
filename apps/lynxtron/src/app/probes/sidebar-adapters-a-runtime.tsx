import { root } from "@lynx-js/react";

import { openCommandPalette } from "../../../../web/src/commandPaletteBus";
import { getLocalStorageItem } from "../../../../web/src/hooks/useLocalStorage";
import { useShortcutModifierState } from "../../../../web/src/shortcutModifierState";
import { CommandDialog } from "../../../../web/src/components/ui/command";

const adapters = [openCommandPalette, getLocalStorageItem, useShortcutModifierState, CommandDialog];
if (adapters.length !== 4) throw new Error("Expected four adapters.");

root.render(
  <view style={{ backgroundColor: "#16181d", height: "100vh", width: "100vw" }}>
    <text style={{ color: "#ffffff", fontSize: "24px", padding: "24px" }}>
      Sidebar adapter group A OK
    </text>
  </view>,
);
