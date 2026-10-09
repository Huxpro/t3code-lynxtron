export type ResizableWidthEdge = "left" | "right";

export interface ResizableWidthBounds {
  readonly defaultWidth: number;
  readonly minWidth: number;
  readonly maxWidth: number;
}

export interface ResizableWidthState {
  readonly moved: boolean;
  readonly startX: number;
  readonly startWidth: number;
  readonly width: number;
}

export function clampResizableWidth(width: number, bounds: ResizableWidthBounds): number {
  const finiteWidth = Number.isFinite(width) ? width : bounds.defaultWidth;
  return Math.max(bounds.minWidth, Math.min(finiteWidth, bounds.maxWidth));
}

export function beginResizableWidth(startX: number, width: number): ResizableWidthState {
  return {
    moved: false,
    startX,
    startWidth: width,
    width,
  };
}

export function moveResizableWidth(
  state: ResizableWidthState,
  clientX: number,
  edge: ResizableWidthEdge,
  bounds: ResizableWidthBounds,
): ResizableWidthState {
  const delta = edge === "left" ? state.startX - clientX : clientX - state.startX;
  const width = clampResizableWidth(state.startWidth + delta, bounds);
  const moved = state.moved || Math.abs(delta) > 2;
  if (width === state.width && moved === state.moved) return state;
  return {
    ...state,
    moved,
    width,
  };
}
