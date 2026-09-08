import "url-search-params-polyfill";

import { root } from "@lynx-js/react";

import { ComponentLabIsolatedSurface } from "../../../web/src/components/components-lab/ComponentLabIsolatedSurface";
import { getPref } from "./state/prefsStore";
import { useT3ClientState } from "./state/t3Client";
import "./generated/lynx.css";
import "./tailwind.css";
import "./overrides.css";

declare const __T3_LYNXTRON_WEB_PREVIEW__: boolean;

function IsolatedComponentsLab() {
  useT3ClientState();
  const storyId = getPref<string>("componentStory", "");
  const theme = getPref<"light" | "dark">("themePreference", "dark");
  return (
    <view
      className={`app-theme-root theme-${theme}${
        __T3_LYNXTRON_WEB_PREVIEW__ ? " lynx-web-preview" : ""
      }`}
      data-theme={theme}
    >
      <ComponentLabIsolatedSurface storyId={storyId} />
    </view>
  );
}

root.render(<IsolatedComponentsLab />);
