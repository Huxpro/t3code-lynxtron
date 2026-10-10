export const COMPOSER_COMPACT_MENU_END_ALIGN_BREAKPOINT_PX = 300;

export function resolveCompactComposerControlsAlign(width: number | null): "start" | "end" {
  return width !== null && width < COMPOSER_COMPACT_MENU_END_ALIGN_BREAKPOINT_PX ? "end" : "start";
}
