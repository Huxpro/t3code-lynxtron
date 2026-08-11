export interface ResizeWidthBounds {
  readonly minWidth: number;
  readonly maxWidth: number;
}

export function resolveMainThreadResizeWidth(
  startX: number,
  startWidth: number,
  clientX: number,
  edge: "left" | "right",
  bounds: ResizeWidthBounds,
): number {
  const delta = edge === "left" ? startX - clientX : clientX - startX;
  return Math.max(bounds.minWidth, Math.min(startWidth + delta, bounds.maxWidth));
}
