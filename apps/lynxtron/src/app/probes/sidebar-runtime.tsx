import "url-search-params-polyfill";

import { RegistryContext } from "@effect/atom-react";
import { root } from "@lynx-js/react";

import { AppSidebarLayout } from "../../../../web/src/components/AppSidebarLayout";
import "../generated/lynx.css";
import "../tailwind.css";
import "../overrides.css";
import { appAtomRegistry } from "../state/atomRegistry";
import { installT3ClientFixtureForDevTool } from "../state/t3Client";
import { sidebarDefaultFixture } from "./sidebarFixtures";

installT3ClientFixtureForDevTool(sidebarDefaultFixture);

root.render(
  <RegistryContext.Provider value={appAtomRegistry}>
    <AppSidebarLayout>
      <view className="app-content" />
    </AppSidebarLayout>
  </RegistryContext.Provider>,
);
