import "url-search-params-polyfill";

import { RegistryContext } from "@effect/atom-react";
import { root, runOnBackground } from "@lynx-js/react";
import { useEffect, useRef, useState } from "@lynx-js/react";
import { viewportTier } from "@t3tools/client-runtime/platform";

import { AppSidebarLayout } from "../../../web/src/components/AppSidebarLayout";
import { ComponentLabSurface } from "../../../web/src/components/components-lab/ComponentLabSurface";
import { ChatView } from "./components/ChatView";
import { SettingsPage } from "./components/SettingsPage";
import { GeneralSettings } from "./components/GeneralSettings";
import { AppearanceSettings } from "./components/AppearanceSettings";
import { GeneralSettingsSync } from "./components/GeneralSettingsSync";
import { ProviderSettings } from "./components/ProviderSettings";
import { AddProviderInstanceDialog } from "./components/ProviderSettings";
import { KeybindingsSettings } from "./components/KeybindingsSettings";
import { QuickSwitch } from "./components/QuickSwitch";
import { ProjectActionDialog } from "./components/ProjectActionDialog";
import { GitPublishDialog } from "./components/GitPublishDialog";
import {
  ArchiveSettings,
  ConnectionsSettings,
  SourceControlSettings,
} from "./components/OtherSettings";
import { usePathname, navigate } from "./router";
import { resolveLynxSettingsPanel } from "./settingsPanel";
import { appAtomRegistry } from "./state/atomRegistry";
import { registerCapabilityProbe } from "./state/capabilityProbe";
import { registerKeyboardCommands } from "./state/keyboardCommands";
import {
  getPref,
  hasPref,
  resolveLynxTheme,
  setPref,
  useThemePreferenceState,
  useClientSettingsState,
} from "./state/prefsStore";
import { readPreviewInitialState, t3ClientActions, useT3ClientState } from "./state/t3Client";
import {
  installResponsiveUiProbe,
  uiActions,
  useAddProviderDialogOpen,
  useGitPublishDialogOpen,
  useProjectActionDialogOpen,
  useProjectScopeKey,
  useSearchOverlayState,
} from "./state/uiState";
import { getViewportSnapshot, startViewportStore, subscribeViewport } from "./state/viewportStore";
import {
  getSystemThemeSnapshot,
  startSystemThemeStore,
  subscribeSystemTheme,
} from "./state/themeStore";
import { ResolvedThemeContext } from "./state/resolvedThemeContext";
import {
  resetLynxShortcutModifierState,
  updateLynxShortcutModifierState,
} from "./state/shortcutModifierState";
import dmSansVariableDataUrl from "./assets/dm-sans.woff2?inline";
import jetBrainsMono400DataUrl from "./assets/jetbrains-mono-400.woff2?inline";
import "./generated/lynx.css";
import "./tailwind.css";
import "./overrides.css";

declare const __T3_LYNXTRON_WEB_PREVIEW__: boolean;

let dmSansReady = false;
let jetBrainsMonoReady = false;
const dmSansReadyListeners = new Set<() => void>();
const jetBrainsMonoReadyListeners = new Set<() => void>();

if (
  !__T3_LYNXTRON_WEB_PREVIEW__ &&
  typeof lynx !== "undefined" &&
  typeof lynx.addFont === "function"
) {
  lynx.addFont(
    {
      "font-family": "T3 DM Sans",
      src: `url("${dmSansVariableDataUrl}")`,
    },
    () => {
      dmSansReady = true;
      for (const listener of dmSansReadyListeners) listener();
    },
  );
  lynx.addFont(
    {
      "font-family": "T3 JetBrains Mono",
      src: `url("${jetBrainsMono400DataUrl}")`,
    },
    () => {
      jetBrainsMonoReady = true;
      for (const listener of jetBrainsMonoReadyListeners) listener();
    },
  );
}

function useDmSansReady(): boolean {
  const [ready, setReady] = useState(dmSansReady);
  useEffect(() => {
    const handleReady = () => setReady(true);
    dmSansReadyListeners.add(handleReady);
    if (dmSansReady) handleReady();
    return () => {
      dmSansReadyListeners.delete(handleReady);
    };
  }, []);
  return ready;
}

function useJetBrainsMonoReady(): boolean {
  const [ready, setReady] = useState(jetBrainsMonoReady);
  useEffect(() => {
    const handleReady = () => setReady(true);
    jetBrainsMonoReadyListeners.add(handleReady);
    if (jetBrainsMonoReady) handleReady();
    return () => {
      jetBrainsMonoReadyListeners.delete(handleReady);
    };
  }, []);
  return ready;
}

