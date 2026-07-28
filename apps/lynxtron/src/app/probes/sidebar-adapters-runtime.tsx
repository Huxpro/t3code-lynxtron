import { root } from "@lynx-js/react";

import { openCommandPalette } from "../../../../web/src/commandPaletteBus";
import { getLocalStorageItem } from "../../../../web/src/hooks/useLocalStorage";
import { useShortcutModifierState } from "../../../../web/src/shortcutModifierState";
import { CommandDialog } from "../../../../web/src/components/ui/command";
import { Menu } from "../../../../web/src/components/ui/menu";
import { Sheet } from "../../../../web/src/components/ui/sheet";
import { Tooltip } from "../../../../web/src/components/ui/tooltip";
import { mergeProps } from "../../../../web/src/lib/baseUiRender";

const adapters = [
  openCommandPalette,
  getLocalStorageItem,
  useShortcutModifierState,
  CommandDialog,
  Menu,
  Sheet,
  Tooltip,
  mergeProps,
];
if (adapters.length !== 8) throw new Error("Expected eight adapters.");

root.render(
  <view style={{ backgroundColor: "#16181d", height: "100vh", width: "100vw" }}>
    <text style={{ color: "#ffffff", fontSize: "24px", padding: "24px" }}>
      Sidebar adapters import OK
    </text>
  </view>,
);
