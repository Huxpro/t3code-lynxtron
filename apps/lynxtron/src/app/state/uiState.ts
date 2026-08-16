import { useAtomValue } from "@effect/atom-react";
import { Atom } from "effect/unstable/reactivity";
import {
  INITIAL_SEARCH_OVERLAY_STATE,
  reduceSearchOverlayState,
  type SearchOverlayAction,
  type SearchOverlayMode,
  type SearchOverlayState,
} from "@t3tools/client-runtime/presentation/search-overlay";
import {
  activatePanelSurface,
  clearPanelSurfaces,
  closePanelSurface,
  createEmptyPanelSurfaceState,
  openPanelSurface,
  setPanelSurfaceVisibility,
  togglePanelSurfaceVisibility,
  type PanelSurfaceState,
} from "@t3tools/client-runtime/state/panel-surfaces";
import type { ProviderInstanceId, TurnId } from "@t3tools/contracts";

import { appAtomRegistry } from "./atomRegistry";
import { requestSidebarToggle } from "../../../../web/src/components/ui/sidebarCommandBus.lynx";

export type RightPanelKind = "plan" | "diff" | "files" | "terminal";

export type RightPanelSurface =
  | {
      readonly id: string;
      readonly kind: "plan" | "files" | "terminal";
      readonly label: string;
    }
  | {
      readonly id: string;
      readonly kind: "diff";
      readonly label: string;
      readonly turnId: TurnId | null;
      readonly filePath: string | null;
    };

export type RightPanelState = PanelSurfaceState<RightPanelSurface>;

export interface ModelPickerNavigationState {
  readonly scopeKey: string | null;
  readonly provider: ProviderInstanceId | "favorites";
  readonly touched: boolean;
}

export const INITIAL_MODEL_PICKER_NAVIGATION_STATE: ModelPickerNavigationState = {
  scopeKey: null,
  provider: "favorites",
  touched: false,
};

export function selectModelPickerProvider(
  state: ModelPickerNavigationState,
  provider: ProviderInstanceId | "favorites",
): ModelPickerNavigationState {
  return {
    ...state,
    provider,
    touched: true,
  };
}

export function syncModelPickerProvider(
  state: ModelPickerNavigationState,
  scopeKey: string,
  provider: ProviderInstanceId | "favorites",
): ModelPickerNavigationState {
  if (state.scopeKey === scopeKey && state.touched) return state;
  if (state.scopeKey === scopeKey && state.provider === provider && state.touched === false) {
    return state;
  }
  return {
    scopeKey,
    provider,
    touched: false,
  };
}

export type RightPanelAction =
  | { readonly type: "open"; readonly surface: RightPanelSurface }
  | { readonly type: "close-surface"; readonly surfaceId: string }
  | { readonly type: "activate"; readonly surfaceId: string }
  | { readonly type: "close-panel" }
  | { readonly type: "close-all" }
  | { readonly type: "toggle-panel" };

export const INITIAL_RIGHT_PANEL_STATE = createEmptyPanelSurfaceState<RightPanelSurface>();

export function applyRightPanelAction(
  state: RightPanelState,
  action: RightPanelAction,
): RightPanelState {
  switch (action.type) {
    case "open": {
      const existing = state.surfaces.find((surface) => surface.kind === action.surface.kind);
      if (existing && action.surface.kind === "diff" && existing.kind === "diff") {
        const next = {
          ...existing,
          turnId: action.surface.turnId,
          filePath: action.surface.filePath,
        };
        return {
          isOpen: true,
          activeSurfaceId: existing.id,
          surfaces: state.surfaces.map((surface) => (surface.id === existing.id ? next : surface)),
        };
      }
      return openPanelSurface(state, existing ?? action.surface);
    }
    case "close-surface":
      return closePanelSurface(state, action.surfaceId);
    case "activate":
      return activatePanelSurface(state, action.surfaceId);
    case "close-panel":
      return setPanelSurfaceVisibility(state, false);
    case "close-all":
      return clearPanelSurfaces(state);
    case "toggle-panel":
      return togglePanelSurfaceVisibility(state);
  }
}

