import { root } from "@lynx-js/react";

import { Menu } from "../../../../web/src/components/ui/menu";
import { Sheet } from "../../../../web/src/components/ui/sheet";
import { Tooltip } from "../../../../web/src/components/ui/tooltip";
import { mergeProps } from "../../../../web/src/lib/baseUiRender";

const adapters = [Menu, Sheet, Tooltip, mergeProps];
if (adapters.length !== 4) throw new Error("Expected four adapters.");

root.render(
  <view style={{ backgroundColor: "#16181d", height: "100vh", width: "100vw" }}>
    <text style={{ color: "#ffffff", fontSize: "24px", padding: "24px" }}>
      Sidebar adapter group B OK
    </text>
  </view>,
);
