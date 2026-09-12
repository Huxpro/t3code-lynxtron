export const T3_SEARCH_OVERLAY_RETURN_FOCUS_METHOD = "t3:search-overlay.return-focus";

export interface SearchOverlayReturnFocusParams {
  readonly focused: boolean;
}

export function isSearchOverlayReturnFocusParams(
  input: unknown,
): input is SearchOverlayReturnFocusParams {
  return (
    typeof input === "object" &&
    input !== null &&
    typeof (input as { focused?: unknown }).focused === "boolean"
  );
}