const modelPickerOpenAtom = Atom.make(false).pipe(Atom.withLabel("lynx-model-picker-open"));
const modelPickerNavigationAtom = Atom.make<ModelPickerNavigationState>(
  INITIAL_MODEL_PICKER_NAVIGATION_STATE,
).pipe(Atom.withLabel("lynx-model-picker-navigation"));
const projectActionDialogOpenAtom = Atom.make(false).pipe(
  Atom.withLabel("lynx-project-action-dialog-open"),
);
const gitPublishDialogOpenAtom = Atom.make(false).pipe(
  Atom.withLabel("lynx-git-publish-dialog-open"),
);
const searchOverlayStateAtom = Atom.make<SearchOverlayState>(INITIAL_SEARCH_OVERLAY_STATE).pipe(
  Atom.withLabel("lynx-search-overlay-state"),
);
const rightPanelStateAtom = Atom.make<RightPanelState>(INITIAL_RIGHT_PANEL_STATE).pipe(
  Atom.withLabel("lynx-right-panel-state"),
);

let nextSurfaceId = 1;

function kindLabel(kind: RightPanelKind): string {
  switch (kind) {
    case "plan":
      return "Plan";
    case "diff":
      return "Diff";
    case "files":
      return "Files";
    case "terminal":
      return "Terminal";
  }
}

function updateRightPanel(action: RightPanelAction): void {
  appAtomRegistry.set(
    rightPanelStateAtom,
    applyRightPanelAction(appAtomRegistry.get(rightPanelStateAtom), action),
  );
}

function updateSearchOverlay(action: SearchOverlayAction): void {
  appAtomRegistry.set(
    searchOverlayStateAtom,
    reduceSearchOverlayState(appAtomRegistry.get(searchOverlayStateAtom), action),
  );
}

export function useModelPickerOpen(): boolean {
  return useAtomValue(modelPickerOpenAtom);
}

export function useModelPickerNavigation(): ModelPickerNavigationState {
  return useAtomValue(modelPickerNavigationAtom);
}

export function useProjectActionDialogOpen(): boolean {
  return useAtomValue(projectActionDialogOpenAtom);
}

export function useGitPublishDialogOpen(): boolean {
  return useAtomValue(gitPublishDialogOpenAtom);
}

export function useQuickSwitchOpen(): boolean {
  return useAtomValue(searchOverlayStateAtom).open;
}

export function useSearchOverlayState(): SearchOverlayState {
  return useAtomValue(searchOverlayStateAtom);
}

export function isSearchOverlayOpen(): boolean {
  return appAtomRegistry.get(searchOverlayStateAtom).open;
}

export function readModelPickerNavigation(): ModelPickerNavigationState {
  return appAtomRegistry.get(modelPickerNavigationAtom);
}

export function useRightPanelState(): RightPanelState {
  return useAtomValue(rightPanelStateAtom);
}

