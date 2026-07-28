import { root } from "@lynx-js/react";

import { HostButton } from "../../../../web/src/components/ui/hostElements";
import "../generated/lynx.css";
import "../tailwind.css";

root.render(
  <view className="h-full w-full bg-background p-4">
    <HostButton className="h-8 bg-sidebar p-2">
      <text className="text-sm text-sidebar-foreground">Host text probe</text>
    </HostButton>
  </view>,
);
