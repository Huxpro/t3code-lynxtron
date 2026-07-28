import "url-search-params-polyfill";

import { root } from "@lynx-js/react";

import "../../../../web/src/components/Sidebar";
import "../generated/lynx.css";
import "../tailwind.css";
import "../overrides.css";

root.render(
  <view className="h-screen w-screen bg-background p-6">
    <text className="text-foreground text-lg">Sidebar module import OK</text>
  </view>,
);
