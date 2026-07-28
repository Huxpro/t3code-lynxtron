/**
 * R1: Lynx Desktop currently rasterizes the Web SVG path blank. Keep the same
 * import boundary and render the wordmark copy as a native text leaf.
 */
export function T3Wordmark() {
  return <text className="lynx-sidebar-wordmark">T3</text>;
}