// NOTE: no <RouterProvider> — see src/app/router.ts for why. The synchronous
// pathname Atom is the only Lynx route authority; Web keeps TanStack Router.
function RootSwitch() {
  const pathname = usePathname();
  const { status } = useT3ClientState();
  const [previewInitialRoute, setPreviewInitialRoute] = useState(
    __T3_LYNXTRON_WEB_PREVIEW__ ? getPref<string>("initialRoute", "/") : "/",
  );

  // Deterministic preview/harness entry: an isolated preview host may seed an
  // `initialRoute` pref (e.g. the dual-renderer workbench Settings scenario)
  // and/or an `initialOverlay` pref (Quick Switch / Model Picker). Applied once
  // after mount, when the nodejs prefs bridge is wired. Production launches
  // leave them unset, so this is a one-shot no-op there. The connector's
  // auto-select-thread no longer force-navigates off a /settings route, so the
  // route stays put once applied.
  const appliedInitialRoute = useRef(false);
  const applyInitialOverlay = (overlay: string | null | undefined) => {
    if (overlay === "quick-switch") uiActions.openQuickSwitch();
    else if (overlay === "file-picker") uiActions.openQuickSwitch("files");
    else if (overlay === "add-project") uiActions.openAddProject();
    else if (overlay === "model-picker") uiActions.openModelPicker();
    else if (overlay === "add-provider") uiActions.openAddProviderDialog();
    else if (overlay === "terminal") uiActions.openRightPanelSurface("terminal");
    else if (overlay === "browser") uiActions.openRightPanelSurface("browser");
    else if (overlay === "right-panel-tabs") {
      uiActions.openRightPanelSurface("diff");
      uiActions.openRightPanelSurface("files");
    }
  };
  useEffect(() => {
    if (appliedInitialRoute.current || (status !== "ready" && !__T3_LYNXTRON_WEB_PREVIEW__)) return;
    void readPreviewInitialState()
      .then((value) => {
        if (appliedInitialRoute.current) return;
        if (!value || typeof value !== "object") return;
        const initial = value as {
          route?: string;
          overlay?: string | null;
          theme?: "light" | "dark";
        };
        appliedInitialRoute.current = true;
        if (initial.route && initial.route !== "/") {
          setPreviewInitialRoute(initial.route);
          navigate(initial.route);
        }
        applyInitialOverlay(initial.overlay);
        if (initial.theme) setPref("themePreference", initial.theme);
      })
      .catch(() => undefined);
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const applyInitialState = () => {
      const hasInitialRoute = hasPref("initialRoute");
      const hasInitialOverlay = hasPref("initialOverlay");
      if (!hasInitialRoute && !hasInitialOverlay && attempts < 20) {
        attempts += 1;
        timer = setTimeout(applyInitialState, 50);
        return;
      }
      appliedInitialRoute.current = true;
      const initialRoute = getPref<string>("initialRoute", "/");
      if (initialRoute !== "/") {
        setPreviewInitialRoute(initialRoute);
        navigate(initialRoute);
      }
      const initialOverlay = getPref<string>("initialOverlay", "");
      applyInitialOverlay(initialOverlay);
    };
    applyInitialState();
    return () => {
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [status]);

  if (pathname === "/components-lab" || previewInitialRoute === "/components-lab") {
    return <ComponentLabSurface />;
  }

  if (pathname.startsWith("/settings")) {
    const section = resolveLynxSettingsPanel(pathname);
    let panel = <GeneralSettings />;
    if (section === "appearance") panel = <AppearanceSettings />;
    else if (section === "providers") panel = <ProviderSettings />;
    else if (section === "keybindings") panel = <KeybindingsSettings />;
    else if (section === "source-control") panel = <SourceControlSettings />;
    else if (section === "connections") panel = <ConnectionsSettings />;
    else if (section === "archive") panel = <ArchiveSettings />;
    return (
      <AppSidebarLayout>
        <GeneralSettingsSync />
        <SettingsPage panelId={section}>{panel}</SettingsPage>
      </AppSidebarLayout>
    );
  }

  return (
    <AppSidebarLayout>
      <ChatView />
    </AppSidebarLayout>
  );
}

function RootOverlays() {
  const searchOverlay = useSearchOverlayState();
  const addProviderDialogOpen = useAddProviderDialogOpen();
  const projectActionDialogOpen = useProjectActionDialogOpen();
  const gitPublishDialogOpen = useGitPublishDialogOpen();
  const projectScopeKey = useProjectScopeKey();
  const { projects, threads, activeThreadId, draftThread } = useT3ClientState();
  const activeThread =
    threads.find((thread) => thread.id === activeThreadId) ??
    (draftThread?.id === activeThreadId ? draftThread : undefined);
  const activeProject =
    projects.find((project) => project.id === activeThread?.projectId) ?? projects[0] ?? null;
  const cwd = activeThread?.worktreePath ?? activeProject?.workspaceRoot;
  return (
    <>
      {searchOverlay.open ? (
        <QuickSwitch
          mode={searchOverlay.mode}
          openIntent={searchOverlay.openIntent}
          projects={projects}
          threads={threads}
          activeThreadId={activeThreadId}
          projectScopeKey={projectScopeKey}
        />
      ) : null}
      {projectActionDialogOpen ? <ProjectActionDialog project={activeProject} /> : null}
      <AddProviderInstanceDialog
        open={addProviderDialogOpen}
        onClose={uiActions.closeAddProviderDialog}
      />
      {gitPublishDialogOpen && cwd ? (
        <GitPublishDialog cwd={cwd} onClose={uiActions.closeGitPublishDialog} />
      ) : null}
    </>
  );
}

function ThemedApp() {
  const [themePreference] = useThemePreferenceState();
  const [clientSettings] = useClientSettingsState();
  const [systemTheme, setSystemTheme] = useState(getSystemThemeSnapshot);
  const theme = resolveLynxTheme(themePreference, systemTheme.theme);
  const fontReady = useDmSansReady();
  const monoFontReady = useJetBrainsMonoReady();
  const [viewport, setViewport] = useState(getViewportSnapshot);
  useEffect(() => subscribeViewport(() => setViewport(getViewportSnapshot())), []);
  useEffect(() => subscribeSystemTheme(() => setSystemTheme(getSystemThemeSnapshot())), []);
  const tier = viewportTier(viewport.width);
  const authorityViewport = viewport.width === 1280 && viewport.height === 820;
  useEffect(() => {
    installResponsiveUiProbe(viewport.testResize === true);
  }, [viewport.testResize]);
  return (
    <ResolvedThemeContext.Provider value={theme}>
      <view
        className={`app-theme-root theme-${theme} viewport-${tier} glass-opacity-${clientSettings.glassOpacity} ${
          authorityViewport ? "viewport-authority" : "viewport-responsive"
        }${__T3_LYNXTRON_WEB_PREVIEW__ ? " lynx-web-preview" : ""}${
          fontReady ? " t3-dm-sans-ready" : ""
        }${monoFontReady ? " t3-jetbrains-mono-ready" : ""}`}
        data-theme={theme}
        data-glass-opacity={String(clientSettings.glassOpacity)}
        data-viewport-height={String(viewport.height)}
        data-viewport-tier={tier}
        data-viewport-width={String(viewport.width)}
        {...({ tabIndex: 0 } as object)}
        main-thread:bindkeydown={(event) => {
          "main thread";
          const modifiers = event as unknown as {
            altKey: boolean;
            ctrlKey: boolean;
            metaKey: boolean;
            shiftKey: boolean;
          };
          runOnBackground(updateLynxShortcutModifierState)({
            altKey: modifiers.altKey,
            ctrlKey: modifiers.ctrlKey,
            metaKey: modifiers.metaKey,
            shiftKey: modifiers.shiftKey,
          });
        }}
        main-thread:bindkeyup={(event) => {
          "main thread";
          const modifiers = event as unknown as {
            altKey: boolean;
            ctrlKey: boolean;
            metaKey: boolean;
            shiftKey: boolean;
          };
          runOnBackground(updateLynxShortcutModifierState)({
            altKey: modifiers.altKey,
            ctrlKey: modifiers.ctrlKey,
            metaKey: modifiers.metaKey,
            shiftKey: modifiers.shiftKey,
          });
        }}
        main-thread:bindblur={() => {
          "main thread";
          runOnBackground(resetLynxShortcutModifierState)();
        }}
      >
        <RootSwitch />
        <RootOverlays />
      </view>
    </ResolvedThemeContext.Provider>
  );
}

function ThemeBootstrap() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    void startSystemThemeStore().then(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);
  return ready ? <ThemedApp /> : null;
}

registerCapabilityProbe();
registerKeyboardCommands();
startViewportStore();

root.render(
  <RegistryContext.Provider value={appAtomRegistry}>
    <ThemeBootstrap />
  </RegistryContext.Provider>,
);
