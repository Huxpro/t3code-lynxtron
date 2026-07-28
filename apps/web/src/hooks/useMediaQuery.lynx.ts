export type MediaQueryInput = {
  min?: string | number;
  max?: string | number;
  pointer?: "coarse" | "fine";
};

/**
 * The desktop Lynx surface is certified at a fixed non-mobile viewport.
 */
export function useMediaQuery(): boolean {
  return false;
}

export function useIsMobile(): boolean {
  return false;
}
