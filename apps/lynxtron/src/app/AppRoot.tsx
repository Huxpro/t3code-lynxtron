import { AppSidebarLayout } from "../../../web/src/components/AppSidebarLayout";

import {
  ArchiveSettings,
  BetaSettings,
  ConnectionsSettings,
  SourceControlSettings,
} from "./components/OtherSettings";
import { ChatView } from "./components/ChatView";
import { GeneralSettings } from "./components/GeneralSettings";
import { GeneralSettingsSync } from "./components/GeneralSettingsSync";
import { KeybindingsSettings } from "./components/KeybindingsSettings";
import { ModelPicker } from "./components/ModelPicker";
import { ProviderSettings } from "./components/ProviderSettings";
import { QuickSwitch } from "./components/QuickSwitch";
import { SettingsPage } from "./components/SettingsPage";
import { usePathname } from "./router";
import { t3ClientActions, useT3ClientState } from "./state/t3Client";
import { uiActions, useModelPickerOpen, useQuickSwitchOpen } from "./state/uiState";

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

export function AppRoot() {
  return (
    <>
      <RootSwitch />
      <RootOverlays />
    </>
  );
}
