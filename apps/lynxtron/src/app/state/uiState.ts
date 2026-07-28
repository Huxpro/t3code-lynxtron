import { useAtomValue } from "@effect/atom-react";
import { Atom } from "effect/unstable/reactivity";
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

import { appAtomRegistry } from "./atomRegistry";

export type RightPanelKind = "plan" | "diff" | "files";

export interface RightPanelSurface {
  readonly id: string;
  readonly kind: RightPanelKind;
  readonly label: string;
}

export type RightPanelState = PanelSurfaceState<RightPanelSurface>;

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
const quickSwitchOpenAtom = Atom.make(false).pipe(Atom.withLabel("lynx-quick-switch-open"));
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
  }
}

function updateRightPanel(action: RightPanelAction): void {
  appAtomRegistry.set(
    rightPanelStateAtom,
    applyRightPanelAction(appAtomRegistry.get(rightPanelStateAtom), action),
  );
}

export function useModelPickerOpen(): boolean {
  return useAtomValue(modelPickerOpenAtom);
}

export function useQuickSwitchOpen(): boolean {
  return useAtomValue(quickSwitchOpenAtom);
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
  closeQuickSwitch(): void {
    appAtomRegistry.set(quickSwitchOpenAtom, false);
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
  openQuickSwitch(): void {
    appAtomRegistry.set(quickSwitchOpenAtom, true);
  },
  openRightPanelSurface(kind: RightPanelKind): void {
    updateRightPanel({
      type: "open",
      surface: {
        id: `${kind}:${nextSurfaceId++}`,
        kind,
        label: kindLabel(kind),
      },
    });
  },
  toggleRightPanel(): void {
    updateRightPanel({ type: "toggle-panel" });
  },
} as const;