export const uiActions = {
  activateRightPanelSurface(surfaceId: string): void {
    updateRightPanel({ type: "activate", surfaceId });
  },
  closeAllRightPanelSurfaces(): void {
    updateRightPanel({ type: "close-all" });
  },
  closeModelPicker(): void {
    appAtomRegistry.set(modelPickerOpenAtom, false);
  },
  selectModelPickerProvider(provider: ProviderInstanceId | "favorites"): void {
    appAtomRegistry.set(
      modelPickerNavigationAtom,
      selectModelPickerProvider(appAtomRegistry.get(modelPickerNavigationAtom), provider),
    );
  },
  syncModelPickerProvider(scopeKey: string, provider: ProviderInstanceId | "favorites"): void {
    appAtomRegistry.set(
      modelPickerNavigationAtom,
      syncModelPickerProvider(appAtomRegistry.get(modelPickerNavigationAtom), scopeKey, provider),
    );
  },
  closeProjectActionDialog(): void {
    appAtomRegistry.set(projectActionDialogOpenAtom, false);
  },
  closeGitPublishDialog(): void {
    appAtomRegistry.set(gitPublishDialogOpenAtom, false);
  },
  closeQuickSwitch(): void {
    updateSearchOverlay({ _tag: "SetOpen", open: false });
  },
  closeRightPanel(): void {
    updateRightPanel({ type: "close-panel" });
  },
  closeRightPanelSurface(surfaceId: string): void {
    updateRightPanel({ type: "close-surface", surfaceId });
  },
  openModelPicker(): void {
    appAtomRegistry.set(modelPickerOpenAtom, true);
  },
  toggleModelPicker(): void {
    appAtomRegistry.set(modelPickerOpenAtom, !appAtomRegistry.get(modelPickerOpenAtom));
  },
  openProjectActionDialog(): void {
    appAtomRegistry.set(projectActionDialogOpenAtom, true);
  },
  openGitPublishDialog(): void {
    appAtomRegistry.set(gitPublishDialogOpenAtom, true);
  },
  openQuickSwitch(input?: SearchOverlayMode | unknown): void {
    const mode: SearchOverlayMode = input === "files" || input === "content" ? input : "command";
    const state = appAtomRegistry.get(searchOverlayStateAtom);
    if (state.open && state.mode === mode) return;
    updateSearchOverlay({ _tag: "ToggleMode", mode });
  },
  openAddProject(): void {
    updateSearchOverlay({ _tag: "OpenAddProject" });
  },
  openNewThreadIn(): void {
    updateSearchOverlay({ _tag: "OpenNewThreadIn" });
  },
  openRightPanelSurface(
    kind: RightPanelKind,
    selection?: { readonly turnId: TurnId; readonly filePath?: string },
  ): void {
    updateRightPanel({
      type: "open",
      surface:
        kind === "diff"
          ? {
              id: `${kind}:${nextSurfaceId++}`,
              kind,
              label: kindLabel(kind),
              turnId: selection?.turnId ?? null,
              filePath: selection?.filePath?.trim() || null,
            }
          : {
              id: `${kind}:${nextSurfaceId++}`,
              kind,
              label: kindLabel(kind),
            },
    });
  },
  toggleRightPanel(): void {
    updateRightPanel({ type: "toggle-panel" });
  },
  toggleQuickSwitch(input?: SearchOverlayMode | unknown): void {
    const mode: SearchOverlayMode = input === "files" || input === "content" ? input : "command";
    updateSearchOverlay({ _tag: "ToggleMode", mode });
  },
} as const;

export function installResponsiveUiProbe(enabled: boolean): void {
  if (!enabled) return;
  (
    globalThis as {
      __T3_LYNXTRON_RESPONSIVE_UI_PROBE__?: (
        action:
          | "close-overlays"
          | "close-right-panel"
          | "open-action-dialog"
          | "open-command-search"
          | "open-diff"
          | "open-file-search"
          | "open-files"
          | "open-model-picker"
          | "toggle-sidebar",
      ) => void;
      __T3_LYNXTRON_OPEN_DIFF_PROBE__?: (turnId: TurnId, filePath?: string) => void;
    }
  ).__T3_LYNXTRON_RESPONSIVE_UI_PROBE__ = (action) => {
    if (action === "close-overlays") {
      uiActions.closeProjectActionDialog();
      uiActions.closeQuickSwitch();
      return;
    }
    if (action === "close-right-panel") {
      uiActions.closeRightPanel();
      return;
    }
    if (action === "open-action-dialog") {
      uiActions.openProjectActionDialog();
      return;
    }
    if (action === "open-command-search") {
      uiActions.openQuickSwitch("command");
      return;
    }
    if (action === "open-file-search") {
      uiActions.openQuickSwitch("files");
      return;
    }
    if (action === "open-diff") {
      uiActions.openRightPanelSurface("diff");
      return;
    }
    if (action === "open-files") {
      uiActions.openRightPanelSurface("files");
      return;
    }
    if (action === "open-model-picker") {
      uiActions.openModelPicker();
      return;
    }
    requestSidebarToggle();
  };
  (
    globalThis as {
      __T3_LYNXTRON_OPEN_DIFF_PROBE__?: (turnId: TurnId, filePath?: string) => void;
    }
  ).__T3_LYNXTRON_OPEN_DIFF_PROBE__ = (turnId, filePath) => {
    uiActions.openRightPanelSurface("diff", { turnId, filePath });
  };
}
