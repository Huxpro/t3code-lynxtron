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
import { ModelPicker } from "./components/ModelPicker";
import { QuickSwitch } from "./components/QuickSwitch";
import {
  ArchiveSettings,
  BetaSettings,
  ConnectionsSettings,
  SourceControlSettings,
} from "./components/OtherSettings";
import { usePathname } from "./router";
import { appAtomRegistry } from "./state/atomRegistry";
import { registerCapabilityProbe } from "./state/capabilityProbe";
import { registerKeyboardCommands } from "./state/keyboardCommands";
import { t3ClientActions, useT3ClientState } from "./state/t3Client";
import { uiActions, useModelPickerOpen, useQuickSwitchOpen } from "./state/uiState";
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

function RootOverlays() {
  const quickSwitchOpen = useQuickSwitchOpen();
  const modelPickerOpen = useModelPickerOpen();
  const { projects, threads, activeThreadId, models, selectedModel } = useT3ClientState();
  return (
    <>
      {quickSwitchOpen ? (
        <QuickSwitch projects={projects} threads={threads} activeThreadId={activeThreadId} />
      ) : null}
      {modelPickerOpen ? (
        <ModelPicker
          models={models}
          selectedModel={selectedModel}
          onSelect={(model) => {
            t3ClientActions.setModelSelection(model);
            uiActions.closeModelPicker();
          }}
          onClose={uiActions.closeModelPicker}
        />
      ) : null}
    </>
  );
}

registerCapabilityProbe();
registerKeyboardCommands();

root.render(
  <RegistryContext.Provider value={appAtomRegistry}>
    <RootSwitch />
    <RootOverlays />
  </RegistryContext.Provider>,
);
