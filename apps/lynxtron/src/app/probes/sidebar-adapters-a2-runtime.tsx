import { root } from "@lynx-js/react";

import { useShortcutModifierState } from "../../../../web/src/shortcutModifierState";
import { CommandDialog } from "../../../../web/src/components/ui/command";

const adapters = [useShortcutModifierState, CommandDialog];
if (adapters.length !== 2) throw new Error("Expected two adapters.");

root.render(
  <view style={{ backgroundColor: "#16181d", height: "100vh", width: "100vw" }}>
    <text style={{ color: "#ffffff", fontSize: "24px", padding: "24px" }}>
      Sidebar adapter group A2 OK
    </text>
  </view>,
);
