export type SearchOverlayMode = "command" | "files" | "content";

export interface SearchOverlayOpenIntent {
  readonly kind: "add-project" | "new-thread-in";
}

export interface SearchOverlayState {
  readonly open: boolean;
  readonly mode: SearchOverlayMode;
  readonly openIntent: SearchOverlayOpenIntent | null;
}

export type SearchOverlayAction =
  | { readonly _tag: "SetOpen"; readonly open: boolean }
  | { readonly _tag: "ToggleMode"; readonly mode: SearchOverlayMode }
  | { readonly _tag: "OpenAddProject" }
  | { readonly _tag: "OpenNewThreadIn" }
  | { readonly _tag: "ClearOpenIntent" };

export const INITIAL_SEARCH_OVERLAY_STATE: SearchOverlayState = {
  open: false,
  mode: "command",
  openIntent: null,
};

export function reduceSearchOverlayState(
  state: SearchOverlayState,
  action: SearchOverlayAction,
): SearchOverlayState {
  switch (action._tag) {
    case "SetOpen":
      return action.open
        ? { open: true, mode: "command", openIntent: state.openIntent }
        : { ...state, open: false, openIntent: null };
    case "ToggleMode":
      return state.open && state.mode === action.mode
        ? { ...state, open: false, openIntent: null }
        : { open: true, mode: action.mode, openIntent: null };
    case "OpenAddProject":
      return { open: true, mode: "command", openIntent: { kind: "add-project" } };
    case "OpenNewThreadIn":
      return { open: true, mode: "command", openIntent: { kind: "new-thread-in" } };
    case "ClearOpenIntent":
      return state.openIntent ? { ...state, openIntent: null } : state;
  }
}
