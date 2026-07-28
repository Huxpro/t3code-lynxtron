import { root } from "@lynx-js/react";

import { openCommandPalette } from "../../../../web/src/commandPaletteBus";
import { getLocalStorageItem } from "../../../../web/src/hooks/useLocalStorage";

const adapters = [openCommandPalette, getLocalStorageItem];
if (adapters.length !== 2) throw new Error("Expected two adapters.");

root.render(
  <view style={{ backgroundColor: "#16181d", height: "100vh", width: "100vw" }}>
    <text style={{ color: "#ffffff", fontSize: "24px", padding: "24px" }}>
      Sidebar adapter group A1 OK
    </text>
  </view>,
);
