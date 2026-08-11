import "url-search-params-polyfill";

import { RegistryContext } from "@effect/atom-react";
import { root } from "@lynx-js/react";

import { AppSidebarLayout } from "../../../../web/src/components/AppSidebarLayout";
import "../generated/lynx.css";
import "../tailwind.css";
import "../overrides.css";
import { ChatView } from "../components/ChatView";
import { appAtomRegistry } from "../state/atomRegistry";
import { installT3ClientFixtureForDevTool } from "../state/t3Client";
import { sidebarDefaultFixture } from "./sidebarFixtures";

export const LIFECYCLE_ERROR_FIXTURE_DETAIL =
  "OC0 fixture: backend unavailable; reconnect from the lifecycle affordance.";

installT3ClientFixtureForDevTool({
  ...sidebarDefaultFixture,
  status: "error",
  statusDetail: LIFECYCLE_ERROR_FIXTURE_DETAIL,
});

root.render(
  <RegistryContext.Provider value={appAtomRegistry}>
    <AppSidebarLayout>
      <ChatView />
    </AppSidebarLayout>
  </RegistryContext.Provider>,
);
