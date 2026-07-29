import "url-search-params-polyfill";

import { RegistryContext } from "@effect/atom-react";
import { root } from "@lynx-js/react";

import { AppSidebarLayout } from "../../../web/src/components/AppSidebarLayout";
import { ChatView } from "./components/ChatView";
import { SettingsPage } from "./components/SettingsPage";
import { GeneralSettings } from "./components/GeneralSettings";
import { GeneralSettingsSync } from "./components/GeneralSettingsSync";
import { ProviderSettings } from "./components/ProviderSettings";
import { KeybindingsSettings } from "./components/KeybindingsSettings";
import {
  ArchiveSettings,
  BetaSettings,
  ConnectionsSettings,
  SourceControlSettings,
} from "./components/OtherSettings";
import { usePathname } from "./router";
import { appAtomRegistry } from "./state/atomRegistry";
import { registerCapabilityProbe } from "./state/capabilityProbe";
import "./generated/lynx.css";
import "./tailwind.css";
import "./overrides.css";

// NOTE: no <RouterProvider> — see src/app/router.ts for why. TanStack Router
// core still owns history/matching/redirects; we render on pathname here.
function RootSwitch() {
  const pathname = usePathname();

  if (pathname.startsWith("/settings")) {
    const section = pathname.split("/")[2] ?? "general";
    let panel = <GeneralSettings />;
    if (section === "providers") panel = <ProviderSettings />;
    else if (section === "keybindings") panel = <KeybindingsSettings />;
    else if (section === "source-control") panel = <SourceControlSettings />;
    else if (section === "connections") panel = <ConnectionsSettings />;
    else if (section === "beta") panel = <BetaSettings />;
    else if (section === "archive" || section === "archived") panel = <ArchiveSettings />;
    return (
      <>
        <GeneralSettingsSync />
        <SettingsPage>{panel}</SettingsPage>
      </>
    );
  }

  return (
    <AppSidebarLayout>
      <ChatView />
    </AppSidebarLayout>
  );
}

registerCapabilityProbe();

root.render(
  <RegistryContext.Provider value={appAtomRegistry}>
    <RootSwitch />
  </RegistryContext.Provider>,
);
